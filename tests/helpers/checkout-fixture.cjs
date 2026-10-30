const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const {loadTs}=require('./load-ts.cjs');
function load(path,mocks={}) {
 const mod={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports',code)(name=>name==='./promotion-rules'?loadTs('src/lib/promotion-rules.ts'):['./money','@/lib/money'].includes(name)?require('../helpers/load-ts.cjs').loadTs('src/lib/money.ts'):name === '@/lib/server/firestore-compat' && mocks['firebase/firestore'] ? {...mocks['firebase/firestore'],db:mocks['@/lib/firebase']?.db} : name in mocks ?mocks[name]:require(name),mod,mod.exports);return mod.exports;
}
const optional=load('src/lib/firestore-optional-fields.ts');
const customerIdentity=loadTs('src/lib/customer-identity.ts');
function strictWrite(value,path='root') {
 assert.notEqual(value,undefined,`Firestore rejects undefined at ${path}`);
 if(value && typeof value==='object') for(const [key,entry] of Object.entries(value)) strictWrite(entry,`${path}.${key}`);
}
const offer={id:'d',brandId:'b',isActive:true,locationIds:['l'],orderTypes:['pickup'],activeDays:[],activeTimeSlots:[],discountType:'percentage',discountValue:10,code:'SAVE10',usedCount:0,usageLimit:0};
async function checkout({discountReaders,existing=false,kind='none',identityCleaner=false, fault, stripeError, realReservations=false, marketingConfigured=true, city='Hellerup', items, seed=[], locationOverrides={}, deliveryType='pickup', deliveryTime, customerOverrides={}, beforeCustomerTransaction, beforeStripe, brandOverrides={}, paymentOverrides={}, standardDiscounts, expectedCartDiscount, consentCookie, loyaltyToken, anonymousConsentId, orderId='ORD-TEST', discountOrderTypes=['pickup'], createOnly=false, origin='https://example.test', requestedBrandSlug='brand', requestedLocationSlug='location', discountId='d',configureMocks,managedDeliveryAcceptance}={}) {
 const path='src/app/checkout/actions.ts';
 const mocks=Object.fromEntries([...fs.readFileSync(path,'utf8').matchAll(/from ['"]([^'"]+)['"]/g)].map(m=>[m[1],{}]));
 const events=[];const writes=[];let coupon, persistenceError, sessionParams;let patchCalls=0;
 const records=new Map();
 const marketingDb=require('./marketing-db.cjs').memoryDb(records);
 const nativeCollection=marketingDb.collection;
 const nativeRef=ref=>({...ref,collection:child=>nativeQuery(nativeCollection(ref.path+'/'+child))});
 const nativeQuery=query=>({...query,doc:id=>nativeRef(query.doc(id)),where:(...args)=>nativeQuery(query.where(...args)),limit:n=>nativeQuery(query.limit(n)),get:async()=>{const result=await query.get();return {...result,size:result.docs.length};}});
 marketingDb.collection=name=>nativeQuery(nativeCollection(name));
 const acceptanceGraph=require('./load-ts-graph.cjs').moduleGraph({react:require('next/dist/compiled/react'),
  'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>marketingDb,getAdminFieldValue:()=>({serverTimestamp:()=>new Date('2026-09-07T00:00:00Z')})},
 });
 const firestoreRef=(collection,id)=>({collection,id});
 const snapshot=ref=>({id:ref.id,ref,exists:()=>records.has(ref.collection+'/'+ref.id),data:()=>records.get(ref.collection+'/'+ref.id)});
 const save=(ref,data,merge=false)=>{
  try { strictWrite(data); } catch(error) { persistenceError=error.message;throw error; }
  const key=ref.collection+'/'+ref.id;
  const saved=merge?{...records.get(key),...data}:structuredClone(data);
  for(const field of Object.keys(data).filter(field=>field.includes('.'))) {
   const [parent,child]=field.split('.'); saved[parent]={...saved[parent],[child]:data[field]}; delete saved[field];
  }
  records.set(key,saved);
 };
 records.set('products/p',{brandId:'b',locationIds:['l'],categoryId:'pizza',price:100,isActive:true,productName:'Pizza'});
 records.set('discounts/d',{...offer,id:'d',orderTypes:discountOrderTypes,applicationType:kind==='newsletter'?'newsletter_signup':kind==='club'?'club_signup':'code',perCustomerLimit:1,usageLimit:1});
 if(kind==='club') records.set('loyaltyCampaigns/b',{brandId:'b',settings:{checkoutMode:'club'}});
 if(fault==='collision')records.set('orders/ORD-TEST',{paymentStatus:'Paid',brandId:'other',totalAmount:900});
 const record={id:'c',brandId:'b',email:'test@example.test',normalizedEmail:'test@example.test',phone:'12345678',normalizedPhone:'12345678',locationIds:['l'],marketingConsent:false};
 for (const [key, data] of seed) records.set(key,data);
 if(fault?.startsWith('consent-')) {
  const id='22222222-2222-4222-8222-222222222222',secret='b'.repeat(64);consentCookie=id+'.'+secret;
  records.set('anonymous_cookie_consents/'+id,{brand_id:'b',identityTokenHash:require('node:crypto').createHash('sha256').update(secret).digest('hex'),last_seen:fault==='consent-invalid'?'invalid':new Date(),marketing:false,statistics:true,functional:true,consent_version:'v1',origin_brand:'b'});
 }

 if(existing) records.set('customers/c',record);
 const snap=snapshot(firestoreRef('customers','c'));
 Object.assign(mocks,{
  '@/lib/delivery/quotes/phone':loadTs('src/lib/delivery/quotes/phone.ts'),
  '@/lib/delivery/quotes/diagnostics':{recordQuoteDiagnostic:async()=>{}},
  '@/lib/delivery/quotes/diagnostic-schema':loadTs('src/lib/delivery/quotes/diagnostic-schema.ts'),
  '@/lib/delivery/quotes/customer-failure':loadTs('src/lib/delivery/quotes/customer-failure.ts'),
  '@/lib/delivery/quotes/adoption':{managedDeliveryRequired:async()=>false},
  '@/lib/delivery/quotes/runtime':{managedDeliveryRuntimeAvailable:async()=>false,resolveManagedDeliveryRuntime:async()=>null},
  'next/headers': {cookies:async()=>({get:name=>name==='__Host-orderfly-loyalty' && loyaltyToken ? {value:loyaltyToken}:undefined})},
  '@/lib/loyalty/stamp-card/portal-http':{SESSION_COOKIE:'__Host-orderfly-loyalty'},
  '@/lib/loyalty/discount-card/checkout':acceptanceGraph('src/lib/loyalty/discount-card/checkout.ts'),
  '@/lib/loyalty/stamp-card/club-signup':{
   getClubSignupDiscountEligibility:async()=>fault!=='club-ineligible',
   validateClubCheckoutSignup:async input=>{events.push('club-preflight');assert.equal(input.newsletterConsent,true);assert.equal(input.termsAccepted,true);return{eligible:fault!=='club-ineligible'};},
   prepareClubCheckoutSignup:async input=>{events.push('club-signup');if(fault==='club-signup')throw Error('Club signup unavailable');const row=[...records].find(([key,data])=>key.startsWith('customers/')&&data.brandId===input.brandId&&customerIdentity.customerHasEmail(data,input.email));assert.ok(row,'canonical checkout customer exists before Club signup');if(input.discountId)records.set(row[0],{...row[1],pendingClubDiscountId:input.discountId});return{customerId:row[1].id};},
  },
  '@/lib/loyalty/stamp-card/membership':{resolveBrand:async()=>({brandId:'b'}),programForPortal:async()=>({active:true,name:'Fixture Club',consentText:'Consent',consentHelp:'Help',termsAccept:'Terms',consentVersion:'v1',termsVersion:'v1'})},
  '@/lib/marketing/config':{marketingConfig:brandId=>marketingConfigured && brandId==='b'?{brandId:'b'}:null},
  'node:crypto':require('node:crypto'),
  '@/lib/firebase-admin':{getAdminDb:()=>marketingDb},
  '@/lib/server/accept-pickup-checkout':acceptanceGraph('src/lib/server/accept-pickup-checkout.ts'),
  '@/lib/printing/unpaid-acceptance-originals':acceptanceGraph('src/lib/printing/unpaid-acceptance-originals.ts'),
  '@/lib/marketing/store':{recordNewsletterConsent:async(...args)=>{events.push('newsletter-consent');if(fault==='newsletter-consent')throw Error('consent storage offline');return loadTs('src/lib/marketing/store.ts',{'server-only':{}}).recordNewsletterConsent(...args);}},
  '@/lib/synthetic-product':loadTs('src/lib/synthetic-product.ts'),
  '@/lib/checkout-schema':loadTs('src/lib/checkout-schema.ts'),
  '@/lib/merchant-payment-methods':loadTs('src/lib/merchant-payment-methods.ts'),
  '@/lib/checkout-items':loadTs('src/lib/checkout-items.ts'),
  '@/lib/fulfillment-time':loadTs('src/lib/fulfillment-time.ts'),
  '@/lib/delivery/public-schedule':loadTs('src/lib/delivery/public-schedule.ts'),
  '@/lib/optional-checkout':load('src/lib/optional-checkout.ts'),
  '@/lib/server/consent-identity':loadTs('src/lib/server/consent-identity.ts',{'server-only':{},'next/headers':{cookies:async()=>({get:()=>consentCookie?{value:consentCookie}:undefined})},'@/lib/firebase-admin':{getAdminDb:()=>{if(fault==='consent-read')throw Error('consent offline');return fault==='consent-link'?{...marketingDb,runTransaction:run=>marketingDb.runTransaction(tx=>run({...tx,update:()=>{throw Error('consent link offline');}}))}:marketingDb;}}}),
  '@/lib/stripe-checkout-failure':load('src/lib/stripe-checkout-failure.ts'),
  '@/lib/firestore-optional-fields':identityCleaner?{omitUndefinedFields:v=>v}:optional,
  '@/lib/promotion-rules':load('src/lib/promotion-rules.ts'),
  '@/lib/automatic-discounts':load('src/lib/automatic-discounts.ts'),
  '@/lib/checkout-price-validation':load('src/lib/checkout-price-validation.ts',{'./promotion-rules':load('src/lib/promotion-rules.ts')}),
  '@/lib/customer-identity':customerIdentity,
  '@/lib/integrations/esmeralda-customer-contract':loadTs('src/lib/integrations/esmeralda-customer-contract.ts'),
  '@/lib/checkout-customer-identity':{findCheckoutCustomer:async(brandId,email,phone)=>{
   if(fault==='identity-conflict')throw Error('Customer identity scope conflict.');
   if(fault==='identity-unknown')throw Error('PRIVATE_CUSTOMER_LOOKUP_FAILURE');
   const matches=[...records].filter(([key,data])=>key.startsWith('customers/')&&data.brandId===brandId&&(
    customerIdentity.customerHasEmail(data,email)||customerIdentity.customerHasPhone(data,phone)
   )).map(([key,data])=>({...data,id:data.id||key.slice('customers/'.length)}));
   const selected=customerIdentity.selectCustomerByIdentity(matches,email,phone);
   return selected?snapshot(firestoreRef('customers',selected.id)):existing?snap:null;
  }},
  '@/lib/checkout-public-error':load('src/lib/checkout-public-error.ts'),
  '@/lib/discount-reservations':{reserveDiscount:async()=>{events.push('reserve');if(fault==='reserve')throw Error('Discount capacity reached');},releaseDiscount:async()=>{events.push('release');if(fault==='release')throw Error('cleanup offline');}},
  '@/lib/order-id':{generateOrderId:()=> orderId},'@/lib/firebase':{db:{}},
  '@/lib/url':{getOrigin:async()=> origin},'@/lib/brand-subdomain':loadTs('src/lib/brand-subdomain.ts'),
  '@/lib/server/payment-settings':{getActiveStripeSecretKey:async()=> 'test-placeholder'},
  // Stale-hold reconciliation has its own suite (stale-discount-holds-210); here it finds nothing.
  '@/lib/server/stale-discount-holds':{reconcileStaleDiscountHolds:async()=>({inspected:0,released:0,settled:0})},
  '@/app/superadmin/brands/actions':{getBrandById:async()=>({id:'b',slug:'brand',name:'Test brand',bagFee:4,adminFee:0,...brandOverrides})},
  '@/app/superadmin/locations/actions':{getLocationById:async()=>({id:'l',slug:'location',brandId:'b',city,name:'Test location',isActive:true,deliveryTypes:['pickup','delivery'],allowPreOrder:true,prep_time:20,delivery_time:20,openingHours:Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day=>[day,{isOpen:true,open:'12:00',close:'22:00'}])),...locationOverrides})},
  '@/lib/server/checkout-discounts':{
   getDiscountById:async id=>records.get('discounts/'+id),
   getDiscountByCode:async(code,brandId)=>{const d=records.get('discounts/d');return d?.code===code&&d.brandId===brandId?d:null;},
  },
  '@/app/superadmin/standard-discounts/actions':{getActiveStandardDiscounts:async()=>standardDiscounts || (kind==='automatic'?[{...offer,discountName:'Automatic 10%',discountType:'cart',discountMethod:'percentage'}]:[])},
  stripe:{default:class Stripe {
   on(_,listener){this.listener=listener;}
   off(){this.listener=null;}
   coupons={create:async params=>{events.push('coupon');if(fault==='coupon'||fault==='release')throw Error('coupon offline');coupon=params;return {id:'coupon'};}};
   checkout={sessions:{create:async (params,options)=>{events.push('stripe');sessionParams=params;this.listener?.();if(fault==='prior-retry')this.listener?.();assert.equal(options.idempotencyKey,orderId);assert.equal(params.payment_intent_data.statement_descriptor,undefined);assert.match(params.payment_intent_data.statement_descriptor_suffix,/[A-Z]/);if(stripeError)throw stripeError;assert.equal(writes.find(w=>w.ref.collection==='orders').data.paymentDetails.cartDiscountTotal,expectedCartDiscount ?? (kind==='none'?0:10));return {id:'cs_test_mock',url:fault==='no-url'?null:'https://checkout.stripe.test/session'};},expire:async()=>{events.push('expire');if(fault==='expire')throw Error('expire uncertain');return {id:'cs_test_mock',status:'expired',payment_status:'unpaid'};}}};
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
   runTransaction:async(_,callback)=>{beforeCustomerTransaction?.(records);const tx={get:async ref=>snapshot(ref),set:(ref,data,options)=>{if(fault==='customer'&&ref.collection==='customers')throw Error('customer offline');save(ref,data,!!options?.merge);writes.push({ref,data});events.push(ref.collection);},update:(ref,data)=>save(ref,data,true)};
    const compatRef=ref=>{const [collection,id]=ref.path.split('/');return firestoreRef(collection,id);};
    const nativeTx={get:async ref=>{if(!ref.path||ref.path.split('/').length!==2)return ref.get();const saved=await tx.get(compatRef(ref));return{...saved,exists:saved.exists()};},create:(ref,data)=>{if(records.has(ref.path))throw Error('Exists');strictWrite(data);records.set(ref.path,structuredClone(data));},set:(ref,...args)=>ref.path.split('/').length===2?tx.set(compatRef(ref),...args):records.set(ref.path,structuredClone(args[0])),update:(ref,...args)=>ref.path.split('/').length===2?tx.update(compatRef(ref),...args):records.set(ref.path,{...records.get(ref.path),...structuredClone(args[0])})};
    const result=await callback(tx,Object.freeze({db:marketingDb,transaction:nativeTx}));
    if(fault==='pickup-response'&&records.get('orders/'+orderId)?.status==='Received')throw Error('acceptance response lost');
    return result;},
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
 records.set('locations/l',await mocks['@/app/superadmin/locations/actions'].getLocationById());
 records.set('brands/b',await mocks['@/app/superadmin/brands/actions'].getBrandById());
 if(realReservations) {
  const reservations=load('src/lib/discount-reservations.ts',mocks);
  mocks['@/lib/discount-reservations']={
   reserveDiscount:async(...args)=>{events.push('reserve');await reservations.reserveDiscount(...args);beforeStripe?.();if(fault==='reserve-response')throw Error('reservation response lost');},
   releaseDiscount:async(...args)=>{events.push('release');return reservations.releaseDiscount(...args);},
  };
 }
 if(discountReaders) mocks['@/lib/server/checkout-discounts']=discountReaders;
 configureMocks?.({mocks,records,marketingDb,events});
 const api=load(path,mocks);
 if(createOnly) return {result:{},writes,events,records,actions:api};
 const result=await api.createStripeCheckoutSessionAction(items || [{id:'p',name:'Pizza',quantity:1,unitPrice:100,totalPrice:100,toppings:identityCleaner?[]:undefined}],{name:'Test',email:'test@example.test',phone:'12345678',subscribeToNewsletter:['newsletter','club'].includes(kind),...(kind==='club'?{subscribeToClub:true,clubTermsAccepted:true,clubConsentVersion:'consent-1',clubTermsVersion:'terms-1'}:{}),acceptTerms:true,...customerOverrides,...(identityCleaner?{street:'',zipCode:'',city:''}:{})},deliveryType,'b','l',{subtotal:100,deliveryFee:0,discountTotal:0,tips:0,taxes:0,bagFee:4,cartDiscountName:undefined,...paymentOverrides},['code','newsletter','club'].includes(kind)?discountId:null,requestedBrandSlug,requestedLocationSlug,deliveryTime,anonymousConsentId || (fault?.startsWith('consent-')?'anon':undefined),managedDeliveryAcceptance);
 return {result,writes,events,coupon,records,patchCalls,persistenceError,sessionParams,actions:api};
}

module.exports={checkout,optional};
