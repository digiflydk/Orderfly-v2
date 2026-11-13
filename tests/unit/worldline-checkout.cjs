const {test}=require('node:test'),assert=require('node:assert/strict');
const {checkout}=require('../helpers/checkout-fixture.cjs');
const reference=`projects/orderfly-39325/secrets/orderfly-worldline-${'a'.repeat(64)}-test/versions/7`;
const agreement={provider:'worldline',mode:'test',owner:{brandId:'b'},reference,merchantNumber:'T123',revision:2,credentials:{merchantNumber:'T123',accessToken:'synthetic-access',secretToken:'synthetic-secret',md5Key:'synthetic-md5'}};
test('Worldline session receives authoritative amount and order keeps pinned account without secrets',async()=>{
 let input;const f=await checkout({configureMocks:({mocks})=>{mocks['@/lib/payments/merchant-agreement']={resolveMerchantAgreement:async()=>agreement};const original=mocks['@/lib/payments/worldline-client'];mocks['@/lib/payments/worldline-client']={...original,createWorldlineCheckoutSession:async(keys,mode,value)=>{input=value;assert.equal(mode,'test');assert.equal(keys.merchantNumber,'T123');return {token:'worldline-session',url:'https://v1.checkout.bambora.com/worldline-session'};}};}});
 assert.equal(f.result.success,true);assert.equal(input.amountMinor,10400);assert.equal(input.currency,'DKK');assert.equal(input.orderId,'ORD-TEST');assert.equal(input.callbackUrl,'https://example.test/api/payments/worldline/callback');assert.match(input.acceptUrl,/receipt_token=/);assert.ok(!f.events.includes('stripe'));
 const accept=new URL(input.acceptUrl);assert.equal(accept.origin,'https://example.test');assert.equal(accept.pathname,'/api/payments/worldline/return');assert.equal(accept.searchParams.get('order_id'),'ORD-TEST');assert.match(accept.searchParams.get('receipt_token'),/^[a-f0-9]{64}$/);
 const order=f.records.get('orders/ORD-TEST');assert.equal(order.paymentMethod,'Worldline');assert.equal(order.psp.provider,'worldline');assert.equal(order.paymentAgreement.reference,reference);assert.doesNotMatch(JSON.stringify(order),/synthetic-access|synthetic-secret|synthetic-md5/);assert.equal(order.paymentStatus,'Pending');
});
test('disabled or incomplete explicit configuration fails before creating any payable order',async()=>{
 const f=await checkout({configureMocks:({mocks})=>{mocks['@/lib/payments/merchant-agreement']={resolveMerchantAgreement:async()=>{throw Error('disabled');}};}});assert.equal(f.result.success,false);assert.equal(f.records.has('orders/ORD-TEST'),false);assert.ok(!f.events.includes('stripe'));
});
test('legacy merchants retain Stripe checkout with an original private account archive',async()=>{
 const f=await checkout();assert.equal(f.result.success,true);assert.ok(f.events.includes('stripe'));
 const order=f.records.get('orders/ORD-TEST'),binding=order.paymentAgreement;
 assert.equal(binding.provider,'stripe');assert.equal(binding.mode,'test');assert.deepEqual(binding.owner,{brandId:'b',locationId:'l'});
 assert.match(binding.reference,/^platform_settings\/stripe-legacy-[a-f0-9]{64}$/);assert.equal(binding.revision,1);
 const archive=f.records.get(binding.reference);assert.equal(archive.kind,'legacyStripeAgreement');assert.equal(archive.mode,binding.mode);assert.deepEqual(archive.owner,binding.owner);assert.equal(archive.credentials.secretKey,'sk_test_fixture');
 assert.doesNotMatch(JSON.stringify(order),/sk_test_fixture|pk_test_fixture|whsec_fixture/);
 const {moduleGraph}=require('../helpers/load-ts-graph.cjs'),{memoryDb}=require('../helpers/marketing-db.cjs');
 const read=moduleGraph({'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>memoryDb(f.records)},'@google-cloud/secret-manager':{SecretManagerServiceClient:class{constructor(){throw Error('Legacy reader must not require Secret Manager');}}},stripe:{default:class{constructor(key){this.key=key;}}}})('src/lib/payments/stripe-order.ts');
 assert.equal((await read.stripeForOrder(order)).key,archive.credentials.secretKey);
});

test('one transient Worldline link-write failure retries the same token without a second provider session',async()=>{
 let sessions=0;
 const f=await checkout({fault:'patch-once',configureMocks:({mocks})=>{
  mocks['@/lib/payments/merchant-agreement']={resolveMerchantAgreement:async()=>agreement};
  const original=mocks['@/lib/payments/worldline-client'];
  mocks['@/lib/payments/worldline-client']={...original,createWorldlineCheckoutSession:async()=>{sessions++;return {token:'worldline-session-once',url:'https://v1.checkout.bambora.com/worldline-session-once'};}};
 }});
 assert.equal(f.result.success,true,f.result.error);assert.equal(sessions,1);assert.equal(f.patchCalls,2);
 assert.equal(f.records.get('orders/ORD-TEST').psp.checkoutSessionId,'worldline-session-once');
 assert.equal(f.records.get('orders/ORD-TEST').paymentAgreement.reference,reference);
 assert.equal(f.result.url,'https://v1.checkout.bambora.com/worldline-session-once');
 assert.ok(!f.events.includes('release'));assert.ok(!f.events.includes('stripe'));
});
