const {test}=require('node:test');
const assert=require('node:assert/strict');
const {checkout}=require('../helpers/checkout-fixture.cjs');
const held = records => [...records].filter(([key])=>key.startsWith('checkout_')).map(([,value])=>value.held);
for(const fault of ['consent-read','consent-invalid','consent-link'])test(`optional ${fault} does not block customer/order/Stripe`,async()=>{
 const {result,writes,events}=await checkout({fault,kind:'newsletter'});
 assert.equal(result.success,true,result.error);
 assert.ok(writes.some(w=>w.ref.collection==='orders'));
 const customer=writes.find(w=>w.ref.collection==='customers').data;
 assert.equal(customer.cookie_consent,undefined);
 assert.equal(customer.marketingConsent,false);
 assert.equal(customer.pendingNewsletterDiscountId,'d');
 assert.ok(events.includes('newsletter-consent'));
});
test('core customer failure is still rejected before any payment',async()=>{
 const {result,events}=await checkout({fault:'customer'});
 assert.equal(result.success,false);assert.equal(result.retryable,true);assert.ok(!events.includes('stripe'));
});
test('coupon failure releases real discount capacity immediately',async()=>{
 const {result,records,events}=await checkout({kind:'newsletter',fault:'coupon',realReservations:true});
 assert.equal(result.retryable,true);assert.equal(records.get('orders/ORD-TEST').discountReservation,'released');
 assert.deepEqual(held(records),[0,0,0]);assert.ok(!events.includes('stripe'));
});
for(const [type,statusCode] of [['StripeInvalidRequestError',400],['StripeAuthenticationError',401],['StripePermissionError',403],['StripeRateLimitError',429]])test(`confirmed Stripe ${statusCode} releases real capacity`,async()=>{
 const {result,records,events}=await checkout({kind:'newsletter',realReservations:true,stripeError:{type,statusCode}});
 assert.equal(result.success,false);assert.equal(result.retryable,true);assert.equal(records.get('orders/ORD-TEST').discountReservation,'released');
 assert.deepEqual(held(records),[0,0,0]);assert.equal(events.filter(e=>e==='stripe').length,1);
});
for(const stripeError of [{type:'StripeConnectionError'},{type:'StripeAPIError',statusCode:500},{type:'StripeIdempotencyError',statusCode:409},{type:'StripeInvalidRequestError',statusCode:400,headers:{'stripe-should-retry':'true'}}])test(`uncertain ${stripeError.type}/${stripeError.statusCode} cannot free capacity or start another session`,async()=>{
 const {result,records,events}=await checkout({kind:'newsletter',realReservations:true,stripeError});
 assert.equal(result.retryable,false);assert.deepEqual(held(records),[1,1,1]);assert.ok(!events.includes('release'));
 assert.equal(events.filter(e=>e==='stripe').length,1);assert.match(result.error,/ORD-TEST/);
});
test('transient session-link failure recovers the same session without another payment',async()=>{
 const {result,patchCalls,events}=await checkout({fault:'patch-once'});
 assert.equal(result.success,true,result.error);assert.equal(patchCalls,2);assert.equal(events.filter(e=>e==='stripe').length,1);assert.ok(!events.includes('expire'));
});
for(const fault of ['patch','no-url'])test(`${fault}: expire the known session before releasing capacity`,async()=>{
 const {result,events,records}=await checkout({fault,kind:'newsletter',realReservations:true});
 assert.equal(result.success,false);assert.equal(result.retryable,true);assert.ok(events.indexOf('expire')<events.indexOf('release'));
 assert.deepEqual(held(records),[0,0,0]);
});
test('failed expiration preserves capacity and disallows a blind retry',async()=>{
 const {result,events,records}=await checkout({fault:'expire',kind:'newsletter',realReservations:true});
 assert.equal(result.retryable,false);assert.ok(events.includes('expire'));assert.ok(!events.includes('release'));assert.deepEqual(held(records),[1,1,1]);
});
test('cleanup failure returns a structured uncertain response, without throwing',async()=>{
 const {result}=await checkout({fault:'release',kind:'newsletter'});
 assert.equal(result.success,false);assert.equal(result.retryable,false);
});
test('card checkout uses a valid descriptor suffix even without a usable city',async()=>{
 assert.equal((await checkout({city:'123'})).result.success,true);
});
test('lost reservation response still releases the committed hold before Stripe',async()=>{
 const {result,records,events}=await checkout({kind:'newsletter',realReservations:true,fault:'reserve-response'});
 assert.equal(result.retryable,true);assert.deepEqual(held(records),[0,0,0]);assert.ok(!events.includes('stripe'));
});
test('order reference collision preserves the original paid order and never reaches Stripe',async()=>{
 const {result,records,events}=await checkout({fault:'collision'});
 assert.equal(result.success,false);assert.equal(result.retryable,true);
 assert.deepEqual(records.get('orders/ORD-TEST'),{paymentStatus:'Paid',brandId:'other',totalAmount:900});
 assert.ok(!events.includes('reserve'));assert.ok(!events.includes('stripe'));
});
for(const stripeError of [{type:'StripeInvalidRequestError',statusCode:400},{type:'StripeRateLimitError',statusCode:429}])test(`4xx after SDK retry does not release an earlier potentially payable session (${stripeError.statusCode})`,async()=>{
 const {result,records}=await checkout({kind:'newsletter',realReservations:true,stripeError,fault:'prior-retry'});
 assert.equal(result.retryable,false);assert.deepEqual(held(records),[1,1,1]);
});
