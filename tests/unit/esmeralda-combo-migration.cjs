const {test}=require('node:test');
const assert=require('node:assert/strict');
const modulePromise=import('../../scripts/migrations/esmeralda-first-combo-menu-2026-10-30.mjs');
async function fixture(){
 const m=await modulePromise, data=new Map(), writes=[];
 data.set(`locations/${m.LOCATION_ID}`,{brandId:m.BRAND_ID,isActive:true});
 const scope={brandId:m.BRAND_ID,locationIds:[m.LOCATION_ID],isActive:true};
 const groups=['fZRA2bP6tvNhyuAyi7CF','cTdhAo0M43JLHkrH0mD1'];
 data.set(`products/${m.LEGACY_ID}`,{...scope,productName:'Pizza Combo',price:95,priceDelivery:95,toppingGroupIds:groups});
 m.PRODUCTS.forEach(([id,name,price,optionId,supplement],index)=>{
  data.set(`products/${id}`,{...scope,productName:name,price,priceDelivery:price});
  data.set(`toppings/${optionId}`,{...scope,toppingName:name,price:supplement,groupId:groups[index<2?0:1]});
 });
 groups.forEach(id=>data.set(`topping_groups/${id}`,{...scope,minSelection:1,maxSelection:1}));
 const snapshot=path=>({exists:data.has(path),data:()=>structuredClone(data.get(path))});
 const db={collection:c=>({doc:id=>({path:`${c}/${id}`,get:async()=>snapshot(`${c}/${id}`)})}),runTransaction:async f=>f({get:async r=>snapshot(r.path),create:(r,v)=>{assert(!data.has(r.path));writes.push(r.path);data.set(r.path,v);}})};
 return {m,data,db,writes};
}
test('preview is read only; apply creates only one V2 menu; rerun preserves merchant edits',async()=>{
 const {m,data,db,writes}=await fixture();const items=await m.plan(db);assert.equal(items.length,1);assert.deepEqual(writes,[]);
 const menu=items[0].create;assert.deepEqual(menu.storefrontVersions,['v2']);assert.equal(menu.pickupPrice,95);assert.equal(menu.deliveryPrice,95);
 assert.equal(menu.productGroups[0].productPriceAdjustments[m.PRODUCTS[1][0]],10);assert.equal(menu.productGroups[1].productIds.length,4);assert.equal(menu.upgradeProductIds.length,2);
 const original=structuredClone(data.get(`products/${m.LEGACY_ID}`));await m.applyItem(db,items[0]);assert.deepEqual(writes,[`comboMenus/${m.TARGET_ID}`]);assert.deepEqual(data.get(`products/${m.LEGACY_ID}`),original);
 data.get(`comboMenus/${m.TARGET_ID}`).isActive=false;assert.deepEqual(await m.plan(db),[]);
});
test('wrong brand, changed legacy prices, missing drinks and changed source options fail closed',async()=>{
 for(const mutate of [
  (m,d)=>{d.get(`products/${m.PRODUCTS[0][0]}`).brandId='other'},
  (m,d)=>{d.get(`products/${m.LEGACY_ID}`).price=90},
  (m,d)=>{d.delete(`products/${m.PRODUCTS[2][0]}`)},
  (m,d)=>{d.get(`toppings/${m.PRODUCTS[1][3]}`).price=0},
 ]){const {m,data,db,writes}=await fixture();mutate(m,data);await assert.rejects(m.plan(db));assert.deepEqual(writes,[]);}
});
test('transaction rejects changes after preview and tampered target/menu',async()=>{
 for(const mutate of [
  (m,d,item)=>{d.get(`products/${m.PRODUCTS[0][0]}`).description='changed after review'},
  (m,d,item)=>{item.create.pickupPrice=1},
  (m,d,item)=>{item.path='comboMenus/other'},
  (m,d,item)=>{d.set(`comboMenus/${m.TARGET_ID}`,{brandId:m.BRAND_ID})},
 ]){const {m,data,db,writes}=await fixture();const [item]=await m.plan(db);mutate(m,data,item);await assert.rejects(m.applyItem(db,item));assert.deepEqual(writes,[]);}
});
test('existing unrelated target is never adopted or overwritten',async()=>{
 const {m,data,db,writes}=await fixture();data.set(`comboMenus/${m.TARGET_ID}`,{brandId:'other'});await assert.rejects(m.plan(db));assert.deepEqual(writes,[]);
});
