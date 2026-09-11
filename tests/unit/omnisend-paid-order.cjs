const {test}=require('node:test');
const assert=require('node:assert/strict');
const {contactKey,recordNewsletterConsent}=require('../helpers/load-ts.cjs').loadTs('src/lib/marketing/store.ts',{'server-only':{}});
const {loadTs}=require('../helpers/load-ts.cjs');
const {memoryDb}=require('../helpers/marketing-db.cjs');
const mocks={'server-only':{}};
const {buildPaidOrderEvent}=loadTs('src/lib/marketing/order-event.ts',mocks);
const {MarketingError,Omnisend}=loadTs('src/lib/marketing/provider.ts',mocks);
const {runMarketingOrderWorker,retryMarketingOrderJob}=loadTs('src/lib/marketing/order-worker.ts',mocks);
const config={brandId:'b',omnisendBrandId:'ob',apiKey:'synthetic-test-key',enabled:true,consentMode:'single_opt_in'};
process.env.ORDERFLY_OMNISEND_PAID_ORDERS_ENABLED='true';
process.env.ORDERFLY_OMNISEND_BRANDS=JSON.stringify([config]);
const eventTime='2026-09-11T12:00:00.000Z';
function order(status='Received') {return {id:'o',brandId:'b',locationId:'l',customerContact:'BUYER@example.test',customerDetails:{id:'c'},paymentStatus:'Paid',status,deliveryType:'Pickup',productItems:[{id:'p',name:'Pizza',quantity:2,unitPrice:60,totalPrice:120}],invoice:{number:'INV-2026-000001',issuedAt:eventTime,currency:'DKK',paymentMethod:'Stripe',lines:[{description:'Pizza',quantity:2,unitAmount:60,totalAmount:120}],subtotal:120,itemDiscount:10,orderDiscount:5,deliveryFee:0,vatAmount:17,totalAmount:105}};}
function fixture({consent=true,contact='synced',status='Received'}={}) {
 const db=memoryDb(),key=contactKey('b','buyer@example.test');
 db.rows.set('orders/o',order(status));
 db.rows.set('customers/c',{brandId:'b',email:'buyer@example.test',marketingConsent:consent});
 db.rows.set('marketingContacts/'+key,{brandId:'b',customerId:'c',state:contact,providerStatus:'subscribed'});
 db.rows.set('marketingOrderOutbox/job',{orderId:'o',brandId:'b',locationId:'l',customerId:'c',kind:'paidOrder',eventId:'event-1',eventTime,state:'pending',attempts:0,nextAttemptAt:1,createdAt:1,updatedAt:1});
 return db;
}

test('#119 paid-order payload uses the immutable invoice and Omnisend currency values',()=>{
 const payload=buildPaidOrderEvent(order(),order().invoice,{eventId:'event-1',eventTime},'buyer@example.test');
 assert.equal(payload.eventName,'paid for order');assert.equal(payload.origin,'api');assert.equal(payload.eventVersion,'v2');
 assert.equal(payload.eventID,'event-1');assert.equal(payload.contact.email,'buyer@example.test');
 assert.equal(payload.properties.orderID,'o');assert.equal(payload.properties.orderNumber,'INV-2026-000001');
 assert.equal(payload.properties.subTotalPrice,120);assert.equal(payload.properties.totalDiscount,15);assert.equal(payload.properties.totalPrice,105);assert.equal(payload.properties.totalTax,17);
 assert.deepEqual(payload.properties.lineItems,[{productID:'p',productTitle:'Pizza',productQuantity:2,productPrice:60,productDiscount:0}]);
 assert.equal(JSON.stringify(payload).includes('analytics'),false);
});

test('#119 provider sends the native event endpoint with the configured API version',async()=>{
 let sent;
 const provider=new Omnisend(config,async(url,init)=>{sent={url,init};return Response.json({eventID:'event-1'});});
 await provider.paidOrder({eventName:'paid for order'});
 assert.equal(sent.url,'https://api.omnisend.com/api/events');assert.equal(sent.init.method,'POST');assert.equal(sent.init.headers['Omnisend-Version'],'2026-03-15');
 assert.equal(JSON.parse(sent.init.body).eventName,'paid for order');
});

test('#119 eligible verified order is accepted exactly once by competing workers',async()=>{
 const db=fixture();let calls=0,payload;
 const provider=()=>({verifyBrand:async()=>{},paidOrder:async value=>{calls++;payload=value;}});
 await Promise.all([runMarketingOrderWorker(db,2,provider),runMarketingOrderWorker(db,2,provider)]);
 assert.equal(calls,1);assert.equal(payload.contact.email,'buyer@example.test');assert.equal(db.rows.get('marketingOrderOutbox/job').state,'accepted');
 assert.equal(await retryMarketingOrderJob(db,'b','job'),false);
});

