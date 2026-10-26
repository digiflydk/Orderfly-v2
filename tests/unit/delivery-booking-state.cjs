const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {transitionBookingIntent:step}=loadTs('src/lib/delivery/booking/state.ts');
const initial=()=>({schemaVersion:1,scope:{brandId:'a',locationId:'a1',orderId:'o1'},provider:'test',intentId:'i1',reference:'ref1',requestDigest:'a'.repeat(64),revision:0,state:'pending',providerDeliveryId:null,createdAt:100,updatedAt:100});
const command=(s,outcome,extra={})=>({scope:s.scope,intentId:s.intentId,reference:s.reference,requestDigest:s.requestDigest,expectedRevision:s.revision,now:110,outcome,...extra});
test('dispatch requires one pending transition; unknown cannot be submitted again',()=>{
 const a=initial(),b=step(a,command(a,{kind:'submit'}));
 assert.equal(a.state,'pending'); assert.equal(b.state,'submitting');
 assert.throws(()=>step(b,command(b,{kind:'submit'})),/transition/);
 const c=step(b,command(b,{kind:'unknown'}));
 assert.throws(()=>step(c,command(c,{kind:'submit'})),/transition/);
 const d=step(c,command(c,{kind:'accepted',providerDeliveryId:'external1'}));
 assert.equal(d.state,'booked');assert.equal(d.reference,a.reference);
 assert.deepEqual(step(d,command(d,{kind:'accepted',providerDeliveryId:'external1'})),d);
 assert.throws(()=>step(d,command(d,{kind:'accepted',providerDeliveryId:'external2'})),/transition/);
});
test('foreign scope, stale revision, altered request and regressed clock are rejected',()=>{
 const a=initial();
 for(const patch of [{scope:{...a.scope,brandId:'b'}},{scope:{...a.scope,locationId:'b1'}},{scope:{...a.scope,orderId:'o2'}},{reference:'ref2'},{requestDigest:'b'.repeat(64)}]) assert.throws(()=>step(a,command(a,{kind:'submit'},patch)),/scope/);
 for(const patch of [{expectedRevision:1},{now:99}])assert.throws(()=>step(a,command(a,{kind:'submit'},patch)),/conflict/);
});
test('no pre-dispatch result; definitive rejection terminal; malformed state fails',()=>{
 const a=initial();assert.throws(()=>step(a,command(a,{kind:'accepted',providerDeliveryId:'p1'})),/transition/);
 const b=step(a,command(a,{kind:'submit'})),c=step(b,command(b,{kind:'rejected'}));
 assert.equal(c.state,'rejected');assert.throws(()=>step(c,command(c,{kind:'submit'})),/transition/);
 for(const patch of [{state:'booked'},{providerDeliveryId:'p1'},{createdAt:200},{revision:-1},{surprise:true}])assert.throws(()=>step({...a,...patch},command(a,{kind:'submit'})),/invalid/);
});
