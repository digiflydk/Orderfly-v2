const {test}=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {loadTs}=require('../helpers/load-ts.cjs'),{memoryDb}=require('../helpers/marketing-db.cjs');
function fixture({paid=false,onReconcile,onProvider,observation={},patch={},job,wait=false,onReceiptRead}={}){
 const token='a'.repeat(64),binding={provider:'worldline',owner:{brandId:'b'},mode:'test',merchantNumber:'T123',reference:`projects/orderfly-39325/secrets/orderfly-worldline-${'a'.repeat(64)}-test/versions/7`,revision:1};
 const order={id:'ORD-123',brandId:'b',locationId:'l',paymentMethod:'Worldline',paymentStatus:paid?'Paid':'Pending',status:paid?'Received':'Pending',totalAmount:125,createdAt:new Date('2026-11-13T00:00:00Z'),customerName:'Synthetic',customerContact:'synthetic@example.test',customerDetails:{id:'c',address:'For Pickup'},deliveryType:'Pickup',productItems:[],paymentDetails:{subtotal:125,taxes:0,discountTotal:0,deliveryFee:0,tips:0},psp:{provider:'worldline',...(paid?{transactionId:'123',captured:true}:{})},paymentAgreement:binding,receiptTokenHash:createHash('sha256').update(token).digest('hex'),...patch};
 const rows=new Map([['orders/ORD-123',order],['brands/b',{slug:'esmeralda'}],['locations/l',{brandId:'b',slug:'amager'}],...(job?[['worldlinePaymentJobs/ORD-123',job]]:[])]);
 const db=memoryDb(rows),run=db.runTransaction;db.runTransaction=callback=>run(tx=>callback({...tx,update:(ref,input)=>{const next={...input};if(input['psp.transactionId']){next.psp={...rows.get(ref.path).psp,transactionId:input['psp.transactionId']};delete next['psp.transactionId'];}return tx.update(ref,next);}}));
 const calls={privateDb:0,pinned:[],provider:[],reconcile:0,observations:0},after=[];
 const receipt=loadTs('src/lib/server/guest-receipt.ts',{'server-only':{},'@/app/checkout/order-actions':{getOrderById:async()=>{if(onReceiptRead)await onReceiptRead();return structuredClone(rows.get('orders/ORD-123'));}},'@/lib/payments/stripe-order':{},'@/lib/delivery/payments/stripe-authority':{},'./settle-checkout':{},'@/lib/server/payment-settings':{},'@/lib/delivery/tracking-server':{readReceiptDeliveryTracking:async()=>null}});
 const completion=loadTs('src/lib/payments/worldline-callback-completion.ts',{'server-only':{}});
 const api=loadTs('src/app/api/payments/worldline/return/route.ts',{'server-only':{},'next/server':{after:callback=>after.push(callback)},'@/lib/server/guest-receipt':receipt,'@/lib/firebase-admin':{getAdminDb:()=>{calls.privateDb++;return db;}},'@/lib/payments/worldline-store':{readPinnedWorldlineAgreement:async input=>{calls.pinned.push(input);return{binding:input,credentials:{merchantNumber:'T123',accessToken:'private-access',secretToken:'private-secret',md5Key:'private-md5'}};}},'@/lib/payments/worldline-client':{readWorldlineTransaction:async(keys,mode,transactionId)=>{calls.provider.push({merchantNumber:keys.merchantNumber,mode,transactionId});if(onProvider)await onProvider(rows);return{id:transactionId,orderid:'ORD-123',merchantnumber:'T123',status:'approved',currency:{code:'DKK',minorunits:2},total:{authorized:12500,captured:0,credited:0},...observation};}},'@/lib/payments/worldline-reconcile':{reconcileWorldlineOrder:async(id,options={})=>{if(options.observationOnly)calls.observations++;else calls.reconcile++;assert.ok(rows.has('worldlinePaymentJobs/ORD-123'));if(onReconcile)await onReconcile(rows,options);}},'@/lib/payments/worldline-callback-completion':{...completion,waitForWorldlineCallbackFinancialCompletion:input=>completion.waitForWorldlineCallbackFinancialCompletion({...input,timeoutMs:wait?input.timeoutMs:Math.min(input.timeoutMs,20),pollIntervalMs:1})}});
 const request=(query={},host='esmeralda.orderfly.dk')=>new Request('https://'+host+'/api/payments/worldline/return?'+new URLSearchParams({order_id:'ORD-123',receipt_token:token,txnid:'123',...query}));
 return {api,rows,calls,after,request,token,binding};
}
function markPaid(rows){const row=rows.get('orders/ORD-123');rows.set('orders/ORD-123',{...row,paymentStatus:'Paid',status:'Received',psp:{...row.psp,captured:true},invoice:{number:'TEST'}});}
test('private capability is checked before follow-up native/provider I/O',async()=>{
 for(const receipt_token of ['invalid','b'.repeat(64)]){const f=fixture();const response=await f.api.GET(f.request({receipt_token}));assert.ok([400,403].includes(response.status));assert.equal(response.headers.get('Location'),null);assert.equal(f.calls.privateDb,0);assert.deepEqual(f.calls.provider,[]);assert.equal(f.calls.reconcile,0);}
});
test('approved auth-only return validates pinned account and waits for real capture/financial commit',async()=>{
 let finishLater,finished=false;const later=new Promise(resolve=>{finishLater=resolve;});
 const f=fixture({onReconcile:async rows=>{markPaid(rows);await later;finished=true;}});
 const response=await f.api.GET(f.request({amount:'1',currency:'EUR',status:'approved',return_url:'https://evil.example'}));
 assert.equal(response.status,302);assert.equal(f.rows.get('orders/ORD-123').paymentStatus,'Paid');assert.equal(finished,false);assert.equal(f.calls.reconcile,1);assert.equal(f.after.length,1);
 assert.deepEqual(f.calls.provider,[{merchantNumber:'T123',mode:'test',transactionId:'123'}]);assert.deepEqual(f.calls.pinned,[f.binding]);
 const location=response.headers.get('Location');assert.ok(location.startsWith('/amager/checkout/confirmation?'));assert.equal(new URL(location,'https://esmeralda.orderfly.dk').searchParams.get('receipt_token'),f.token);assert.doesNotMatch(location,/evil|amount|currency|status|txnid/);
 assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.equal(response.headers.get('Referrer-Policy'),'no-referrer');finishLater();await f.after[0]();assert.equal(finished,true);
});
test('already verified NativePaid redirects without provider calls or new jobs',async()=>{
 const f=fixture({paid:true});const response=await f.api.GET(f.request());assert.equal(response.status,302);assert.deepEqual(f.calls.provider,[]);assert.deepEqual(f.calls.pinned,[]);assert.equal(f.calls.reconcile,0);assert.equal(f.after.length,0);assert.equal(f.rows.has('worldlinePaymentJobs/ORD-123'),false);
 const apex=await f.api.GET(f.request({},'orderfly.dk'));assert.ok(apex.headers.get('Location').startsWith('/esmeralda/amager/checkout/confirmation?'));
});
test('wrong provider order, merchant, amount, currency, status or identity never links a transaction',async()=>{
 for(const observation of [{orderid:'ORD-OTHER'},{merchantnumber:'P999'},{id:'999'},{currency:{code:'EUR',minorunits:2}},{total:{authorized:1,captured:0,credited:0}},{status:'declined'}]){
  const f=fixture({observation});const response=await f.api.GET(f.request());assert.notEqual(response.status,302);assert.equal(response.headers.get('Location'),null);assert.equal(f.rows.has('worldlinePaymentJobs/ORD-123'),false);assert.equal(f.rows.get('orders/ORD-123').psp.transactionId,undefined);assert.equal(f.calls.reconcile,0);
 }
});
test('native owner/environment/canceled state and changed capability fail closed',async()=>{
 for(const patch of [{paymentAgreement:{provider:'worldline',owner:{brandId:'other'},mode:'test'}},{paymentAgreement:{provider:'worldline',owner:{brandId:'b'},mode:'live',merchantNumber:'T123'}},{status:'Canceled'}]){
  const f=fixture({patch});const response=await f.api.GET(f.request());assert.notEqual(response.status,302);assert.deepEqual(f.calls.provider,[]);assert.equal(f.calls.reconcile,0);
 }
 const f=fixture({onProvider:rows=>{const row=rows.get('orders/ORD-123');rows.set('orders/ORD-123',{...row,receiptTokenHash:'b'.repeat(64)});}});assert.notEqual((await f.api.GET(f.request())).status,302);assert.equal(f.rows.has('worldlinePaymentJobs/ORD-123'),false);
});
test('browser cannot replace a callback-linked transaction and replay never duplicates the job',async()=>{
 const f=fixture({patch:{psp:{provider:'worldline',transactionId:'123'}},job:{orderId:'ORD-123',brandId:'b',locationId:'l',transactionId:'123',state:'pending'},onReconcile:async rows=>markPaid(rows)});
 assert.equal((await f.api.GET(f.request({txnid:'456'}))).status,409);assert.deepEqual(f.calls.provider,[]);
 assert.equal((await f.api.GET(f.request())).status,302);assert.equal((await f.api.GET(f.request())).status,302);assert.equal([...f.rows].filter(([path])=>path.startsWith('worldlinePaymentJobs/')).length,1);assert.equal(f.calls.reconcile,1);
});
test('nonfinancial work completion, failure or pending work never produces a success redirect',async()=>{
 for(const onReconcile of [async()=>{},async()=>{throw Error('uncertain original capture');},async()=>new Promise(()=>{})]){
  const f=fixture({onReconcile});const response=await f.api.GET(f.request());assert.equal(response.status,503);assert.equal(response.headers.get('Location'),null);assert.equal(f.rows.get('orders/ORD-123').paymentStatus,'Pending');assert.equal(f.calls.reconcile,1);assert.equal(f.rows.get('worldlinePaymentJobs/ORD-123').state,'pending');assert.doesNotMatch(await response.text(),/private-|synthetic@example|er betalt|er bekræftet/);
 }
});
test('cancellation, refund or active money operation during completion never redirects to success',async()=>{
 for(const patch of [{status:'Canceled'},{refundedAmountOre:12500,refundedAt:new Date()},{paymentOperation:'refund-in-progress'}]){
  const f=fixture({onReconcile:async rows=>{markPaid(rows);rows.set('orders/ORD-123',{...rows.get('orders/ORD-123'),...patch});}});
  const response=await f.api.GET(f.request());assert.equal(response.status,503);assert.equal(response.headers.get('Location'),null);
 }
});
test('initial stalled private read is bounded and cannot start late provider recovery',async t=>{
 const f=fixture({wait:true});t.mock.timers.enable({apis:['setTimeout']});
 // Leave the native proof helper unresolved to exercise the route's outer budget.
 const api=loadTs('src/app/api/payments/worldline/return/route.ts',{'server-only':{},'next/server':{after:()=>{throw Error('must not register');}},'@/lib/server/guest-receipt':{readGuestReceipt:async()=>new Promise(()=>{})},'@/lib/firebase-admin':{getAdminDb:()=>{throw Error('must not read');}},'@/lib/payments/worldline-store':{},'@/lib/payments/worldline-client':{},'@/lib/payments/worldline-reconcile':{}});
 const responsePromise=api.GET(f.request());t.mock.timers.tick(60000);const response=await responsePromise;assert.equal(response.status,503);assert.equal(response.headers.get('Location'),null);
});
test('a normal delayed capture beyond ten seconds stays server-side until the real Paid commit',async()=>{
 const started=Date.now(),f=fixture({wait:true,onReconcile:async rows=>{await new Promise(resolve=>setTimeout(resolve,11000));markPaid(rows);}});
 const response=await f.api.GET(f.request());
 assert.equal(response.status,302);assert.ok(Date.now()-started>=11000);assert.equal(f.calls.reconcile,1);assert.equal(f.calls.observations,0);
 assert.equal(await response.text(),'');assert.ok(response.headers.get('Location').includes('/checkout/confirmation?'));
});
test('transient private and provider read failures recover without another financial reconciliation',async()=>{
 let proofReads=0,providerReads=0;
 const f=fixture({onReceiptRead:async()=>{if(++proofReads===1)throw Error('temporary native read');},onProvider:async()=>{if(++providerReads===1)throw Error('temporary transaction read');},onReconcile:async rows=>markPaid(rows)});
 const response=await f.api.GET(f.request());assert.equal(response.status,302);assert.equal(proofReads,2);assert.equal(providerReads,2);assert.equal(f.calls.reconcile,1);assert.equal(f.calls.observations,0);
});
test('a lost capture reply can recover only through observation mode, without rerunning normal capture',async()=>{
 const f=fixture({onReconcile:async(rows,options)=>{if(!options.observationOnly)throw Error('capture reply lost; original journal remains');markPaid(rows);}});
 const response=await f.api.GET(f.request());assert.equal(response.status,302);assert.equal(f.calls.reconcile,1);assert.equal(f.calls.observations,1);assert.equal(f.rows.get('orders/ORD-123').paymentStatus,'Paid');
});
