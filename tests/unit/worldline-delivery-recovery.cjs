const {test}=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {moduleGraph}=require('../helpers/load-ts-graph.cjs'),{memoryDb}=require('../helpers/marketing-db.cjs');
const binding={provider:'worldline',mode:'test',owner:{brandId:'brand'},merchantNumber:'T123',revision:1,reference:`projects/orderfly-39325/secrets/orderfly-worldline-${'a'.repeat(64)}-test/versions/1`};
function fixture(count=1,options={}){
 const rows=new Map(),calls=[],settled=[];
 for(let i=1;i<=count;i++){const orderId='order'+i;rows.set('orders/'+orderId,{brandId:'brand',locationId:'location',paymentMethod:'Worldline',paymentStatus:'Pending',status:'Pending',totalAmount:100,paymentAgreement:binding,psp:{provider:'worldline',transactionId:String(i),checkoutSessionId:'session'+i}});rows.set('worldlinePaymentJobs/'+orderId,{orderId,brandId:'brand',locationId:'location',transactionId:String(i),state:'pending',nextAttemptAt:1,attempts:0});}
 const db=memoryDb(rows),load=moduleGraph({'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db},'./worldline-store':{readPinnedWorldlineAgreement:async()=>({binding,credentials:{}})},'./worldline-client':{readWorldlineTransaction:async(keys,mode,transactionId)=>{if(options.poison&&Number(transactionId)<=10)throw Error('provider unavailable');return {id:transactionId,orderid:'order'+transactionId,merchantnumber:'T123',status:options.deleted?'deleted':'approved',currency:{code:'DKK',minorunits:2},total:{authorized:10000,captured:options.authorized?0:10000,credited:0}};}},'./worldline-operations':{runWorldlineOperation:async input=>{calls.push(input);const order=rows.get('orders/'+input.orderId);order.paymentOperation=null;order.paymentRevision=(order.paymentRevision??0)+1;return {state:'confirmed'};}},'@/lib/delivery/payments/worldline-operation-authority':{},'@/lib/server/settle-checkout':{settleWorldlineOrder:async orderId=>{assert.ok(!rows.get('orders/'+orderId).paymentOperation);settled.push(orderId);}}});
 return {rows,calls,settled,api:load('src/lib/payments/worldline-reconcile.ts')};
}
test('due ordering reaches an eleventh valid callback job despite ten permanent provider failures',async()=>{
 const f=fixture(11,{poison:true});for(let i=0;i<11;i++)await f.api.processWorldlineJobs();assert.deepEqual(f.settled,['order11']);assert.equal(f.rows.get('worldlinePaymentJobs/order11').state,'settled');for(let i=1;i<=10;i++){const job=f.rows.get('worldlinePaymentJobs/order'+i);assert.equal(job.attempts,1);assert.ok(job.nextAttemptAt>Date.now());}
});
test('already captured provider result still reconciles an unresolved initial capture journal before settlement',async()=>{
 const f=fixture();f.rows.get('orders/order1').paymentOperation=createHash('sha256').update('initial-capture').digest('hex');await f.api.reconcileWorldlineOrder('order1');assert.equal(f.calls.length,1);assert.equal(f.calls[0].requestId,'initial-capture');assert.deepEqual(f.settled,['order1']);
});
test('another pending financial operation cannot be bypassed by captured provider observation',async()=>{
 const f=fixture();f.rows.get('orders/order1').paymentOperation='other';// Real proof rejects this before settlement; this recovery module must reject before entering it too.
 await assert.rejects(f.api.reconcileWorldlineOrder('order1'));assert.equal(f.calls.length,0);assert.equal(f.settled.length,0);
});
test('late authorization after confirmed session cancellation is voided without settlement',async()=>{
 const f=fixture(1,{authorized:true});Object.assign(f.rows.get('orders/order1'),{status:'Canceled',psp:{provider:'worldline',transactionId:'1',sessionExpired:true}});await f.api.reconcileWorldlineOrder('order1');assert.equal(f.calls[0].operation,'delete');assert.equal(f.calls[0].requestId,'canceled-authorization');assert.equal(f.settled.length,0);assert.equal(f.rows.get('worldlinePaymentJobs/order1').state,'canceled');
});

test('verified void marker plus deleted provider state completes canceled job without inventing session expiry',async()=>{
 const f=fixture(1,{authorized:true,deleted:true});Object.assign(f.rows.get('orders/order1'),{status:'Canceled',paymentStatus:'Failed',psp:{provider:'worldline',transactionId:'1',voided:true}});await f.api.reconcileWorldlineOrder('order1');assert.equal(f.calls.length,0);assert.equal(f.settled.length,0);assert.equal(f.rows.get('worldlinePaymentJobs/order1').state,'canceled');
});
