const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
function load(path,mocks={}) {
 const mod={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports',code)(name=>name in mocks?mocks[name]:require(name),mod,mod.exports);return mod.exports;
}
const rules=load('src/lib/promotion-rules.ts');
const pricing=load('src/lib/checkout-price-validation.ts',{'./promotion-rules':rules});
const automatic=load('src/lib/automatic-discounts.ts');
const scope={brandId:'b',locationId:'l',deliveryType:'pickup',now:new Date('2026-09-07T10:00:00Z')};
const catalog=[{id:'p',categoryId:'pizza',tags:[],price:100,isCombo:false}];
const item={id:'p',name:'Pizza',quantity:3,unitPrice:100,totalPrice:300};
const offer={id:'d',brandId:'b',locationIds:['l'],isActive:true,orderTypes:['pickup'],activeDays:[],activeTimeSlots:[],discountType:'product',referenceIds:['p'],discountMethod:'percentage',discountValue:20};
test('rejects manipulated unit and line prices independently of eligibility or campaign existence',()=>{
 for(const offers of [[],[offer],[{...offer,discountMethod:'buy_x_pay_y',buyQuantity:3,payQuantity:2}]]) {
  for(const patch of [{unitPrice:1,totalPrice:3},{unitPrice:100,totalPrice:1},{unitPrice:1,totalPrice:300},{unitPrice:NaN},{totalPrice:Infinity},{quantity:1.5}]) {
   assert.throws(()=>pricing.validateCheckoutPrices([{...item,...patch}],catalog,offers,[],scope));
  }
 }
 assert.throws(()=>pricing.validateCheckoutPrices([{...item,unitPrice:1,totalPrice:3}],[{...catalog[0],isCombo:true}],[],[],scope));
});
test('accepts genuine product/category discounts and base prices, rejects expired and cross-scope discounts',()=>{
 pricing.validateCheckoutPrices([item],catalog,[],[],scope);
 pricing.validateCheckoutPrices([{...item,unitPrice:80,totalPrice:240}],catalog,[offer],[],scope);
 pricing.validateCheckoutPrices([{...item,unitPrice:70,totalPrice:210}],catalog,[{...offer,discountType:'category',referenceIds:['pizza'],discountMethod:'fixed_amount',discountValue:30}],[],scope);
 for(const patch of [{isActive:false},{brandId:'foreign'},{locationIds:['other']},{endDate:new Date('2000-01-01')}]) assert.throws(()=>pricing.validateCheckoutPrices([{...item,unitPrice:80,totalPrice:240}],catalog,[{...offer,...patch}],[],scope));
});
test('accepts triggered upsell price but rejects untriggered, self-triggered or excessive reduction',()=>{
 const upsell={...offer,discountType:'percentage',discountValue:10,offerType:'product',offerProductIds:['soda'],offerCategoryIds:[],triggerConditions:[{type:'product_in_cart',referenceId:'p'}]};
 const soda={id:'soda',name:'Soda',quantity:1,unitPrice:22.5,totalPrice:22.5};
 const sodaCatalog={id:'soda',categoryId:'drink',tags:[],price:25,isCombo:false};
 pricing.validateCheckoutPrices([item,soda],[...catalog,sodaCatalog],[],[upsell],scope);
 assert.throws(()=>pricing.validateCheckoutPrices([soda],[sodaCatalog],[],[upsell],scope));
 assert.throws(()=>pricing.validateCheckoutPrices([item,{...soda,unitPrice:1,totalPrice:1}],[...catalog,sodaCatalog],[],[upsell],scope));
 assert.throws(()=>pricing.validateCheckoutPrices([soda],[sodaCatalog],[],[{...upsell,triggerConditions:[{type:'product_in_cart',referenceId:'soda'}]}],scope));
});
test('actual checkout action rejects tampering before side effects, allows valid discounted line past validation',async()=>{
 const path='src/app/checkout/actions.ts';
 const mocks=Object.fromEntries([...fs.readFileSync(path,'utf8').matchAll(/from ['"]([^'"]+)['"]/g)].map(m=>[m[1],{}]));
 let identityCalls=0;let writes=0;
 Object.assign(mocks,{
  '@/lib/checkout-price-validation':pricing,'@/lib/promotion-rules':rules,'@/lib/automatic-discounts':automatic,
  stripe:{default:class Stripe {}},'@/lib/firebase':{db:{}},
  '@/lib/checkout-customer-identity':{findCheckoutCustomer:async()=>{if(++identityCalls===2)throw Error('AFTER_PRICE_VALIDATION');return {ref:{id:'c'},exists:()=>true,data:()=>({brandId:'b'})};}},
  '../superadmin/settings/actions':{getActiveStripeSecretKey:async()=> 'test-placeholder'},
  '@/lib/url':{getOrigin:async()=> 'https://example.test'},
  '@/app/superadmin/brands/actions':{getBrandById:async()=>({id:'b'})},
  '@/app/superadmin/locations/actions':{getLocationById:async()=>({id:'l',brandId:'b'})},
  '@/app/superadmin/standard-discounts/actions':{getActiveStandardDiscounts:async()=>[offer]},
  'firebase/firestore':{doc:(_,collection,id)=>({collection,id}),getDoc:async ref=>({id:ref.id,exists:()=>ref.collection==='products',data:()=>({brandId:'b',locationIds:['l'],categoryId:'pizza',price:100})}),collection:()=>({}),where:()=>({}),query:()=>({}),getDocs:async()=>({docs:[]}),setDoc:async()=>{writes++;}},
 });
 const api=load(path,mocks);
 async function run(line){identityCalls=0;return api.createStripeCheckoutSessionAction([line],{email:'test@example.test'},'pickup','b','l',{subtotal:300},null,'brand','location');}
 const bad=await run({...item,unitPrice:1,totalPrice:3});assert.equal(bad.success,false);assert.match(bad.error,/Basket prices/);assert.equal(identityCalls,1);assert.equal(writes,0);
 const valid=await run({...item,unitPrice:80,totalPrice:240});assert.match(valid.error,/AFTER_PRICE_VALIDATION/);assert.equal(identityCalls,2);assert.equal(writes,0);
});
