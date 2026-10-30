const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const f=require('../helpers/cart-fixture.cjs');
const {checkoutItems,validateCheckoutItems}=loadTs('src/lib/checkout-items.ts');
const {cartChoicesSchema}=loadTs('src/lib/cart-snapshot.ts');
const {putCartItem}=loadTs('src/lib/cart-edit.ts');
const choice=()=>({...structuredClone(f.comboChoice),quantity:2,comboSelections:[{groupId:'pg',groupName:'Pizza',products:[{id:'pizza',modifiers:[{id:'t',quantity:2}]}]}]});
const catalog=()=>{const c=f.catalog();c.groups[0].minSelection=1;c.toppings[0].maxQuantity=3;return c;};
test('combo product choices roundtrip without prices, are re-priced, and survive checkout/edit',()=>{
 const c=catalog(); c.discounts=[f.discount]; const restored=f.restoreCartItems([choice()],c,f.scope);
 assert.equal(restored.removed,0);const item=restored.items[0];assert.equal(item.itemTotal,120);
 assert.equal(item.toppings[0].name,'Italiana: 2 × Cheese');
 const saved=f.cartChoices([item]);assert.equal(JSON.stringify(saved).includes('price'),false);assert.deepEqual(saved[0].toppings,[]);
 const parsed=cartChoicesSchema.parse(saved);assert.equal(f.restoreCartItems(parsed,c,f.scope).items[0].itemTotal,120);
 const request=checkoutItems([item]);assert.equal(request[0].totalPrice,240);assert.deepEqual(request[0].toppings,[]);
 const result=validateCheckoutItems(request,c,f.scope);assert.equal(result.subtotal,240);assert.equal(result.items[0].toppings[0],'Italiana: 2 × Cheese');
 c.toppings[0].price=12;assert.equal(f.restoreCartItems(parsed,c,f.scope).items[0].itemTotal,124);
 assert.throws(()=>validateCheckoutItems(request,c,f.scope),/prices have changed/);
 const changed=structuredClone(item);changed.comboSelections[0].products[0].modifiers[0].quantity=1;
 assert.equal(putCartItem([changed],item,item),null);
});
test('missing required, duplicate, unknown, excessive, inactive and cross-tenant combo options fail closed',()=>{
 for(const mutate of [x=>x.comboSelections[0].products[0].modifiers=[],x=>x.comboSelections[0].products[0].modifiers.push({id:'t',quantity:1}),x=>x.comboSelections[0].products[0].modifiers[0].id='other',x=>x.comboSelections[0].products[0].modifiers[0].quantity=4]) {
  const x=choice();mutate(x);assert.equal(f.restoreCartItems([x],catalog(),f.scope).removed,1);
 }
 for(const mutate of [c=>c.toppings[0].isActive=false,c=>c.toppings[0].locationIds=['other'],c=>c.products[0].brandId='other',c=>c.products[0].locationIds=['other'],c=>c.products[0].toppingOverrides={t:{isAvailable:false}}]) {
  const c=catalog();mutate(c);assert.equal(f.restoreCartItems([choice()],c,f.scope).removed,1);
 }
 const forged=choice();forged.comboSelections[0].products[0].modifiers[0].price=0;assert.equal(cartChoicesSchema.safeParse([forged]).success,false);
});
test('combo base and option totals cannot be forged; legacy unmodified combos still work',()=>{
 const c=catalog(),item=f.restoreCartItems([choice()],c,f.scope).items[0];
 for(const unitPrice of [1,200]) {const request=checkoutItems([item]);request[0].unitPrice=unitPrice;request[0].totalPrice=(unitPrice+20)*2;assert.throws(()=>validateCheckoutItems(request,c,f.scope),/Combo prices/);}
 const request=checkoutItems([item]);request[0].totalPrice=200;assert.throws(()=>validateCheckoutItems(request,c,f.scope),/Option prices/);
 assert.equal(f.restoreCartItems([f.comboChoice],f.catalog(),f.scope).removed,0);
});
test('real checkout action loads combo component catalogs and persists authoritative modifier totals',async()=>{
 const {checkout}=require('../helpers/checkout-fixture.cjs');
 const c=catalog();const items=checkoutItems(f.restoreCartItems([choice()],c,f.scope).items);
 const seed=[['products/pizza',c.products[0]],['comboMenus/combo',c.combos[0]],['toppings/t',c.toppings[0]],['topping_groups/g',c.groups[0]]];
 const valid=await checkout({items,seed,paymentOverrides:{subtotal:240}});
 assert.equal(valid.result.success,true,JSON.stringify(valid.result));
 const order=valid.writes.find(w=>w.ref.collection==='orders').data;
 assert.equal(order.productItems[0].totalPrice,240);assert.deepEqual(order.productItems[0].comboSelections[0].products[0].modifiers,[{id:'t',quantity:2}]);
 const invalid=await checkout({items,seed:seed.map(([key,value])=>[key,key==='products/pizza'?{...value,brandId:'foreign'}:value]),paymentOverrides:{subtotal:240}});
 assert.equal(invalid.result.success,false);assert.equal(invalid.writes.length,0);
});
test('linked combo modifier prices follow fulfillment and conditional required groups remain enforced',()=>{
 const c=catalog();c.products.push({id:'drink',brandId:'b',isActive:true,locationIds:['l'],productName:'Cola',price:12,priceDelivery:15});
 c.toppings[0].productId='drink';
 const delivery={...f.scope,deliveryType:'delivery'};
 assert.equal(f.restoreCartItems([choice()],c,delivery).items[0].itemTotal,140);
 c.products[0].toppingGroupIds.push('side');c.products[0].toppingGroupConditions={side:['t']};
 c.groups.push({id:'side',groupName:'Side',locationIds:['l'],minSelection:1,maxSelection:1});
 c.toppings.push({id:'bread',toppingName:'Bread',groupId:'side',price:0,isActive:true,locationIds:['l']});
 assert.equal(f.restoreCartItems([choice()],c,delivery).removed,1);
 const complete=choice();complete.comboSelections[0].products[0].modifiers.push({id:'bread',quantity:1});
 assert.equal(f.restoreCartItems([complete],c,delivery).removed,0);
 c.products[1].brandId='foreign';assert.equal(f.restoreCartItems([complete],c,delivery).removed,1);
});
test('legacy plain combo bypasses product customization while explicit empty choices remain strict across roundtrips',()=>{
 const c=catalog();c.toppings[0].isDefault=true;
 const legacy=f.restoreCartItems([f.comboChoice],c,f.scope);assert.equal(legacy.removed,0);
 assert.equal(legacy.items[0].itemTotal,100);assert.deepEqual(legacy.items[0].toppings,[]);
 assert.equal(validateCheckoutItems(checkoutItems(legacy.items),c,f.scope).subtotal,100);
 const explicit=structuredClone(f.comboChoice);explicit.comboSelections[0].products[0].modifiers=[];
 assert.equal(f.restoreCartItems([explicit],c,f.scope).removed,1);
 c.groups[0].minSelection=0;
 const configured=f.restoreCartItems([explicit],c,f.scope).items;
 assert.deepEqual(configured[0].comboSelections[0].products[0].modifiers,[]);
 const saved=f.cartChoices(configured), request=checkoutItems(configured);
 assert.deepEqual(saved[0].comboSelections[0].products[0].modifiers,[]);
 assert.deepEqual(request[0].comboSelections[0].products[0].modifiers,[]);
 c.groups[0].minSelection=1;
 assert.equal(f.restoreCartItems(saved,c,f.scope).removed,1);
 assert.throws(()=>validateCheckoutItems(request,c,f.scope),/no longer available/);
});
