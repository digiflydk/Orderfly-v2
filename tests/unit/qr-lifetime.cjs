const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { emptyQrLifetime, readQrLifetime, incrementQrLifetime, QrLifetimeError } = loadTs('src/lib/qr/lifetime.ts');
const { classifyQrRequest } = loadTs('src/lib/qr/metrics.ts');
const at = Date.parse('2026-10-21T12:00:00Z');
const human = classifyQrRequest({method:'GET',userAgent:'Mozilla/5.0 (iPhone) Mobile Safari/604.1'});
const valid = () => ({openings:3,probableScans:2,excludedOpenings:1,firstOpenedAt:at-100,lastOpenedAt:at});
const error = code => err => err instanceof QrLifetimeError && err.code===code;

test('missing lifetime initializes to distinct zero projections without inventing timestamps',()=>{
  const zero={openings:0,probableScans:0,excludedOpenings:0,firstOpenedAt:null,lastOpenedAt:null};
  assert.deepEqual(emptyQrLifetime(),zero);assert.deepEqual(readQrLifetime(undefined),zero);assert.deepEqual(readQrLifetime(null),zero);assert.notEqual(emptyQrLifetime(),emptyQrLifetime());
});
test('first and subsequent probable GETs increase consistent totals',()=>{
  const first=incrementQrLifetime(undefined,human,at);assert.deepEqual(first,{openings:1,probableScans:1,excludedOpenings:0,firstOpenedAt:at,lastOpenedAt:at});
  assert.deepEqual(incrementQrLifetime(first,human,at+10),{openings:2,probableScans:2,excludedOpenings:0,firstOpenedAt:at,lastOpenedAt:at+10});
});
test('bot, prefetch and unknown-agent GETs increment only openings and exclusions',()=>{
  let previous=undefined;
  for(const request of [{method:'GET',userAgent:'Googlebot'},{method:'GET',userAgent:'Mozilla/5.0',purpose:'prefetch'},{method:'GET'}])previous=incrementQrLifetime(previous,classifyQrRequest(request),at);
  assert.deepEqual(previous,{openings:3,probableScans:0,excludedOpenings:3,firstOpenedAt:at,lastOpenedAt:at});
});
test('HEAD and unsupported methods leave values unchanged without mutating the input',()=>{
  const previous=Object.freeze(valid());
  for(const method of ['HEAD','POST','OPTIONS']){const next=incrementQrLifetime(previous,classifyQrRequest({method}),at+100);assert.deepEqual(next,previous);assert.notEqual(next,previous);}
  assert.deepEqual(incrementQrLifetime(undefined,classifyQrRequest({method:'HEAD'}),at),emptyQrLifetime());
});
test('present invalid counts fail closed instead of resetting historical totals',()=>{
  for(const previous of [{},[],true,0,'bad',{...valid(),openings:-1},{...valid(),openings:3.5},{...valid(),probableScans:NaN},{...valid(),excludedOpenings:Infinity},{...valid(),openings:4},{...valid(),openings:Number.MAX_SAFE_INTEGER+1}])
    assert.throws(()=>readQrLifetime(previous),error('invalid_lifetime'));
});
test('stored timestamps must match zero/nonzero count state and retain valid order',()=>{
  for(const previous of [{...emptyQrLifetime(),firstOpenedAt:at},{...emptyQrLifetime(),lastOpenedAt:at},{...valid(),firstOpenedAt:null},{...valid(),lastOpenedAt:NaN},{...valid(),firstOpenedAt:at+1},{...valid(),lastOpenedAt:'2026-10-21'},{...valid(),firstOpenedAt:-1}])
    assert.throws(()=>readQrLifetime(previous),error('invalid_lifetime'));
});
test('the exact projection never copies visitor or unrelated configuration fields',()=>{
  const previous={...valid(),email:'private@example.com',ip:'192.0.2.1',visitorKey:'secret',revision:99};const projected=readQrLifetime(previous);
  assert.deepEqual(Object.keys(projected).sort(),['excludedOpenings','firstOpenedAt','lastOpenedAt','openings','probableScans'].sort());assert.deepEqual(projected,valid());
  assert.equal(JSON.stringify(incrementQrLifetime(previous,human,at+1)).includes('private'),false);assert.equal(previous.openings,3);
});
test('out-of-order requests preserve min/max time without dropping valid increments',()=>{
  let value=incrementQrLifetime(undefined,human,at);value=incrementQrLifetime(value,human,at+10);value=incrementQrLifetime(value,human,at-10);
  assert.equal(value.openings,3);assert.equal(value.firstOpenedAt,at-10);assert.equal(value.lastOpenedAt,at+10);assert.equal(value.probableScans+value.excludedOpenings,value.openings);
});
test('unsafe or invalid supplied clock values are rejected even for a non-opening request',()=>{
  for(const time of [NaN,Infinity,-1,1.5,Number.MAX_SAFE_INTEGER,undefined,'123'])for(const classification of [human,classifyQrRequest({method:'HEAD'})])
    assert.throws(()=>incrementQrLifetime(valid(),classification,time),error('invalid_time'));
  assert.equal(incrementQrLifetime(undefined,human,0).firstOpenedAt,0);
});
test('inconsistent classifications and counter overflow fail rather than skew totals',()=>{
  for(const classification of [null,{}, {...human,opening:false},{...human,probableScan:false},{...human,exclusion:'bot'},{...human,opening:'true'},{...human,exclusion:'unknown'}])
    assert.throws(()=>incrementQrLifetime(valid(),classification,at),error('invalid_classification'));
  const maximum={openings:Number.MAX_SAFE_INTEGER,probableScans:Number.MAX_SAFE_INTEGER,excludedOpenings:0,firstOpenedAt:at,lastOpenedAt:at};
  assert.throws(()=>incrementQrLifetime(maximum,human,at),error('counter_overflow'));assert.deepEqual(incrementQrLifetime(maximum,classifyQrRequest({method:'HEAD'}),at),maximum);
});

