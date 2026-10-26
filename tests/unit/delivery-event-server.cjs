const {test}=require('node:test');const assert=require('node:assert/strict');const {loadTs}=require('../helpers/load-ts.cjs');const {createHash}=require('node:crypto');
const reference=createHash('sha256').update(JSON.stringify(['delivery-original-v1','a','a1','o1'])).digest('hex');
const scope={brandId:'a',locationId:'a1',orderId:'o1'}, instant='2026-10-25T20:00:00.000Z';
const event=(extra={})=>({version:1,scope:{brandId:'a',locationId:'a1'},providerId:'test',eventRef:'e1',providerDeliveryId:'p1',occurredAt:instant,receivedAt:instant,sequence:1,status:'picked_up',nativeStatus:'collected',pickupInterval:null,pickupEstimateProvenance:null,dispatchedAt:null,deliveryInterval:null,nativeErrorCode:null,...extra});
function fixture(options={}){
 const rows=new Map([['orders/o1',{brandId:'a',locationId:'a1',paymentStatus:'Paid',deliveryType:'Delivery',managedDelivery:{version:1,providerId:'test',quoteRef:'q1',requestDigest:'a'.repeat(64)}}],['orders/o1/deliveryAttempts/original',{schemaVersion:1,scope,provider:'test',intentId:reference,reference,requestDigest:'a'.repeat(64),revision:2,state:'booked',providerDeliveryId:'p1',createdAt:100,updatedAt:120}]]);let lock=Promise.resolve(),reads=0;
 const ref=path=>({path,collection:name=>({doc:id=>ref(`${path}/${name}/${id}`)})});
 const db={collection:name=>({doc:id=>ref(`${name}/${id}`)}),runTransaction:run=>{const operation=lock.then(async()=>{const writes=[];let writing=false;const tx={get:async r=>{reads++;assert.equal(writing,false);const v=rows.get(r.path);return{exists:!!v,data:()=>v&&structuredClone(v)}},create:(r,v)=>{writing=true;assert.equal(rows.has(r.path),false);writes.push([r.path,v])},set:(r,v)=>{writing=true;writes.push([r.path,v])}};
 const result=await run(tx);if(options.fail)throw Error('commit failed');for(const [p,v]of writes)rows.set(p,structuredClone(v));return result});lock=operation.catch(()=>{});return operation;}};
 const mocks={'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db},'../booking/server':{originalAttemptReference:()=>reference}};
 return{...loadTs('src/lib/delivery/events/server.ts',mocks),rows,reads:()=>reads};
}
test('verification runs before DB; wrong binding cannot mutate',async()=>{
 const f=fixture();await assert.rejects(f.ingestDeliveryProviderEvent(async()=>{throw Error('signature')}),/signature/);assert.equal(f.reads(),0);
 await assert.rejects(f.ingestDeliveryProviderEvent(async()=>({orderId:'o1',event:event({providerDeliveryId:'foreign'})})),/binding/);assert.equal(f.rows.size,2);
});
test('inbox and materialized state atomically dedupe reception retries',async()=>{
 const f=fixture(),results=await Promise.all([f.ingestDeliveryProviderEvent(async()=>({orderId:'o1',event:event()})),f.ingestDeliveryProviderEvent(async()=>({orderId:'o1',event:event({receivedAt:'2026-10-25T20:01:00.000Z'})}))]);
 assert.equal(results.filter(x=>x.applied).length,1);assert.equal(results.filter(x=>x.duplicate).length,1);assert.equal(f.rows.size,4);
 assert.equal(f.rows.get('orders/o1/deliveryState/current').status,'picked_up');
 await assert.rejects(f.ingestDeliveryProviderEvent(async()=>({orderId:'o1',event:event({status:'delivered'})})),/identity_conflict/);
});
test('rollback leaves no inbox/projection and conflicting later terminal event reconciles',async()=>{
 const broken=fixture({fail:true});await assert.rejects(broken.ingestDeliveryProviderEvent(async()=>({orderId:'o1',event:event()})),/commit failed/);assert.equal(broken.rows.size,2);
 const f=fixture();await f.ingestDeliveryProviderEvent(async()=>({orderId:'o1',event:event({status:'delivered'})}));
 const result=await f.ingestDeliveryProviderEvent(async()=>({orderId:'o1',event:event({eventRef:'e2',sequence:2,status:'cancelled'})}));assert.equal(result.reconcile,true);assert.equal(f.rows.get('orders/o1/deliveryState/current').status,'delivered');
});

test('financial compensation never blocks verified provider delivery updates',async()=>{
 const f=fixture();f.rows.get('orders/o1').paymentStatus='Refunded';
 const result=await f.ingestDeliveryProviderEvent(async()=>({orderId:'o1',event:event({status:'cancelled'})}));
 assert.equal(result.applied,true);assert.equal(f.rows.get('orders/o1').paymentStatus,'Refunded');
});

test('ETA-only messages retain original provenance without inventing status or occurrence',async()=>{
 const f=fixture(),eta=event({status:null,occurredAt:null,dispatchedAt:instant,pickupInterval:{earliest:instant,latest:instant},pickupEstimateProvenance:{source:'test',reliability:'verified_update',observedAt:instant}});
 const result=await f.ingestDeliveryProviderEvent(async()=>({orderId:'o1',event:eta}));
 assert.equal(result.applied,false);assert.equal(result.reconcile,false);assert.equal(f.rows.has('orders/o1/deliveryState/current'),false);
 const inbox=[...f.rows.entries()].find(([key])=>key.includes('/deliveryEvents/'))[1];assert.equal(inbox.event.status,null);assert.equal(inbox.event.occurredAt,null);assert.equal(inbox.event.dispatchedAt,instant);assert.equal(inbox.event.pickupEstimateProvenance.reliability,'verified_update');
});
test('status without occurrence is retained for reconciliation, never uses dispatch time',async()=>{
 const f=fixture(),result=await f.ingestDeliveryProviderEvent(async()=>({orderId:'o1',event:event({occurredAt:null,dispatchedAt:instant})}));
 assert.equal(result.reconcile,true);assert.equal(result.applied,false);assert.equal(f.rows.has('orders/o1/deliveryState/current'),false);
});
