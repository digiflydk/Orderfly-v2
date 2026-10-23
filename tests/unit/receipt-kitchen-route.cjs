const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { projectKitchenReceipt } = loadTs('src/lib/receipts/kitchen-preview.ts');
const order = () => ({
  id: 'order-a', createdAt: new Date('2026-10-22T10:00:00Z'), brandId: 'brand-a', locationId: 'location-a',
  brandName: 'Current brand', locationName: 'Current location', customerName: 'Ada', customerContact: 'ada@example.com',
  customerDetails: { id: 'private-customer-id', address: 'Private address', deliveryInstructions: 'Ring twice' },
  paymentStatus: 'Pending', paymentMethod: 'PayAtPickup', status: 'Received', deliveryType: 'Pickup', totalAmount: 105,
  paymentDetails: { subtotal: 100, discountTotal: 0, deliveryFee: 0, bagFee: 5, adminFee: 0, tips: 0, vatAmount: 21, paymentRefId: 'private-payment-id' },
  productItems: [{ name: 'Burger', quantity: 2, unitPrice: 50, totalPrice: 100, toppings: ['Cheese'] }],
  psp: { paymentIntentId: 'private-psp' }, analytics: { sessionId: 'private-session' },
});

function loadPage(mocks) {
  const fs = require('node:fs'), ts = require('typescript');
  const source = fs.readFileSync('src/app/superadmin/sales/orders/[orderId]/kitchen-receipt/page.tsx', 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  const jsx = (type, props) => ({ type, props });
  new Function('require', 'module', 'exports', code)(name => {
    if (name in mocks) return mocks[name];
    if (name === '@/lib/receipts/kitchen-categories-server') return { readKitchenCategoriesForOrder: async () => { throw Error('unexpected_category_read'); } };
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === '@/lib/receipts/kitchen-preview') return { projectKitchenReceipt };
    if (name === '@/components/receipts/kitchen-receipt-preview') return { KitchenReceiptPreview: 'receipt' };
    if (name === '@/components/ui/button') return { Button: 'button' };
    if (name === '@/components/superadmin/admin-link') return { default: 'link' };
    if (name === 'next/navigation') return { notFound() { throw Error('not_found'); } };
    throw Error('Unexpected dependency: ' + name);
  }, module, module.exports);
  return module.exports.default;
}

test('receipt route authenticates before lookup and never reads settings for inaccessible/missing orders', async () => {
  const calls = [];
  let mode = 'anonymous';
  const page = loadPage({
    '@/lib/access/orderfly-session': { orderflySession: async () => { calls.push('auth'); if (mode === 'anonymous') throw Error('unauthorized'); return { superuser: false }; } },
    '@/lib/access/order-details': { getOrderDetails: async () => { calls.push('order'); if (mode === 'denied') throw Error('forbidden'); return null; } },
    '@/lib/receipts/kitchen-settings-server': { readKitchenSettingsForOrder: async () => { calls.push('settings'); throw Error('must_not_read'); } },
  });
  const props = { params: Promise.resolve({ orderId: 'order-a' }) };
  await assert.rejects(page(props), /unauthorized/); assert.deepEqual(calls, ['auth']);
  calls.length = 0; mode = 'denied'; await assert.rejects(page(props), /forbidden/); assert.deepEqual(calls, ['auth', 'order']);
  calls.length = 0; mode = 'missing'; await assert.rejects(page(props), /not_found/); assert.deepEqual(calls, ['auth', 'order']);
});

test('receipt route reads settings only for the authorized order brand/location and serializes allowlisted preview', async () => {
  const calls = [];
  const page = loadPage({
    '@/lib/access/orderfly-session': { orderflySession: async () => ({ superuser: false }) },
    '@/lib/access/order-details': { getOrderDetails: async id => { assert.equal(id, 'order-a'); return order(); } },
    '@/lib/receipts/kitchen-settings-server': { readKitchenSettingsForOrder: async (...scope) => { calls.push(scope); return { settings: { heading: 'Example' } }; } },
  });
  const result = await page({ params: Promise.resolve({ orderId: 'order-a' }) });
  assert.deepEqual(calls, [['brand-a', 'location-a']]);
  const serialized = JSON.stringify(result);
  assert.ok(serialized.includes('order-a')); assert.ok(!serialized.includes('private-psp'));
  assert.ok(!serialized.includes('Rediger køkkenbon'));
});


test('kitchen route categories receive only the authorized order and labels reach preview', async () => {
  const scoped = order(); scoped.productItems[0].id = 'burger';
  let calls = 0;
  const page = loadPage({
    '@/lib/access/orderfly-session': { orderflySession: async () => ({ superuser: true }) },
    '@/lib/access/order-details': { getOrderDetails: async () => scoped },
    '@/lib/receipts/kitchen-settings-server': { readKitchenSettingsForOrder: async () => ({ settings: { groupByCategory: true } }) },
    '@/lib/receipts/kitchen-categories-server': { readKitchenCategoriesForOrder: async value => { calls++; assert.equal(value, scoped); return { burger: 'Burgere' }; } },
  });
  const result = await page({ params: Promise.resolve({ orderId: 'order-a' }) });
  assert.equal(calls, 1);
  const serialized = JSON.stringify(result);
  assert.ok(serialized.includes('Burgere'));
  assert.ok(serialized.includes('Rediger køkkenbon'));
  assert.ok(!serialized.includes('private-payment-id'));
});
