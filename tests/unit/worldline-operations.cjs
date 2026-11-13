const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs'),vm=require('node:vm');
const {memoryDb}=require('../helpers/marketing-db.cjs');
const retry=require('../helpers/load-ts.cjs').loadTs('src/lib/payments/worldline-read-retry.ts',{'server-only':{}});
function fixture({lost=false,move=true,readFailures=0,failFirstReadback=false}={}){
 const binding={provider:'worldline',owner:{brandId:'b'},mode:'test',merchantNumber:'T123',reference:'pinned-1'};
 const rows=new Map([['orders/o',{brandId:'b',locationId:'l',paymentMethod:'Worldline',paymentAgreement:binding,psp:{provider:'worldline',transactionId:'123'},totalAmount:125}]]);
 const db=memoryDb(rows),collection=db.collection;db.collection=name=>{const q=collection(name),doc=q.doc;q.doc=id=>{const r=doc(id);r.collection=sub=>db.collection(r.path+'/'+sub);return r;};return q;};
 let calls=0,reads=0,readbackFailed=false;let total={authorized:12500,captured:0,credited:0};
 const mocks={'server-only':{},'./worldline-read-retry':retry,'@/lib/firebase-admin':{getAdminDb:()=>db},'./worldline-store':{readPinnedWorldlineAgreement:async b=>{assert.equal(b.reference,'pinned-1');return {binding:b,credentials:{}};}},'./worldline-verification':{assertWorldlineTransaction:(v,e)=>{assert.equal(v.orderid,e.orderId);return v;}},'./worldline-client':{readWorldlineTransaction:async()=>{reads++;if(reads<=readFailures||failFirstReadback&&calls&&!readbackFailed){if(calls)readbackFailed=true;throw Error('temporary provider read');}return {id:'123',orderid:'o',status:'approved',total:{...total}};},mutateWorldlineTransaction:async(k,m,id,op,amount)=>{calls++;if(move)total={...total,...(op==='capture'?{captured:amount}:op==='credit'?{credited:total.credited+amount}:{})};if(lost)throw Object.assign(Error('lost'),{outcome:'unknown'});}}};
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/payments/worldline-operations.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>mocks[n]||require(n)});
 const run=(patch={},options={})=>exports.runWorldlineOperation({orderId:'o',transactionId:'123',requestId:'capture-1',operation:'capture',amountMinor:12500,actorId:'worker',...patch},undefined,options);
 return {run,rows,db,calls:()=>calls,reads:()=>reads,total:()=>total,setCaptured:value=>{total={...total,captured:value};}};
}
test('capture commits journal; duplicate calls do not move money twice',async()=>{const f=fixture();assert.equal((await f.run()).state,'confirmed');assert.equal((await f.run()).state,'confirmed');assert.equal(f.calls(),1);assert.equal(f.rows.get('orders/o').paymentOperation,null);});
test('lost provider reply is reconciled by readback, not a second mutation',async()=>{const f=fixture({lost:true});assert.equal((await f.run()).state,'confirmed');await f.run();assert.equal(f.calls(),1);});
test('unresolved timeout remains locked across retries and blocks another operation',async()=>{const f=fixture({lost:true,move:false});assert.equal((await f.run()).state,'unknown');assert.equal((await f.run()).state,'unknown');assert.equal(f.calls(),1);await assert.rejects(f.run({requestId:'new-capture'}));assert.equal(f.calls(),1);});
test('request identity cannot be reused for different money or actor',async()=>{const f=fixture();await f.run();await assert.rejects(f.run({amountMinor:100}));await assert.rejects(f.run({actorId:'other'}));assert.equal(f.calls(),1);});
test('refund records authoritative credited total and refuses over-refund',async()=>{const f=fixture();await f.run();f.rows.get('orders/o').paymentStatus='Paid';assert.equal((await f.run({operation:'credit',requestId:'refund-1',amountMinor:500})).state,'confirmed');assert.equal(f.rows.get('orders/o').refundedAmountOre,500);await assert.rejects(f.run({operation:'credit',requestId:'refund-2',amountMinor:12500}));assert.equal(f.calls(),2);});