test('#119 revoked consent and canceled orders are suppressed before provider dispatch',async()=>{
 for(const options of [{consent:false},{status:'Canceled'}]){
  const db=fixture(options);let calls=0;
  await runMarketingOrderWorker(db,2,()=>({verifyBrand:async()=>{calls++;},paidOrder:async()=>{calls++;}}));
  assert.equal(calls,0);assert.equal(db.rows.get('marketingOrderOutbox/job').state,'suppressed');
 }
});

test('#119 pending contact defers without dispatch and a known 429 can retry',async()=>{
 const pending=fixture({contact:'pending'});let calls=0;
 const result=await runMarketingOrderWorker(pending,2,()=>({verifyBrand:async()=>{calls++;},paidOrder:async()=>{calls++;}}));
 assert.equal(calls,0);assert.equal(result.deferred,1);assert.equal(pending.rows.get('marketingOrderOutbox/job').state,'pending');
 const db=fixture();
 await runMarketingOrderWorker(db,2,()=>({verifyBrand:async()=>{},paidOrder:async()=>{throw new MarketingError('provider_http_429',true,false);}}));
 const job=db.rows.get('marketingOrderOutbox/job');assert.equal(job.state,'failed');assert.ok(job.nextAttemptAt>2);assert.equal(await retryMarketingOrderJob(db,'other','job'),false);assert.equal(await retryMarketingOrderJob(db,'b','job'),true);
});

test('#119 uncertain post-dispatch outcome is never retried blindly',async()=>{
 const db=fixture();
 await runMarketingOrderWorker(db,2,()=>({verifyBrand:async()=>{},paidOrder:async()=>{throw new MarketingError('provider_unavailable',true,true);}}));
 assert.equal(db.rows.get('marketingOrderOutbox/job').state,'uncertain');assert.equal(await retryMarketingOrderJob(db,'b','job'),false);
 const crashed=fixture();crashed.rows.get('marketingOrderOutbox/job').state='dispatching';crashed.rows.get('marketingOrderOutbox/job').nextAttemptAt=1;
 await runMarketingOrderWorker(crashed,2,()=>{throw Error('must not dispatch');});assert.equal(crashed.rows.get('marketingOrderOutbox/job').state,'uncertain');
});

test('#119 admin projection distinguishes job types without exposing customer or order data',async()=>{
 const db=memoryDb(),orderId='a'.repeat(64),contactId='b'.repeat(64);
 db.rows.set('marketingOrderOutbox/'+orderId,{brandId:'b',orderId:'private-order',customerId:'private-customer',state:'failed',attempts:1,createdAt:2,updatedAt:2,lastError:'provider_http_400'});
 db.rows.set('marketingOutbox/'+contactId,{brandId:'b',email:'private@example.test',state:'synced',attempts:1,createdAt:1,updatedAt:1});
 const route=loadTs('src/app/api/superadmin/marketing/route.ts',{
  ...mocks,'@/lib/firebase-admin':{getAdminDb:()=>db},'@/lib/marketing/auth':{marketingAdminAuthorized:async()=>true},'@/lib/url':{getOrigin:async()=> 'https://fixture.test'},
 });
 const response=await route.GET(new Request('https://fixture.test/api/superadmin/marketing?brandId=b')),body=await response.json();
 assert.deepEqual(body.jobs.map(job=>job.kind),['paid_order','contact']);assert.doesNotMatch(JSON.stringify(body),/private-order|private-customer|private@example/);
 const retry=await route.POST(new Request('https://fixture.test/api/superadmin/marketing',{method:'POST',headers:{origin:'https://fixture.test'},body:JSON.stringify({brandId:'b',id:orderId,kind:'paid_order'})}));
 assert.equal((await retry.json()).success,true);assert.equal(db.rows.get('marketingOrderOutbox/'+orderId).state,'pending');
});

test('#119 actual consent store is found by paid-order worker',async()=>{
 const db=fixture();db.rows.delete('marketingContacts/'+contactKey('b','buyer@example.test'));
 await recordNewsletterConsent(db,{brandId:'b',brandName:'Fixture',locationId:'l',customerId:'c',email:'BUYER@example.test'});
 const contact=db.rows.get('marketingContacts/'+contactKey('b','buyer@example.test'));contact.state='synced';
 let calls=0;await runMarketingOrderWorker(db,2,()=>({verifyBrand:async()=>{},paidOrder:async()=>{calls++;}}));
 assert.equal(calls,1);assert.equal(db.rows.get('marketingOrderOutbox/job').state,'accepted');
});

