const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const api=loadTs('src/lib/payments/worldline-callback-completion.ts',{'server-only':{}});
const binding={provider:'worldline',owner:{brandId:'b'},mode:'test',merchantNumber:'T123',reference:`projects/orderfly-39325/secrets/orderfly-worldline-${'a'.repeat(64)}-test/versions/7`,revision:1};
const expected={orderId:'ORD-123',brandId:'b',locationId:'l',transactionId:'123',amountMinor:12500,binding};
const paid={id:'ORD-123',brandId:'b',locationId:'l',totalAmount:125,paymentMethod:'Worldline',paymentStatus:'Paid',status:'Received',psp:{provider:'worldline',transactionId:'123',captured:true},paymentAgreement:binding};
test('only the original scoped captured native payment satisfies financial completion',()=>{
 assert.equal(api.isWorldlineCallbackFinanciallyComplete(paid,expected),true);
 for(const patch of [
  {id:'ORD-OTHER'},{brandId:'other'},{locationId:'other'},{totalAmount:1},{totalAmount:'125'},
  {paymentMethod:'Stripe'},{paymentStatus:'Pending'},
  {status:'Canceled'},{status:'Failed'},{paymentOperation:'refund-in-progress'},{refundedAmountOre:12500},{refundedAmount:125},{refundedAt:new Date()},
  {psp:{...paid.psp,provider:'stripe'}},{psp:{...paid.psp,transactionId:'999'}},{psp:{...paid.psp,captured:false}},
  {paymentAgreement:{...binding,revision:2}},{paymentAgreement:{...binding,merchantNumber:'T999'}},
  {paymentAgreement:{...binding,owner:{brandId:'b',locationId:'other'}}},
  {paymentAgreement:{...binding,reference:binding.reference.replace('/7','/8')}},
  {paymentAgreement:{...binding,mode:'live'}},
 ])assert.equal(api.isWorldlineCallbackFinanciallyComplete({...paid,...patch},expected),false,JSON.stringify(patch));
 assert.equal(api.isWorldlineCallbackFinanciallyComplete(paid,{...expected,brandId:'other'}),false);
 assert.equal(api.isWorldlineCallbackFinanciallyComplete(paid,{...expected,amountMinor:0}),false);
});
test('observation returns once Paid commits even when later original work remains pending',async()=>{
 let reads=0;const work=new Promise(()=>{});
 const result=await api.waitForWorldlineCallbackFinancialCompletion({expected,work,timeoutMs:50,pollIntervalMs:1,readOrder:async()=>++reads===1?{...paid,paymentStatus:'Pending'}:paid});
 assert.equal(result,true);assert.equal(reads,2);
});
test('a stalled native read or pending financial work cannot hold the ACK deadline',async()=>{
 let resolveRead,reads=0;
 const result=await api.waitForWorldlineCallbackFinancialCompletion({expected,timeoutMs:10,pollIntervalMs:1,work:new Promise(()=>{}),readOrder:()=>{reads++;return new Promise(resolve=>{resolveRead=resolve;});}});
 assert.equal(result,false);assert.equal(reads,1);resolveRead(paid);await Promise.resolve();await Promise.resolve();assert.equal(reads,1);
});
test('completed or failed original work without a native Paid commit never passes completion',async()=>{
 for(const work of [Promise.resolve(),Promise.reject(Error('private provider failure'))]){
  const result=await api.waitForWorldlineCallbackFinancialCompletion({expected,work,timeoutMs:20,readOrder:async()=>({...paid,paymentStatus:'Pending'})});assert.equal(result,false);
 }
 assert.equal(await api.waitForWorldlineCallbackFinancialCompletion({expected,timeoutMs:20,readOrder:async()=>{throw Error('native read unavailable');}}),false);
});
test('an exhausted callback budget skips all further reads and provider work',async()=>{
 let reads=0;assert.equal(await api.waitForWorldlineCallbackFinancialCompletion({expected,timeoutMs:0,readOrder:async()=>{reads++;return paid;}}),false);assert.equal(reads,0);
});
test('return gate can observe another callback financial commit after its own work ends',async()=>{
 let reads=0;assert.equal(await api.waitForWorldlineCallbackFinancialCompletion({expected,work:Promise.resolve(),stopWhenWorkFinishes:false,timeoutMs:50,pollIntervalMs:1,readOrder:async()=>++reads===1?{...paid,paymentStatus:'Pending'}:paid}),true);assert.equal(reads,2);
});
test('return-only observation survives temporary native read errors without changing callback behavior',async()=>{
 let reads=0;
 assert.equal(await api.waitForWorldlineCallbackFinancialCompletion({expected,work:Promise.resolve(),stopWhenWorkFinishes:false,retryReadFailures:true,timeoutMs:100,pollIntervalMs:1,readOrder:async()=>{if(++reads<3)throw Error('temporary native read');return paid;}}),true);assert.equal(reads,3);
});
test('full refunds and confirmed voids are terminal display candidates, never financial Paid success',()=>{
 const refund={...paid,status:'Canceled',refundedAmountOre:12500,refundedAt:new Date()};
 assert.equal(api.worldlineNativeTerminalOutcome(refund,expected),'refunded');
 assert.equal(api.isWorldlineCallbackFinanciallyComplete(refund,expected),false);
 assert.equal(api.worldlineNativeTerminalOutcome({...refund,refundedAmountOre:2500},expected),'partially_refunded');
 for(const patch of [{refundedAmountOre:0},{refundedAmountOre:12501},{refundedAmountOre:-1},{paymentOperation:'credit-pending'},{brandId:'other'},{totalAmount:126},{paymentAgreement:{...binding,revision:2}},{paymentStatus:'Pending'}])assert.equal(api.worldlineNativeTerminalOutcome({...refund,...patch},expected),null);
 const canceled={...paid,status:'Canceled',paymentStatus:'Failed',psp:{provider:'worldline',transactionId:'123',voided:true}};
 assert.equal(api.worldlineNativeTerminalOutcome(canceled,expected),'canceled');
 assert.equal(api.isWorldlineCallbackFinanciallyComplete(canceled,expected),false);
 assert.equal(api.worldlineNativeTerminalOutcome({...canceled,psp:{...canceled.psp,voided:false}},expected),null);
 assert.equal(api.worldlineNativeTerminalOutcome({...canceled,psp:{...canceled.psp,captured:true}},expected),null);
});
test('return observation can finish a verified terminal receipt without relaxing callback completion',async()=>{
 const refund={...paid,status:'Canceled',refundedAmountOre:12500,refundedAt:new Date()};let verified=0;
 const input={expected,timeoutMs:20,pollIntervalMs:1,work:Promise.resolve(),stopWhenWorkFinishes:false,readOrder:async()=>refund};
 assert.equal(await api.waitForWorldlineReturnOutcome({...input,terminalOutcome:async row=>{verified++;return api.worldlineNativeTerminalOutcome(row,expected);}}),'refunded');assert.equal(verified,1);
 assert.equal(await api.waitForWorldlineCallbackFinancialCompletion(input),false);
});
test('a stalled terminal provider verification remains bounded and never produces a late receipt',async()=>{
 let finish;const promise=new Promise(resolve=>{finish=resolve;});
 assert.equal(await api.waitForWorldlineReturnOutcome({expected,timeoutMs:10,readOrder:async()=>({...paid,paymentStatus:'Pending'}),terminalOutcome:async()=>promise}),null);
 finish('refunded');await Promise.resolve();await Promise.resolve();
});
