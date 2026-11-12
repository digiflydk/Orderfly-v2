const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {checkout}=require('../helpers/checkout-fixture.cjs');
const {checkoutFailureCode}=loadTs('src/lib/checkout-public-error.ts');
const agreement={provider:'worldline',mode:'test',owner:{brandId:'b'},reference:`projects/orderfly-39325/secrets/orderfly-worldline-${'a'.repeat(64)}-test/versions/7`,merchantNumber:'T123',revision:2,credentials:{merchantNumber:'T123',accessToken:'synthetic-access',secretToken:'synthetic-secret',md5Key:'synthetic-md5'}};

test('only bounded Worldline checkout codes are public diagnostics',()=>{
 for(const code of ['WORLDLINE_CHECKOUT_HTTP_401','WORLDLINE_CHECKOUT_HTTP_400_PROVIDER_40005','WORLDLINE_CHECKOUT_PROVIDER_1234','WORLDLINE_CHECKOUT_PROVIDER_40005','WORLDLINE_CHECKOUT_REJECTED','WORLDLINE_CHECKOUT_UNKNOWN']) {
  assert.equal(checkoutFailureCode('worldline_session',{code}),code);
  assert.equal(checkoutFailureCode('customer',{code}),'CHECKOUT_CUSTOMER');
 }
 for(const code of ['WORLDLINE_CHECKOUT_HTTP_999','WORLDLINE_CHECKOUT_PROVIDER_secret','WORLDLINE_CHECKOUT_PROVIDER_1234567','WORLDLINE_CHECKOUT_HTTP_400_PROVIDER_1234567','WORLDLINE_CHECKOUT_PROVIDER_1234\nsecret','WORLDLINE_CHECKOUT_HTTP_400_PROVIDER_40005\n','WORLDLINE_CHECKOUT_HTTP_401\n','WORLDLINE_CHECKOUT_HTTP_401\u2028','WORLDLINE_CHECKOUT_HTTP_401 api-secret','PRIVATE_ERROR',7,null]) {
  assert.equal(checkoutFailureCode('worldline_session',{code}),'CHECKOUT_WORLDLINE_SESSION');
 }
 assert.equal(checkoutFailureCode('toString',new Error('secret')),'CHECKOUT_UNAVAILABLE');
 assert.equal(checkoutFailureCode('private-stage',null),'CHECKOUT_UNAVAILABLE');
});

test('definitive provider rejection is actionable and safely logged without changing retry/release rules',async()=>{
 const logs=[],original=console.error;
 console.error=(...args)=>logs.push(args);
 let calls=0,result;
 try {
  result=await checkout({configureMocks:({mocks})=>{
   mocks['@/lib/payments/merchant-agreement']={resolveMerchantAgreement:async()=>agreement};
   const original=mocks['@/lib/payments/worldline-client'];
   mocks['@/lib/payments/worldline-client']={...original,createWorldlineCheckoutSession:async()=>{
    calls++;throw Object.assign(new original.WorldlineRequestError('rejected'),{code:'WORLDLINE_CHECKOUT_HTTP_400_PROVIDER_40005'});
   }};
  }});
 } finally {console.error=original;}
 assert.equal(result.result.success,false);assert.equal(result.result.retryable,true);
 assert.match(result.result.error,/afviste betalingsstarten/);assert.match(result.result.error,/WORLDLINE_CHECKOUT_HTTP_400_PROVIDER_40005/);
 assert.equal(calls,1);assert.equal(result.events.filter(e=>e==='release').length,1);assert.ok(!result.events.includes('stripe'));
 const entry=logs.find(args=>typeof args[0]==='string'&&args[0].startsWith('{"event":"checkout_failed"'));
 assert.ok(entry);assert.equal(entry.length,1);
 const log=JSON.parse(entry[0]);assert.equal(log.code,'WORLDLINE_CHECKOUT_HTTP_400_PROVIDER_40005');assert.equal(log.stage,'worldline_session');
 assert.doesNotMatch(JSON.stringify(log),/synthetic-access|synthetic-secret|synthetic-md5|example.test/);
});

test('unknown provider result retains the order reference and prevents a blind retry',async()=>{
 let calls=0;
 const f=await checkout({configureMocks:({mocks})=>{
  mocks['@/lib/payments/merchant-agreement']={resolveMerchantAgreement:async()=>agreement};
  const original=mocks['@/lib/payments/worldline-client'];
  mocks['@/lib/payments/worldline-client']={...original,createWorldlineCheckoutSession:async()=>{
   calls++;throw Object.assign(new original.WorldlineRequestError('unknown'),{code:'WORLDLINE_CHECKOUT_UNKNOWN'});
  }};
 }});
 assert.equal(f.result.retryable,false);assert.match(f.result.error,/før du prøver igen/);assert.match(f.result.error,/ORD-TEST/);
 assert.match(f.result.error,/WORLDLINE_CHECKOUT_UNKNOWN/);assert.equal(calls,1);assert.ok(!f.events.includes('release'));assert.ok(!f.events.includes('stripe'));
});

test('a pre-provider customer persistence failure identifies its stage without leaking internal error text',async()=>{
 const f=await checkout({fault:'customer'});
 assert.equal(f.result.success,false);assert.match(f.result.error,/CHECKOUT_CUSTOMER/);
 assert.doesNotMatch(f.result.error,/customer offline|Could not create or update/);assert.ok(!f.events.includes('stripe'));
});

test('preflight identity lookup failures preserve a safe message instead of internal storage text',async()=>{
 const f=await checkout({fault:'identity-unknown'});
 assert.equal(f.result.success,false);assert.equal(f.result.error,'Kundeoplysningerne kunne ikke kontrolleres. Prøv igen.');
 assert.doesNotMatch(f.result.error,/PRIVATE_CUSTOMER_LOOKUP_FAILURE/);assert.ok(!f.events.includes('stripe'));
});
