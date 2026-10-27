const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {resolveToppingOptions,cartTopping,toppingSelectionError}=loadTs('src/lib/topping-options.ts');
const {menuProduct}=loadTs('src/lib/server/menu-products.ts',{'server-only':{},'@/lib/firebase-admin':{}});

test('serialized public options retain native price authority, counts, exclusions and group rules',async()=>{
 const groups=[{id:'drink',brandId:'b',groupName:'Internal drinks',displayName:'Vælg drik',kind:'addition',selectionMode:'single',minSelection:1,maxSelection:3},
  {id:'remove',brandId:'b',groupName:'Ingredients',displayName:'Fjern ingredienser',kind:'removal',selectionMode:'multiple',minSelection:0,maxSelection:0},
  {id:'foreign',brandId:'other',groupName:'Private'}];
 const toppings=[{id:'cola',brandId:'b',groupId:'drink',toppingName:'Old drink',price:1,productId:'native',maxQuantity:3,isActive:true},
  {id:'water',brandId:'b',groupId:'drink',toppingName:'Water',price:5,maxQuantity:1,isActive:true},
  {id:'onion',brandId:'b',groupId:'remove',toppingName:'løg',price:0,maxQuantity:1,isActive:true},
  {id:'foreign',brandId:'other',groupId:'foreign',toppingName:'Private',price:1,isActive:true}];
 const reads=[],cache=[];
 const db={collection(name){
  if(name==='locations')return {doc(id){assert.equal(id,'l');return {get:async()=>({exists:true,data:()=>({brandId:'b',isActive:true})})};}};
  const filters=[];return {where(...args){filters.push(args);return this;},async get(){reads.push([name,filters]);return {docs:(name==='toppings'?toppings:groups).map(value=>({id:value.id,data:()=>({...value,locationIds:['l'],secret:'must-not-leak'})}))};}};
 }};
 const {GET}=loadTs('src/app/api/public/product-options/route.ts',{'@/lib/firebase-admin':{getAdminDb:()=>db},'next/cache':{unstable_cache(fn,keys,options){cache.push({keys,options});return fn;}}});
 const response=await GET(new Request('https://example.test/api/public/product-options?brandId=b&locationId=l'));
 assert.equal(response.status,200);
 const body=await response.json();
 assert.deepEqual(cache,[{keys:['public-options-v2'],options:{revalidate:60,tags:['storefront']}}]);
 assert.deepEqual(reads,[['toppings',[['locationIds','array-contains','l'],['isActive','==',true]]],['topping_groups',[['locationIds','array-contains','l']]]]);
 assert.equal(body.groups.some(g=>g.id==='foreign'),false);assert.equal(body.toppings.some(t=>t.id==='foreign'),false);
 assert.doesNotMatch(JSON.stringify(body),/secret|must-not-leak|Private/);
 assert.equal(body.groups[0].displayName,'Vælg drik');
 const native={id:'native',brandId:'b',locationIds:['l'],productName:'Current drink',isActive:true,price:20,priceDelivery:25};
 for(const price of [0,7,99])for(const deliveryType of ['pickup','delivery']){
  const parent={id:'pizza',brandId:'b',locationIds:['l'],productName:'Pizza',isActive:true,price:80,toppingGroupIds:['drink','remove'],toppingOverrides:{cola:{price}}};
  // The production menu projection and response JSON are the same boundaries used by the dialog.
  const products=JSON.parse(JSON.stringify([parent,native].map(menuProduct)));
  const scope={brandId:'b',locationId:'l',deliveryType};
  const options=resolveToppingOptions(products[0],body.groups,body.toppings,products,scope);
  const cola=options.find(o=>o.id==='cola'),onion=options.find(o=>o.id==='onion');
  const expected=deliveryType==='delivery'?25:20;
  assert.equal(cola.price,expected);assert.equal(cola.maxQuantity,3);
  assert.deepEqual(cartTopping(cola,2),{id:'cola',name:'2 × Current drink',quantity:2,unitPrice:expected,price:expected*2});
  assert.equal(onion.kind,'removal');assert.equal(cartTopping(onion).name,'Uden løg');assert.equal(cartTopping(onion).price,0);
  assert.equal(toppingSelectionError(products[0],body.groups,options,{cola:2,onion:1}),null);
  assert.ok(toppingSelectionError(products[0],body.groups,options,{cola:1,water:1}),'single rule survives serialization');
  assert.ok(toppingSelectionError(products[0],body.groups,options,{cola:4}),'quantity limit survives serialization');
  assert.ok(toppingSelectionError(products[0],body.groups,options,{onion:1}),'required drink survives serialization');
 }
});
