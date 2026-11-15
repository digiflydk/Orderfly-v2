// The payment page opens only after the checkout request has finished its database and Stripe calls.
// Every mocked I/O call here takes the same time; the test counts how many rounds wait on each other.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {checkout}=require('../helpers/checkout-fixture.cjs');
const IO_MS=40;
const pure=new Set(['@/lib/checkout-schema','@/lib/merchant-payment-methods','@/lib/checkout-items','@/lib/fulfillment-time','@/lib/optional-checkout','@/lib/firestore-optional-fields','@/lib/promotion-rules','@/lib/automatic-discounts','@/lib/checkout-price-validation','@/lib/customer-identity','@/lib/checkout-public-error','@/lib/brand-subdomain','@/lib/synthetic-product','@/lib/stripe-checkout-failure','node:crypto','@/lib/order-id','@/lib/delivery/quotes/phone','@/lib/delivery/public-schedule','@/lib/delivery/quotes/performance','@/lib/delivery/quotes/diagnostic-schema','@/lib/delivery/quotes/customer-failure','@/lib/integrations/esmeralda-customer-contract','@/lib/delivery/quotes/request-context']);
async function timeline(options={}){
 const calls=[];let origin=null;const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const slow=(name,fn)=>function(...args){const result=fn.apply(this,args);if(!result||typeof result.then!=='function')return result;
  const start=Date.now();origin??=start;return (async()=>{await sleep(IO_MS);const value=await result;calls.push({name,start:start-origin,end:Date.now()-origin});return value;})();};
 const r=await checkout({customerOverrides:{paymentMethod:'online'},existing:true,...options,configureMocks:context=>{
  options.configureMocks?.(context);const {mocks,marketingDb}=context;
  for(const [name,api] of Object.entries(mocks)){if(pure.has(name)||!api||typeof api!=='object')continue;
   if(name==='stripe'){const Base=api.default;mocks.stripe={default:class extends Base{constructor(...a){super(...a);this.coupons={create:slow('stripe.coupons.create',this.coupons.create)};this.checkout={sessions:{create:slow('stripe.sessions.create',this.checkout.sessions.create)}};}}};continue;}
   mocks[name]=Object.fromEntries(Object.entries(api).map(([key,value])=>[key,typeof value==='function'&&!['collection','where','query','doc','serverTimestamp'].includes(key)?slow(name+'.'+key,value):value]));}
  marketingDb.runTransaction=slow('adminDb.runTransaction',marketingDb.runTransaction);
 }});
 assert.equal(r.result.success,true,r.result.error);
 calls.sort((a,b)=>a.start-b.start);
 // A round is a group of calls that started before the previous round finished.
 let rounds=0,roundEnd=-Infinity;for(const call of calls){if(call.start>=roundEnd-IO_MS/4){rounds++;roundEnd=call.end;}else roundEnd=Math.max(roundEnd,call.end);}
 return {rounds,calls,startOf:name=>calls.find(call=>call.name===name)?.start};
}
test('online pickup reaches Stripe in few dependent rounds: independent reads run together',async()=>{
 const {rounds,calls,startOf}=await timeline();
 // Sequentially this request took 19 rounds; the rules still need tenant, price, customer, order, reservation, session and link.
 assert.ok(rounds<=11,`dependent I/O rounds: ${rounds}\n${calls.map(c=>`${c.start} ${c.name}`).join('\n')}`);
 // The price check reads offers, products, upsells and the customer together, alongside the payment agreement.
 const pricingStart=startOf('@/app/superadmin/standard-discounts/actions.getActiveStandardDiscounts');
 for(const name of ['@/lib/checkout-customer-identity.findCheckoutCustomer','@/lib/payments/merchant-agreement.resolveMerchantAgreement','firebase/firestore.getDocs'])
  assert.ok(Math.abs(startOf(name)-pricingStart)<IO_MS/2,name+' starts with the price check');
 // Unchanged fulfilment time: no second order write before the session.
 const beforeSession=calls.filter(c=>c.start<startOf('stripe.sessions.create'));
 assert.equal(beforeSession.filter(c=>c.name==='firebase/firestore.updateDoc').length,0);
});
test('a cart discount creates the Stripe coupon alongside the order writes, ready before the final checks',async()=>{
 const {calls,startOf}=await timeline({kind:'automatic'});
 const coupon=calls.find(c=>c.name==='stripe.coupons.create');assert.ok(coupon,'coupon created');
 assert.ok(coupon.start<startOf('@/lib/discount-reservations.reserveDiscount'),'coupon starts before the reservation');
 assert.ok(coupon.end<=startOf('stripe.sessions.create')+1,'coupon ready before the session');
});
test('a change during coupon creation is still caught by the final checks before payment',async()=>{
 // The restaurant stops taking orders while Stripe creates the coupon: no payable session may be created.
 let location=null;const events=[];
 const r=await checkout({kind:'automatic',customerOverrides:{paymentMethod:'online'},existing:true,configureMocks:({mocks,events:log})=>{
  const read=mocks['@/app/superadmin/locations/actions'].getLocationById;
  mocks['@/app/superadmin/locations/actions']={...mocks['@/app/superadmin/locations/actions'],getLocationById:async(...a)=>(location=await read(...a))};
  const Base=mocks.stripe.default;mocks.stripe={default:class extends Base{constructor(...a){super(...a);const create=this.coupons.create;
   this.coupons={create:async(...args)=>{const coupon=await create(...args);await new Promise(r=>setTimeout(r,20));location.isActive=false;return coupon;}};}}};
  events.push(log);
 }});
 assert.equal(r.result.success,false);assert.equal(r.result.url,undefined);
 assert.ok(r.events.includes('coupon'));assert.ok(!r.events.includes('stripe'),'no Stripe session after the failed recheck');
});
test('Worldline (the provider Esmeralda uses) gets the same overlapped path before its session',async()=>{
 const reference=`projects/orderfly-39325/secrets/orderfly-worldline-${'a'.repeat(64)}-test/versions/7`;
 const agreement={provider:'worldline',mode:'test',owner:{brandId:'b'},reference,merchantNumber:'T123',revision:2,credentials:{merchantNumber:'T123',accessToken:'synthetic-access',secretToken:'synthetic-secret',md5Key:'synthetic-md5'}};
 const {rounds,calls,startOf}=await timeline({configureMocks:({mocks})=>{
  mocks['@/lib/payments/merchant-agreement']={resolveMerchantAgreement:async()=>agreement};
  mocks['@/lib/payments/worldline-client']={...mocks['@/lib/payments/worldline-client'],createWorldlineCheckoutSession:async()=>({token:'wl-token',url:'https://v1.checkout.bambora.com/wl-token'})};
 }});
 assert.ok(calls.some(c=>c.name==='@/lib/payments/worldline-client.createWorldlineCheckoutSession'),'Worldline session created');
 assert.ok(!calls.some(c=>c.name.startsWith('stripe.')),'no Stripe call');
 assert.ok(Math.abs(startOf('@/lib/payments/merchant-agreement.resolveMerchantAgreement')-startOf('@/app/superadmin/standard-discounts/actions.getActiveStandardDiscounts'))<IO_MS/2,'agreement read alongside the price check');
 assert.ok(rounds<=10,`dependent I/O rounds: ${rounds}\n${calls.map(c=>`${c.start} ${c.name}`).join('\n')}`);
});
