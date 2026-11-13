const {test}=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {moduleGraph}=require('../helpers/load-ts-graph.cjs'),{memoryDb}=require('../helpers/marketing-db.cjs');
function fixture({captured=0,mode='provider_instant',managed=false,transactionPatch={},operationState='confirmed'}={}){
 const psp={provider:'worldline',transactionId:'123',...(mode===undefined?{}:{captureMode:mode})};
 const order={brandId:'b',locationId:'l',status:'Pending',paymentStatus:'Pending',totalAmount:125,psp,paymentAgreement:{provider:'worldline',mode:'test',owner:{brandId:'b'},merchantNumber:'T123',reference:'pinned-version-1',revision:1},...(managed?{managedDelivery:{version:1,providerId:'wolt'}}:{})};
 // `undefined` needs an explicit fixture mutation because default parameters select instant mode.
 const rows=new Map([['orders/o',order],['worldlinePaymentJobs/o',{orderId:'o',brandId:'b',locationId:'l',transactionId:'123',state:'pending',nextAttemptAt:0,attempts:0}]]),db=memoryDb(rows);
 let observed={id:'123',orderid:'o',merchantnumber:'T123',status:'approved',currency:{code:'DKK',minorunits:2},total:{authorized:12500,captured,credited:0},...transactionPatch};
 const calls={read:0,secret:0,capture:[],managedCapture:[],settle:[]};
 const load=moduleGraph({'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db},'./worldline-store':{readPinnedWorldlineAgreement:async binding=>{calls.secret++;return {binding,credentials:{synthetic:true}};}},'./worldline-client':{readWorldlineTransaction:async()=>{calls.read++;return structuredClone(observed);}},'./worldline-operations':{runWorldlineOperation:async input=>{calls.capture.push(input);if(operationState==='confirmed'){observed.total.captured=12500;order.paymentOperation=null;}return {state:operationState};}},'@/lib/delivery/payments/worldline-operation-authority':{captureManagedWorldlineOrder:async id=>{calls.managedCapture.push(id);if(operationState==='confirmed'){observed.total.captured=12500;order.paymentOperation=null;}return {state:operationState};},cancelManagedWorldlineAuthorization:async()=>{throw Error('Unexpected cancellation');}},'@/lib/server/settle-checkout':{settleWorldlineOrder:async(...args)=>{assert.equal(observed.total.captured,12500,'Only fully captured observations may settle');calls.settle.push(args);order.paymentStatus='Paid';}}});
 return {api:load('src/lib/payments/worldline-reconcile.ts'),rows,order,calls,observe:patch=>observed={...observed,...patch}};
}
test('early provider-instant authorization and partial capture remain durable Pending without a second capture',async()=>{
 for(const managed of [false,true])for(const captured of [0,5000]){
  const f=fixture({captured,managed});await assert.rejects(f.api.reconcileWorldlineOrder('o'),error=>error.code==='worldline_capture_pending');
  assert.equal(f.order.paymentStatus,'Pending');assert.equal(f.rows.get('worldlinePaymentJobs/o').state,'pending');assert.equal(f.calls.capture.length,0);assert.equal(f.calls.managedCapture.length,0);assert.equal(f.calls.settle.length,0);
 }
});
test('provider full capture settles and closes the same durable job without own capture',async()=>{
 for(const managed of [false,true]){
  const f=fixture({managed});await assert.rejects(f.api.reconcileWorldlineOrder('o'),error=>error.code==='worldline_capture_pending');
  f.observe({total:{authorized:12500,captured:12500,credited:0}});await f.api.reconcileWorldlineOrder('o');
  assert.deepEqual(f.calls.settle,[['o','123']]);assert.equal(f.rows.get('worldlinePaymentJobs/o').state,'settled');assert.equal(f.order.paymentStatus,'Paid');assert.equal(f.calls.capture.length,0);assert.equal(f.calls.managedCapture.length,0);
 }
});
test('legacy authorization-only orders preserve their original standalone or managed capture journal',async()=>{
 for(const managed of [false,true]){
  const f=fixture({managed});delete f.order.psp.captureMode;await f.api.reconcileWorldlineOrder('o');
  assert.equal(f.calls.settle.length,1);assert.equal(f.calls.capture.length,managed?0:1);assert.equal(f.calls.managedCapture.length,managed?1:0);
  if(!managed){assert.equal(f.calls.capture[0].requestId,'initial-capture');assert.equal(f.calls.capture[0].amountMinor,12500);}
 }
});
test('legacy full capture still reconciles its outstanding own-capture journal before settlement',async()=>{
 const f=fixture({captured:12500});delete f.order.psp.captureMode;f.order.paymentOperation=createHash('sha256').update('initial-capture').digest('hex');
 await f.api.reconcileWorldlineOrder('o');assert.equal(f.calls.capture.length,1);assert.equal(f.calls.settle.length,1);
 const unknown=fixture({operationState:'unknown'});delete unknown.order.psp.captureMode;await assert.rejects(unknown.api.reconcileWorldlineOrder('o'),/Capture requires reconciliation/);assert.equal(unknown.calls.capture.length,1);assert.equal(unknown.calls.settle.length,0);assert.equal(unknown.rows.get('worldlinePaymentJobs/o').state,'pending');
});
test('unknown capture modes fail before provider I/O instead of falling back to server capture',async()=>{
 for(const mode of [null,'legacy','instant',false,0,{},'provider_instant ']){
  const f=fixture({mode,captured:12500});await assert.rejects(f.api.reconcileWorldlineOrder('o'),/Unknown Worldline capture mode/);assert.equal(f.calls.secret,0);assert.equal(f.calls.read,0);assert.equal(f.calls.capture.length,0);assert.equal(f.calls.settle.length,0);
 }
});
test('amount/account/order/currency mismatch and pending money operations cannot settle instant orders',async()=>{
 for(const transactionPatch of [{merchantnumber:'T999'},{orderid:'other'},{total:{authorized:12501,captured:12500,credited:0}},{currency:{code:'EUR',minorunits:2}},{total:{authorized:12500,captured:12500,credited:1}}]){
  const f=fixture({captured:12500,transactionPatch});await assert.rejects(f.api.reconcileWorldlineOrder('o'));assert.equal(f.calls.capture.length,0);assert.equal(f.calls.settle.length,0);
 }
 const f=fixture({captured:12500});f.order.paymentOperation=createHash('sha256').update('initial-capture').digest('hex');await assert.rejects(f.api.reconcileWorldlineOrder('o'),/Another operation/);assert.equal(f.calls.capture.length,0);assert.equal(f.calls.settle.length,0);
});

test('existing durable worker retries early authorization until provider capture completes, without capture writes',async()=>{
 const f=fixture();const early=await f.api.processWorldlineJobs();assert.equal(early.settled,0);
 let job=f.rows.get('worldlinePaymentJobs/o');assert.equal(job.state,'pending');assert.equal(job.attempts,1);assert.ok(job.nextAttemptAt>Date.now());assert.equal(f.calls.capture.length,0);assert.equal(f.calls.settle.length,0);
 f.observe({total:{authorized:12500,captured:12500,credited:0}});job.nextAttemptAt=0;const complete=await f.api.processWorldlineJobs();assert.equal(complete.settled,1);assert.equal(f.rows.get('worldlinePaymentJobs/o').state,'settled');assert.equal(f.calls.settle.length,1);assert.equal(f.calls.capture.length,0);assert.equal(f.calls.managedCapture.length,0);
});
