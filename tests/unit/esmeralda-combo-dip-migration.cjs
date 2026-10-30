const {test}=require('node:test');
const assert=require('node:assert/strict');
const modules=Promise.all([import('../../scripts/migrations/esmeralda-combo-dip-2026-10-30.mjs'),import('../../scripts/migrations/esmeralda-first-combo-menu-2026-10-30.mjs')]);
async function fixture(){
 const [m,first]=await modules,data=new Map(),writes=[];
 const scope={brandId:m.BRAND_ID,locationIds:[m.LOCATION_ID],isActive:true};
 data.set(`locations/${m.LOCATION_ID}`,{brandId:m.BRAND_ID,isActive:true});
 data.set(`categories/${m.CATEGORY_ID}`,scope);
 data.set(`products/${m.GARLIC_ID}`,{...scope,productName:'Hvidløgsbæger',price:10,priceDelivery:10,categoryId:m.CATEGORY_ID,toppingGroupIds:[]});
 data.set(`comboMenus/${m.TARGET_ID}`,{...scope,storefrontVersions:['v2'],setupMigration:'esmeralda-first-combo-menu-2026-10-30',sourceProductId:first.LEGACY_ID,pickupPrice:95,deliveryPrice:95,productGroups:[
 {id:'pizza',groupName:'Vælg pizza',productIds:first.PRODUCTS.slice(0,2).map(([id])=>id),minSelection:1,maxSelection:1,productPriceAdjustments:{[first.PRODUCTS[1][0]]:10}},
 {id:'drink',groupName:'Vælg sodavand',productIds:first.PRODUCTS.slice(2).map(([id])=>id),minSelection:1,maxSelection:1},
 ]});
 const snapshot=path=>({exists:data.has(path),data:()=>structuredClone(data.get(path))});
 const db={collection:c=>({doc:id=>({path:`${c}/${id}`,get:async()=>snapshot(`${c}/${id}`)})}),runTransaction:async f=>f({get:async r=>snapshot(r.path),create:(r,v)=>{assert(!data.has(r.path));writes.push(r.path);data.set(r.path,v)},update:(r,v)=>{assert(data.has(r.path));writes.push(r.path);data.set(r.path,{...data.get(r.path),...v})}})};
 return {m,data,db,writes};
}
test('atomic plan creates only three scoped combo components and adds optional included dip without price changes',async()=>{
 const {m,data,db,writes}=await fixture();const garlic=structuredClone(data.get(`products/${m.GARLIC_ID}`));
 const items=await m.plan(db);assert.equal(items.length,1);assert.deepEqual(writes,[]);
 assert.equal(items[0].creates.length,3);for(const p of items[0].creates){assert.equal(p.data.comboOnly,true);assert.equal(p.data.price,0);assert.equal(p.data.brandId,m.BRAND_ID);assert.deepEqual(p.data.locationIds,[m.LOCATION_ID]);assert.equal(p.data.imageUrl,undefined)}
 await m.applyItem(db,items[0]);assert.equal(writes.length,4);const menu=data.get(`comboMenus/${m.TARGET_ID}`);
 assert.equal(menu.pickupPrice,95);assert.equal(menu.deliveryPrice,95);assert.equal(menu.productGroups[2].minSelection,0);assert.equal(menu.productGroups[2].maxSelection,1);assert.equal(menu.productGroups[2].productIds.length,4);
 assert.deepEqual(data.get(`products/${m.GARLIC_ID}`),garlic);menu.isActive=false;assert.deepEqual(await m.plan(db),[]);
});
test('fails closed for changed menu prices, scope, collision and garlic source',async()=>{
 for(const mutate of [
 (m,d)=>d.get(`comboMenus/${m.TARGET_ID}`).pickupPrice=99,
 (m,d)=>d.get(`comboMenus/${m.TARGET_ID}`).storefrontVersions=['v1','v2'],
 (m,d)=>d.get(`comboMenus/${m.TARGET_ID}`).brandId='other',
 (m,d)=>d.get(`products/${m.GARLIC_ID}`).productName='Garlic mayo',
 (m,d)=>d.set(`products/${m.NEW_DIPS[0][0]}`,{}),
 (m,d)=>d.delete(`categories/${m.CATEGORY_ID}`),
 ]){const {m,data,db,writes}=await fixture();mutate(m,data);await assert.rejects(m.plan(db));assert.deepEqual(writes,[])}
});
test('apply rejects stale sources or tampered manifest before any write',async()=>{
 for(const mutate of [
 (m,d,item)=>d.get(`comboMenus/${m.TARGET_ID}`).description='merchant edit',
 (m,d,item)=>item.creates[0].data.comboOnly=false,
 (m,d,item)=>item.update.pickupPrice=0,
 (m,d,item)=>item.path='comboMenus/other',
 ]){const {m,data,db,writes}=await fixture();const [item]=await m.plan(db);mutate(m,data,item);await assert.rejects(m.applyItem(db,item));assert.deepEqual(writes,[])}
});
