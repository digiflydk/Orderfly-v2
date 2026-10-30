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

function dipCatalog() {
 const c=f.catalog();
 c.combos[0].pickupPrice=95;c.combos[0].deliveryPrice=95;
 c.products.push({id:'chili',productName:'Chili',brandId:'b',locationIds:['l'],isActive:true,price:0,comboOnly:true},
  {id:'garlic',productName:'Hvidløgsbæger',brandId:'b',locationIds:['l'],isActive:true,price:10});
 c.combos[0].productGroups.push({id:'dip',groupName:'Dip',productIds:['chili','garlic'],minSelection:0,maxSelection:1});
 return c;
}
function dipChoice(id) {
 const choice=structuredClone(f.comboChoice);
 choice.comboSelections.push({groupId:'dip',groupName:'Dip',products:id?[{id,modifiers:[]}]:[]});
 return choice;
}
test('included dip and explicit no-dip retain the same menu price through reload and checkout',()=>{
 const c=dipCatalog();
 for(const id of ['chili','garlic',undefined])for(const deliveryType of ['pickup','delivery']){
  const scope={...f.scope,deliveryType},choice=dipChoice(id);choice.quantity=2;
  const restored=f.restoreCartItems([choice],c,scope);assert.equal(restored.removed,0);
  assert.equal(restored.items[0].itemTotal,95);assert.equal(restored.items[0].basePrice,95);
  const saved=f.cartChoices(restored.items),reloaded=f.restoreCartItems(saved,c,scope);
  assert.deepEqual(reloaded.items[0].comboSelections[1].products.map(p=>p.id),id?[id]:[]);
  const result=validateCheckoutItems(checkoutItems(reloaded.items),c,scope);assert.equal(result.subtotal,190);
 }
});
test('dip group rejects excess, unknown, missing required, inactive and cross-tenant component choices',()=>{
 for(const mutate of [x=>x.comboSelections.shift(),x=>x.comboSelections[1].products.push({id:'garlic'}),x=>x.comboSelections[1].products[0].id='unknown']) {
  const choice=dipChoice('chili');mutate(choice);assert.equal(f.restoreCartItems([choice],dipCatalog(),f.scope).removed,1);
 }
 for(const mutate of [p=>p.isActive=false,p=>p.brandId='foreign',p=>p.locationIds=['other']]){
  const c=dipCatalog();mutate(c.products.find(p=>p.id==='chili'));
  assert.equal(f.restoreCartItems([dipChoice('chili')],c,f.scope).removed,1);
 }
});
test('combo-only products cannot become free standalone items or linked toppings',()=>{
 const c=dipCatalog(),standalone={...f.choice,id:'chili',quantity:1};
 assert.equal(f.restoreCartItems([standalone],c,f.scope).removed,1);
 assert.throws(()=>validateCheckoutItems([{id:'chili',itemType:'product',name:'Chili',quantity:1,unitPrice:0,totalPrice:0,toppings:[]}],c,f.scope),/no longer available/);
 c.toppings[0].productId='chili';
 const choice=structuredClone(f.choice);choice.toppings=['Chili'];choice.toppingIds=['t'];choice.toppingQuantities=[1];
 assert.equal(f.restoreCartItems([choice],c,f.scope).removed,1);
 assert.equal(f.restoreCartItems([{...f.choice,id:'garlic',toppings:[]}],c,f.scope).removed,0);
});
test('real checkout persists included or declined dip and rejects standalone combo-only purchase before writes',async()=>{
 const {checkout}=require('../helpers/checkout-fixture.cjs');const c=dipCatalog();
 const seed=[...c.products.map(p=>['products/'+p.id,p]),['comboMenus/combo',c.combos[0]],['toppings/t',c.toppings[0]],['topping_groups/g',c.groups[0]]];
 for(const id of ['chili',undefined]){
  const items=checkoutItems(f.restoreCartItems([dipChoice(id)],c,f.scope).items);
  const result=await checkout({items,seed,paymentOverrides:{subtotal:95}});
  assert.equal(result.result.success,true,JSON.stringify(result.result));
  const order=result.writes.find(w=>w.ref.collection==='orders').data;
  assert.equal(order.productItems[0].totalPrice,95);
  assert.deepEqual(order.productItems[0].comboSelections[1].products.map(p=>p.id),id?[id]:[]);
 }
 const invalid=await checkout({items:[{id:'chili',itemType:'product',name:'Chili',quantity:1,unitPrice:0,totalPrice:0,toppings:[]}],seed,paymentOverrides:{subtotal:0}});
 assert.equal(invalid.result.success,false);assert.equal(invalid.writes.length,0);
});

