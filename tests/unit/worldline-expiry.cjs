const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs'),vm=require('node:vm');
const {memoryDb}=require('../helpers/marketing-db.cjs');
const identities=require('../helpers/load-ts-graph.cjs').moduleGraph({'server-only':{},'@/lib/server/firestore-compat':{}})('src/lib/discount-reservations.ts');
function fixture(options={}){
 const binding={provider:'worldline',mode:'test',owner:{brandId:'b'},reference:'pinned-version',merchantNumber:'T123'};
 const rows=new Map([['orders/ORD-123',{brandId:'b',locationId:'l',paymentMethod:'Worldline',paymentStatus:'Pending',status:'Pending',discountReservation:'held',customerDetails:{id:'customer'},appliedDiscountId:null,firstTimeReservation:false,totalAmount:125,psp:{provider:'worldline',checkoutSessionId:'synthetic-token',...options.psp},paymentAgreement:binding,...options.order}]]);
 const db=memoryDb(rows),original=db.runTransaction;db.runTransaction=run=>original(tx=>run({...tx,update:(ref,patch)=>{
  const next={...patch};for(const k of Object.keys(patch).filter(k=>k.includes('.'))){const [parent,field]=k.split('.');next[parent]={...rows.get(ref.path)?.[parent],...next[parent],[field]:patch[k]};delete next[k];}tx.update(ref,next);
 }}));
 const events=[];let fetchCalls=0;
 const requireMock={
  'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db},
  './worldline-client':{readWorldlineTransaction:async()=>{options.duringTransactionRead?.(rows);if(options.transactionReadError)throw Error('synthetic private provider error');return {id:'123',orderid:'ORD-123',merchantnumber:options.merchantNumber??'T123',status:options.transactionStatus??'approved',currency:{code:'DKK',minorunits:2},total:{authorized:options.authorized??12500,captured:options.captured??0,credited:options.credited??0}};}},
  './worldline-verification':{assertWorldlineTransaction:(value,expected)=>{assert.equal(value.orderid,expected.orderId);assert.equal(value.merchantnumber,expected.merchantNumber);assert.equal(value.total.authorized,expected.amountMinor);return value;}},
  './worldline-store':{readPinnedWorldlineAgreement:async()=>({binding,credentials:{merchantNumber:'T123',accessToken:'test-access',secretToken:'test-secret'}})},
  '@/lib/delivery/payments/worldline-operation-authority':{cancelManagedWorldlineAuthorization:async orderId=>{events.push('managed-void');const order=rows.get('orders/'+orderId);order.psp.voided=true;order.status='Canceled';return {state:'confirmed'};}},
  './worldline-operations':{runWorldlineOperation:async input=>{events.push('void');assert.equal(input.operation,'delete');const order=rows.get('orders/'+input.orderId);order.psp.voided=true;order.paymentOperation=null;return {state:'confirmed'};}},
  '@/lib/discount-reservations':{reservationReleaseIdentity:identities.reservationReleaseIdentity,sameReservationReleaseIdentity:identities.sameReservationReleaseIdentity,releaseDiscount:async(orderId,brandId,sessionId,locationId)=>{const order=rows.get('orders/'+orderId);assert.equal(order.status,'Canceled','financial cancellation precedes capacity release');assert.equal(brandId,'b');assert.equal(locationId,'l');assert.equal(sessionId,order.psp.checkoutSessionId);events.push('release');order.discountReservation='released';order.paymentStatus='Failed';}},
 };
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/payments/worldline-expiry.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>requireMock[n]||require(n),Buffer,AbortSignal,fetch:async(url,input)=>{fetchCalls++;events.push('expire');assert.equal(url,'https://api.v1.checkout.bambora.com/sessions/synthetic-token');assert.equal(input.method,'DELETE');assert.equal(input.headers.Authorization,'Basic '+Buffer.from('test-access@T123:test-secret').toString('base64'));assert.match(rows.get('orders/ORD-123').paymentOperation,/^session-expiry:/);options.duringExpire?.(rows);if(options.timeout)throw Error('test-secret');return {ok:options.http!==false,status:options.httpStatus??(options.http===false?500:200),json:async()=>{if(options.jsonError)throw Error('private body');return options.body??{meta:{result:true}};}};}});
 return {api:exports,rows,events,fetchCalls:()=>fetchCalls,cancel:()=>exports.cancelWorldlineCheckout('ORD-123')};
}
test('confirmed provider expiry cancels atomically before releasing the hold',async()=>{const f=fixture();assert.equal(await f.cancel(),'canceled');assert.deepEqual(f.events,['expire','release']);assert.equal(f.rows.get('orders/ORD-123').psp.sessionExpired,true);assert.equal(f.rows.get('orders/ORD-123').paymentOperation,null);assert.equal(await f.cancel(),'canceled');assert.equal(f.fetchCalls(),1);});
test('timeout, malformed response and refusal preserve lock and reservation',async()=>{for(const options of [{timeout:true},{http:false},{body:{}},{body:{meta:{result:false}}}]){const f=fixture(options);assert.equal(await f.cancel(),'unknown');assert.equal(f.rows.get('orders/ORD-123').discountReservation,'held');assert.match(f.rows.get('orders/ORD-123').paymentOperation,/^session-expiry:/);assert.equal(f.events.includes('release'),false);}});
test('a capture operation lock is never overwritten by session cancellation',async()=>{const f=fixture({order:{paymentOperation:'capture-claim'}});assert.equal(await f.cancel(),'unknown');assert.equal(f.fetchCalls(),0);assert.equal(f.rows.get('orders/ORD-123').paymentOperation,'capture-claim');});
test('late callback authorization remains canceled and cannot race capture after expiry',async()=>{const f=fixture({duringExpire:rows=>{rows.get('orders/ORD-123').psp.transactionId='123';}});assert.equal(await f.cancel(),'canceled');assert.equal(f.rows.get('orders/ORD-123').status,'Canceled');assert.equal(f.rows.get('orders/ORD-123').psp.transactionId,'123');assert.equal(f.events.includes('void'),false,'durable callback worker owns the late authorization void');});
test('pinned agreement mutation while expiry runs prevents reservation release',async()=>{const f=fixture({duringExpire:rows=>{rows.get('orders/ORD-123').paymentAgreement={reference:'different'};}});await assert.rejects(f.cancel());assert.equal(f.events.includes('release'),false);});
test('known authorization uses verified core void and common cancellation finalizer',async()=>{const f=fixture({psp:{transactionId:'123'}});assert.equal(await f.cancel(),'canceled');assert.deepEqual(f.events,['void','release']);assert.equal(f.fetchCalls(),0);});
test('already-paid checkout is never canceled and missing session never authorizes release',async()=>{const paid=fixture({order:{paymentStatus:'Paid'}});assert.equal(await paid.cancel(),'paid');assert.equal(paid.fetchCalls(),0);const missing=fixture({psp:{checkoutSessionId:undefined}});await assert.rejects(missing.cancel());assert.equal(missing.events.includes('release'),false);});

