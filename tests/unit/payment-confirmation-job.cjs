const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {loadTs}=require('../helpers/load-ts.cjs');
process.env.ORDERFLY_OMNISEND_PAID_ORDERS_ENABLED='true';
const jobKey='orderNotificationJobs/'+createHash('sha256').update(JSON.stringify(['order-confirmation','b','ORD-TEST'])).digest('hex');
const marketingJobKey='marketingOrderOutbox/'+createHash('sha256').update(JSON.stringify(['omnisend-paid-order','b','ORD-TEST'])).digest('hex');
function fixture({paid=false,missingInvoice=false,job,fail=false,marketingConsent=false}={}) {
 let records={
  'orders/ORD-TEST':{brandId:'b',locationId:'l',paymentStatus:paid?'Paid':'Pending',status:'Received',psp:{checkoutSessionId:'cs_test_fixture_123456'},customerDetails:{id:'c',address:'For Pickup'},customerName:'Test Kunde',customerContact:'kunde@example.test',deliveryType:'Pickup',productItems:[{name:'Pizza',quantity:1,totalPrice:100,listTotalPrice:120}],paymentDetails:{subtotal:120,itemDiscountTotal:20,cartDiscountTotal:0,deliveryFee:0,bagFee:0,adminFee:0,vatAmount:20},totalAmount:100,appliedDiscountId:'d'},
  'brands/b':{name:'Fixture Brand',companyName:'Fixture Brand ApS',companyRegNo:'12345678',street:'Testvej 1',zipCode:'1000',city:'København K',country:'DK',currency:'DKK',vatPercentage:25},
  'locations/l':{brandId:'b',name:'Fixture Location',address:'Testvej 1, 1000 København K, DK'},
  'customers/c':{brandId:'b',email:'kunde@example.test',marketingConsent,totalOrders:paid?1:0,totalSpend:paid?100:0},
  'discounts/d':{brandId:'b',usedCount:paid?1:0},
 };
 if(paid&&!missingInvoice){
  records['orders/ORD-TEST'].invoice={number:'INV-2026-000001'};
  records['invoiceCounters/b-2026']={brandId:'b',year:2026,lastNumber:1};
 }
 if(job)records[jobKey]={orderId:'ORD-TEST',brandId:'b',locationId:'l',kind:'orderConfirmation',eventId:'keep',attempts:2,...job};
 let capacity=0,analytics=0,queue=Promise.resolve();
 const session={id:'cs_test_fixture_123456',payment_status:'paid',status:'complete',payment_intent:'pi',amount_total:10000,metadata:{orderId:'ORD-TEST',brandId:'b',locationId:'l'}};
 const snapshot=value=>({exists:()=>!!value,data:()=>value});
 const mocks={
  'server-only':{},'@/lib/firebase':{db:{}},
  '@/app/superadmin/settings/actions':{getActiveStripeSecretKey:async()=> 'fixture'},
  'stripe':{default:class{checkout={sessions:{retrieve:async()=>structuredClone(session)}}}},
  'next/server':{NextResponse:{json:(body,init)=>Response.json(body,init)}},
  '@/lib/analytics-server':{trackServerEvent:async()=>{analytics++;}},
  '@/lib/server/discount-capacity':{prepareAdminCapacitySettlement:async(...args)=>{const commit=await loadTs('src/lib/server/discount-capacity.ts',{'server-only':{}}).prepareAdminCapacitySettlement(...args);return()=>{commit();capacity++;};}},
  'firebase/firestore':{
   doc:(_,collection,id)=>collection+'/'+id,serverTimestamp:()=> 'now',getDoc:async ref=>snapshot(structuredClone(records[ref])),
   runTransaction:(_,fn)=>{
    const task=queue.then(async()=>{
     const draft=structuredClone(records);let writes=false;
     const result=await fn({get:async ref=>{assert.equal(writes,false,'Firestore reads must precede writes');return snapshot(draft[ref]);},
      set:(ref,value)=>{writes=true;if(fail)throw Error('write failure');draft[ref]=value;},
      update:(ref,value)=>{writes=true;draft[ref]={...draft[ref],...value};}});
     records=draft;return result;
    });queue=task.catch(()=>{});return task;
   },
  },
 };
 const adminRef=path=>({path,id:path.split('/').at(-1)});
 const client=mocks['firebase/firestore'];
 const transact=client.runTransaction;
 // Client permissions deny the private outbox. Settlement must use Admin SDK.
 client.runTransaction=()=>{throw Error('permission-denied: client transaction');};
 mocks['@/lib/firebase-admin']={getAdminFieldValue:()=>({serverTimestamp:()=> 'now'}),getAdminDb:()=>({
  collection:collection=>({doc:id=>adminRef(collection+'/'+id)}),
  runTransaction:fn=>transact(null,async tx=>fn({
   get:async ref=>{assert.ok(ref.path,'Admin settlement requires server document references');const snap=await tx.get(ref.path);return{exists:snap.exists(),data:snap.data,id:ref.id,ref};},
   set:(ref,data,opts)=>tx.set(ref.path,data,opts),update:(ref,data)=>tx.update(ref.path,data),
  })),
 })};
 const settlement=loadTs('src/lib/server/settle-checkout.ts',mocks);
 mocks['@/lib/server/settle-checkout']=settlement;
 const route=loadTs('src/app/api/payments/confirm-from-session/route.ts',mocks);
 return {session,settle:()=>settlement.settlePaidCheckoutSession(session),records:()=>records,counters:()=>({capacity,analytics}),
  post:(body={orderId:'ORD-TEST',sessionId:'cs_test_fixture_123456'})=>route.POST(new Request('https://fixture.test',{method:'POST',body:JSON.stringify(body)}))};
}
test('confirmation endpoint atomically settles payment and creates job; webhook/receipt repeats account once',async()=>{
 const f=fixture();assert.equal((await f.post()).status,200);
 await Promise.all([f.settle(),f.settle(),f.post()]);
 assert.equal(f.records()['orders/ORD-TEST'].paymentStatus,'Paid');
 assert.equal(f.records()[jobKey].state,'pending');
 assert.equal(f.records()['customers/c'].totalOrders,1);assert.equal(f.records()['customers/c'].totalSpend,100);
 assert.equal(f.records()['discounts/d'].usedCount,1);assert.deepEqual(f.counters(),{capacity:1,analytics:1});
 assert.equal(Object.keys(f.records()).filter(k=>k.startsWith('orderNotificationJobs/')).length,1);
});
test('verified settlement atomically creates one consent-gated Omnisend order job',async()=>{
 const f=fixture({marketingConsent:true});await Promise.all([f.settle(),f.settle(),f.settle()]);
 const job=f.records()[marketingJobKey];assert.equal(job.state,'pending');assert.equal(job.kind,'paidOrder');assert.equal(job.customerId,'c');assert.match(job.eventTime,/Z$/);
 assert.equal(Object.keys(f.records()).filter(k=>k.startsWith('marketingOrderOutbox/')).length,1);
 const noConsent=fixture();await noConsent.settle();assert.equal(noConsent.records()[marketingJobKey],undefined);
});
test('legacy Paid missing job is repaired once without financial/accounting replay',async()=>{
 const f=fixture({paid:true,missingInvoice:true});const original=structuredClone(f.records());
 await Promise.all([f.post(),f.settle(),f.settle()]);
 assert.equal(f.records()[jobKey].state,'pending');assert.ok(f.records()[jobKey].eventId);
 assert.deepEqual(f.records()['customers/c'],original['customers/c']);
 assert.deepEqual(f.records()['discounts/d'],original['discounts/d']);
 assert.equal(f.records()['orders/ORD-TEST'].invoice,undefined);
 assert.equal(f.records()['invoiceCounters/b-2026'],undefined);
 assert.deepEqual(f.counters(),{capacity:0,analytics:0});
});
test('existing pending, accepted, uncertain, failed and suppressed jobs retain event and retry state',async()=>{
 for(const state of ['pending','accepted','uncertain','failed','suppressed']){
  const f=fixture({paid:true,job:{state,nextAttemptAt:123,lastError:'keep'}});const before=structuredClone(f.records());
  await f.post();await f.settle();assert.deepEqual(f.records(),before);
 }
});
test('complete but unpaid session never marks Paid or creates a job',async()=>{
 const f=fixture();f.session.payment_status='unpaid';const before=structuredClone(f.records());
 const response=await f.post();assert.equal(response.status,200);assert.equal((await response.json()).status,'Pending');
 assert.equal(await f.settle(),false);assert.deepEqual(f.records(),before);
});
test('wrong session, order, brand or location cannot mutate an order',async()=>{
 for(const patch of [{id:'cs_test_wrong_session_12345'},{metadata:{orderId:'OTHER',brandId:'b',locationId:'l'}},{metadata:{orderId:'ORD-TEST',brandId:'other',locationId:'l'}},{metadata:{orderId:'ORD-TEST',brandId:'b',locationId:'other'}}]){
  const f=fixture();Object.assign(f.session,patch);const before=structuredClone(f.records());
  assert.equal((await f.post()).status,403);await assert.rejects(f.settle());assert.deepEqual(f.records(),before);
 }
});
test('failed job creation rolls back Paid update and totals; route returns safe no-store error',async()=>{
 const f=fixture({fail:true});const before=structuredClone(f.records());const response=await f.post();
 assert.equal(response.status,500);assert.equal(response.headers.get('cache-control'),'private, no-store');
 assert.deepEqual(await response.json(),{ok:false,error:'server_error'});assert.deepEqual(f.records(),before);
});
test('paid repair refuses missing stored session and corrupt job scope; canceled does not enqueue',async()=>{
 const missing=fixture({paid:true});delete missing.records()['orders/ORD-TEST'].psp;
 await assert.rejects(missing.settle(),/scope mismatch/);assert.equal(missing.records()[jobKey],undefined);
 const mismatch=fixture({paid:true,job:{state:'accepted',locationId:'other'}});
 await assert.rejects(mismatch.settle(),/Confirmation scope mismatch/);
 const canceled=fixture({paid:true});canceled.records()['orders/ORD-TEST'].status='Canceled';
 await canceled.settle();assert.equal(canceled.records()[jobKey],undefined);
});
test('invalid input rejected before any mutation',async()=>{
 const f=fixture();const before=structuredClone(f.records());
 for(const body of [{},{orderId:'../other',sessionId:f.session.id},{orderId:'ORD-TEST',sessionId:'invalid'},{orderId:'ORD-TEST',sessionId:f.session.id,brandId:'other'}])assert.equal((await f.post(body)).status,400);
 assert.deepEqual(f.records(),before);
});

