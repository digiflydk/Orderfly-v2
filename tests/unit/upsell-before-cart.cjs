const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {upsellTriggered,compareUpsells}=loadTs('src/lib/upsell-rules.ts');
const {upsellCart}=loadTs('src/lib/server/upsell-cart.ts');
const {validateCheckoutPrices,verifiedUpsellAmount}=loadTs('src/lib/checkout-price-validation.ts');
const scope={brandId:'b',locationId:'l',deliveryType:'pickup'};
const product={id:'pizza',brandId:'b',categoryId:'pizza-category',price:100,priceDelivery:120,isActive:true,isPopular:true};
const offer={id:'offer',...scope,locationIds:['l'],isActive:true,orderTypes:['pickup','delivery'],activeDays:[],activeTimeSlots:[],offerType:'product',offerProductIds:['drink'],offerCategoryIds:[],discountType:'percentage',discountValue:20,triggerConditions:[{type:'cart_value_over',referenceId:'90'}]};
const discount={id:'discount',...offer,discountType:'product',referenceIds:['pizza'],discountMethod:'percentage',discountValue:20};
const soda={id:'drink',categoryId:'drinks',price:25,tags:[],isCombo:false};
const db={getAll:async()=>[],collection:()=>({doc:id=>id})};
test('popup and checkout agree on discounted thresholds, quantities, channel prices and toppings',async()=>{
 for(const [deliveryType,quantity,totalPrice,threshold,eligible] of [
  ['pickup',1,100,90,false],['pickup',2,200,150,true],['delivery',1,120,90,true],
  ['pickup',1,50000,90,false],['pickup',1,60,70,false],['pickup',1,100,80,false],
 ]) {
  const scoped={...scope,deliveryType};
  const campaign={...offer,triggerConditions:[{type:'cart_value_over',referenceId:String(threshold)}]};
  const ctx=await upsellCart(db,[{id:'pizza',quantity,totalPrice,categoryId:'forged',tags:['forged']}],scoped,async()=>[product],[discount]);
  assert.equal(upsellTriggered(campaign,'drink',ctx.items,ctx.catalog,ctx.standardPrices),eligible);
  assert.equal(ctx.catalog[0].categoryId,'pizza-category');assert.deepEqual(ctx.catalog[0].tags,['Popular']);
  const items=[{...ctx.items[0],unitPrice:ctx.standardPrices[0],totalPrice:Math.min(totalPrice,ctx.standardPrices[0]*quantity)},{id:'drink',upsellId:'offer',name:'Soda',quantity:1,unitPrice:20,totalPrice:20}];
  if(totalPrice<ctx.standardPrices[0]*quantity) continue; // final checkout also rejects this invalid trigger line's price.
  if(eligible)assert.deepEqual(validateCheckoutPrices(items,[...ctx.catalog,soda],[discount],[campaign],scoped),['offer']);
  else assert.throws(()=>validateCheckoutPrices(items,[...ctx.catalog,soda],[discount],[campaign],scoped));
 }
});
test('native combo supplements, product/category/tag triggers and self-exclusion match checkout',async()=>{
 const combo={id:'menu',brandId:'b',locationIds:['l'],isActive:true,orderTypes:['pickup'],pickupPrice:100,productGroups:[{id:'main',groupName:'Main',productIds:['pizza'],productPriceAdjustments:{pizza:20}}]};
 const comboDb={...db,getAll:async()=>[{id:'menu',exists:true,data:()=>combo}]};
 const ctx=await upsellCart(comboDb,[{id:'menu',itemType:'combo',quantity:1,totalPrice:120,comboSelections:[{groupId:'main',groupName:'Main',products:[{id:'pizza'}]}]}],scope,async()=>[],[]);
 assert.equal(ctx.catalog[0].price,120);
 for(const trigger of [{type:'combo_in_cart',referenceId:'menu'},{type:'cart_value_over',referenceId:'110'}])assert.equal(upsellTriggered({...offer,triggerConditions:[trigger]},'drink',ctx.items,ctx.catalog,ctx.standardPrices),true);
 assert.equal(upsellTriggered({...offer,triggerConditions:[{type:'product_in_cart',referenceId:'menu'}]},'drink',ctx.items,ctx.catalog,ctx.standardPrices),false);
 const pc=await upsellCart(db,[{id:'pizza',quantity:1,totalPrice:100}],scope,async()=>[product],[]);
 for(const trigger of [{type:'product_in_cart',referenceId:'pizza'},{type:'category_in_cart',referenceId:'pizza-category'},{type:'product_tag_in_cart',referenceId:'Popular'}]) {
  const campaign={...offer,triggerConditions:[trigger]};
  assert.equal(upsellTriggered(campaign,'drink',pc.items,pc.catalog,pc.standardPrices),true);
  assert.equal(upsellTriggered(campaign,'pizza',pc.items,pc.catalog,pc.standardPrices),false);
 }
 combo.brandId='foreign';assert.equal((await upsellCart(comboDb,[{id:'menu',itemType:'combo'}],scope,async()=>[],[])).catalog.length,0);
});
test('priority is explicit, stable for legacy records and higher first',()=>{
 const campaigns=[{id:'b'},{id:'z',priority:20},{id:'a',priority:0}];
 assert.deepEqual(campaigns.sort(compareUpsells).map(c=>c.id),['z','a','b']);
});
test('revenue counts only individually verified offered lines, including options and quantity',()=>{
 const campaign={...offer,triggerConditions:[{type:'product_in_cart',referenceId:'pizza'}]};
 const items=[{id:'pizza',upsellId:'offer',name:'Pizza',quantity:1,unitPrice:100,totalPrice:100},
  {id:'drink',upsellId:'offer',name:'Drink',quantity:2,unitPrice:20,totalPrice:46}];
 const rows=new Set();
 assert.deepEqual(validateCheckoutPrices(items,[{...product,tags:[],isCombo:false},soda],[],[campaign],scope,rows),['offer']);
 assert.deepEqual([...rows],[1]);assert.equal(verifiedUpsellAmount(items,rows),46);
 assert.equal(verifiedUpsellAmount(items,new Set()),0);
});
test('editing clears both dates, preserves paid counters and saves priority',async()=>{
 let saved={brandId:'b',locationIds:['l'],startDate:new Date(),endDate:new Date(),views:12,conversions:3};
 const mocks={
  'server-only':{},'@/lib/access/orderfly-session':{verifiedOrderflyIdentity:async()=>({})},
  '@/app/superadmin/standard-discounts/actions':{},'../products/actions':{},'@/lib/access/location-catalog':{},
  'next/cache':{revalidatePath:()=>{}},'next/navigation':{redirect:()=>{throw Error('REDIRECT')}},
  '@/lib/firebase-admin':{getAdminDb:()=>({collection:()=>({doc:id=>({id})})}),admin:{firestore:{Timestamp:{now:()=>123,fromDate:d=>d}}}},
  '@/lib/access/scoped-data':{mutateScopedDocument:async(c,id,permission,kind,update)=>{assert.equal(permission,'orderfly.catalog:edit');saved=update(saved)}},
 };
 const api=loadTs('src/app/superadmin/upsells/actions.ts',mocks);
 const {upsellFormData}=loadTs('src/lib/upsell-form-data.ts');
 const values={...offer,upsellName:'Offer',priority:9,triggerConditions:[{id:'t',type:'combo_in_cart',referenceId:'menu'}]};
 await assert.rejects(api.createOrUpdateUpsell(null,upsellFormData(values,'offer')),/REDIRECT/);
 assert.equal(saved.startDate,null);assert.equal(saved.endDate,null);assert.equal(saved.priority,9);
 assert.equal(saved.views,12);assert.equal(saved.conversions,3);assert.equal(saved.triggerConditions[0].referenceId,'menu');
 for(const key of ['excludeProductIds','excludeCategoryIds','excludeComboIds'])saved[key]=['keep'];
 const legacy=upsellFormData(values,'offer');legacy.delete('exclusionsSubmitted');
 await assert.rejects(api.createOrUpdateUpsell(null,legacy),/REDIRECT/);
 for(const key of ['excludeProductIds','excludeCategoryIds','excludeComboIds'])assert.deepEqual(saved[key],['keep']);
 await assert.rejects(api.createOrUpdateUpsell(null,upsellFormData(values,'offer')),/REDIRECT/);
 for(const key of ['excludeProductIds','excludeCategoryIds','excludeComboIds'])assert.deepEqual(saved[key],[]);
 const invalid=await api.createOrUpdateUpsell(null,upsellFormData({...values,priority:-1},'offer'));assert.equal(invalid.error,true);assert.equal(saved.priority,9);
});
test('fractional prices use the checkout integer-ore boundary for strict thresholds',()=>{
 const {lineMoney}=loadTs('src/lib/money.ts');
 const campaign={...offer,triggerConditions:[{type:'cart_value_over',referenceId:'0.30'}]};
 const items=[{quantity:1,totalPrice:lineMoney(0.10,1,[0.20])}];
 assert.equal(items[0].totalPrice,0.30);
 assert.equal(upsellTriggered(campaign,'drink',items,[{id:'pizza',isCombo:false,tags:[],price:1}],[1]),false);
});
test('real offer lookup chooses the highest eligible campaign and ignores forged browser tags',async()=>{
 let campaigns=[{...offer,id:'low',priority:0,triggerConditions:[{type:'product_in_cart',referenceId:'pizza'}]},
  {...offer,id:'high',priority:10,triggerConditions:[{type:'cart_value_over',referenceId:'90'}]}];
 const products=[product,{...product,id:'drink',categoryId:'drinks',price:25}];
 const database={collection:()=>({where(){return this},get:async()=>({docs:campaigns.map(data=>({id:data.id,data:()=>data}))})})};
 const api=loadTs('src/app/superadmin/upsells/actions.ts',{
  'server-only':{},'@/lib/access/orderfly-session':{},'@/lib/access/scoped-data':{},'@/lib/access/location-catalog':{},'next/cache':{},'next/navigation':{},
  '@/lib/firebase-admin':{getAdminDb:()=>database,admin:{}},
  '@/app/superadmin/standard-discounts/actions':{getActiveStandardDiscounts:async()=>[discount]},
  '@/lib/server/menu-products':{publicMenuProducts:async()=>products},
 });
 const input={...scope,cartTotal:99999,cartItems:[{id:'pizza',quantity:1,totalPrice:100,tags:['forged'],categoryId:'forged'}]};
 assert.equal((await api.getActiveUpsellForCart(input)).upsell.id,'low','higher priority fails the authoritative 80 DKK threshold');
 campaigns[1].triggerConditions=[{type:'product_tag_in_cart',referenceId:'Popular'}];
 assert.equal((await api.getActiveUpsellForCart(input)).upsell.id,'high');
 assert.equal((await api.getActiveUpsellForCart({...input,excludedUpsellIds:['high']})).upsell.id,'low');
 campaigns[0].offerProductIds=['dessert']; products.push({...product,id:'dessert'});
 campaigns[1].excludeCategoryIds=['drinks'];
 assert.equal((await api.getActiveUpsellForCart({...input,cartItems:[...input.cartItems,{id:'other',comboSelections:[{groupName:'Drink',products:[{id:'drink'}]}]}]})).upsell.id,'low');
 campaigns[1].excludeCategoryIds=[];
 assert.equal((await api.getActiveUpsellForCart(input)).upsell.id,'high');
 campaigns=[{...campaigns[1],triggerConditions:[{type:'product_tag_in_cart',referenceId:'forged'}]}];
 assert.equal(await api.getActiveUpsellForCart(input),null);
});
test('combo and product-tag references survive controlled serialization',()=>{
 const {upsellFormData}=loadTs('src/lib/upsell-form-data.ts');
 for(const condition of [{id:'c',type:'combo_in_cart',referenceId:'native-menu'},{id:'t',type:'product_tag_in_cart',referenceId:'Recommended'}]) {
  const data=upsellFormData({triggerConditions:[condition],priority:4});
  assert.deepEqual(JSON.parse(data.get('triggerConditions')),[condition]);assert.equal(data.get('priority'),'4');
 }
});

