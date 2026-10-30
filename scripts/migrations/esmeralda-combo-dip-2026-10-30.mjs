import { createHash } from 'node:crypto';
import { BRAND_ID, LOCATION_ID, TARGET_ID, LEGACY_ID, PRODUCTS } from './esmeralda-first-combo-menu-2026-10-30.mjs';
export { BRAND_ID, LOCATION_ID, TARGET_ID };
export const description = 'Include one optional dip in the existing V2 Pizzamenu, preserving 95/105 DKK prices; create three combo-only components atomically.';
export const MIGRATION = 'esmeralda-combo-dip-2026-10-30';
export const GARLIC_ID = 'eb643661-bb1f-4311-b1cc-7bd65e6b46f5';
export const CATEGORY_ID = '3wEoIQkuOWSWiWXHwsGO';
// These are NEW deterministic IDs, not aliases for existing catalog products.
export const NEW_DIPS = [
  ['esmeralda-v2-combo-dip-chili-20261030', 'Chili'],
  ['esmeralda-v2-combo-dip-dressing-20261030', 'Dressing'],
  ['esmeralda-v2-combo-dip-pesto-20261030', 'Pesto'],
];
const TARGET_PATH = `comboMenus/${TARGET_ID}`;
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const hash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const ref = (db, path) => db.collection(path.split('/')[0]).doc(path.split('/')[1]);
const check = (ok, message) => { if (!ok) throw new Error(message); };
const equal = (a,b) => hash(a) === hash(b);
const scoped = row => row?.brandId === BRAND_ID && equal(row.locationIds, [LOCATION_ID]) && row.isActive === true && row.isTestData !== true;
const group = {id:'dip', groupName:'Vælg dip', productIds:[NEW_DIPS[0][0], GARLIC_ID, NEW_DIPS[1][0], NEW_DIPS[2][0]], minSelection:0, maxSelection:1};
const originalGroups = [
  {id:'pizza', groupName:'Vælg pizza', productIds:PRODUCTS.slice(0,2).map(([id])=>id), minSelection:1, maxSelection:1, productPriceAdjustments:{[PRODUCTS[1][0]]:10}},
  {id:'drink', groupName:'Vælg sodavand', productIds:PRODUCTS.slice(2).map(([id])=>id), minSelection:1, maxSelection:1},
];
const newProduct = (id,name) => ({id, brandId:BRAND_ID, locationIds:[LOCATION_ID], categoryId:CATEGORY_ID, productName:name,
  description:'Inkluderet dip i Pizzamenu.', price:0, priceDelivery:0, comboOnly:true, isActive:true, isTestData:false,
  toppingGroupIds:[], isFeatured:false, isNew:false, isPopular:false, setupMigration:MIGRATION});
async function read(db, reader) {
 const paths = [TARGET_PATH,`locations/${LOCATION_ID}`,`categories/${CATEGORY_ID}`,`products/${GARLIC_ID}`,...NEW_DIPS.map(([id])=>`products/${id}`)];
 const snaps = await Promise.all(paths.map(path=>reader(ref(db,path))));
 return Object.fromEntries(snaps.map((s,i)=>[paths[i], s.exists ? s.data() : null]));
}
function planned(rows) {
 const menu = rows[TARGET_PATH];
 check(menu?.brandId === BRAND_ID && menu.setupMigration === 'esmeralda-first-combo-menu-2026-10-30' && menu.sourceProductId === LEGACY_ID, 'Unexpected menu ownership or provenance.');
 // Preserve subsequent merchant edits, including deactivation, after a completed run.
 if (menu.dipSetupMigration === MIGRATION) return null;
 check(scoped(menu) && equal(menu.storefrontVersions,['v2']) && menu.pickupPrice === 95 && menu.deliveryPrice === 95 && equal(menu.productGroups,originalGroups), 'Menu scope, price or groups changed; review before adding dip.');
 check(rows[`locations/${LOCATION_ID}`]?.brandId === BRAND_ID && rows[`locations/${LOCATION_ID}`]?.isActive === true, 'Location changed.');
 const category = rows[`categories/${CATEGORY_ID}`];
 check(category && (!category.brandId || category.brandId === BRAND_ID) && category.locationIds?.includes(LOCATION_ID) && category.isActive === true, 'Dip category scope or availability changed.');
 const garlic = rows[`products/${GARLIC_ID}`];
 check(scoped(garlic) && garlic.productName === 'Hvidløgsbæger' && garlic.price === 10 && garlic.priceDelivery === 10 && garlic.categoryId === CATEGORY_ID && !garlic.toppingGroupIds?.length, 'Existing garlic dip changed.');
 for (const [id] of NEW_DIPS) check(rows[`products/${id}`] === null, `New dip ID already exists: ${id}`);
 return {path:TARGET_PATH, sourceHash:hash(rows), creates:NEW_DIPS.map(([id,name])=>({path:`products/${id}`,data:newProduct(id,name)})), update:{
   productGroups:[...menu.productGroups,group], description:'Vælg Margherita eller Pepperoni, en valgfri 0,33 l sodavand og én dip.', dipSetupMigration:MIGRATION,
 }};
}
export async function plan(db) {
 const item = planned(await read(db,r=>r.get()));
 return item ? [item] : [];
}
export async function applyItem(db,item) {
 check(item.path === TARGET_PATH,'Unexpected migration target.');
 await db.runTransaction(async tx=>{
  const expected = planned(await read(db,r=>tx.get(r)));
  check(expected && equal(expected,item),'Catalog or manifest changed since preview; rerun preview.');
  const now = new Date();
  for (const product of expected.creates) tx.create(ref(db,product.path),{...product.data,createdAt:now,updatedAt:now});
  tx.update(ref(db,TARGET_PATH),{...expected.update,updatedAt:now});
 });
}
