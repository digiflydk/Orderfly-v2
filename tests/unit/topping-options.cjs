const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {resolveToppingOptions,cartTopping,toppingSelectionError,reconcileToppingQuantities}=loadTs('src/lib/topping-options.ts');
const {restoreCartItems}=loadTs('src/lib/cart-restore.ts');
const {validateCheckoutItems,checkoutItems}=loadTs('src/lib/checkout-items.ts');
const scope={brandId:'b',locationId:'l',deliveryType:'pickup'};
const group={id:'extras',groupName:'Internal',displayName:'Ekstra',locationIds:['l'],minSelection:0,maxSelection:5};
const removal={id:'without',groupName:'Ingredients',kind:'removal',locationIds:['l'],minSelection:0,maxSelection:0};
const product={id:'p',productName:'Pizza',brandId:'b',locationIds:['l'],isActive:true,price:80,priceDelivery:90,toppingGroupIds:['extras','without']};
const cheese={id:'cheese',groupId:'extras',toppingName:'Ost',price:10,maxQuantity:3,isActive:true,locationIds:['l']};
const onion={id:'onion',groupId:'without',toppingName:'Løg',price:0,isActive:true,locationIds:['l']};
const catalog=(p=product,extras={})=>({products:[p],groups:[group,removal],toppings:[cheese,onion],combos:[],discounts:[],upsells:[],...extras});
const choice=(ids=['cheese','onion'],counts=[2,1])=>({id:'p',cartItemId:'line',itemType:'product',quantity:2,toppingIds:ids,toppings:ids,toppingQuantities:counts});

