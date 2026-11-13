const {test}=require('node:test'),assert=require('node:assert/strict');
const {moduleGraph}=require('../helpers/load-ts-graph.cjs'),{memoryDb}=require('../helpers/marketing-db.cjs');
function fixture(options={}){
 const binding={provider:'worldline',mode:'test',owner:{brandId:'brand'},merchantNumber:'T123',revision:1,reference:`projects/orderfly-39325/secrets/orderfly-worldline-${'a'.repeat(64)}-test/versions/1`};
 const order={brandId:'brand',locationId:'location',paymentMethod:'Worldline',paymentStatus:'Pending',status:'Pending',totalAmount:100,paymentAgreement:binding,psp:{provider:'worldline',transactionId:'123',checkoutSessionId:'session'},managedDelivery:{version:1,providerId:'wolt',quoteRef:'quote',requestDigest:'a'.repeat(64)}};
 const rows=new Map([['orders/order',order],['worldlinePaymentJobs/order',{state:'pending',orderId:'order',brandId:'brand',locationId:'location',transactionId:'123'}]]);
 const db=memoryDb(rows),collection=db.collection;db.collection=name=>{const q=collection(name),doc=q.doc;q.doc=id=>{const r=doc(id);r.collection=sub=>db.collection(r.path+'/'+sub);return r;};return q;};
 const native=db.runTransaction;let transactions=0,creates=0,captured=0,status='approved';
 db.runTransaction=async run=>{transactions++;if(options.failFinal&&transactions===2)throw Error('commit failed');return native(run);};
 const store={readPinnedWorldlineAgreement:async value=>({binding:value,credentials:{merchantNumber:'T123'}})};
 const provider={readWorldlineTransaction:async()=>({id:'123',orderid:'order',merchantnumber:'T123',status,currency:{code:'DKK',minorunits:2},total:{authorized:10000,captured,credited:0}}),mutateWorldlineTransaction:async(keys,mode,id,operation,amount)=>{creates++;if(operation==='capture')captured=amount;else{assert.equal(operation,'delete');status='deleted';}}};
 const load=moduleGraph({'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db},'@/lib/payments/worldline-store':store,'./worldline-store':store,'@/lib/payments/worldline-client':provider,'./worldline-client':provider});
 return {rows,db,authority:load('src/lib/delivery/payments/worldline-operation-authority.ts'),operations:load('src/lib/payments/worldline-operations.ts'),get creates(){return creates;}};
}
const input={orderId:'order',transactionId:'123',requestId:'initial-capture',operation:'capture',amountMinor:10000,actorId:'worldline-worker'};
test('generic caller or plain-object managed authority cannot charge managed orders',async()=>{
 const f=fixture();await assert.rejects(f.operations.runWorldlineOperation(input));await assert.rejects(f.operations.runWorldlineOperation(input,{}));await assert.rejects(f.operations.runWorldlineOperation({...input,operation:'credit'},{}));assert.equal(f.creates,0);
});
test('fixed managed capture wrapper requires matching durable tenant-scoped callback job',async()=>{
 const f=fixture();assert.equal((await f.authority.captureManagedWorldlineOrder('order')).state,'confirmed');assert.equal(f.creates,1);assert.equal(f.rows.get('orders/order').paymentOperation,null);
 for(const patch of [{brandId:'foreign'},{locationId:'foreign'},{transactionId:'456'},{state:'settled'}]){const g=fixture();Object.assign(g.rows.get('worldlinePaymentJobs/order'),patch);await assert.rejects(g.authority.captureManagedWorldlineOrder('order'));assert.equal(g.creates,0);}
});
test('captured provider + failed journal commit recovers with same operation and no duplicate capture',async()=>{
 const f=fixture({failFinal:true});assert.equal((await f.authority.captureManagedWorldlineOrder('order')).state,'unknown');assert.equal(f.creates,1);assert.ok(f.rows.get('orders/order').paymentOperation);assert.equal((await f.authority.captureManagedWorldlineOrder('order')).state,'confirmed');assert.equal(f.creates,1);assert.equal(f.rows.get('orders/order').paymentOperation,null);
});
test('changed amount, binding, revision or scope invalidate a permit before journal claim',async()=>{
 for(const change of [order=>order.totalAmount=101,order=>order.paymentAgreement={...order.paymentAgreement,revision:2},order=>order.paymentRevision=1,order=>order.locationId='foreign']){
  const f=fixture(),native=f.db.runTransaction;let first=true;f.db.runTransaction=run=>{if(first){first=false;change(f.rows.get('orders/order'));}return native(run);};await assert.rejects(f.authority.captureManagedWorldlineOrder('order'));assert.equal(f.creates,0);
 }
});

test('known callback authorization can be canceled without a returned checkout token; no fabricated expiry claim',async()=>{
 const f=fixture();delete f.rows.get('orders/order').psp.checkoutSessionId;
 assert.equal((await f.authority.cancelManagedWorldlineAuthorization('order','123')).state,'confirmed');assert.equal(f.creates,1);const order=f.rows.get('orders/order');assert.equal(order.status,'Canceled');assert.equal(order.cancellationReason,'worldline_authorization_cancel_requested');assert.equal(order.psp.sessionExpired,undefined);assert.equal(order.paymentOperation,null);
});
test('managed cancellation cannot race an in-flight capture or target a different transaction',async()=>{
 const f=fixture();f.rows.get('orders/order').paymentOperation='initial-capture-lock';await assert.rejects(f.authority.cancelManagedWorldlineAuthorization('order','123'));assert.equal(f.creates,0);const g=fixture();await assert.rejects(g.authority.cancelManagedWorldlineAuthorization('order','456'));assert.equal(g.creates,0);
});

test('expired order marked Failed can void a late authorization while capture remains forbidden',async()=>{
 const f=fixture();Object.assign(f.rows.get('orders/order'),{status:'Canceled',paymentStatus:'Failed'});f.rows.get('orders/order').psp.sessionExpired=true;
 await assert.rejects(f.authority.captureManagedWorldlineOrder('order'));assert.equal((await f.authority.cancelManagedWorldlineAuthorization('order','123')).state,'confirmed');assert.equal(f.creates,1);
});
test('managed capture observation uses its existing protected journal and never creates another capture',async()=>{
 const f=fixture({failFinal:true});assert.equal((await f.authority.captureManagedWorldlineOrder('order')).state,'unknown');assert.equal(f.creates,1);
 assert.equal((await f.authority.captureManagedWorldlineOrder('order',{observationOnly:true})).state,'confirmed');assert.equal(f.creates,1);
 const missing=fixture();await assert.rejects(missing.authority.captureManagedWorldlineOrder('order',{observationOnly:true}));assert.equal(missing.creates,0);
});
