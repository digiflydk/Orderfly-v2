const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {upsellCart}=loadTs('src/lib/server/upsell-cart.ts');
const {upsellTriggered}=loadTs('src/lib/upsell-rules.ts');
const {validateCheckoutPrices}=loadTs('src/lib/checkout-price-validation.ts');

const scope={brandId:'b',locationId:'l',deliveryType:'pickup',now:new Date('2026-11-04T12:00:00Z')};
const standardDiscount={id:'d',brandId:'b',locationIds:['l'],isActive:true,orderTypes:['pickup'],
  activeDays:[],activeTimeSlots:[],discountType:'product',referenceIds:['pizza'],
  discountMethod:'percentage',discountValue:20};
function campaign(referenceId) {
  return {id:'u',brandId:'b',locationIds:['l'],isActive:true,orderTypes:['pickup'],
    activeDays:[],activeTimeSlots:[],offerType:'product',offerProductIds:['cola'],offerCategoryIds:[],
    discountType:'fixed_amount',discountValue:10,
    triggerConditions:[{id:'t',type:'cart_value_over',referenceId:String(referenceId)}]};
}
function dbFor(combos=[]) {
  return {
    collection:()=>({doc:id=>({id})}),
    getAll:async(...refs)=>refs.map(ref=>{
      const record=combos.find(c=>c.id===ref.id);
      return {id:ref.id,exists:!!record,data:()=>record};
    }),
  };
}
const product=(id,price)=>({id,price,priceDelivery:price,isActive:true,categoryId:'pizza'});

// Compare actual server-side offer reconstruction with authoritative checkout
// validation for the same native basket and active campaign.
async function scenario({lines,products,discounts=[],combos=[],threshold=200}) {
  const offer=campaign(threshold);
  const {items,catalog,standardPrices}=await upsellCart(dbFor(combos),lines,scope,
    async ids=>products.filter(p=>ids.includes(p.id)),discounts);
  assert.equal(items.length,lines.length,'all test basket lines must resolve');
  const shown=upsellTriggered(offer,'cola',items,catalog,standardPrices);
  const checkoutItems=items.map((item,i)=>({
    id:item.id,name:item.id,quantity:item.quantity,unitPrice:standardPrices[i],
    totalPrice:Math.max(lines[i].totalPrice,standardPrices[i]*item.quantity),
  }));
  checkoutItems.push({id:'cola',name:'Cola',quantity:1,unitPrice:20,totalPrice:20,upsellId:'u'});
  const checkoutCatalog=[...catalog,{id:'cola',isCombo:false,price:30,tags:[]}];
  let accepted=false;
  try {
    accepted=validateCheckoutPrices(checkoutItems,checkoutCatalog,discounts,[offer],scope).includes('u');
  } catch {
    accepted=false;
  }
  assert.equal(shown,accepted,'recommendation and checkout must agree on discount eligibility');
  return {shown,accepted};
}

test('paid options cannot falsely lift a pizza above the upsell threshold',async()=>{
  assert.deepEqual(await scenario({lines:[{id:'pizza',itemType:'product',quantity:1,totalPrice:210}],
    products:[product('pizza',180)]}),{shown:false,accepted:false});
});
test('standard discounts determine value before toppings and across quantities',async()=>{
  const products=[product('pizza',250)];
  assert.equal((await scenario({products,discounts:[standardDiscount],
    lines:[{id:'pizza',itemType:'product',quantity:1,totalPrice:230}]})).shown,false);
  assert.equal((await scenario({products,discounts:[standardDiscount],
    lines:[{id:'pizza',itemType:'product',quantity:2,totalPrice:400}]})).shown,true);
});
test('combo values and other products count toward an upsell trigger',async()=>{
  const menu={id:'menu',brandId:'b',locationIds:['l'],isActive:true,
    orderTypes:['pickup'],activeDays:[],activeTimeSlots:[],pickupPrice:105,
    deliveryPrice:105,productGroups:[]};
  assert.equal((await scenario({lines:[{id:'menu',itemType:'combo',quantity:1,totalPrice:105},
    {id:'pizza',itemType:'product',quantity:1,totalPrice:100}],
    products:[product('pizza',100)],combos:[menu]})).shown,true);
});
test('strict thresholds compare integer øre, not floating-point approximations',async()=>{
  const products=[product('a',0.1),product('b',0.2)];
  const lines=[{id:'a',itemType:'product',quantity:1,totalPrice:0.1},
    {id:'b',itemType:'product',quantity:1,totalPrice:0.2}];
  assert.equal((await scenario({lines,products,threshold:0.3})).shown,false);
  assert.equal((await scenario({lines,products,threshold:0.29})).shown,true);
  assert.equal((await scenario({lines:[{id:'pizza',itemType:'product',quantity:1,totalPrice:200}],
    products:[product('pizza',200)],threshold:200})).shown,false);
});
test('browser-submitted totals cannot increase eligibility above native prices',async()=>{
  assert.equal((await scenario({lines:[{id:'pizza',itemType:'product',quantity:1,totalPrice:9999}],
    products:[product('pizza',180)]})).shown,false);
});
test('invalid cart-value thresholds cannot unlock a discount',()=>{
  const items=[{quantity:1,totalPrice:100}],catalog=[{id:'pizza',price:100,isCombo:false,tags:[]}];
  assert.equal(upsellTriggered(campaign('invalid'),'cola',items,catalog,[100]),false);
});