test('pre-dip menu carts and pending checkout retain exact pizza prices and modifiers after adding optional dip',async()=>{
 const {checkout}=require('../helpers/checkout-fixture.cjs');const upgraded=dipCatalog();
 upgraded.products.push({...structuredClone(upgraded.products[0]),id:'pepperoni',productName:'Pepperoni'},
  {id:'soda',productName:'Sodavand',brandId:'b',locationIds:['l'],isActive:true,price:20});
 const menu=upgraded.combos[0];menu.productGroups[0].productIds.push('pepperoni');
 menu.productGroups[0].productPriceAdjustments={pepperoni:10};
 menu.productGroups.splice(1,0,{id:'drink',groupName:'Sodavand',productIds:['soda'],minSelection:1,maxSelection:1});
 const original=structuredClone(upgraded);original.combos[0].productGroups.pop();
 const seed=[...upgraded.products.map(p=>['products/'+p.id,p]),['comboMenus/combo',menu],['toppings/t',upgraded.toppings[0]],['topping_groups/g',upgraded.groups[0]]];
 for(const [pizza,base] of [['pizza',95],['pepperoni',105]]){
  const oldChoice=structuredClone(f.comboChoice);oldChoice.quantity=2;
  oldChoice.comboSelections[0].products=[{id:pizza,modifiers:[{id:'t',quantity:1}]}];
  oldChoice.comboSelections.push({groupId:'drink',groupName:'Sodavand',products:[{id:'soda',modifiers:[]}]});
  const oldItems=f.restoreCartItems([oldChoice],original,f.scope).items;
  assert.equal(oldItems[0].basePrice,base);
  const oldSnapshot=f.cartChoices(oldItems),oldRequest=checkoutItems(oldItems);
  assert.equal(oldSnapshot[0].comboSelections.length,2);
  const restored=f.restoreCartItems(oldSnapshot,upgraded,f.scope);assert.equal(restored.removed,0);
  const item=restored.items[0];assert.equal(item.basePrice,base);assert.equal(item.itemTotal,base+10);
  assert.deepEqual(item.comboSelections.slice(0,2),oldItems[0].comboSelections);
  assert.deepEqual(item.comboSelections[2],{groupId:'dip',groupName:'Dip',products:[]});
  const canonical=validateCheckoutItems(oldRequest,upgraded,f.scope);
  assert.equal(canonical.subtotal,(base+10)*2);
  assert.deepEqual(canonical.items[0].comboSelections[2].products,[]);
  const result=await checkout({items:oldRequest,seed,paymentOverrides:{subtotal:(base+10)*2}});
  assert.equal(result.result.success,true,JSON.stringify(result.result));
  const order=result.writes.find(w=>w.ref.collection==='orders').data;
  assert.equal(order.productItems[0].unitPrice,base);assert.equal(order.productItems[0].totalPrice,(base+10)*2);
  assert.deepEqual(order.productItems[0].comboSelections[0].products[0].modifiers,[{id:'t',quantity:1}]);
  assert.deepEqual(order.productItems[0].comboSelections[2].products,[]);
  assert.equal(oldRequest[0].comboSelections.length,2,'validation must not rewrite the client request');
 }
});
test('optional-group compatibility rejects forged, duplicate, unknown and ambiguous submitted groups',()=>{
 for(const mutate of [
  x=>x.comboSelections.push({groupId:'unknown',groupName:'Unknown',products:[]}),
  x=>x.comboSelections.push(structuredClone(x.comboSelections[1])),
  x=>x.comboSelections[1].products=[{id:'pizza'}],
  x=>x.comboSelections[0].products=[],
 ]){
  const choice=dipChoice();mutate(choice);assert.equal(f.restoreCartItems([choice],dipCatalog(),f.scope).removed,1);
 }
 const c=dipCatalog();c.combos[0].productGroups.push({...c.combos[0].productGroups[1],id:'dip2'});
 const ambiguous=dipChoice();delete ambiguous.comboSelections[1].groupId;
 assert.equal(f.restoreCartItems([ambiguous],c,f.scope).removed,1);
});