test('#119 failed contact sync can recover before its order is dispatched',async()=>{
 const db=fixture({contact:'failed'});let calls=0;const provider=()=>({verifyBrand:async()=>{},paidOrder:async()=>{calls++;}});
 const first=await runMarketingOrderWorker(db,2,provider);assert.equal(first.deferred,1);assert.equal(calls,0);
 db.rows.get('marketingContacts/'+contactKey('b','buyer@example.test')).state='synced';
 db.rows.get('marketingOrderOutbox/job').nextAttemptAt=1;
 await runMarketingOrderWorker(db,2,provider);assert.equal(calls,1);
});

test('#119 consent revocation and cancellation during provider verification stop dispatch',async()=>{
 for (const mutate of [db=>db.rows.get('customers/c').marketingConsent=false,db=>db.rows.get('orders/o').status='Canceled',db=>db.rows.get('marketingContacts/'+contactKey('b','buyer@example.test')).state='suppressed']) {
  const db=fixture();let calls=0;await runMarketingOrderWorker(db,2,()=>({verifyBrand:async()=>mutate(db),paidOrder:async()=>{calls++;}}));
  assert.equal(calls,0);assert.equal(db.rows.get('marketingOrderOutbox/job').state,'suppressed');
 }
});

test('#119 exhausted shared deadline leaves jobs available for the next invocation',async()=>{
 const db=fixture();const before=structuredClone(db.rows.get('marketingOrderOutbox/job'));
 const counts=await runMarketingOrderWorker(db,2,()=>{throw Error('must not start');},Date.now()+1000);
 assert.equal(counts.processed,0);assert.deepEqual(db.rows.get('marketingOrderOutbox/job'),before);
});


test('#119 release gate defaults closed and blocks worker and retry before any database access',async()=>{
 const {paidOrderMarketingEnabled}=loadTs('src/lib/marketing/config.ts',mocks);
 try {
  for(const value of [undefined,'false','TRUE','1']) {
   if(value===undefined)delete process.env.ORDERFLY_OMNISEND_PAID_ORDERS_ENABLED;else process.env.ORDERFLY_OMNISEND_PAID_ORDERS_ENABLED=value;
   assert.equal(paidOrderMarketingEnabled(),false);
   const db={collection:()=>{throw Error('disabled worker accessed outbox');}};
   assert.equal((await runMarketingOrderWorker(db)).processed,0);
   assert.equal(await retryMarketingOrderJob(db,'b','job'),false);
  }
 } finally {process.env.ORDERFLY_OMNISEND_PAID_ORDERS_ENABLED='true';}
});

test('#119 acknowledged provider send survives completion failure without permitting replay',async()=>{
 const db=fixture(),run=db.runTransaction;let failOnce=true,calls=0;
 db.runTransaction=fn=>run(tx=>fn({...tx,update:(ref,data)=>{
  if(data.state==='accepted'&&failOnce){failOnce=false;throw Error('transient database failure');}
  tx.update(ref,data);
 }}));
 await runMarketingOrderWorker(db,2,()=>({verifyBrand:async()=>{},paidOrder:async()=>{calls++;}}));
 assert.equal(calls,1);assert.equal(db.rows.get('marketingOrderOutbox/job').state,'uncertain');
 assert.equal(await retryMarketingOrderJob(db,'b','job'),false);
 await runMarketingOrderWorker(db,Date.now()+1000000,()=>{throw Error('must not replay');});
 assert.equal(calls,1);
});

test('#119 unknown post-dispatch failures cannot become retryable jobs',async()=>{
 const db=fixture();await runMarketingOrderWorker(db,2,()=>({verifyBrand:async()=>{},paidOrder:async()=>{throw Error('unknown transport failure');}}));
 assert.equal(db.rows.get('marketingOrderOutbox/job').state,'uncertain');
 assert.equal(await retryMarketingOrderJob(db,'b','job'),false);
});

test('#119 fully discounted line retains zero net price and full unit discount',()=>{
 const o=order();o.productItems=[{id:'free',name:'Free Pizza',quantity:1,totalPrice:0},{id:'paid',name:'Pizza',quantity:1,totalPrice:50}];
 Object.assign(o.invoice,{lines:[{description:'Free Pizza',quantity:1,unitAmount:100,totalAmount:100},{description:'Pizza',quantity:1,unitAmount:50,totalAmount:50}],subtotal:150,itemDiscount:100,orderDiscount:0,totalAmount:50,vatAmount:10});
 const payload=buildPaidOrderEvent(o,o.invoice,{eventId:'event-1',eventTime},'buyer@example.test');
 assert.equal(payload.properties.totalPrice,50);assert.equal(payload.properties.totalDiscount,100);
 assert.deepEqual(payload.properties.lineItems.map(i=>[i.productPrice,i.productDiscount]),[[0,100],[50,0]]);
});
