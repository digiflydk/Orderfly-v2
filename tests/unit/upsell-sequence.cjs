const {test}=require('node:test');const assert=require('node:assert/strict');const {loadTs}=require('../helpers/load-ts.cjs');
const {upsellBadges}=loadTs('src/lib/upsell-badges.ts');
const {upsellParentEligible}=loadTs('src/lib/upsell-rules.ts');
const {upsellReport}=loadTs('src/lib/upsell-report.ts');
test('badges resolve ties in configured order; zero sales never claim popularity; manual none wins',()=>{
 assert.deepEqual(upsellBadges(['a','b','c'],{a:5,b:5,c:5}),{a:'popular',b:'recommended',c:'none'});
 assert.deepEqual(upsellBadges(['a','b'],{}),{a:'none',b:'none'});
 assert.deepEqual(upsellBadges(['a','b'],{a:5,b:3},{a:'none',b:'popular'}),{a:'none',b:'popular'});
});
test('follow-up requires accepted qualifying parent; no chaining or cross-brand parents',()=>{
 const parent={id:'first',brandId:'b',offerType:'product',offerProductIds:['soda'],triggerConditions:[{type:'product_in_cart',referenceId:'pizza'}]};
 const child={afterUpsellId:'first',brandId:'b'};
 const items=[{quantity:1,totalPrice:80},{quantity:1,totalPrice:20,upsellId:'first'}];
 const catalog=[{id:'pizza',price:80,isCombo:false},{id:'soda',price:20,isCombo:false}];
 assert.equal(upsellParentEligible(child,[parent],items,catalog,[80,20]),true);
 assert.equal(upsellParentEligible(child,[parent],[items[0],{...items[1],upsellId:undefined}],catalog,[80,20]),false);
 for(const p of [{...parent,brandId:'other'},{...parent,afterUpsellId:'another'}])assert.equal(upsellParentEligible(child,[p],items,catalog,[80,20]),false);
 assert.equal(upsellParentEligible(child,[parent],[items[1]],[catalog[1]],[20]),false);
});
test('report separates consented cohorts and paid revenue, excludes cancelled orders, estimates partial refunds',()=>{
 const base={brandId:'b',locationId:'l',sessionId:'s',upsellId:'u',interactionId:'i'};
 const events=[{...base,name:'upsell_eligible',experimentGroup:'treatment',ts:new Date('2026-11-01T12:00:00Z')},{...base,name:'upsell_offer_shown',upsellStep:2},{...base,name:'upsell_accepted'}];
 const order={brandId:'b',locationId:'l',analytics:{sessionId:'s'},paidAt:new Date('2026-11-01T12:10:00Z'),paymentStatus:'Paid',totalAmount:100,refundedAmountOre:2000,productItems:[{totalPrice:100}],paymentDetails:{cartDiscountTotal:0},upsellMeasurement:[{upsellId:'u',productId:'p',step:2,amount:25,itemDiscount:5,quantity:1}]};
 const report=upsellReport(events,[order,{...order,status:'Canceled'}, {...order,paidAt:new Date('2026-11-01T11:00:00Z'),upsellMeasurement:[]}],{step:2});
 assert.equal(report.accepted,1);assert.equal(report.paidOrders,1);assert.equal(report.revenue,20);assert.equal(report.partialRefunds,1);assert.equal(report.cohorts.treatment.purchases,1);assert.equal(report.cohorts.treatment.revenue,80);
});
test('checkout rejects follow-up discount when parent was removed or never accepted',()=>{
 const {validateCheckoutPrices}=loadTs('src/lib/checkout-price-validation.ts');
 const scope={brandId:'b',locationId:'l',deliveryType:'pickup'};
 const common={...scope,locationIds:['l'],orderTypes:['pickup'],isActive:true,activeDays:[],activeTimeSlots:[],offerType:'product',offerCategoryIds:[],discountType:'none'};
 const parent={...common,id:'parent',offerProductIds:['soda'],triggerConditions:[{type:'product_in_cart',referenceId:'pizza'}]};
 const child={...common,id:'child',afterUpsellId:'parent',offerProductIds:['dessert'],discountType:'percentage',discountValue:20,triggerConditions:[{type:'product_in_cart',referenceId:'soda'}]};
 const items=[{id:'pizza',quantity:1,unitPrice:80,totalPrice:80},{id:'soda',upsellId:'parent',quantity:1,unitPrice:20,totalPrice:20},{id:'dessert',upsellId:'child',quantity:1,unitPrice:40,totalPrice:40}];
 const catalog=items.map(i=>({id:i.id,price:i.id==='dessert'?50:i.unitPrice,isCombo:false,tags:[]}));
 assert.deepEqual(validateCheckoutPrices(items,catalog,[],[parent,child],scope),['parent','child']);
 assert.throws(()=>validateCheckoutPrices([items[0],{...items[1],upsellId:undefined},items[2]],catalog,[],[parent,child],scope));
 assert.throws(()=>validateCheckoutPrices([items[0],items[2]],[catalog[0],catalog[2]],[],[parent,child],scope));
});

test('popularity counts restaurant paid units including menu components, excluding refunds and other restaurants',async()=>{
 const order={locationId:'l',paymentStatus:'Paid',totalAmount:100,productItems:[{id:'pizza',quantity:2},{id:'menu',itemType:'combo',quantity:3,comboSelections:[{products:[{id:'soda'},{id:'pizza'}]}]}]};
 const query={where(){return this;},async get(){return {docs:[order,{...order,locationId:'foreign'},{...order,refundedAmountOre:100},{...order,status:'Canceled'}].map(data=>({data:()=>data}))};}};
 const {upsellSales}=loadTs('src/lib/server/upsell-sales.ts',{'server-only':{},'next/cache':{unstable_cache:fn=>fn},'@/lib/firebase-admin':{getAdminDb:()=>({collection:()=>query})}});
 assert.deepEqual(await upsellSales('b','l'),{pizza:5,soda:3});
});
test('badge reporting deduplicates visible products and joins their accepted interaction',()=>{
 const base={brandId:'b',locationId:'l',sessionId:'s',upsellId:'u',interactionId:'i',productId:'soda'};
 const shown={...base,name:'upsell_product_shown',upsellStep:2,badge:'popular',badgeSource:'manual'};
 const result=upsellReport([shown,shown,{...base,name:'upsell_accepted'}],[],{step:2,product:'soda'});
 assert.deepEqual(result.badges,{'manual:popular':{views:1,accepted:1}});
 assert.equal(result.accepted,1);
});
