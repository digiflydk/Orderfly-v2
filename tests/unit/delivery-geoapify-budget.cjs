const {test}=require('node:test');
const assert=require('node:assert/strict');
const {moduleGraph}=require('../helpers/load-ts-graph.cjs');

function fixture(){
  const records=new Map();let clock=Date.parse('2026-10-26T12:00:00Z'),tail=Promise.resolve(),failRead=false,unknownCommit=false,retry=false,dbLoads=0;
  const db={collection:name=>({doc:id=>({path:`${name}/${id}`})}),runTransaction(run){
    const operation=tail.then(async()=>{
      if(failRead)throw Error('unavailable');
      const execute=async()=>{const writes=new Map();const result=await run({get:async ref=>({exists:records.has(ref.path),data:()=>structuredClone(records.get(ref.path))}),set:(ref,value)=>writes.set(ref.path,structuredClone(value))});return {result,writes};};
      if(retry)await execute(); // The first transaction's writes never committed.
      const value=await execute();for(const [key,row] of value.writes)records.set(key,row);
      if(unknownCommit)throw Error('response lost after commit');
      return value.result;
    });tail=operation.catch(()=>{});return operation;
  }};
  const api=moduleGraph({'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>{dbLoads++;return db;}}})('src/lib/delivery/routing/geoapify/budget.ts');
  const make=(namespace='shared-project-key-v1')=>api.createGeoapifyBudget({quotaNamespace:namespace,now:()=>clock});
  return {api,make,records,db,clock:v=>clock=v,failRead:v=>failRead=v,unknownCommit:v=>unknownCommit=v,retry:v=>retry=v,loads:()=>dbLoads};
}

test('construction is I/O-free and quota namespace is explicit server configuration',()=>{
  const f=fixture();f.make();assert.equal(f.loads(),0);
  for(const bad of [undefined,'',' space','key/tenant','x'.repeat(129),123])assert.equal(f.api.isGeoapifyQuotaNamespace(bad),false);
  assert.throws(()=>f.make(' bad'),/geoapify_quota_configuration_invalid/);
});

test('100 UTC quote attempts are atomic across independent runtime instances and restart',async()=>{
  const f=fixture(),instances=Array.from({length:12},()=>f.make());
  const results=await Promise.all(Array.from({length:150},(_,i)=>instances[i%instances.length].reserveQuote()));
  assert.equal(results.filter(Boolean).length,100);assert.equal(await f.make().reserveQuote(),false);
  const [path,row]=[...f.records][0];assert.equal(row.count,100);assert.equal(row.day,'2026-10-26');
  assert.match(path,/^deliveryRoutingBudgets\/[a-f0-9]{64}-2026-10-26$/);assert.equal(path.includes('shared-project'),false);
  f.clock(Date.parse('2026-10-27T00:00:00Z'));assert.equal(await f.make().reserveQuote(),true);
  assert.equal(f.records.size,2);assert.equal(row.count,100);
});

test('transaction retries do not double increment, while unknown commits consume and deny',async()=>{
  const f=fixture();f.retry(true);assert.equal(await f.make().reserveQuote(),true);assert.equal([...f.records.values()][0].count,1);
  f.unknownCommit(true);assert.equal(await f.make().reserveQuote(),false);assert.equal([...f.records.values()][0].count,2);
  f.unknownCommit(false);f.failRead(true);assert.equal(await f.make().reserveQuote(),false);assert.equal(await f.make().reserveRequest(),false);
});

test('five-request rolling window is shared and does not burst at second boundaries',async()=>{
  const f=fixture(),start=Date.parse('2026-10-26T12:00:00.999Z');f.clock(start);
  const results=await Promise.all(Array.from({length:12},()=>f.make().reserveRequest()));
  assert.equal(results.filter(Boolean).length,5);
  f.clock(start+1);assert.equal(await f.make().reserveRequest(),false);
  f.clock(start+999);assert.equal(await f.make().reserveRequest(),false);
  f.clock(start+1000);assert.equal(await f.make().reserveRequest(),true);
  const row=[...f.records.values()][0];assert.deepEqual(row.reservations,[start+1000]);
  f.clock(start+999);assert.equal(await f.make().reserveRequest(),false); // clock reversal fails closed
});

test('quote and request budgets are independent, denied request does not refund quote attempt',async()=>{
  const f=fixture(),budget=f.make();
  assert.equal(await budget.reserveQuote(),true);
  for(let i=0;i<5;i++)assert.equal(await budget.reserveRequest(),true);
  assert.equal(await budget.reserveRequest(),false);
  assert.equal([...f.records.values()].find(x=>'count'in x).count,1);
  assert.equal(f.records.size,2);
});

test('malformed records, future rate timestamps and invalid clocks fail closed without overwrites',async()=>{
  const f=fixture();await f.make().reserveQuote();await f.make().reserveRequest();
  const daily=[...f.records.keys()].find(x=>!x.endsWith('requests')),rate=[...f.records.keys()].find(x=>x.endsWith('requests'));
  for(const bad of [{}, {version:1,day:'2026-10-26',count:-1},{version:1,day:'2026-10-25',count:1},{version:1,day:'2026-10-26',count:1,extra:true}]){
    f.records.set(daily,bad);assert.equal(await f.make().reserveQuote(),false);assert.deepEqual(f.records.get(daily),bad);
  }
  const now=Date.parse('2026-10-26T12:00:00Z');
  for(const bad of [{},{version:1,lastSeenAtMs:now,reservations:[now+1]},{version:1,lastSeenAtMs:now,reservations:[now,now-1]}]){
    f.records.set(rate,bad);assert.equal(await f.make().reserveRequest(),false);assert.deepEqual(f.records.get(rate),bad);
  }
  for(const bad of [NaN,Infinity,-1,1.2]){f.clock(bad);assert.equal(await f.make().reserveQuote(),false);assert.equal(await f.make().reserveRequest(),false);}
});