// Execute actual store, bulk writer and HTTP service with atomic transactions.
// This is an isolated Firestore-shaped integration fixture, not a live database.
const { createHash } = require('node:crypto');
const { createQrStore, qrAuditSnapshot } = loadTs('src/lib/qr/store.ts');
const { handleQrRedirect, QR_GETS_PER_CODE_MINUTE } = loadTs('src/lib/qr/redirect.ts');
const { createQrBulkStore } = loadTs('src/lib/qr/bulk-store.ts');
const { previewQrCsv } = loadTs('src/lib/qr/bulk.ts');
class Database {
  rows=new Map();tail=Promise.resolve();failAt=Infinity;retryNext=false;
  collection(prefix){const db=this;return{doc(id){const path=prefix+'/'+id;return{path,collection:suffix=>db.collection(path+'/'+suffix)};}};}
  async runTransaction(body){const prior=this.tail;let release;this.tail=new Promise(resolve=>release=resolve);await prior;
    try{const retry=this.retryNext;this.retryNext=false;for(let attempt=0;attempt<(retry?2:1);attempt++){
      const staged=new Map(this.rows);let writes=0;
      const write=(ref,data,create)=>{writes++;if(writes===this.failAt)throw Error('injected transaction rollback');if(create&&staged.has(ref.path))throw Error('duplicate');staged.set(ref.path,structuredClone(data));};
      const output=await body({get:async ref=>{assert.equal(writes,0,'every read must precede the first write');const row=staged.get(ref.path);return{id:ref.path.split('/').at(-1),exists:row!==undefined,data:()=>row===undefined?undefined:structuredClone(row)};},set:(ref,data)=>write(ref,data,false),create:(ref,data)=>write(ref,data,true)});
      if(retry&&attempt===0)continue;this.rows=staged;return output;
    }}finally{release();}
  }
}
const scope={brandId:'brandA',locationIds:null,actorId:'employeeA'};
const requestId=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const draft={name:'Menu',destination:'https://example.com/menu',locationId:null,campaign:'Brunch',tags:['poster']};
async function integration(){const db=new Database();db.rows.set('brands/brandA',{status:'active'});let serial=0,eventSerial=100,time=at;
  const store=createQrStore(db,{normalizeDestination:value=>new URL(value).toString(),now:()=>time,newId:()=>(++serial).toString(16).padStart(32,'0')});
  const code=await store.create(scope,draft,requestId(1)),prefix=`brands/brandA/qrCodes/${code.id}`;
  const options={db:()=>db,enabled:true,environment:'production',now:()=>time,eventId:()=>requestId(++eventSerial)};
  const open=(method='GET',headers={})=>handleQrRedirect(new Request('https://orderfly.dk/q/'+code.slug,{method,headers:{'user-agent':'Mozilla/5.0 (iPhone) Mobile Safari/604.1',...headers}}),code.slug,options);
  return{db,store,code,prefix,open,tick:value=>time=value,events:()=>[...db.rows].filter(([path])=>path.startsWith(prefix+'/qrScanEvents/'))};
}

