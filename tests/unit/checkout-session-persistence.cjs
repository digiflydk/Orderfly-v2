const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
function load(path,mocks={}) {
 const mod={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports',code)(name=>name in mocks?mocks[name]:require(name),mod,mod.exports);return mod.exports;
}
const optional=load('src/lib/firestore-optional-fields.ts');
function strictWrite(value,path='root') {
 assert.notEqual(value,undefined,`Firestore rejects undefined at ${path}`);
 if(value && typeof value==='object') for(const [key,entry] of Object.entries(value)) strictWrite(entry,`${path}.${key}`);
}
const offer={id:'d',brandId:'b',isActive:true,locationIds:['l'],orderTypes:['pickup'],activeDays:[],activeTimeSlots:[],discountType:'percentage',discountValue:10,code:'SAVE10',usedCount:0,usageLimit:0};
async function checkout({existing=false,kind='none',identityCleaner=false}={}) {
 const path='src/app/checkout/actions.ts';
 const mocks=Object.fromEntries([...fs.readFileSync(path,'utf8').matchAll(/from ['"]([^'"]+)['"]/g)].map(m=>[m[1],{}]));
 const events=[];const writes=[];let coupon;
 const record={id:'c',brandId:'b',locationIds:['l'],marketingConsent:false};
 const snap={ref:{id:'c',collection:'customers'},exists:()=>true,data:()=>record};
 Object.assign(mocks,{
  'node:crypto':require('node:crypto'),
  '@/lib/firestore-optional-fields':identityCleaner?{omitUndefinedFields:v=>v}:optional,
  '@/lib/promotion-rules':load('src/lib/promotion-rules.ts'),
  '@/lib/checkout-customer-identity':{findCheckoutCustomer:async()=>existing?snap:null},
  '@/lib/discount-reservations':{reserveDiscount:async()=>events.push('reserve'),releaseDiscount:async()=>events.push('release')},
  '@/lib/order-id':{generateOrderId:()=> 'ORD-TEST'},'@/lib/firebase':{db:{}},
  '@/lib/url':{getOrigin:async()=> 'https://example.test'},
  '../superadmin/settings/actions':{getActiveStripeSecretKey:async()=> 'test-placeholder'},
  '@/app/superadmin/brands/actions':{getBrandById:async()=>({id:'b',name:'Test brand',bagFee:4,adminFee:0})},
  '@/app/superadmin/locations/actions':{getLocationById:async()=>({id:'l',brandId:'b',city:'Hellerup',name:'Test location'})},
  '@/app/superadmin/discounts/actions':{getDiscountById:async()=>({...offer,applicationType:kind==='newsletter'?'newsletter_signup':'code'})},
  '@/app/superadmin/standard-discounts/actions':{getActiveStandardDiscounts:async()=>kind==='automatic'?[{...offer,discountName:'Automatic 10%',discountType:'cart',discountMethod:'percentage'}]:[]},
  stripe:{default:class Stripe {
   coupons={create:async params=>{coupon=params;return {id:'coupon'};}};
   checkout={sessions:{create:async params=>{events.push('stripe');assert.equal(writes.find(w=>w.ref.collection==='orders').data.paymentDetails.cartDiscountTotal,kind==='none'?0:10);return {id:'cs_test_mock',url:'https://checkout.stripe.test/session'};}}};
  }},
  'firebase/firestore':{
   doc:(_,collection,id)=>({collection,id}),
   getDoc:async ref=>({id:ref.id,exists:()=>ref.collection==='products',data:()=>({brandId:'b',locationIds:['l'],categoryId:'pizza',price:100})}),
   serverTimestamp:()=>new Date('2026-09-07T00:00:00Z'),
   setDoc:async(ref,data)=>{strictWrite(data);writes.push({ref,data});events.push(ref.collection);},
   updateDoc:async(ref,data)=>{strictWrite(data);writes.push({ref,data});events.push('patch');},
  },
 });
 const api=load(path,mocks);
 const result=await api.createStripeCheckoutSessionAction([{id:'p',name:'Pizza',quantity:1,unitPrice:100,totalPrice:100,toppings:identityCleaner?[]:undefined}],{name:'Test',email:'test@example.test',phone:'12345678',subscribeToNewsletter:kind==='newsletter',...(identityCleaner?{street:'',zipCode:'',city:''}:{})},'pickup','b','l',{subtotal:100,bagFee:4,cartDiscountName:undefined},['code','newsletter'].includes(kind)?'d':null,'brand','location');
 return {result,writes,events,coupon};
}
test('fixture reproduces the old nested undefined failure before Stripe',async()=>{
 const {result,events}=await checkout({existing:true,identityCleaner:true});
 assert.equal(result.success,false);assert.match(result.error,/paymentDetails\.cartDiscountName/);assert.ok(!events.includes('stripe'));
});
for(const existing of [false,true])for(const kind of ['none','automatic','code','newsletter'])test(`${existing?'returning':'new'} customer ${kind}: persists order and reaches Stripe session`,async()=>{
 const {result,writes,events,coupon}=await checkout({existing,kind});
 assert.equal(result.success,true,result.error);assert.equal(result.url,'https://checkout.stripe.test/session');
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