test('concurrent duplicate finalization is monotonic and moves money at most once',async()=>{
 const f=fixture();const results=await Promise.all([f.run(),f.run(),f.run()]);assert.equal(f.calls(),1);assert.ok(results.every(r=>r.state==='confirmed'));const journal=[...f.rows].find(([path])=>path.includes('/paymentOperations/'))[1];assert.equal(journal.state,'confirmed');assert.equal(f.rows.get('orders/o').paymentOperation,null);
});
test('failed financial journal commit never reports confirmed; retry reconciles without resubmission',async()=>{
 const f=fixture();const original=f.db.runTransaction;let calls=0;f.db.runTransaction=async run=>{calls++;if(calls===2)throw Error('commit unavailable');return original(run);};
 assert.equal((await f.run()).state,'unknown');assert.equal(f.calls(),1);assert.ok(f.rows.get('orders/o').paymentOperation);assert.equal((await f.run()).state,'confirmed');assert.equal(f.calls(),1);
});

test('refund spend and financial adjustment commit once with journal, including replay',async()=>{
 const f=fixture();await f.run();Object.assign(f.rows.get('orders/o'),{paymentStatus:'Paid',customerDetails:{id:'c'},invoice:{number:'INV-1'}});f.rows.set('customers/c',{brandId:'b',totalSpend:200});
 const input={operation:'credit',requestId:'refund-ledger',amountMinor:500};assert.equal((await f.run(input)).state,'confirmed');await f.run(input);assert.equal(f.rows.get('customers/c').totalSpend,195);const adjustments=[...f.rows].filter(([p])=>p.includes('/financialAdjustments/'));assert.equal(adjustments.length,1);assert.equal(adjustments[0][1].amountMinor,-500);assert.equal(adjustments[0][1].customerApplied,true);
});
test('observation-only recovery cannot create a missing journal or send capture',async()=>{
 const f=fixture();await assert.rejects(f.run({}, {observationOnly:true}),/existing journal/);assert.equal(f.calls(),0);assert.equal([...f.rows].filter(([path])=>path.includes('/paymentOperations/')).length,0);assert.equal(f.rows.get('orders/o').paymentOperation,undefined);
});
test('capture accepted after a lost reply is observed through the existing journal with one POST total',async()=>{
 const f=fixture({lost:true,move:false});assert.equal((await f.run()).state,'unknown');assert.equal(f.calls(),1);
 assert.equal((await f.run({}, {observationOnly:true})).state,'unknown');assert.equal(f.calls(),1);
 f.setCaptured(12500);assert.equal((await f.run({}, {observationOnly:true})).state,'confirmed');assert.equal(f.calls(),1);assert.equal(f.rows.get('orders/o').paymentOperation,null);
});
test('observation-only recovery rejects changed identity, binding or a deleted journal before sending',async()=>{
 for(const change of [f=>{const [,row]=[...f.rows].find(([path])=>path.includes('/paymentOperations/'));row.fingerprint='other';},f=>{const [,row]=[...f.rows].find(([path])=>path.includes('/paymentOperations/'));row.binding={...row.binding,merchantNumber:'other'};},f=>{const [path]=[...f.rows].find(([path])=>path.includes('/paymentOperations/'));f.rows.delete(path);}]){
  const f=fixture({lost:true,move:false});await f.run();change(f);await assert.rejects(f.run({}, {observationOnly:true}));assert.equal(f.calls(),1);
 }
});
test('optional pre-journal and post-capture READ retries recover with exactly one money POST',async()=>{
 for(const options of [{readFailures:2},{lost:true,failFirstReadback:true}]){
  const f=fixture(options);assert.equal((await f.run({}, {retryReadFailures:true})).state,'confirmed');assert.equal(f.calls(),1);assert.ok(f.reads()>=3);
 }
 const unchangedDefault=fixture({readFailures:1});await assert.rejects(unchangedDefault.run());assert.equal(unchangedDefault.calls(),0);
});