test('quantity and explicit removals survive restore and authoritative checkout labels',()=>{
 const restored=restoreCartItems([choice()],catalog(),scope);
 assert.equal(restored.removed,0);assert.equal(restored.items[0].itemTotal,100);
 assert.deepEqual(restored.items[0].toppings.map(t=>[t.name,t.price,t.unitPrice,t.quantity]),[['2 × Ost',20,10,2],['Uden Løg',0,0,1]]);
 const wire=checkoutItems(restored.items);assert.equal(wire[0].totalPrice,200);
 wire[0].toppings=['FREE CHEESE','EVIL'];
 const validated=validateCheckoutItems(wire,catalog(),scope);
 assert.deepEqual(validated.items[0].toppings,['2 × Ost','Uden Løg']);
 assert.deepEqual(validated.items[0].toppingQuantities,[2,1]);assert.equal(validated.subtotal,200);
});
test('one shared option has independent zero and charged product prices',()=>{
 const free={...product,toppingOverrides:{cheese:{price:0,isDefault:true,defaultQuantity:2}}};
 const charged={...product,id:'p2',toppingOverrides:{cheese:{price:15}}};
 const opts=resolveToppingOptions(free,[group],[cheese],[],scope);
 assert.equal(opts[0].price,0);assert.equal(opts[0].defaultQuantity,2);
 assert.equal(resolveToppingOptions(charged,[group],[cheese],[],scope)[0].price,15);
 assert.equal(resolveToppingOptions(product,[group],[cheese],[],scope)[0].price,10);
 assert.equal(restoreCartItems([choice(['cheese'],[2])],catalog(free),scope).items[0].itemTotal,80);
});
test('forged quantities, missing IDs, stale availability and underpayment are rejected',()=>{
 for(const quantities of [[0,1],[-1,1],[1.5,1],[4,1],[1,2],[NaN,1],[Infinity,1],[2],[2,1,1]]) {
  assert.equal(restoreCartItems([choice(undefined,quantities)],catalog(),scope).removed,1,String(quantities));
 }
 assert.equal(restoreCartItems([{...choice(),toppingIds:undefined}],catalog(),scope).removed,1);
 assert.equal(restoreCartItems([choice()],catalog({...product,toppingOverrides:{cheese:{isAvailable:false}}}),scope).removed,1);
 assert.throws(()=>validateCheckoutItems([{...choice(),name:'Pizza',unitPrice:80,totalPrice:160}],catalog(),scope),/prices/);
});
test('group limits use total quantities and single mode limits distinct choices',()=>{
 const second={...cheese,id:'sauce',toppingName:'Sauce'};
 const options=resolveToppingOptions(product,[group],[cheese,second],[],scope);
 assert.equal(toppingSelectionError(product,[{...group,minSelection:3,maxSelection:3}],options,{cheese:3}),null);
 assert.ok(toppingSelectionError(product,[{...group,minSelection:3,maxSelection:3}],options,{cheese:2}));
 assert.ok(toppingSelectionError(product,[{...group,selectionMode:'single'}],options,{cheese:1,sauce:1}));
 assert.equal(toppingSelectionError(product,[{...group,selectionMode:'single'}],options,{cheese:2}),null);
});
test('global quantity cap bounds selected units even across groups',()=>{
 const large={...cheese,maxQuantity:50};const second={...large,id:'other',groupId:'other'};
 const groups=[{...group,maxSelection:0},{...group,id:'other',maxSelection:0}];
 const p={...product,toppingGroupIds:['extras','other']};const opts=resolveToppingOptions(p,groups,[large,second],[],scope);
 assert.ok(toppingSelectionError(p,groups,opts,{cheese:50,other:1}));
 assert.equal(toppingSelectionError(p,groups,opts,{cheese:50}),null);
});
test('defaults respect quantities, explicit deselection and newly visible groups',()=>{
 const p={...product,toppingOverrides:{cheese:{isDefault:true,defaultQuantity:2}}};
 const opts=resolveToppingOptions(p,[group,removal],[cheese,onion],[],scope);
 assert.deepEqual({...reconcileToppingQuantities(p,[group,removal],opts,{})},{cheese:2});
 assert.deepEqual({...reconcileToppingQuantities(p,[group,removal],opts,{},50,{cheese:2})},{});
 assert.deepEqual({...reconcileToppingQuantities(p,[group,removal],opts,{cheese:1},50,{cheese:2})},{cheese:1});
});
test('hidden dependent options and quantities are rejected or removed, with fresh defaults',()=>{
 const size={id:'size',groupName:'Size',minSelection:1,maxSelection:1,locationIds:['l']};
 const trigger={id:'large',groupId:'size',toppingName:'Large',price:20,isActive:true,locationIds:['l']};
 const p={...product,toppingGroupIds:['size','extras'],toppingGroupConditions:{extras:['large']},toppingOverrides:{cheese:{isDefault:true,defaultQuantity:2}}};
 const groups=[size,group], opts=resolveToppingOptions(p,groups,[trigger,cheese],[],scope);
 assert.deepEqual({...reconcileToppingQuantities(p,groups,opts,{large:1},50,{})},{large:1,cheese:2});
 assert.deepEqual({...reconcileToppingQuantities(p,groups,opts,{cheese:2},50,{large:1,cheese:2})},{});
 assert.ok(toppingSelectionError(p,groups,opts,{cheese:2}));
});
test('removal cannot charge, preselect, or allow multiple units',()=>{
 for(const option of [{...onion,price:5},{...onion,isDefault:true},{...onion,maxQuantity:2}]) assert.equal(resolveToppingOptions(product,[removal],[option],[],scope).length,0);
 for(const override of [{price:5},{isDefault:true},{defaultQuantity:2}]) assert.equal(resolveToppingOptions({...product,toppingOverrides:{onion:override}},[removal],[onion],[],scope).length,0);
});
test('linked native products inherit current delivery price and scoped availability',()=>{
 const linked={id:'drink',productName:'Current drink',price:20,priceDelivery:25,brandId:'b',locationIds:['l'],isActive:true};
 const option={...cheese,productId:'drink',price:0,toppingName:'Old'};
 let opts=resolveToppingOptions(product,[group],[option],[linked],{...scope,deliveryType:'delivery'});
 assert.equal(opts[0].price,25);assert.equal(cartTopping(opts[0],2).name,'2 × Current drink');
 assert.equal(resolveToppingOptions({...product,toppingOverrides:{cheese:{price:0}}},[group],[option],[linked],scope)[0].price,0);
 assert.equal(resolveToppingOptions(product,[group],[option],[{...linked,locationIds:[]}],scope).length,1);
 assert.equal(resolveToppingOptions(product,[group],[option],[{...linked,locationIds:undefined}],scope).length,0);
 for(const row of [{...linked,brandId:'foreign'},{...linked,locationIds:['other']},{...linked,isActive:false},{...linked,toppingGroupIds:['nested']},{...linked,isTestData:true}]) assert.equal(resolveToppingOptions(product,[group],[option],[row],scope).length,0);
 assert.equal(resolveToppingOptions(product,[group],[option],[],scope).length,0);
});
test('legacy option counts default to one and old unambiguous plain labels still restore',()=>{
 const old={...choice(['cheese'],[1]),toppingQuantities:undefined,toppingIds:undefined,toppings:['Ost']};
 assert.equal(restoreCartItems([old],catalog(),scope).items[0].itemTotal,90);
 const opts=resolveToppingOptions(product,[group],[{...cheese,maxQuantity:undefined}],[],scope);
 assert.equal(opts[0].maxQuantity,1);assert.ok(toppingSelectionError(product,[group],opts,{cheese:2}));
});
test('malformed catalog numbers and duplicate selected IDs fail closed',()=>{
 for(const bad of [NaN,Infinity,-1,1.5,0,51]) assert.equal(resolveToppingOptions(product,[group],[{...cheese,maxQuantity:bad}],[],scope).length,0);
 assert.equal(restoreCartItems([choice(['cheese','cheese'],[1,1])],catalog(),scope).removed,1);
 assert.equal(resolveToppingOptions({...product,toppingOverrides:{cheese:{price:Infinity}}},[group],[cheese],[],scope).length,0);
});

test('root defaults activate dependent defaults in one reconciliation call',()=>{
 const parent={...group,id:'size',minSelection:1,maxSelection:1};
 const trigger={...cheese,id:'large',groupId:'size',maxQuantity:1,isDefault:true};
 const p={...product,toppingGroupIds:['size','extras'],toppingGroupConditions:{extras:['large']},toppingOverrides:{cheese:{isDefault:true,defaultQuantity:2}}};
 const groups=[group,parent],opts=resolveToppingOptions(p,groups,[cheese,trigger],[],scope);
 assert.deepEqual({...reconcileToppingQuantities(p,groups,opts,{})},{large:1,cheese:2});
});
