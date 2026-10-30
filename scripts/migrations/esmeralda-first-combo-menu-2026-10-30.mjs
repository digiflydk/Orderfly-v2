import { createHash } from 'node:crypto';

export const description = 'Create one V2-only Esmeralda Pizzamenu from verified existing pizza/drink products and legacy menu prices; preserve the legacy Pizza Combo.';
export const BRAND_ID = 'oeypKaMyYcQjIwaa1PtV';
export const LOCATION_ID = 'eibiesSbluQTmp3mUqly';
export const TARGET_ID = 'esmeralda-v2-pizzamenu-20261030';
export const LEGACY_ID = 'ca2a037a-9d70-4b4e-a5c4-d7217b465be8';
export const PRODUCTS = [
  ['a401ceb4-3638-4bad-9a39-0088827eade4', '1. Margherita (V)', 79, 'miwLbdWj8YwlwxhDWFNN', 0],
  ['9e6202ff-1f3a-4ed8-81f8-1615c13be554', '4. Pepperoni', 89, 'R924L1dorQlFq6UUUoo4', 10],
  ['f10a57a7-ecfa-4f70-86b0-b0b435120440', 'Pepsi 0,33 l', 20, 'OurZo6bCr4Nzof31ALv4', 0],
  ['53102f7c-a218-4028-804b-61a10aa3e646', 'Pepsi Max 0,33 l', 20, 'krCxojRMbLIJDjvKwEPw', 0],
  ['40adc2d6-2b59-4cc1-94b1-901e9758f5b0', 'Faxe Kondi 0,33 l', 20, 'BIebFsCcn6iSLGnxiqa4', 0],
  ['8d43f3df-69f5-4a7f-80ca-6303d7210e0d', 'Faxe Kondi free 0,33 l', 20, 'rsLCb3O30j2vhE7FZrfw', 0],
];
const PIZZA_GROUP = 'fZRA2bP6tvNhyuAyi7CF', DRINK_GROUP = 'cTdhAo0M43JLHkrH0mD1';
const TARGET_PATH = `comboMenus/${TARGET_ID}`;
const SOURCE_PATHS = [
  `locations/${LOCATION_ID}`, `products/${LEGACY_ID}`,
  ...PRODUCTS.map(([id]) => `products/${id}`),
  ...PRODUCTS.map(([, , , id]) => `toppings/${id}`),
  `topping_groups/${PIZZA_GROUP}`, `topping_groups/${DRINK_GROUP}`,
];
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const hash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const ref = (db, path) => db.collection(path.split('/')[0]).doc(path.split('/')[1]);
const check = (ok, message) => { if (!ok) throw new Error(message); };

async function readSources(db, reader) {
  const snaps = await Promise.all(SOURCE_PATHS.map(path => reader(ref(db, path))));
  const rows = Object.fromEntries(snaps.map((snap, i) => {
    check(snap.exists, `Required source missing: ${SOURCE_PATHS[i]}`);
    return [SOURCE_PATHS[i], snap.data()];
  }));
  const location = rows[`locations/${LOCATION_ID}`];
  check(location.brandId === BRAND_ID && location.isActive === true, 'Location scope/availability changed.');
  const legacy = rows[`products/${LEGACY_ID}`];
  const scoped = row => row.brandId === BRAND_ID && row.locationIds?.includes(LOCATION_ID) && row.isActive === true && row.isTestData !== true;
  check(scoped(legacy) && legacy.productName === 'Pizza Combo' && legacy.price === 95 && legacy.priceDelivery === 95, 'Legacy menu price/scope changed.');
  check(legacy.toppingGroupIds?.includes(PIZZA_GROUP) && legacy.toppingGroupIds?.includes(DRINK_GROUP), 'Legacy menu groups changed.');
  PRODUCTS.forEach(([id, name, price, optionId, supplement], index) => {
    const product = rows[`products/${id}`], option = rows[`toppings/${optionId}`];
    check(scoped(product) && product.productName === name && product.price === price && product.priceDelivery === price, `Product changed: ${id}`);
    check((!option.brandId || option.brandId === BRAND_ID) && option.locationIds?.includes(LOCATION_ID) && option.isActive === true && option.toppingName === name && option.price === supplement && option.groupId === (index < 2 ? PIZZA_GROUP : DRINK_GROUP), `Legacy option changed: ${optionId}`);
  });
  for (const id of [PIZZA_GROUP, DRINK_GROUP]) {
    const group = rows[`topping_groups/${id}`];
    check((!group.brandId || group.brandId === BRAND_ID) && group.locationIds?.includes(LOCATION_ID) && group.minSelection === 1 && group.maxSelection === 1, `Legacy selection group changed: ${id}`);
  }
  return rows;
}

function menuFrom(rows) {
  return {
    brandId: BRAND_ID, locationIds: [LOCATION_ID], comboName: 'Pizzamenu',
    description: 'Vælg Margherita eller Pepperoni og en valgfri 0,33 l dåsesodavand.',
    pickupPrice: 95, deliveryPrice: 95,
    calculatedNormalPricePickup: 109, calculatedNormalPriceDelivery: 109,
    imageUrl: rows[`products/${LEGACY_ID}`].imageUrl || null,
    activeDays: [], activeTimeSlots: [], orderTypes: ['pickup', 'delivery'], tags: [],
    productGroups: [
      {id: 'pizza', groupName: 'Vælg pizza', productIds: PRODUCTS.slice(0, 2).map(([id]) => id), minSelection: 1, maxSelection: 1, productPriceAdjustments: {[PRODUCTS[1][0]]: 10}},
      {id: 'drink', groupName: 'Vælg sodavand', productIds: PRODUCTS.slice(2).map(([id]) => id), minSelection: 1, maxSelection: 1},
    ],
    upgradeProductIds: PRODUCTS.slice(0, 2).map(([id]) => id), storefrontVersions: ['v2'],
    isActive: true, isTestData: false,
    setupMigration: 'esmeralda-first-combo-menu-2026-10-30', sourceProductId: LEGACY_ID,
  };
}

export async function plan(db) {
  const target = await ref(db, TARGET_PATH).get();
  // Never overwrite an existing menu, including later intentional merchant edits/deactivation.
  if (target.exists) {
    const data = target.data();
    check(data.brandId === BRAND_ID && data.setupMigration === 'esmeralda-first-combo-menu-2026-10-30' && data.sourceProductId === LEGACY_ID, 'Target ID already belongs to another record.');
    return [];
  }
  const rows = await readSources(db, r => r.get());
  return [{path: TARGET_PATH, sourceHash: hash(rows), create: menuFrom(rows)}];
}

export async function applyItem(db, item) {
  check(item.path === TARGET_PATH, 'Unexpected migration target.');
  await db.runTransaction(async tx => {
    const target = await tx.get(ref(db, TARGET_PATH));
    check(!target.exists, 'Target appeared after preview; rerun preview.');
    const rows = await readSources(db, r => tx.get(r));
    check(hash(rows) === item.sourceHash && hash(menuFrom(rows)) === hash(item.create), 'Catalog or planned menu changed since preview; rerun preview.');
    const now = new Date();
    tx.create(ref(db, TARGET_PATH), {...item.create, createdAt: now, updatedAt: now});
  });
}
