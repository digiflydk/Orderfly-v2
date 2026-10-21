const {test}=require('node:test');
const assert=require('node:assert/strict');
const {checkout}=require('../helpers/checkout-fixture.cjs');
const {loadTs}=require('../helpers/load-ts.cjs');
const {checkoutRequestSchema}=loadTs('src/lib/checkout-schema.ts');

test('Club checkout records real signup after quote validation and skips generic newsletter consent',async()=>{
 const f=await checkout({kind:'club',expectedCartDiscount:10,paymentOverrides:{cartDiscountTotal:10,discountTotal:10}});
 assert.equal(f.result.success,true,f.result.error);
 assert.ok(f.events.indexOf('club-signup')>f.events.indexOf('customers'));
 assert.equal(f.events.filter(e=>e==='club-signup').length,1);
 assert.equal(f.events.includes('newsletter-consent'),false);
 const order=f.records.get('orders/ORD-TEST');
 assert.equal(order.appliedDiscountId,'d');assert.equal(order.paymentDetails.cartDiscountTotal,10);
 assert.equal(f.records.get('customers/'+order.customerDetails.id).pendingClubDiscountId,'d');
});
test('Club stale quote cannot commit membership, consent, reservation or payment',async()=>{
 const f=await checkout({kind:'club',paymentOverrides:{cartDiscountTotal:0,discountTotal:0}});
 assert.equal(f.result.success,false);assert.match(f.result.error,/Priser eller tilbud/);
 assert.deepEqual(f.writes,[]);assert.equal(f.events.includes('club-signup'),false);assert.equal(f.events.includes('reserve'),false);assert.equal(f.events.includes('stripe'),false);
});
test('missing either explicit Club consent or versions rejects before any writes',async()=>{
 for(const customerOverrides of [{subscribeToNewsletter:false},{clubTermsAccepted:false},{clubConsentVersion:''},{clubTermsVersion:undefined}]){
  const f=await checkout({kind:'club',customerOverrides});
  assert.equal(f.result.success,false);assert.deepEqual(f.writes,[]);assert.deepEqual(f.events,[]);
 }
});
test('a mode change rejects new Club acquisition but not an already earned personal right',async()=>{
 const mode={brandId:'b',settings:{checkoutMode:'newsletter'}};
 const stale=await checkout({kind:'club',seed:[['loyaltyCampaigns/b',mode]]});
 assert.equal(stale.result.success,false);assert.match(stale.result.error,/ikke aktiv/);assert.deepEqual(stale.writes,[]);
 const personal=await checkout({kind:'club',seed:[['loyaltyCampaigns/b',mode],['customers/c',{id:'c',brandId:'b',email:'test@example.test',normalizedEmail:'test@example.test',phone:'12345678',pendingClubDiscountId:'d',locationIds:['l'],marketingConsent:false}]],
  customerOverrides:{subscribeToClub:false,subscribeToNewsletter:false,clubTermsAccepted:false},paymentOverrides:{cartDiscountTotal:10,discountTotal:10}});
 assert.equal(personal.result.success,true,personal.result.error);assert.equal(personal.events.includes('club-signup'),false);assert.equal(personal.events.includes('newsletter-consent'),false);
});
test('Club signup failure never creates a paid order or payment session',async()=>{
 const f=await checkout({kind:'club',fault:'club-signup',paymentOverrides:{cartDiscountTotal:10,discountTotal:10}});
 assert.equal(f.result.success,false);assert.equal(f.records.has('orders/ORD-TEST'),false);assert.equal(f.events.includes('reserve'),false);assert.equal(f.events.includes('stripe'),false);
});
