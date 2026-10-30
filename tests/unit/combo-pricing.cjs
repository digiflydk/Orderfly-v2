const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const f=require('../helpers/cart-fixture.cjs');
const {comboProductAdjustment,comboSelectionAdjustments,comboMinimumAdjustments}=loadTs('src/lib/combo-pricing.ts');
const {comboProductAdjustmentsSchema,validComboAdjustmentKeys}=loadTs('src/lib/combo-pricing-schema.ts');
const {checkoutItems,validateCheckoutItems}=loadTs('src/lib/checkout-items.ts');
const catalog=()=>{const c=f.catalog();c.combos[0].productGroups[0].productPriceAdjustments={pizza:12.5};return c;};
test('legacy groups have zero surcharge; required cheapest completion includes retained dish',()=>{
 const combo=structuredClone(f.combo);assert.equal(comboMinimumAdjustments(combo),0);
 combo.productGroups[0].productIds.push('special');combo.productGroups[0].productPriceAdjustments={pizza:5,special:15};
 combo.productGroups.push({id:'drink',groupName:'Drink',productIds:['cola','water'],minSelection:1,maxSelection:1,productPriceAdjustments:{cola:2,water:4}});
 assert.equal(comboMinimumAdjustments(combo),7);assert.equal(comboMinimumAdjustments(combo,'special'),17);
 assert.equal(comboSelectionAdjustments(combo,[{groupId:'pg',groupName:'Pizza',products:[{id:'special'}]}]),15);
});
test('admin validation rejects negative, nonnumeric, infinite and unrelated supplements',()=>{
 for(const value of [-1,Infinity,NaN,'10',100001])assert.equal(comboProductAdjustmentsSchema.safeParse({pizza:value}).success,false);
 assert.equal(comboProductAdjustmentsSchema.safeParse({pizza:12.5}).success,true);
 assert.equal(validComboAdjustmentKeys({productIds:['pizza'],productPriceAdjustments:{foreign:2}}),false);
 const group={...f.combo.productGroups[0],productPriceAdjustments:{pizza:-1}};
 assert.throws(()=>comboProductAdjustment(group,'pizza'),/Invalid combo/);
 assert.throws(()=>comboProductAdjustment(group,'foreign'),/not in this combo/);
});
test('selection rejects unknown or duplicated products and ambiguous groups',()=>{
 const c=catalog().combos[0];const selected=[{groupId:'pg',groupName:'Pizza',products:[{id:'pizza'},{id:'pizza'}]}];
 assert.throws(()=>comboSelectionAdjustments(c,selected),/Duplicate/);
 selected[0].products=[{id:'foreign'}];assert.throws(()=>comboSelectionAdjustments(c,selected),/not in/);
 selected[0].products=[{id:'pizza'}];assert.throws(()=>comboSelectionAdjustments(c,[...selected,...selected]),/Invalid combo group/);
});
test('supplements survive save/reload, modifiers and delivery pricing without double charging',()=>{
 const c=catalog(),choice=structuredClone(f.comboChoice);choice.quantity=2;
 choice.comboSelections[0].products[0].modifiers=[{id:'t',quantity:1}];
 for(const [mode,base] of [['pickup',112.5],['delivery',122.5]]){
  const scope={...f.scope,deliveryType:mode},item=f.restoreCartItems([choice],c,scope).items[0];
  assert.equal(item.basePrice,base);assert.equal(item.itemTotal,base+10);
  const reloaded=f.restoreCartItems(f.cartChoices([item]),c,scope).items[0];assert.equal(reloaded.itemTotal,base+10);
  const req=checkoutItems([reloaded]);assert.equal(validateCheckoutItems(req,c,scope).subtotal,(base+10)*2);
  req[0].unitPrice-=12.5;req[0].totalPrice-=25;assert.throws(()=>validateCheckoutItems(req,c,scope),/Combo prices/);
 }
});
test('changed or invalid catalog supplement invalidates checkout and malformed restoration fails closed',()=>{
 const c=catalog(),item=f.restoreCartItems([f.comboChoice],c,f.scope).items[0],request=checkoutItems([item]);
 c.combos[0].productGroups[0].productPriceAdjustments.pizza=20;
 assert.throws(()=>validateCheckoutItems(request,c,f.scope),/Combo prices/);
 c.combos[0].productGroups[0].productPriceAdjustments.pizza=-1;
 assert.equal(f.restoreCartItems([f.comboChoice],c,f.scope).removed,1);
});
test('real checkout persists authoritative surcharge plus modifiers and rejects underpayment',async()=>{
 const {checkout}=require('../helpers/checkout-fixture.cjs');const c=catalog();const choice=structuredClone(f.comboChoice);choice.quantity=2;
 choice.comboSelections[0].products[0].modifiers=[{id:'t',quantity:1}];
 const items=checkoutItems(f.restoreCartItems([choice],c,f.scope).items);
 const seed=[['products/pizza',c.products[0]],['comboMenus/combo',c.combos[0]],['toppings/t',c.toppings[0]],['topping_groups/g',c.groups[0]]];
 const valid=await checkout({items,seed,paymentOverrides:{subtotal:245}});
 assert.equal(valid.result.success,true,JSON.stringify(valid.result));assert.equal(valid.writes.find(w=>w.ref.collection==='orders').data.productItems[0].totalPrice,245);
 items[0].unitPrice=100;items[0].totalPrice=220;
 const invalid=await checkout({items,seed,paymentOverrides:{subtotal:220}});assert.equal(invalid.result.success,false);assert.equal(invalid.writes.length,0);
});
