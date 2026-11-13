const {test}=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {loadTs}=require('../helpers/load-ts.cjs'),{memoryDb}=require('../helpers/marketing-db.cjs');
function fixture({onReconcile,afterFailure=false,timeoutMs=30}={}){
 const binding={provider:'worldline',owner:{brandId:'b'},mode:'test',merchantNumber:'T123',reference:`projects/orderfly-39325/secrets/orderfly-worldline-${'a'.repeat(64)}-test/versions/7`,revision:1};
 const order={id:'ORD-123',brandId:'b',locationId:'l',totalAmount:125,paymentMethod:'Worldline',paymentStatus:'Pending',status:'Pending',psp:{provider:'worldline'},paymentAgreement:binding};
 const rows=new Map([['orders/ORD-123',order]]),db=memoryDb(rows),run=db.runTransaction;
 db.runTransaction=callback=>run(tx=>callback({...tx,update:(ref,input)=>{const next={...input};if(input['psp.transactionId']){next.psp={...rows.get(ref.path).psp,transactionId:input['psp.transactionId']};delete next['psp.transactionId'];}return tx.update(ref,next);}}));
 const after=[];let calls=0;
 const completion=loadTs('src/lib/payments/worldline-callback-completion.ts',{'server-only':{}});
 const api=loadTs('src/app/api/payments/worldline/callback/route.ts',{'server-only':{},'next/server':{after:callback=>{if(afterFailure)throw Error('continuation unavailable');after.push(callback);}},'@/lib/firebase-admin':{getAdminDb:()=>db},'@/lib/payments/worldline-store':{readPinnedWorldlineAgreement:async input=>{assert.equal(input.reference,binding.reference);return {binding:input,credentials:{md5Key:'synthetic-md5'}};}},'@/lib/payments/worldline-reconcile':{reconcileWorldlineOrder:async()=>{calls++;assert.ok(rows.has('worldlinePaymentJobs/ORD-123'),'work must start after durable admission');if(onReconcile)await onReconcile(rows);}},'@/lib/payments/worldline-callback-completion':{waitForWorldlineCallbackFinancialCompletion:input=>completion.waitForWorldlineCallbackFinancialCompletion({...input,timeoutMs:Math.min(input.timeoutMs,timeoutMs),pollIntervalMs:1})}});
 const request=(patch={},invalidHash=false)=>{const q=new URLSearchParams({txnid:'123',orderid:'ORD-123',amount:'12500',currency:'DKK',...patch});q.set('hash',invalidHash?'0'.repeat(32):createHash('md5').update([...q.values()].join('')+'synthetic-md5').digest('hex'));return new Request('https://example.test/api/payments/worldline/callback?'+q);};
 return {api,rows,request,after,calls:()=>calls};
}
test('callback before customer return durably admits exactly one transaction, never marks Paid',async()=>{
 const f=fixture();assert.equal((await f.api.GET(f.request())).status,200);assert.equal(f.rows.get('orders/ORD-123').paymentStatus,'Pending');assert.equal(f.rows.get('orders/ORD-123').psp.transactionId,'123');assert.equal(f.rows.get('worldlinePaymentJobs/ORD-123').state,'pending');
 assert.equal((await f.api.GET(f.request())).status,200);assert.equal([...f.rows].filter(([p])=>p.startsWith('worldlinePaymentJobs/')).length,1);assert.equal(f.calls(),1);assert.equal(f.after.length,1);await f.after[0]();assert.equal(f.calls(),1);
});
test('invalid hash, amount, currency or second transaction cannot enqueue or replace original payment',async()=>{
 for(const [patch,invalid]of [[{},true],[{amount:'1'},false],[{currency:'EUR'},false]]){const f=fixture();assert.notEqual((await f.api.GET(f.request(patch,invalid))).status,200);assert.equal(f.rows.has('worldlinePaymentJobs/ORD-123'),false);}
 const f=fixture();await f.api.GET(f.request());assert.notEqual((await f.api.GET(f.request({txnid:'456'}))).status,200);assert.equal(f.rows.get('orders/ORD-123').psp.transactionId,'123');
});
test('browser return cannot create a transaction without signed callback fields',async()=>{const f=fixture();assert.notEqual((await f.api.GET(new Request('https://example.test/api/payments/worldline/callback?orderid=ORD-123'))).status,200);assert.equal(f.rows.has('worldlinePaymentJobs/ORD-123'),false);});

function markPaid(rows){const order=rows.get('orders/ORD-123');rows.set('orders/ORD-123',{...order,paymentStatus:'Paid',status:'Received',psp:{...order.psp,captured:true},invoice:{number:'TEST'}});}
test('financial commit completes before ACK without awaiting later managed delivery work',async()=>{
 let finishLater,finished=false;const later=new Promise(resolve=>{finishLater=resolve;});
 const f=fixture({onReconcile:async rows=>{markPaid(rows);await later;finished=true;}});
 const response=await f.api.GET(f.request());assert.equal(response.status,200);assert.equal(f.rows.get('orders/ORD-123').paymentStatus,'Paid');assert.equal(finished,false);assert.equal(f.calls(),1);assert.equal(f.after.length,1);
 let continuationFinished=false;const continuation=f.after[0]().then(()=>{continuationFinished=true;});await Promise.resolve();assert.equal(continuationFinished,false);
 finishLater();await continuation;assert.equal(finished,true);assert.equal(continuationFinished,true);
 await f.api.GET(f.request());assert.equal(f.calls(),1,'a Paid callback replay must not create another capture/reconciliation');
});
test('bounded pending work ACKs durable admission and duplicate callbacks never start it twice',async()=>{
 const f=fixture({onReconcile:async()=>new Promise(()=>{})});
 assert.equal((await f.api.GET(f.request())).status,200);assert.equal(f.rows.get('orders/ORD-123').paymentStatus,'Pending');assert.equal(f.rows.get('worldlinePaymentJobs/ORD-123').state,'pending');
 assert.equal((await f.api.GET(f.request())).status,200);assert.equal(f.calls(),1);assert.equal(f.after.length,1);
});
test('reconciliation or continuation registration failure preserves durable recovery without fake Paid',async()=>{
 for(const afterFailure of [false,true]){
  const f=fixture({afterFailure,onReconcile:async()=>{throw Error('provider unavailable');}});
  assert.equal((await f.api.GET(f.request())).status,200);assert.equal(f.rows.get('orders/ORD-123').paymentStatus,'Pending');assert.equal(f.rows.get('worldlinePaymentJobs/ORD-123').state,'pending');assert.equal(f.calls(),1);
 }
});