test('managed authorized checkout expires the window before the callback worker can void it',async()=>{const f=fixture({order:{managedDelivery:{version:1},totalAmount:125},psp:{transactionId:'123'}});assert.equal(await f.cancel(),'canceled');assert.deepEqual(f.events,['expire','release']);assert.equal(f.rows.get('orders/ORD-123').psp.sessionExpired,true);});
test('managed capture already observed is never canceled or released',async()=>{const f=fixture({order:{managedDelivery:{version:1},totalAmount:125},psp:{transactionId:'123'},captured:12500});assert.equal(await f.cancel(),'paid');assert.deepEqual(f.events,[]);assert.equal(f.rows.get('orders/ORD-123').discountReservation,'held');});

test('signed callback authorization can be voided even if the create-session response was lost',async()=>{const f=fixture({psp:{checkoutSessionId:undefined,transactionId:'123'}});assert.equal(await f.cancel(),'canceled');assert.deepEqual(f.events,['void','release']);assert.equal(f.fetchCalls(),0);});

test('managed signed callback authorization can be voided with no recovered session token',async()=>{const f=fixture({order:{managedDelivery:{version:1},totalAmount:125},psp:{checkoutSessionId:undefined,transactionId:'123'}});assert.equal(await f.cancel(),'canceled');assert.deepEqual(f.events,['managed-void','release']);assert.equal(f.fetchCalls(),0);});