test('signed asynchronous success invokes the same settlement; invalid signature does not',async()=>{
 let calls=0,invalid=false;
 const session={payment_status:'paid',metadata:{orderId:'ORD-TEST'}};
 const api=loadTs('src/app/api/stripe/webhook/route.ts',{
  '@/lib/server/settle-checkout':{settlePaidCheckoutSession:async value=>{assert.equal(value,session);calls++;}},
  '@/lib/discount-reservations':{},'next/headers':{headers:async()=>({get:()=> 'signature'})},
  '@/app/superadmin/settings/actions':{getActiveStripeSecretKey:async()=> 'fixture',getActiveStripeWebhookSecret:async()=> 'fixture'},
  stripe:{default:class{webhooks={constructEventAsync:async()=>{if(invalid)throw Error('invalid');return{type:'checkout.session.async_payment_succeeded',data:{object:session}};}}}},
 });
 const request=()=>new Request('https://fixture.test',{method:'POST',body:'event'});
 assert.equal((await api.POST(request())).status,200);assert.equal(calls,1);
 invalid=true;assert.equal((await api.POST(request())).status,400);assert.equal(calls,1);
});


test('Admin settlement consumes the same bounded reservation counters exactly once',async()=>{
 const f=fixture(),r=f.records(),key=parts=>createHash('sha256').update(JSON.stringify(parts)).digest('hex');
 const customer='checkout_customer_capacity/'+key(['b','c']);
 const discount='checkout_discount_capacity/'+key(['b','d']);
 const pair='checkout_customer_discount_capacity/'+key(['b','c','d']);
 Object.assign(r['orders/ORD-TEST'],{discountReservation:'held',firstTimeReservation:true});
 r[customer]={paid:3,held:2,firstTimeHeld:true};r[discount]={paid:8,held:4};r[pair]={paid:1,held:1};
 await Promise.all([f.settle(),f.settle(),f.post()]);
 assert.deepEqual(f.records()[customer],{paid:4,held:1,firstTimeHeld:false});
 assert.deepEqual(f.records()[discount],{paid:9,held:3});
 assert.deepEqual(f.records()[pair],{paid:2,held:0});
});

test('release gate disabled keeps settlement working without private outbox reads or writes',async()=>{
 process.env.ORDERFLY_OMNISEND_PAID_ORDERS_ENABLED='false';
 try {
  const f=fixture({marketingConsent:true});
  // Any read of this unrelated/corrupt record would reject payment settlement.
  f.records()[marketingJobKey]={brandId:'other'};
  assert.equal(await f.settle(),true);
  assert.deepEqual(f.records()[marketingJobKey],{brandId:'other'});
  assert.equal(f.records()['orders/ORD-TEST'].paymentStatus,'Paid');
  assert.equal(f.records()[jobKey].state,'pending');
 } finally {process.env.ORDERFLY_OMNISEND_PAID_ORDERS_ENABLED='true';}
});
