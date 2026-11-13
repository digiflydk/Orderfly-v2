// Current-source terminal return acceptance. Persistence and provider transport
// are isolated; guest capabilities, original binding, provider HTTP validation
// and the return/receipt projection are production modules.
const {test,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {loadTs}=require('../helpers/load-ts.cjs');
const {memoryDb}=require('../helpers/marketing-db.cjs');
const originalFetch=global.fetch;
afterEach(()=>{global.fetch=originalFetch;});

function fixture({phase='before',kind='refunded',nativePatch={},providerPatch={},wrongToken=false,providerFirst=false}={}){
 const token='a'.repeat(64),orderId='ORD-TERMINAL',transactionId='123';
 const binding={provider:'worldline',owner:{brandId:'b'},mode:'test',merchantNumber:'T123',reference:`projects/orderfly-39325/secrets/orderfly-worldline-${'a'.repeat(64)}-test/versions/1`,revision:1};
 const credentials={merchantNumber:'T123',accessToken:'synthetic-access',secretToken:'synthetic-secret',md5Key:'synthetic-md5'};
 const order={id:orderId,brandId:'b',locationId:'l',paymentMethod:'Worldline',paymentStatus:'Pending',status:'Pending',totalAmount:125,createdAt:new Date(),customerName:'Synthetic',customerContact:'synthetic@example.test',customerDetails:{id:'c',address:'Synthetic address'},deliveryType:'Pickup',productItems:[],paymentDetails:{subtotal:125,taxes:0,discountTotal:0,deliveryFee:0,tips:0},psp:{provider:'worldline',transactionId},paymentAgreement:binding,receiptTokenHash:createHash('sha256').update(token).digest('hex')};
 const rows=new Map([[`orders/${orderId}`,order],['brands/b',{slug:'brand'}],['locations/l',{brandId:'b',slug:'location'}]]),db=memoryDb(rows),after=[];
 const observation={id:transactionId,orderid:orderId,merchantnumber:'T123',status:'approved',currency:{code:'DKK',minorunits:2},total:{authorized:12500,captured:12500,credited:0}};
 let providerReads=0,moneyPosts=0,reconciliations=0;
 const terminate=()=>{
  const current=rows.get(`orders/${orderId}`);
  if(kind==='refunded'){
   rows.set(`orders/${orderId}`,{...current,status:'Canceled',paymentStatus:'Paid',psp:{...current.psp,captured:true},refundedAmountOre:12500,refundedAt:new Date(),paymentOperation:null,invoice:{number:'INV-ORIGINAL'},...nativePatch});
   observation.total.credited=12500;
  }else{
   rows.set(`orders/${orderId}`,{...current,status:'Canceled',paymentStatus:'Failed',psp:{...current.psp,captured:false,voided:true},paymentOperation:null,...nativePatch});
   observation.status='deleted';observation.total.captured=0;
  }
  for(const [key,value] of Object.entries(providerPatch))observation[key]=value;
 };
 if(phase==='before')terminate();
 if(providerFirst){
  rows.set(`orders/${orderId}`,{...order,status:'Canceled',paymentStatus:'Paid',psp:{...order.psp,captured:true},paymentOperation:'original-refund',invoice:{number:'INV-ORIGINAL'}});
  observation.total.credited=12500;
 }
 global.fetch=async(input,init={})=>{
  const u=new URL(String(input));
  assert.equal(init.redirect,'error');
  assert.equal(init.headers.Authorization,`Basic ${Buffer.from('synthetic-access@T123:synthetic-secret').toString('base64')}`);
  if(init.method==='POST')moneyPosts++;
  assert.equal(init.method,'GET','Terminal return can observe but never mutate provider state');
  assert.equal(u.origin,'https://merchant-v1.api-eu.bambora.com');assert.equal(u.pathname,'/transactions/123');
  providerReads++;
  if(providerFirst&&providerReads===1)setTimeout(terminate,25);
  return Response.json({meta:{result:true},transaction:structuredClone(observation)});
 };
 const receipt=loadTs('src/lib/server/guest-receipt.ts',{'server-only':{},'@/app/checkout/order-actions':{getOrderById:async()=>structuredClone(rows.get(`orders/${orderId}`))},'@/lib/payments/stripe-order':{},'@/lib/delivery/payments/stripe-authority':{},'./settle-checkout':{},'@/lib/server/payment-settings':{},'@/lib/delivery/tracking-server':{readReceiptDeliveryTracking:async()=>null}});
 const client=loadTs('src/lib/payments/worldline-client.ts',{'server-only':{}});
 const completion=loadTs('src/lib/payments/worldline-callback-completion.ts',{'server-only':{}});
 const observe=completion.waitForWorldlineReturnOutcome;
 // Only synthetic never-clearing locks use a short observation budget. Keep
 // the production terminal validators and provider reads unchanged.
 completion.waitForWorldlineReturnOutcome=input=>observe({...input,timeoutMs:Math.min(input.timeoutMs??1000,1000),pollIntervalMs:1});
 const api=loadTs('src/app/api/payments/worldline/return/route.ts',{'server-only':{},'next/server':{after:fn=>after.push(fn)},'@/lib/server/guest-receipt':receipt,'@/lib/firebase-admin':{getAdminDb:()=>db},'@/lib/payments/worldline-store':{readPinnedWorldlineAgreement:async()=>({binding,credentials})},'@/lib/payments/worldline-client':client,'@/lib/payments/worldline-callback-completion':completion,'@/lib/payments/worldline-reconcile':{reconcileWorldlineOrder:async()=>{reconciliations++;terminate();}}});
 const request=(extra={})=>new Request('https://example.test/api/payments/worldline/return?'+new URLSearchParams({order_id:orderId,receipt_token:wrongToken?'0'.repeat(64):token,txnid:transactionId,...extra}));
 return {api,receipt,request,rows,after,orderId,observation,providerReads:()=>providerReads,moneyPosts:()=>moneyPosts,reconciliations:()=>reconciliations,readReceipt:()=>receipt.readGuestReceipt({orderId,receiptToken:token},{reconcilePayment:false})};
}

for(const phase of ['before','during'])test(`verified full refund ${phase} financial observation reaches its truthful private receipt`,async()=>{
 const f=fixture({phase}),response=await f.api.GET(f.request({status:'approved',return_url:'https://outside.test/'}));
 assert.equal(response.status,302);const target=new URL(response.headers.get('Location'),'https://example.test');
 assert.equal(target.origin,'https://example.test');assert.equal(target.pathname,'/brand/location/checkout/confirmation');assert.equal(target.searchParams.get('order_id'),f.orderId);assert.equal(target.searchParams.get('status'),null);assert.equal(target.searchParams.get('return_url'),null);
 const receipt=await f.readReceipt();assert.equal(receipt.paymentOutcome,'refunded');assert.equal(receipt.invoice.number,'INV-ORIGINAL');
 assert.equal(f.moneyPosts(),0);assert.ok(f.providerReads()>0);if(phase==='before')assert.equal(f.reconciliations(),0);
});
test('provider-confirmed deleted zero-capture authorization reaches a canceled receipt, never a Paid success',async()=>{
 const f=fixture({kind:'canceled'}),response=await f.api.GET(f.request());assert.equal(response.status,302);
 const receipt=await f.readReceipt();assert.equal(receipt.paymentOutcome,'canceled');assert.equal(receipt.paymentStatus,'Failed');assert.equal(receipt.invoice,undefined);assert.equal(f.moneyPosts(),0);
});
test('wrong private receipt capability prevents all provider reads and terminal disclosure',async()=>{
 const f=fixture({wrongToken:true}),response=await f.api.GET(f.request());assert.equal(response.status,403);assert.equal(response.headers.get('Location'),null);assert.equal(f.providerReads(),0);assert.equal(f.reconciliations(),0);
});
test('partial or mismatched provider refund cannot authorize a full-refunded terminal redirect',async()=>{
 for(const providerPatch of [{total:{authorized:12500,captured:12500,credited:100}},{merchantnumber:'T999'},{orderid:'ORD-OTHER'},{currency:{code:'EUR',minorunits:2}},{id:'999'}]){
  const f=fixture({providerPatch}),response=await f.api.GET(f.request());assert.notEqual(response.status,302);assert.equal(response.headers.get('Location'),null);assert.equal(f.moneyPosts(),0);
 }
});
test('an active financial operation or inconsistent native refund does not become a final receipt',async()=>{
 for(const nativePatch of [{paymentOperation:'another-credit'},{refundedAmountOre:100},{brandId:'other'},{totalAmount:126}]){
  const f=fixture({nativePatch}),response=await f.api.GET(f.request());assert.notEqual(response.status,302);assert.equal(response.headers.get('Location'),null);assert.equal(f.moneyPosts(),0);
 }
});
test('browser refund flags alone cannot project a terminal refunded outcome',async()=>{
 const f=fixture({phase:'never'});const receipt=await f.readReceipt();assert.equal(receipt.paymentStatus,'Pending');assert.equal(receipt.paymentOutcome,undefined);assert.equal(f.providerReads(),0);
});

test('verified partial refund keeps the original invoice and reports the exact credited amount without new money requests',async()=>{
 const f=fixture({nativePatch:{status:'Received',refundedAmountOre:3000},providerPatch:{total:{authorized:12500,captured:12500,credited:3000}}});
 const response=await f.api.GET(f.request());assert.equal(response.status,302);
 const receipt=await f.readReceipt();assert.equal(receipt.paymentOutcome,'partially_refunded');assert.equal(receipt.refundedAmountMinor,3000);assert.equal(receipt.invoice.number,'INV-ORIGINAL');assert.equal(receipt.totalAmount,125);assert.equal(receipt.status,'Received');assert.equal(f.moneyPosts(),0);
});

test('a provider credit visible before native refund accounting waits for the same terminal commit without reconciliation or money requests',async()=>{
 const f=fixture({phase:'not-yet',providerFirst:true}),response=await f.api.GET(f.request());
 assert.equal(response.status,302);const receipt=await f.readReceipt();
 assert.equal(receipt.paymentOutcome,'refunded');assert.equal(receipt.refundedAmountMinor,12500);assert.equal(receipt.invoice.number,'INV-ORIGINAL');
 assert.equal(f.moneyPosts(),0);assert.equal(f.reconciliations(),0);assert.ok(f.providerReads()>=2);
});
