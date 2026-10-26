const {test}=require('node:test');const assert=require('node:assert/strict');const {loadTs}=require('../helpers/load-ts.cjs');
const scope={brandId:'a',locationId:'a1',orderId:'o1'};
function fixture(options={}){
 const rows=new Map([['orders/o1',{...scope,deliveryType:'Delivery',paymentStatus:'Paid',managedDelivery:{version:1,providerId:'test',quoteRef:'q1',requestDigest:'a'.repeat(64)},...options.order}]]);let lock=Promise.resolve();let denied=false;
 const ref=path=>({path,collection:name=>({doc:id=>ref(`${path}/${name}/${id}`)})});
 const db={collection:name=>({doc:id=>ref(`${name}/${id}`)}),runTransaction:run=>{const operation=lock.then(async()=>{
  const attempt=async commit=>{const writes=[];let writing=false;const tx={get:async r=>{assert.equal(writing,false);const v=rows.get(r.path);return{exists:!!v,data:()=>v&&structuredClone(v)}},create:(r,v)=>{writing=true;assert.equal(rows.has(r.path),false);writes.push([r.path,v])},set:(r,v)=>{writing=true;writes.push([r.path,v])}};
  const result=await run(tx);if(options.fail)throw Error('commit failed');if(commit)for(const [p,v]of writes)rows.set(p,structuredClone(v));return result};
  if(options.retry)await attempt(false);return attempt(true)});lock=operation.catch(()=>{});return operation;}};
 const mocks={'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db},'@/lib/access/orderfly-session':{verifiedOrderflyIdentity:async()=>({subject:'operator'})},'@/lib/access/scoped-data':{authorizeTransaction:async()=>{if(denied)throw Error('denied')}}};
 return{...loadTs('src/lib/delivery/booking/server.ts',mocks),rows,revoke:()=>{denied=true}};
}
test('transaction retry and concurrent preparation produce one immutable original attempt',async()=>{
 const f=fixture({retry:true});const results=await Promise.all([f.ensureOriginalDeliveryAttempt(scope),f.ensureOriginalDeliveryAttempt(scope)]);
 assert.equal(results.filter(r=>!r.existing).length,1);assert.equal(f.rows.size,2);assert.equal(results[0].intent.reference,results[1].intent.reference);
});
test('revocation, unpaid order, foreign scope and altered digest deny replay',async()=>{
 const f=fixture();await f.ensureOriginalDeliveryAttempt(scope);f.rows.get('orders/o1').managedDelivery.requestDigest='b'.repeat(64);await assert.rejects(f.ensureOriginalDeliveryAttempt(scope),/conflict/);
 const g=fixture();g.revoke();await assert.rejects(g.ensureOriginalDeliveryAttempt(scope),/denied/);assert.equal(g.rows.size,1);
 await assert.rejects(fixture({order:{paymentStatus:'Pending'}}).ensureOriginalDeliveryAttempt(scope),/ineligible/);
 await assert.rejects(fixture().ensureOriginalDeliveryAttempt({...scope,brandId:'b'}),/ineligible/);
});
test('commit failure does not expose durable intent',async()=>{
 const f=fixture({fail:true});await assert.rejects(f.ensureOriginalDeliveryAttempt(scope),/commit failed/);assert.equal(f.rows.size,1);
});
test('revision compare-and-set prevents simultaneous dispatch transitions',async()=>{
 const f=fixture(),{intent}=await f.ensureOriginalDeliveryAttempt(scope);
 const command={scope,intentId:intent.intentId,reference:intent.reference,requestDigest:intent.requestDigest,expectedRevision:0,now:Date.now(),outcome:{kind:'submit'}};
 const results=await Promise.allSettled([f.transitionOriginalDeliveryAttempt(scope,command),f.transitionOriginalDeliveryAttempt(scope,command)]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(f.rows.get('orders/o1/deliveryAttempts/original').state,'submitting');
});

const commandFor=(intent,outcome)=>({scope,intentId:intent.intentId,reference:intent.reference,requestDigest:intent.requestDigest,expectedRevision:intent.revision,now:Date.now(),outcome});
test('late accepted provider outcome persists after compensation without replaying dispatch',async()=>{
 const f=fixture(),{intent}=await f.ensureOriginalDeliveryAttempt(scope);
 const submitting=await f.transitionOriginalDeliveryAttempt(scope,commandFor(intent,{kind:'submit'}));
 f.rows.get('orders/o1').paymentStatus='Refunded';
 const booked=await f.transitionOriginalDeliveryAttempt(scope,commandFor(submitting,{kind:'accepted',providerDeliveryId:'provider-1'}));
 assert.equal(booked.state,'booked');assert.equal(booked.providerDeliveryId,'provider-1');
 assert.equal(f.rows.get('orders/o1').paymentStatus,'Refunded');
 assert.deepEqual((await f.ensureOriginalDeliveryAttempt(scope)).intent,booked);
 assert.deepEqual(await f.transitionOriginalDeliveryAttempt(scope,commandFor(booked,{kind:'accepted',providerDeliveryId:'provider-1'})),booked);
});
test('unknown outcome reconciles after refund but pending cannot submit and refunded cannot create',async()=>{
 const f=fixture(),{intent}=await f.ensureOriginalDeliveryAttempt(scope);
 const submitting=await f.transitionOriginalDeliveryAttempt(scope,commandFor(intent,{kind:'submit'}));
 f.rows.get('orders/o1').paymentStatus='Refunded';
 const unknown=await f.transitionOriginalDeliveryAttempt(scope,commandFor(submitting,{kind:'unknown'}));
 assert.equal(unknown.state,'unknown');
 const reconciled=await f.transitionOriginalDeliveryAttempt(scope,commandFor(unknown,{kind:'accepted',providerDeliveryId:'provider-2'}));
 assert.equal(reconciled.state,'booked');
 const g=fixture(),pending=(await g.ensureOriginalDeliveryAttempt(scope)).intent;g.rows.get('orders/o1').paymentStatus='Refunded';
 await assert.rejects(g.transitionOriginalDeliveryAttempt(scope,commandFor(pending,{kind:'submit'})),/ineligible/);
 assert.equal(g.rows.get('orders/o1/deliveryAttempts/original').state,'pending');
 const h=fixture({order:{paymentStatus:'Refunded'}});await assert.rejects(h.ensureOriginalDeliveryAttempt(scope),/ineligible/);assert.equal(h.rows.size,1);
});
test('post-refund outcome still requires current authorization and immutable scope/digest',async()=>{
 const f=fixture(),{intent}=await f.ensureOriginalDeliveryAttempt(scope);
 const submitting=await f.transitionOriginalDeliveryAttempt(scope,commandFor(intent,{kind:'submit'}));
 f.rows.get('orders/o1').paymentStatus='Refunded';
 const accepted=commandFor(submitting,{kind:'accepted',providerDeliveryId:'provider-1'});
 await assert.rejects(f.transitionOriginalDeliveryAttempt({...scope,brandId:'foreign'},accepted),/ineligible/);
 await assert.rejects(f.transitionOriginalDeliveryAttempt(scope,{...accepted,requestDigest:'b'.repeat(64)}),/scope/);
 f.revoke();await assert.rejects(f.transitionOriginalDeliveryAttempt(scope,accepted),/denied/);
 assert.equal(f.rows.get('orders/o1/deliveryAttempts/original').state,'submitting');
});