test('uncertain expiry records only safe diagnostics and schedules the original scoped recovery without automatic DELETE retries',async()=>{
 for(const [options,code] of [
  [{timeout:true},'WORLDLINE_CANCEL_EXPIRY_NETWORK_OR_TIMEOUT'],
  [{http:false,httpStatus:401,body:{meta:{result:false,message:{merchant:'synthetic-secret'}}}},'WORLDLINE_CANCEL_EXPIRY_HTTP_401'],
  [{http:false,httpStatus:404},'WORLDLINE_CANCEL_EXPIRY_HTTP_404'],
  [{body:{meta:{result:false,action:{code:'40005'},message:{merchant:'synthetic-secret'}}}},'WORLDLINE_CANCEL_EXPIRY_REJECTED_PROVIDER_40005'],
  [{body:{meta:{result:false,action:{code:'synthetic-secret'}}}},'WORLDLINE_CANCEL_EXPIRY_REJECTED'],
  [{jsonError:true},'WORLDLINE_CANCEL_EXPIRY_INVALID_RESPONSE'],
 ]){
  const f=fixture(options),before=Date.now();assert.equal(await f.cancel(),'unknown');assert.equal(f.fetchCalls(),1);assert.equal(f.events.includes('release'),false);
  const order=f.rows.get('orders/ORD-123'),job=f.rows.get('worldlineCheckoutExpiryJobs/ORD-123');
  assert.equal(order.psp.cancellationErrorCode,code);assert.equal(order.discountReservation,'held');assert.equal(order.paymentStatus,'Pending');
  assert.deepEqual([job.orderId,job.brandId,job.locationId],['ORD-123','b','l']);assert.ok(job.nextAttemptAt>=before&&job.nextAttemptAt<=Date.now()+15000);
  assert.doesNotMatch(JSON.stringify({order,job}),/synthetic-secret|test-secret|test-access/);
 }
});
test('an explicit same-session recheck can complete after a lost expiry reply without another checkout or capture',async()=>{
 const options={timeout:true},f=fixture(options);assert.equal(await f.cancel(),'unknown');const marker=f.rows.get('orders/ORD-123').paymentOperation;
 options.timeout=false;assert.equal(await f.cancel(),'canceled');assert.equal(f.fetchCalls(),2);assert.equal(f.events.filter(x=>x==='release').length,1);assert.equal(f.events.includes('void'),false);
 const order=f.rows.get('orders/ORD-123');assert.ok(marker.startsWith('session-expiry:'));assert.equal(order.psp.sessionExpired,true);assert.equal(order.psp.cancellationErrorCode,null);assert.equal(order.paymentOperation,null);
});
test('an original server-verified deleted zero-capture authorization completes cancellation without another money request',async()=>{
 const f=fixture({psp:{transactionId:'123'},transactionStatus:'deleted'});assert.equal(await f.cancel(),'canceled');assert.deepEqual(f.events,['release']);assert.equal(f.fetchCalls(),0);
 assert.equal(f.rows.get('orders/ORD-123').psp.voided,true);assert.equal(f.rows.get('orders/ORD-123').status,'Canceled');assert.equal(f.rows.get('orders/ORD-123').discountReservation,'released');
});
test('full captured transactions are never voided while partial capture stays explicitly unresolved',async()=>{
 for(const managed of [false,true]){
  const full=fixture({order:managed?{managedDelivery:{version:1}}:{},psp:{transactionId:'123'},captured:12500});assert.equal(await full.cancel(),'paid');assert.deepEqual(full.events,[]);
  const partial=fixture({order:managed?{managedDelivery:{version:1}}:{},psp:{transactionId:'123'},captured:100});assert.equal(await partial.cancel(),'unknown');assert.deepEqual(partial.events,[]);assert.equal(partial.rows.get('orders/ORD-123').psp.cancellationErrorCode,'WORLDLINE_CANCEL_CAPTURE_REQUIRES_RECONCILIATION');assert.equal(partial.rows.get('orders/ORD-123').discountReservation,'held');
 }
});
test('declined or unreadable transaction and wrong original merchant never prove unpaid cancellation',async()=>{
 for(const options of [{transactionStatus:'declined',authorized:0},{transactionReadError:true},{merchantNumber:'T_OTHER'}]){
  const f=fixture({...options,psp:{transactionId:'123'}});assert.equal(await f.cancel(),'unknown');assert.deepEqual(f.events,[]);assert.equal(f.rows.get('orders/ORD-123').discountReservation,'held');assert.equal(f.rows.get('orders/ORD-123').status,'Pending');
 }
});
test('native amount, brand, location, provider or method changes during expiry cannot release capacity',async()=>{
 for(const patch of [{totalAmount:126},{brandId:'other'},{locationId:'other'},{paymentMethod:'Stripe'},{psp:{provider:'stripe',checkoutSessionId:'synthetic-token'}}]){
  const f=fixture({duringExpire:rows=>Object.assign(rows.get('orders/ORD-123'),patch)});await assert.rejects(f.cancel());assert.equal(f.events.includes('release'),false);assert.equal(f.rows.get('orders/ORD-123').discountReservation,'held');
 }
});
test('an already completed concurrent cancellation is not changed back to unresolved or requeued',async()=>{
 const f=fixture({timeout:true,duringExpire:rows=>{const order=rows.get('orders/ORD-123');Object.assign(order,{status:'Canceled',paymentStatus:'Failed',discountReservation:'released',paymentOperation:null});order.psp.sessionExpired=true;order.psp.cancellationErrorCode=null;}});
 assert.equal(await f.cancel(),'canceled');assert.equal(f.rows.has('worldlineCheckoutExpiryJobs/ORD-123'),false);assert.equal(f.rows.get('orders/ORD-123').psp.cancellationErrorCode,null);
});
test('an unrelated tenant recovery job is never overwritten by a guest cancellation failure',async()=>{
 const f=fixture({timeout:true}),foreign={orderId:'ORD-123',brandId:'foreign',locationId:'other',nextAttemptAt:1};f.rows.set('worldlineCheckoutExpiryJobs/ORD-123',foreign);
 await assert.rejects(f.cancel(),/scope mismatch/);assert.deepEqual(f.rows.get('worldlineCheckoutExpiryJobs/ORD-123'),foreign);assert.equal(f.events.includes('release'),false);
});
test('a fully captured provider observation cannot report a changed native amount or tenant as paid',async()=>{
 for(const patch of [{totalAmount:126},{brandId:'other'},{locationId:'other'}]){
  const f=fixture({psp:{transactionId:'123'},captured:12500,duringTransactionRead:rows=>Object.assign(rows.get('orders/ORD-123'),patch)});
  await assert.rejects(f.cancel(),/state changed/);assert.equal(f.events.includes('release'),false);assert.equal(f.fetchCalls(),0);
 }
});
test('captured totals with a nonapproved provider status remain unresolved rather than claiming Paid',async()=>{
 for(const status of ['declined','deleted','pending']){
  const f=fixture({psp:{transactionId:'123'},captured:12500,transactionStatus:status});
  assert.equal(await f.cancel(),'unknown');assert.equal(f.rows.get('orders/ORD-123').psp.cancellationErrorCode,'WORLDLINE_CANCEL_CAPTURE_REQUIRES_RECONCILIATION');assert.deepEqual(f.events,[]);assert.equal(f.rows.get('orders/ORD-123').discountReservation,'held');
 }
});
