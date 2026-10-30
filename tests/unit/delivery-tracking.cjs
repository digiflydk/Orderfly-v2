const {test}=require('node:test');const assert=require('node:assert/strict');const {createHash}=require('node:crypto');const {loadTs}=require('../helpers/load-ts.cjs');
const {projectCustomerDeliveryTracking:project}=loadTs('src/lib/delivery/tracking.ts');
const scope={brandId:'brand',locationId:'location',orderId:'order'};
const managed={version:1,providerId:'wolt',quoteRef:'quote',requestDigest:'a'.repeat(64)};
function fixture(){const now=Date.now();const order={...scope,deliveryType:'Delivery',paymentStatus:'Paid',totalAmount:100,managedDelivery:managed};const attempt={schemaVersion:1,scope,provider:'wolt',intentId:'attempt',reference:'attempt',requestDigest:managed.requestDigest,revision:1,state:'booked',providerDeliveryId:'native',createdAt:now,updatedAt:now};const result={scope,providerId:'wolt',requestDigest:managed.requestDigest,attemptRef:'attempt',result:{kind:'accepted',providerDeliveryId:'native',nativeReference:'reference',trackingUrl:'https://tracking.example/order',pickupInterval:null,deliveryInterval:null,pickupEstimateProvenance:null,cost:null}};return {order,attempt,result};}
test('tracking projection separates booking, payment and provider status and suppresses foreign metadata',()=>{
 const {order,attempt,result}=fixture();const state={...scope,provider:'wolt',providerDeliveryId:'native',status:'picked_up'};
 const good=project('order',order,attempt,result,state);assert.equal(good.bookingState,'accepted');assert.equal(good.deliveryStatus,'picked_up');assert.equal(good.paymentStatus,'paid');assert.equal(good.trackingUrl,'https://tracking.example/order');
 const bad=project('order',order,{...attempt,scope:{...scope,brandId:'foreign'}},result,state);assert.equal(bad.bookingState,'unknown');assert.equal(bad.trackingUrl,null);assert.equal(bad.deliveryStatus,null);
 assert.equal(project('order',order,attempt,{...result,result:{...result.result,trackingUrl:'javascript:alert(1)'}},state).trackingUrl,null);
 assert.equal(project('order',{...order,refundedAmountOre:10000},attempt,result,state).paymentStatus,'refunded');
 assert.equal(JSON.stringify(good).includes(managed.requestDigest),false);
});
test('only identity-matched estimates override accepted delivery and reliable pickup',()=>{
 const {order,attempt,result}=fixture();const interval={earliest:'2026-10-26T12:00:00Z',latest:'2026-10-26T12:10:00Z'};
 const estimates={...scope,provider:'wolt',providerDeliveryId:'native',pickup:interval,dropoff:interval,pickupReliable:true,dispatchedAtMs:Date.now()};
 assert.equal(project('order',order,attempt,result,null,estimates).pickupReliable,true);
 assert.equal(project('order',order,attempt,result,null,{...estimates,locationId:'other'}).deliveryInterval,null);
 assert.equal(project('order',order,attempt,result,null,{...estimates,pickup:{earliest:'bad',latest:'bad'}}).pickupReliable,false);
});
test('guest delivery is reached only after original receipt session/token/scope proof',async()=>{
 const token='1'.repeat(64),hash=createHash('sha256').update(token).digest('hex');let reads=0;
 const order={id:'order',brandId:'brand',locationId:'location',managedDelivery:managed,deliveryType:'Delivery',paymentMethod:'Stripe',paymentStatus:'Paid',status:'Received',psp:{checkoutSessionId:'cs_test_abcdefgh1234'},receiptTokenHash:hash,customerDetails:{id:'customer',address:'Test'},paymentDetails:{},createdAt:new Date(),productItems:[]};
 let paymentReads=0;
 const {readGuestReceipt}=loadTs('src/lib/server/guest-receipt.ts',{'server-only':{},'@/app/checkout/order-actions':{getOrderById:async()=>order,getOrderByCheckoutSessionId:async()=>order},'@/lib/server/payment-settings':{getActiveStripeSecretKey:async()=>{paymentReads++;return null;}},'./settle-checkout':{settlePaidCheckoutSession:async()=>{}},'@/lib/delivery/tracking-server':{readReceiptDeliveryTracking:async()=>{reads++;return {orderId:'order'};}}});
 const proof={orderId:'order',brandId:'brand',locationId:'location',sessionId:order.psp.checkoutSessionId,receiptToken:token};
 for(const bad of [{orderId:'order'},{...proof,sessionId:'cs_test_wrong12345'},{...proof,receiptToken:'2'.repeat(64)},{...proof,brandId:'other'},{...proof,locationId:'other'}])assert.equal(await readGuestReceipt(bad),null);
 assert.equal(reads,0);assert.equal((await readGuestReceipt(proof)).managedDeliveryTracking.orderId,'order');assert.equal(reads,1);
 delete order.managedDelivery;
 for(const bad of [{...proof,receiptToken:'2'.repeat(64)},{...proof,brandId:'other'}])assert.equal(await readGuestReceipt(bad,{reconcilePayment:false}),null);
 assert.equal((await readGuestReceipt(proof,{reconcilePayment:false})).id,'order');assert.equal(paymentReads,0);assert.equal(reads,2);
});
test('receipt tracking reread suppresses rotated proof and swapped scope before subcollection reads',async()=>{
 const {order,attempt,result}=fixture();const verified={...order,id:'order',receiptTokenHash:'hash',psp:{checkoutSessionId:'cs_test_abcdefgh'}};
 const records=new Map([['orders/order',verified],['orders/order/deliveryAttempts/original',attempt],['orders/order/deliveryDispatchResults/original',result]]),reads=[];
 const ref=path=>({path,collection:name=>({doc:id=>ref(`${path}/${name}/${id}`)})});const db={collection:name=>({doc:id=>ref(`${name}/${id}`)}),runTransaction:async fn=>fn({get:async r=>{reads.push(r.path);return {data:()=>records.get(r.path)};}})};
 const {readReceiptDeliveryTracking:read}=loadTs('src/lib/delivery/tracking-server.ts',{'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db}});
 assert.equal((await read(verified)).trackingUrl,'https://tracking.example/order');
 for(const patch of [{receiptTokenHash:'rotated'},{brandId:'foreign'},{locationId:'other'},{psp:{checkoutSessionId:'cs_test_other'}}]){
 records.set('orders/order',{...verified,...patch});reads.length=0;assert.equal(await read(verified),null);assert.deepEqual(reads,['orders/order']);
 }
});
test('persisted cancellation is bound to original accepted booking, preserves uncertainty and never refunds',()=>{
 const {order,attempt,result}=fixture(),saved={version:1,...scope,attemptRef:'attempt',providerDeliveryId:'native',environment:'sandbox',state:'cancelled',reconcileRequired:false,result:{kind:'cancelled',fee:null},operatorReason:'private reason',actorId:'private actor'};
 const interval={earliest:'2026-10-26T12:00:00Z',latest:'2026-10-26T12:10:00Z'};result.result.deliveryInterval=interval;
 const projectSaved=(s=saved,state=null,o=order)=>project('order',o,attempt,result,state,null,s);
 const good=projectSaved();assert.equal(good.cancellationState,'cancelled');assert.equal(good.deliveryStatus,'cancelled');assert.equal(good.bookingState,'accepted');assert.equal(good.paymentStatus,'paid');assert.equal(good.trackingUrl,null);assert.equal(good.deliveryInterval,null);
 for(const key of ['brandId','locationId','orderId','attemptRef','providerDeliveryId']){assert.equal(projectSaved({...saved,[key]:'foreign'}).cancellationState,null);}
 assert.equal(project('order',order,{...attempt,requestDigest:'b'.repeat(64)},result,null,null,saved).cancellationState,null);
 for(const patch of [{state:'unknown',result:{kind:'unknown',error:{code:'unavailable',message:'unknown',retryable:false}}},{state:'submitting',result:null},{reconcileRequired:true}])assert.notEqual(projectSaved({...saved,...patch}).deliveryStatus,'cancelled');
 for(const status of ['courier_to_pickup','picked_up','delivered','failed']){const v=projectSaved(saved,{...scope,provider:'wolt',providerDeliveryId:'native',status});assert.equal(v.cancellationState,'unknown');assert.equal(v.deliveryStatus,status);}
 assert.equal(projectSaved(saved,null,{...order,status:'Delivered'}).cancellationState,'unknown');
 assert.equal(projectSaved({...saved,result:null}).cancellationState,'unknown');
 for(const secret of ['private reason','private actor','providerDeliveryId','attemptRef'])assert.equal(JSON.stringify(good).includes(secret),false);
});
