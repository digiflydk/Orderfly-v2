const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const {loadTs}=require('./load-ts.cjs');
function load(path,mocks={}) {
 const mod={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports',code)(name=>['./money','@/lib/money'].includes(name)?require('../helpers/load-ts.cjs').loadTs('src/lib/money.ts'):name in mocks?mocks[name]:require(name),mod,mod.exports);return mod.exports;
}
const optional=load('src/lib/firestore-optional-fields.ts');
function strictWrite(value,path='root') {
 assert.notEqual(value,undefined,`Firestore rejects undefined at ${path}`);
 if(value && typeof value==='object') for(const [key,entry] of Object.entries(value)) strictWrite(entry,`${path}.${key}`);
}
const offer={id:'d',brandId:'b',isActive:true,locationIds:['l'],orderTypes:['pickup'],activeDays:[],activeTimeSlots:[],discountType:'percentage',discountValue:10,code:'SAVE10',usedCount:0,usageLimit:0};
async function checkout({existing=false,kind='none',identityCleaner=false, fault, stripeError, realReservations=false, city='Hellerup', items, seed=[], locationOverrides={}, deliveryType='pickup', deliveryTime, customerOverrides={}, beforeStripe, brandOverrides={}, paymentOverrides={}, standardDiscounts, expectedCartDiscount}={}) {
 const path='src/app/checkout/actions.ts';
 const mocks=Object.fromEntries([...fs.readFileSync(path,'utf8').matchAll(/from ['"]([^'"]+)['"]/g)].map(m=>[m[1],{}]));
 const events=[];const writes=[];let coupon, persistenceError, sessionParams;let patchCalls=0;
 const records=new Map();
 const firestoreRef=(collection,id)=>({collection,id});
 const snapshot=ref=>({id:ref.id,ref,exists:()=>records.has(ref.collection+'/'+ref.id),data:()=>records.get(ref.collection+'/'+ref.id)});
 const save=(ref,data,merge=false)=>{
  try { strictWrite(data); } catch(error) { persistenceError=error.message;throw error; }
  const key=ref.collection+'/'+ref.id; records.set(key,merge?{...records.get(key),...data}:structuredClone(data));
 };
 records.set('products/p',{brandId:'b',locationIds:['l'],categoryId:'pizza',price:100,isActive:true,productName:'Pizza'});
 records.set('discounts/d',{...offer,applicationType:kind==='newsletter'?'newsletter_signup':'code',perCustomerLimit:1,usageLimit:1});
 if(fault==='collision')records.set('orders/ORD-TEST',{paymentStatus:'Paid',brandId:'other',totalAmount:900});
 const record={id:'c',brandId:'b',locationIds:['l'],marketingConsent:false};
 for (const [key, data] of seed) records.set(key,data);
 if(existing) records.set('customers/c',record);
 const snap=snapshot(firestoreRef('customers','c'));
 Object.assign(mocks,{
  'node:crypto':require('node:crypto'),
  '@/lib/checkout-schema':loadTs('src/lib/checkout-schema.ts'),
  '@/lib/checkout-items':loadTs('src/lib/checkout-items.ts'),
  '@/lib/fulfillment-time':loadTs('src/lib/fulfillment-time.ts'),
  '@/lib/optional-checkout':load('src/lib/optional-checkout.ts'),
  '@/lib/stripe-checkout-failure':load('src/lib/stripe-checkout-failure.ts'),
  '@/lib/firestore-optional-fields':identityCleaner?{omitUndefinedFields:v=>v}:optional,
  '@/lib/promotion-rules':load('src/lib/promotion-rules.ts'),
  '@/lib/automatic-discounts':load('src/lib/automatic-discounts.ts'),
  '@/lib/checkout-price-validation':load('src/lib/checkout-price-validation.ts',{'./promotion-rules':load('src/lib/promotion-rules.ts')}),
  '@/lib/checkout-customer-identity':{findCheckoutCustomer:async()=>existing?snap:null},
  '@/lib/discount-reservations':{reserveDiscount:async()=>{events.push('reserve');if(fault==='reserve')throw Error('Discount capacity reached');},releaseDiscount:async()=>{events.push('release');if(fault==='release')throw Error('cleanup offline');}},
  '@/lib/order-id':{generateOrderId:()=> 'ORD-TEST'},'@/lib/firebase':{db:{}},
  '@/lib/url':{getOrigin:async()=> 'https://example.test'},
  '../superadmin/settings/actions':{getActiveStripeSecretKey:async()=> 'test-placeholder'},
  '@/app/superadmin/brands/actions':{getBrandById:async()=>({id:'b',slug:'brand',name:'Test brand',bagFee:4,adminFee:0,...brandOverrides})},
  '@/app/superadmin/locations/actions':{getLocationById:async()=>({id:'l',slug:'location',brandId:'b',city,name:'Test location',isActive:true,deliveryTypes:['pickup','delivery'],allowPreOrder:true,prep_time:20,delivery_time:20,openingHours:Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day=>[day,{isOpen:true,open:'12:00',close:'22:00'}])),...locationOverrides})},
  '@/app/superadmin/discounts/actions':{getDiscountById:async()=>records.get('discounts/d')},
  '@/app/superadmin/standard-discounts/actions':{getActiveStandardDiscounts:async()=>standardDiscounts || (kind==='automatic'?[{...offer,discountName:'Automatic 10%',discountType:'cart',discountMethod:'percentage'}]:[])},
  stripe:{default:class Stripe {
   on(_,listener){this.listener=listener;}
   off(){this.listener=null;}
   coupons={create:async params=>{events.push('coupon');if(fault==='coupon'||fault==='release')throw Error('coupon offline');coupon=params;return {id:'coupon'};}};
   checkout={sessions:{create:async (params,options)=>{events.push('stripe');sessionParams=params;this.listener?.();if(fault==='prior-retry')this.listener?.();assert.equal(options.idempotencyKey,'ORD-TEST');assert.equal(params.payment_intent_data.statement_descriptor,undefined);assert.match(params.payment_intent_data.statement_descriptor_suffix,/[A-Z]/);if(stripeError)throw stripeError;assert.equal(writes.find(w=>w.ref.collection==='orders').data.paymentDetails.cartDiscountTotal,expectedCartDiscount ?? (kind==='none'?0:10));return {id:'cs_test_mock',url:fault==='no-url'?null:'https://checkout.stripe.test/session'};},expire:async()=>{events.push('expire');if(fault==='expire')throw Error('expire uncertain');return {id:'cs_test_mock',status:'expired',payment_status:'unpaid'};}}};
  }},
  'firebase/firestore':{
   collection:(_,name)=>name,where:()=>null,query:value=>value,getDocs:async collection=>({docs:[...records].filter(([key])=>key.startsWith(collection+'/')).map(([key])=>snapshot(firestoreRef(collection,key.slice(collection.length+1))))}),
   doc:(_,collection,id)=>firestoreRef(collection,id),
   getDoc:async ref=>{
    if(ref.collection==='anonymous_cookie_consents') {
     if(fault==='consent-read')throw Error('consent offline');
     return {exists:()=>true,data:()=>({last_seen:fault==='consent-invalid'?'invalid':new Date(),marketing:false,statistics:true,functional:true})};
    }
    return snapshot(ref);
   },
   runTransaction:async(_,callback)=>callback({get:async ref=>snapshot(ref),set:(ref,data)=>{save(ref,data);writes.push({ref,data});events.push(ref.collection);},update:(ref,data)=>save(ref,data,true)}),
   serverTimestamp:()=>new Date('2026-09-07T00:00:00Z'),
   setDoc:async(ref,data)=>{if(fault==='customer'&&ref.collection==='customers')throw Error('customer offline');save(ref,data);writes.push({ref,data});events.push(ref.collection);},
   updateDoc:async(ref,data)=>{
    if(ref.collection==='anonymous_cookie_consents'&&fault==='consent-link')throw Error('consent link offline');
    if(data['psp.checkoutSessionId']) {
     patchCalls++;
     if(['patch','expire'].includes(fault)||(fault==='patch-once'&&patchCalls===1))throw Error('session link offline');
    }
    save(ref,data,true);writes.push({ref,data});events.push('patch');
   },
  },
 });
 if(realReservations) {
  const reservations=load('src/lib/discount-reservations.ts',mocks);
  mocks['@/lib/discount-reservations']={
   reserveDiscount:async(...args)=>{events.push('reserve');await reservations.reserveDiscount(...args);beforeStripe?.();if(fault==='reserve-response')throw Error('reservation response lost');},
   releaseDiscount:async(...args)=>{events.push('release');return reservations.releaseDiscount(...args);},
  };
 }
 const api=load(path,mocks);
 const result=await api.createStripeCheckoutSessionAction(items || [{id:'p',name:'Pizza',quantity:1,unitPrice:100,totalPrice:100,toppings:identityCleaner?[]:undefined}],{name:'Test',email:'test@example.test',phone:'12345678',subscribeToNewsletter:kind==='newsletter',acceptTerms:true,...customerOverrides,...(identityCleaner?{street:'',zipCode:'',city:''}:{})},deliveryType,'b','l',{subtotal:100,deliveryFee:0,discountTotal:0,tips:0,taxes:0,bagFee:4,cartDiscountName:undefined,...paymentOverrides},['code','newsletter'].includes(kind)?'d':null,'brand','location',deliveryTime,fault?.startsWith('consent-')?'anon':undefined);
 return {result,writes,events,coupon,records,patchCalls,persistenceError,sessionParams};
}

module.exports={checkout,optional};
