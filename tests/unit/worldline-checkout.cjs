const {test}=require('node:test'),assert=require('node:assert/strict');
const {checkout}=require('../helpers/checkout-fixture.cjs');
const reference=`projects/orderfly-39325/secrets/orderfly-worldline-${'a'.repeat(64)}-test/versions/7`;
const agreement={provider:'worldline',mode:'test',owner:{brandId:'b'},reference,merchantNumber:'T123',revision:2,credentials:{merchantNumber:'T123',accessToken:'synthetic-access',secretToken:'synthetic-secret',md5Key:'synthetic-md5'}};
test('Worldline session receives authoritative amount and order keeps pinned account without secrets',async()=>{
 let input;const f=await checkout({configureMocks:({mocks})=>{mocks['@/lib/payments/merchant-agreement']={resolveMerchantAgreement:async()=>agreement};const original=mocks['@/lib/payments/worldline-client'];mocks['@/lib/payments/worldline-client']={...original,createWorldlineCheckoutSession:async(keys,mode,value)=>{input=value;assert.equal(mode,'test');assert.equal(keys.merchantNumber,'T123');return {token:'worldline-session',url:'https://v1.checkout.bambora.com/worldline-session'};}};}});
 assert.equal(f.result.success,true);assert.equal(input.amountMinor,10400);assert.equal(input.currency,'DKK');assert.equal(input.orderId,'ORD-TEST');assert.equal(input.callbackUrl,'https://example.test/api/payments/worldline/callback');assert.match(input.acceptUrl,/receipt_token=/);assert.ok(!f.events.includes('stripe'));
 const order=f.records.get('orders/ORD-TEST');assert.equal(order.paymentMethod,'Worldline');assert.equal(order.psp.provider,'worldline');assert.equal(order.paymentAgreement.reference,reference);assert.doesNotMatch(JSON.stringify(order),/synthetic-access|synthetic-secret|synthetic-md5/);assert.equal(order.paymentStatus,'Pending');
});
test('disabled or incomplete explicit configuration fails before creating any payable order',async()=>{
 const f=await checkout({configureMocks:({mocks})=>{mocks['@/lib/payments/merchant-agreement']={resolveMerchantAgreement:async()=>{throw Error('disabled');}};}});assert.equal(f.result.success,false);assert.equal(f.records.has('orders/ORD-TEST'),false);assert.ok(!f.events.includes('stripe'));
});
test('legacy merchants retain their Stripe session path',async()=>{const f=await checkout();assert.equal(f.result.success,true);assert.ok(f.events.includes('stripe'));assert.equal(f.records.get('orders/ORD-TEST').paymentAgreement,undefined);});
