const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const f = require('../helpers/cart-fixture.cjs');
const snapshot = loadTs('src/lib/cart-snapshot.ts');
const restore = (choices, catalog = f.catalog(), scope = f.scope) => f.restoreCartItems(choices, catalog, scope);

test('snapshot contains choices only, safely parses and rejects corrupt/expired/oversized data', () => {
  const { items } = restore([{ ...f.choice, toppings: ['Cheese'] }]);
  const saved = { version: 1, brandId: 'b', locationId: 'l', deliveryType: 'pickup', includeBagFee: true, choices: f.cartChoices(items), savedAt: Date.now() };
  assert.equal(JSON.stringify(saved).includes('price'), false);
  assert.equal(JSON.stringify(saved).includes('email'), false);
  const read = data => snapshot.readCartSnapshot({ getItem: () => data });
  assert.deepEqual(read(JSON.stringify(saved)), saved);
  for (const invalid of ['{', 'x'.repeat(200001), JSON.stringify({ ...saved, version: 2 }), JSON.stringify({ ...saved, savedAt: 0 }), JSON.stringify({ ...saved, choices: [f.choice, f.choice] })]) assert.equal(read(invalid), null);
  assert.equal(snapshot.readCartSnapshot({ getItem: () => { throw Error('blocked'); } }), null);
  assert.equal(snapshot.requestedDelivery('?deliveryMethod=takeaway'), 'pickup');
  assert.equal(snapshot.requestedDelivery('?deliveryMethod=delivery'), 'delivery');
});

test('quantity, topping and combo selections survive with current catalog prices and names', () => {
  const catalog = f.catalog(); catalog.products[0].price = 90; catalog.toppings[0].price = 12;
  const { items, removed } = restore([{ ...f.choice, toppings: ['Cheese'], price: 1 }, f.comboChoice], catalog);
  assert.equal(removed, 0); assert.equal(items[0].quantity, 2); assert.equal(items[0].price, 90); assert.equal(items[0].itemTotal, 102);
  assert.deepEqual(items[1].comboSelections, [{ groupId: 'pg', groupName: 'Pizza', products: [{ id: 'pizza', name: 'Italiana' }] }]);
  assert.equal(restore([f.choice], catalog, { ...f.scope, deliveryType: 'delivery' }).items[0].price, 80);
});

test('deleted/inactive/wrong-brand/wrong-location products and unavailable toppings are removed', () => {
  for (const mutation of [c => c.products.splice(0), c => c.products[0].isActive = false, c => c.products[0].brandId = 'other', c => c.products[0].locationIds = ['other'], c => c.toppings[0].isActive = false, c => c.groups[0].minSelection = 2]) {
    const catalog = f.catalog(); mutation(catalog);
    assert.equal(restore([{ ...f.choice, toppings: ['Cheese'] }], catalog).removed, 1);
  }
  assert.equal(restore([{ ...f.choice, toppings: ['unknown'] }]).removed, 1);
});

test('expired or no-longer-valid combo selections are removed, including native Firestore dates', () => {
  for (const mutation of [c => c.combos[0].endDate = { toDate: () => new Date('2026-09-06') }, c => c.combos[0].orderTypes = ['delivery'], c => c.combos[0].productGroups[0].productIds = ['other']]) {
    const catalog = f.catalog(); mutation(catalog);
    assert.equal(restore([f.comboChoice], catalog).removed, 1);
  }
});

test('current item offers apply; expired offers and browser-provided prices do not', () => {
  const catalog = f.catalog(); catalog.discounts = [{ ...f.discount }];
  assert.equal(restore([{ ...f.choice, id: 'pizza-offer', offered: true, price: 1 }], catalog).items[0].price, 60);
  catalog.discounts[0].endDate = new Date('2026-09-06');
  assert.equal(restore([{ ...f.choice, offered: true, price: 1 }], catalog).items[0].price, 75);
});

test('upsell is restored only while its offer and another product trigger remain valid', () => {
  const catalog = f.catalog(); catalog.products.push({ ...f.product, id: 'drink', productName: 'Drink', price: 20, toppingGroupIds: [] });
  catalog.upsells = [{ ...f.discount, offerType: 'product', offerProductIds: ['drink'], discountType: 'percentage', discountValue: 50, triggerConditions: [{ type: 'product_in_cart', referenceId: 'pizza' }] }];
  const drink = { ...f.choice, id: 'drink', cartItemId: 'drink-line', offered: true };
  assert.equal(restore([f.choice, drink], catalog).items[1].price, 10);
  assert.equal(restore([drink], catalog).items[0].price, 20);
  catalog.upsells[0].isActive = false;
  assert.equal(restore([f.choice, drink], catalog).items[1].price, 20);
});

test('restore action verifies native restaurant ownership and bounds selectors before catalog reads', async () => {
  let reads = 0;
  const db = { collection: name => ({ doc: id => ({ get: async () => { reads++; return { exists: true, data: () => ({ brandId: 'other' }) }; } }) }) };
  const { restoreCartAction } = loadTs('src/app/cart-actions.ts', {
    '@/lib/firebase-admin': { getAdminDb: () => db },
    '@/app/superadmin/standard-discounts/actions': {},
  });
  await assert.rejects(restoreCartAction({ ...f.scope, choices: [f.choice] }), /context is invalid/);
  assert.equal(reads, 2);
  await assert.rejects(restoreCartAction({ ...f.scope, choices: Array(101).fill(f.choice) }));
  await assert.rejects(restoreCartAction({ ...f.scope, brandId: '../other', choices: [] }));
  assert.equal(reads, 2);
});
