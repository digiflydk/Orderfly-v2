const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {restoreCartItems}=loadTs('src/lib/cart-restore.ts');
const {validateCheckoutItems}=loadTs('src/lib/checkout-items.ts');
const {reconcileToppingIds}=loadTs('src/lib/topping-conditions.ts');
const scope={brandId:'b',locationId:'l',deliveryType:'pickup'};
const groups=['size','regular','family','drink'].map(id=>({id,locationIds:['l'],minSelection:id==='size'||id==='drink'?1:0,maxSelection:1}));
const toppings=[['alm','size',0],['fam','size',60],['menu','size',30],['cheese','regular',10],['family-cheese','family',20],['cola','drink',0]].map(([id,groupId,price])=>({id,groupId,price,toppingName:id,isActive:true,locationIds:['l'],isDefault:id==='cola'}));
const product={id:'p',productName:'Pizza',isActive:true,brandId:'b',locationIds:['l'],price:65,priceDelivery:70,toppingGroupIds:groups.map(g=>g.id),toppingGroupConditions:{regular:['alm'],family:['fam'],drink:['menu']}};
const catalog={products:[product],groups,toppings,combos:[],discounts:[],upsells:[]};
const choice=ids=>({id:'p',itemType:'product',cartItemId:'one',quantity:1,toppingIds:ids,toppings:ids});
test('regular/family totals survive restore for pickup and delivery',()=>{
 for(const [ids,total] of [[['alm','cheese'],75],[['fam','family-cheese'],145]]) {
  assert.equal(restoreCartItems([choice(ids)],catalog,scope).items[0].itemTotal,total);
  assert.equal(restoreCartItems([choice(ids)],catalog,{...scope,deliveryType:'delivery'}).items[0].itemTotal,total+5);
 }
});
test('checkout rejects hidden toppings, free drink without menu, and missing menu drink',()=>{
 for(const ids of [['fam','cheese'],['alm','cola'],['menu'],[],['alm','fam']]) {
  const item={id:'p',name:'Pizza',quantity:1,unitPrice:65,totalPrice:65,toppingIds:ids,toppings:ids};
  assert.throws(()=>validateCheckoutItems([item],catalog,scope));
 }
 assert.equal(validateCheckoutItems([{id:'p',name:'Pizza',quantity:1,unitPrice:65,totalPrice:95,toppingIds:['menu','cola'],toppings:['menu','cola']}],catalog,scope).subtotal,95);
});
test('switching size removes the old extras; switching away from menu removes its drink',()=>{
 assert.deepEqual([...reconcileToppingIds(product,groups,toppings,['fam','cheese'],50)],['fam']);
 assert.deepEqual([...reconcileToppingIds(product,groups,toppings,['menu'],50)],['menu','cola']);
 assert.deepEqual([...reconcileToppingIds(product,groups,toppings,['alm','cola'],50)],['alm']);
});
test('defaults do not override explicit removal or saved empty choices',()=>{
 const optionalGroups=[{id:'extra',locationIds:['l'],minSelection:0,maxSelection:2}];
 const optionalToppings=[{id:'cheese',groupId:'extra',isActive:true,isDefault:true,locationIds:['l']}];
 const optionalProduct={toppingGroupIds:['extra']};
 assert.deepEqual([...reconcileToppingIds(optionalProduct,optionalGroups,optionalToppings,[],50,['cheese'])],[]);
 assert.deepEqual([...reconcileToppingIds(optionalProduct,optionalGroups,optionalToppings,[],50,[])],[]);
 assert.deepEqual([...reconcileToppingIds(product,groups,toppings,['menu'],50,['alm'])],['menu','cola']);
 assert.deepEqual([...reconcileToppingIds(product,groups,toppings,['menu'],50,['menu','cola'])],['menu']);
});
test('unrelated and unavailable triggers cannot activate conditional groups',()=>{
 for(const bad of [{...product,toppingGroupConditions:{family:['foreign']}},{...product,toppingGroupIds:['family'],toppingGroupConditions:{family:['fam']}}]) {
  assert.equal(restoreCartItems([choice(['fam','family-cheese'])],{...catalog,products:[bad]},scope).removed,1);
 }
 assert.equal(restoreCartItems([choice(['fam','family-cheese'])],{...catalog,toppings:toppings.map(t=>t.id==='fam'?{...t,isActive:false}:t)},scope).removed,1);
});
