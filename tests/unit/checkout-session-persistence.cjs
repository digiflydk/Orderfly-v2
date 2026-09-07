const {test}=require('node:test');
const assert=require('node:assert/strict');
const {checkout,optional}=require('../helpers/checkout-fixture.cjs');
test('fixture reproduces the old nested undefined failure before Stripe',async()=>{
 const {result,events,persistenceError}=await checkout({existing:true,identityCleaner:true});
 assert.equal(result.success,false);assert.match(persistenceError,/paymentDetails\.cartDiscountName/);assert.ok(!events.includes('stripe'));
});
for(const existing of [false,true])for(const kind of ['none','automatic','code','newsletter'])test(`${existing?'returning':'new'} customer ${kind}: persists order and reaches Stripe session`,async()=>{
 const {result,writes,events,coupon}=await checkout({existing,kind});
 assert.equal(result.success,true,result.error);assert.equal(result.url,'https://checkout.stripe.test/session');
 assert.equal(result.orderId,'ORD-TEST');
 assert.ok(events.indexOf('orders')<events.indexOf('reserve'));assert.ok(events.indexOf('reserve')<events.indexOf('stripe'));
 const order=writes.find(w=>w.ref.collection==='orders').data;
 assert.equal(order.paymentDetails.cartDiscountTotal,kind==='none'?0:10);
 assert.equal('cartDiscountName' in order.paymentDetails,kind!=='none');
 assert.equal('deliveryTime' in order,false);assert.equal('toppings' in order.productItems[0],false);
 if(kind!=='none')assert.equal(coupon.amount_off,1000);
 assert.ok(writes.some(w=>w.data['psp.checkoutSessionId']==='cs_test_mock'));
});
test('cleaning retains valid values and SDK objects while rejecting invalid array entries',()=>{
 class Sentinel{} const sentinel=new Sentinel(),now=new Date();
 const cleaned=optional.omitUndefinedFields({missing:undefined,zero:0,no:false,empty:'',nil:null,nested:{missing:undefined},now,sentinel});
 assert.equal(cleaned.now,now);assert.equal(cleaned.sentinel,sentinel);assert.equal(cleaned.zero,0);assert.equal(cleaned.no,false);assert.equal(cleaned.nil,null);assert.deepEqual(cleaned.nested,{});
 assert.throws(()=>optional.omitUndefinedFields([undefined]),/array entries/);
});