test('actual new code and immutable audit start from zero without leaking counters or unrelated fields',async()=>{
  const f=await integration();assert.deepEqual(f.code.lifetime,emptyQrLifetime());
  const audit=f.db.rows.get(f.prefix+'/audit/'+requestId(1));assert.equal(audit.before,null);assert.equal(audit.after.id,f.code.id);assert.equal(audit.after.brandId,'brandA');assert.equal(audit.after.locationId,null);assert.equal('lifetime'in audit.after,false);
  const snapshot=qrAuditSnapshot({...f.code,secret:'private',design:{width:512,margin:4,dark:'#000000',light:'#ffffff',errorCorrectionLevel:'M',secret:'private'}});
  assert.equal(JSON.stringify(snapshot).includes('private'),false);assert.equal('lifetime'in snapshot,false);snapshot.tags.push('new');assert.deepEqual(f.code.tags,['poster']);
});
test('actual GET atomically increments lifetime with event/quota while preserving business fields and revision',async()=>{
  const f=await integration();f.db.rows.get(f.prefix).futureBusinessField={keep:true};const before=structuredClone(f.db.rows.get(f.prefix));
  assert.equal((await f.open()).status,302);const row=f.db.rows.get(f.prefix);
  assert.deepEqual({...row,lifetime:before.lifetime},before);assert.equal(row.revision,1);assert.equal(row.updatedAt,before.updatedAt);assert.equal(row.lifetime.openings,1);assert.equal(row.lifetime.probableScans,1);assert.equal(f.events().length,1);
  assert.equal(f.db.rows.get(f.prefix+'/qrRateLimits/'+Math.floor(at/60000)).count,1);assert.equal([...f.db.rows.keys()].filter(path=>path.includes('/audit/')).length,1);
});
test('actual bot/prefetch counts exclusions, HEAD is untouched and legacy missing counters stay unknown',async()=>{
  const f=await integration();assert.equal((await f.open('GET',{'user-agent':'Googlebot'})).status,302);assert.equal((await f.open('GET',{'sec-purpose':'prefetch'})).status,302);
  assert.deepEqual(f.db.rows.get(f.prefix).lifetime,{openings:2,probableScans:0,excludedOpenings:2,firstOpenedAt:at,lastOpenedAt:at});
  const before=structuredClone([...f.db.rows]);assert.equal((await f.open('HEAD')).status,302);assert.deepEqual([...f.db.rows],before);
  delete f.db.rows.get(f.prefix).lifetime;assert.equal((await f.open()).status,302);assert.equal('lifetime'in f.db.rows.get(f.prefix),false);assert.equal(f.events().length,3);
});
test('actual failed event commit rolls back counters and quota; transaction retry counts exactly once',async()=>{
  const f=await integration();const before=structuredClone([...f.db.rows]);f.db.failAt=3;
  assert.equal((await f.open()).status,503);assert.deepEqual([...f.db.rows],before);
  f.db.failAt=Infinity;f.db.retryNext=true;assert.equal((await f.open()).status,302);assert.equal(f.db.rows.get(f.prefix).lifetime.openings,1);assert.equal(f.events().length,1);
});
test('actual quota rejection and corrupt counters do not produce false lifetime increments',async()=>{
  const f=await integration();const limiter=f.prefix+'/qrRateLimits/'+Math.floor(at/60000);f.db.rows.set(limiter,{count:QR_GETS_PER_CODE_MINUTE});
  assert.equal((await f.open()).status,429);assert.deepEqual(f.db.rows.get(f.prefix).lifetime,emptyQrLifetime());assert.equal(f.events().length,0);
  f.db.rows.delete(limiter);f.db.rows.get(f.prefix).lifetime={...emptyQrLifetime(),openings:99};const before=structuredClone([...f.db.rows]);assert.equal((await f.open()).status,503);assert.deepEqual([...f.db.rows],before);
});
test('actual concurrent GET/config updates preserve counts without creating scan revision conflicts',async()=>{
  const f=await integration();const operations=Array.from({length:10},()=>f.open());operations.splice(5,0,f.store.update(scope,f.code.id,{...draft,name:'Updated'},1,requestId(2)));
  const results=await Promise.all(operations);assert.equal(results.filter(value=>value instanceof Response&&value.status===302).length,10);
  const row=f.db.rows.get(f.prefix);assert.equal(row.lifetime.openings,10);assert.equal(row.lifetime.probableScans,10);assert.equal(row.revision,2);assert.equal(row.name,'Updated');assert.equal(f.events().length,10);
  const audit=f.db.rows.get(f.prefix+'/audit/'+requestId(2));assert.equal(audit.before.name,'Menu');assert.equal(audit.after.name,'Updated');assert.equal('lifetime'in audit.before,false);assert.equal('lifetime'in audit.after,false);
});
test('actual duplicate resets lifetime; status and configuration history have stable before/after snapshots',async()=>{
  const f=await integration();await f.open();const copy=await f.store.duplicate(scope,f.code.id,'Copy',requestId(2));assert.deepEqual(copy.lifetime,emptyQrLifetime());assert.equal(f.db.rows.get(f.prefix).lifetime.openings,1);
  const copiedAudit=f.db.rows.get(`brands/brandA/qrCodes/${copy.id}/audit/${requestId(2)}`);assert.equal(copiedAudit.before,null);assert.equal(copiedAudit.after.id,copy.id);assert.equal(copiedAudit.after.status,'paused');
  const paused=await f.store.pause(scope,f.code.id,1,requestId(3));assert.equal(paused.lifetime.openings,1);const audit=f.db.rows.get(f.prefix+'/audit/'+requestId(3));assert.equal(audit.before.status,'active');assert.equal(audit.after.status,'paused');assert.equal(audit.previousRevision,1);assert.equal(audit.revision,2);
  await f.store.activate(scope,f.code.id,2,requestId(4));assert.equal(f.db.rows.get(f.prefix+'/audit/'+requestId(3)).after.status,'paused');
});
test('actual command receipt replays retain business results but project current counters instead of regressing them',async()=>{
  const f=await integration();await f.open();const writes=structuredClone([...f.db.rows]);const replay=await f.store.create(scope,draft,requestId(1));
  assert.equal(replay.lifetime.openings,1);assert.equal(replay.revision,1);assert.equal(replay.name,'Menu');assert.deepEqual([...f.db.rows],writes);
  delete f.db.rows.get(f.prefix).lifetime;const legacy=await f.store.create(scope,draft,requestId(1));assert.equal('lifetime'in legacy,false);
});
test('actual bulk create initializes every lifetime and writes exact creation snapshots without extra writes',async()=>{
  const db=new Database();db.rows.set('brands/brandA',{status:'active'});let serial=0;
  const preview=previewQrCsv('name,destination,brand_id\nOne,https://example.com/one,brandA\nTwo,https://example.com/two,brandA',{allowedScopes:[{brandId:'brandA',locationIds:[],allowBrandWide:true}]});assert.equal(preview.ok,true);
  const canonical=preview.plan.canonical,command={canonical,sha256:createHash('sha256').update(canonical).digest('hex'),requestId:requestId(1)};
  const bulk=createQrBulkStore(db,{authorizeCreate:async()=>{},now:()=>at,newId:()=>(++serial).toString(16).padStart(32,'0')});const output=await bulk.create(scope,command);
  for(const code of output.records){assert.deepEqual(code.lifetime,emptyQrLifetime());const audit=db.rows.get(`brands/brandA/qrCodes/${code.id}/audit/${requestId(1)}`);assert.equal(audit.before,null);assert.equal(audit.after.id,code.id);assert.equal('lifetime'in audit.after,false);}
  const before=structuredClone([...db.rows]);assert.deepEqual(await bulk.create(scope,command),output);assert.deepEqual([...db.rows],before);assert.equal(db.rows.size,8);
  const path=`brands/brandA/qrCodes/${output.records[0].id}`;db.rows.get(path).lifetime={openings:5,probableScans:3,excludedOpenings:2,firstOpenedAt:at,lastOpenedAt:at};
  const replay=await bulk.create(scope,command);assert.equal(replay.records[0].lifetime.openings,5);assert.deepEqual(replay.records[1].lifetime,emptyQrLifetime());assert.equal(db.rows.size,8);
});
