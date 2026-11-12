const { test } = require('node:test'), assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { memoryDb } = require('../helpers/marketing-db.cjs');
const REQUEST='c2839a53-bf0f-4bb3-8d95-d46a5cc2a311';
function fixture(){
  const reference=`projects/orderfly-39325/secrets/orderfly-worldline-${'a'.repeat(64)}-test/versions/1`;
  const order={brandId:'b',locationId:'l',totalAmount:125,paymentStatus:'Paid',status:'Received',refundedAmountOre:0,psp:{provider:'worldline',transactionId:'123',checkoutSessionId:'private-window-token'},paymentAgreement:{provider:'worldline',mode:'test',owner:{brandId:'b'},merchantNumber:'T123',revision:1,reference}};
  const rows=new Map([['orders/o',order]]), db=memoryDb(rows),collection=db.collection;
  db.collection=name=>{const value=collection(name),doc=value.doc;return {...value,doc:id=>{const r=doc(id);return {...r,collection:child=>db.collection(r.path+'/'+child)};}};};
  const calls=[],finalized=[];let denied=false,state='confirmed';
  const mocks={'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db},'@/lib/access/orderfly-session':{orderflySession:async()=>({actorId:'real-actor',identity:{provider:'firebase',subject:'real-user'}})},'@/lib/access/scoped-data':{authorizeTransaction:async(tx,identity,scope,permission,level)=>{calls.push({identity,scope,permission,level});if(denied)throw Error('forbidden');assert.equal(scope.brandId,'b');assert.equal(scope.locationId,'l');}},'@/lib/payments/worldline-operations':{runWorldlineOperation:async input=>{calls.push({operation:input});return {state};}},'@/lib/payments/worldline-expiry':{finalizeWorldlineVoid:async(...args)=>finalized.push(args)}};
  const api=loadTs('src/app/superadmin/payments/worldline-operations-actions.ts',mocks);
  return {api,rows,order,calls,finalized,deny:()=>denied=true,state:value=>state=value};
}
test('payment snapshot returns metadata, scoped permission and no secret reference or hosted token',async()=>{
 const f=fixture(),view=await f.api.loadWorldlineOrderPayment('o');assert.equal(view.environment,'test');assert.equal(view.agreement,'brand');assert.equal(view.merchantNumber,'T123');assert.equal(view.remainingMinor,12500);assert.equal(view.canRefund,true);assert.equal(f.calls[0].permission,'orderfly.orders:view');assert.equal(f.calls[0].level,'location');assert.doesNotMatch(JSON.stringify(view),/versions|orderfly-worldline|private-window-token|real-actor/);
});
test('active own operation can be recovered; another employee operation never exposes replay identity',async()=>{
 const f=fixture();f.order.paymentOperation='a'.repeat(64);f.rows.set('orders/o/paymentOperations/'+f.order.paymentOperation,{requestId:REQUEST,operation:'credit',amountMinor:500,actorId:'real-actor',state:'unknown'});
 let view=await f.api.loadWorldlineOrderPayment('o');assert.equal(view.pending.requestId,REQUEST);assert.equal(view.canRefund,false);
 f.rows.get('orders/o/paymentOperations/'+f.order.paymentOperation).actorId='different-actor';view=await f.api.loadWorldlineOrderPayment('o');assert.equal(view.pending,null);assert.equal(view.locked,true);
});
test('load and mutation require current scoped authorization before provider I/O',async()=>{
 const f=fixture();f.deny();await assert.rejects(f.api.loadWorldlineOrderPayment('o'));await assert.rejects(f.api.worldlineOrderOperation({orderId:'o',requestId:REQUEST,operation:'credit',amountMinor:100}));assert.equal(f.calls.filter(c=>c.operation).length,0);
});
test('server derives transaction, employee and tenant; browser cannot add or alter authority fields',async()=>{
 const f=fixture();for(const extra of [{transactionId:'evil'},{actorId:'evil'},{brandId:'evil'}])await assert.rejects(f.api.worldlineOrderOperation({orderId:'o',requestId:REQUEST,operation:'credit',amountMinor:100,...extra}));
 await f.api.worldlineOrderOperation({orderId:'o',requestId:REQUEST,operation:'credit',amountMinor:100});const sent=f.calls.find(c=>c.operation).operation;assert.equal(sent.transactionId,'123');assert.equal(sent.actorId,'real-actor');assert.equal(sent.requestId,REQUEST);assert.equal(f.calls.find(c=>c.permission==='orderfly.orders:edit').level,'location');
});
test('refund and void preconditions reject managed delivery, unpaid refunds, malformed money and paid voids',async()=>{
 const f=fixture();await assert.rejects(f.api.worldlineOrderOperation({orderId:'o',requestId:REQUEST,operation:'delete'}));
 for(const amountMinor of [undefined,0,-1,1.5,2147483648])await assert.rejects(f.api.worldlineOrderOperation({orderId:'o',requestId:REQUEST,operation:'credit',amountMinor}));
 f.order.paymentStatus='Pending';await assert.rejects(f.api.worldlineOrderOperation({orderId:'o',requestId:REQUEST,operation:'credit',amountMinor:100}));
 f.order.managedDelivery={};await assert.rejects(f.api.worldlineOrderOperation({orderId:'o',requestId:REQUEST,operation:'delete'}));assert.equal(f.calls.filter(c=>c.operation).length,0);
});
test('confirmed void finalizes order/reservation; unknown void never releases it',async()=>{
 const f=fixture();f.order.paymentStatus='Pending';f.state('unknown');assert.equal((await f.api.worldlineOrderOperation({orderId:'o',requestId:REQUEST,operation:'delete'})).state,'unknown');assert.equal(f.finalized.length,0);
 f.state('confirmed');assert.equal((await f.api.worldlineOrderOperation({orderId:'o',requestId:REQUEST,operation:'delete'})).state,'confirmed');assert.deepEqual(f.finalized,[['o','123']]);
});

test('an amount above the stored remaining balance is rejected before provider I/O',async()=>{const f=fixture();const result=await f.api.worldlineOrderOperation({orderId:'o',requestId:REQUEST,operation:'credit',amountMinor:12501});assert.equal(result.state,'rejected');assert.match(result.message,/resterende betaling/);assert.equal(f.calls.filter(c=>c.operation).length,0);});