test('display exclusions match any product/category/menu, but never affect price eligibility',()=>{
 const {upsellExcluded}=loadTs('src/lib/upsell-rules.ts');
 const products=[{id:'pepsi',categoryId:'drinks'}];
 assert.equal(upsellExcluded({},products,[]),false);
 for(const rules of [{excludeProductIds:['pepsi']},{excludeCategoryIds:['drinks']},{excludeComboIds:['menu']}]) assert.equal(upsellExcluded(rules,products,['menu']),true);
 assert.equal(upsellExcluded({excludeProductIds:['faxe'],excludeCategoryIds:['desserts'],excludeComboIds:['other']},products,['menu']),false);
 const campaign={...offer,excludeCategoryIds:['drinks'],triggerConditions:[{type:'product_in_cart',referenceId:'pizza'}]};
 assert.equal(upsellTriggered(campaign,'drink',[{quantity:1,totalPrice:100}],[{id:'pizza',price:100,tags:[],isCombo:false}],[100]),true);
});

test('quantity ranges and headings count matching line quantities and preserve legacy behavior',()=>{
 const {upsellHeading}=loadTs('src/lib/upsell-rules.ts');
 const catalog=[{id:'pizza',isCombo:false,categoryId:'pizzas',tags:[],price:80},{id:'pizza2',isCombo:false,categoryId:'pizzas',tags:[],price:90}];
 const campaign={...offer,headingSingular:'Noget koldt til din pizza?',headingPlural:'Noget koldt til dine {antal} pizzaer?',triggerConditions:[{type:'category_in_cart',referenceId:'pizzas',minQuantity:3,maxQuantity:4}]};
 for(const [quantity,eligible] of [[1,false],[2,true],[3,true],[4,false]]) {
  const items=[{quantity,totalPrice:80*quantity},{quantity:1,totalPrice:90}];
  assert.equal(upsellTriggered(campaign,'drink',items,catalog,[80,90]),eligible);
  if(eligible)assert.equal(upsellHeading(campaign,'drink',items,catalog,[80,90]),`Noget koldt til dine ${quantity+1} pizzaer?`);
 }
 campaign.triggerConditions=[{type:'category_in_cart',referenceId:'pizzas'}];
 assert.equal(upsellHeading(campaign,'drink',[{quantity:1,totalPrice:80}],catalog.slice(0,1),[80]),'Noget koldt til din pizza?');
 delete campaign.headingSingular;
 assert.equal(upsellHeading(campaign,'drink',[{quantity:1,totalPrice:80}],catalog.slice(0,1),[80]),campaign.upsellName || 'Lidt ekstra til din ordre');
 assert.equal(upsellTriggered(campaign,'pizza',[{quantity:3,totalPrice:240}],catalog.slice(0,1),[80]),false);
});
test('checkout accepts quantity-qualified discounts and rejects out-of-range baskets',()=>{
 const campaign={...offer,triggerConditions:[{type:'product_in_cart',referenceId:'pizza',minQuantity:2,maxQuantity:3}]};
 for(const quantity of [1,2,3,4]) {
  const items=[{id:'pizza',name:'Pizza',quantity,unitPrice:100,totalPrice:quantity*100},{id:'drink',name:'Drink',upsellId:'offer',quantity:1,unitPrice:20,totalPrice:20}];
  const catalog=[{...product,isCombo:false,tags:[]},soda];
  if(quantity>=2&&quantity<=3)assert.deepEqual(validateCheckoutPrices(items,catalog,[],[campaign],scope),['offer']);
  else assert.throws(()=>validateCheckoutPrices(items,catalog,[],[campaign],scope));
 }
});
