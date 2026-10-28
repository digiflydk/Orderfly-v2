const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {linkedCartProductIds}=loadTs('src/lib/server/upsell-linked-options.ts');
function fixture(location={brandId:'brand',isActive:true},rows=[]){
 const queries=[];let reads=0;
 const db={collection(name){return {
 doc(){return {async get(){reads++;return {exists:!!location,data:()=>location}}}},
 where(...args){queries.push([name,...args]);return this},
 async get(){reads++;return {docs:rows.map(([id,data])=>({id,data:()=>data}))}}
 }}};
 return {db,queries,reads:()=>reads};
}
const topping=(productId,locationIds=['shop'],isActive=true)=>({productId,locationIds,isActive});
test('legacy baskets without native topping IDs cause no reads',async()=>{
 const f=fixture();assert.deepEqual(await linkedCartProductIds(f.db,'brand','shop',[{}],()=>{throw Error('unexpected')}),[]);assert.equal(f.reads(),0);
});
test('foreign, inactive and missing locations cannot resolve topping links',async()=>{
 for(const loc of [null,{brandId:'other',isActive:true},{brandId:'brand',isActive:false}]){
  const f=fixture(loc);assert.deepEqual(await linkedCartProductIds(f.db,'brand','shop',[{toppingIds:['a']}],()=>{throw Error('unexpected')}),[]);assert.equal(f.reads(),1);assert.deepEqual(f.queries,[]);
 }
});
test('only selected active local links are resolved through authoritative scoped products',async()=>{
 const f=fixture(undefined,[['a',topping('drink')],['b',topping('drink')],['unselected',topping('dessert')],['foreign',topping('foreign',['other'])],['off',topping('off',['shop'],false)],['invalid',topping('../bad')],['unavailable',topping('gone')]]);
 const result=await linkedCartProductIds(f.db,'brand','shop',[{toppingIds:['a','b','missing','foreign','off','invalid','unavailable']}],async(ids,brand,shop)=>{assert.deepEqual(ids,['drink','gone']);assert.equal(brand,'brand');assert.equal(shop,'shop');return [{id:'drink'}]});
 assert.deepEqual(result,['drink']);assert.deepEqual(f.queries,[['toppings','locationIds','array-contains','shop'],['toppings','isActive','==',true]]);
});
test('public upsell DTO accepts bounded native ids and rejects overlarge lists',async()=>{
 let input;
 const {POST}=loadTs('src/app/api/public/upsell/route.ts',{'@/lib/url':{getOrigin:async()=> 'https://shop.test'},'@/lib/firebase-admin':{getAdminDb:()=>({collection:()=>({doc:()=>({get:async()=>({exists:true,data:()=>({brandId:'brand',isActive:true,deliveryTypes:['pickup']})})})})})},'@/app/superadmin/upsells/actions':{getActiveUpsellForCart:async(data)=>{input=data;return null}}});
 const send=ids=>POST(new Request('https://shop.test/api/public/upsell',{method:'POST',headers:{origin:'https://shop.test'},body:JSON.stringify({brandId:'brand',locationId:'shop',deliveryType:'pickup',cartItems:[{id:'pizza',toppingIds:ids}],cartTotal:79})}));
 assert.equal((await send(['native'])).status,200);assert.deepEqual(input.cartItems[0].toppingIds,['native']);
 assert.equal((await send(Array(51).fill('native'))).status,400);assert.equal((await send(['../bad'])).status,400);
});
