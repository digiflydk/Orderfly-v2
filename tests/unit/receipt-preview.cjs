const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { projectReceipt } = loadTs('src/lib/receipts/preview.ts');

const order = () => ({
  id: 'order-a', createdAt: new Date('2026-10-22T10:00:00Z'), brandId: 'brand-a', locationId: 'location-a',
  brandName: 'Current brand', locationName: 'Current location', customerName: 'Ada', customerContact: 'ada@example.com',
  customerDetails: { id: 'private-customer-id', address: 'Private address', deliveryInstructions: 'Ring twice' },
  paymentStatus: 'Pending', paymentMethod: 'PayAtPickup', status: 'Received', deliveryType: 'Pickup', totalAmount: 105,
  paymentDetails: { subtotal: 100, discountTotal: 0, deliveryFee: 0, bagFee: 5, adminFee: 0, tips: 0, vatAmount: 21, paymentRefId: 'private-payment-id' },
  productItems: [{ name: 'Burger', quantity: 2, unitPrice: 50, totalPrice: 100, toppings: ['Cheese'] }],
  psp: { paymentIntentId: 'private-psp' }, analytics: { sessionId: 'private-session' },
});

test('unpaid receipt retains status, saved amounts and optional details without payment or tracking identifiers', () => {
  const result = projectReceipt(order());
  assert.equal(result.paymentStatus, 'Ikke betalt');
  assert.equal(result.total, 105);
  assert.equal(result.paidAt, undefined);
  assert.deepEqual(result.lines[0].modifiers, ['Cheese']);
  assert.equal(result.notes, 'Ring twice');
  for (const secret of ['private-customer-id', 'private-payment-id', 'private-psp', 'private-session', 'Private address']) assert.ok(!JSON.stringify(result).includes(secret));
});

test('immutable invoice is authoritative even when current order lines and totals disagree; current refund remains visible', () => {
  const input = order();
  input.paymentStatus = 'Paid'; input.status = 'Canceled'; input.refundedAmountOre = 2500;
  input.invoice = {
    number: 'INV-1', currency: 'DKK', seller: { legalName: 'Legal seller', tradingName: 'Original brand', registrationNumber: '1234', address: 'Original address' },
    fulfillmentLocation: { name: 'Original location' }, customer: { name: 'Original customer', email: 'original@example.com' },
    lines: [{ description: 'Original item', quantity: 1, unitAmount: 80, totalAmount: 80 }], subtotal: 80,
    itemDiscount: 5, orderDiscount: 10, deliveryFee: 20, bagFee: 2, adminFee: 3, vatAmount: 18, totalAmount: 90, paymentMethod: 'Cash', paymentReference: 'private-invoice-payment',
  };
  const result = projectReceipt(input);
  assert.equal(result.total, 90); assert.equal(result.subtotal, 80); assert.equal(result.discount, 15);
  assert.equal(result.lines[0].name, 'Original item'); assert.equal(result.brandName, 'Original brand');
  assert.equal(result.customerName, 'Original customer'); assert.equal(result.seller.name, 'Legal seller');
  assert.equal(result.refunded, 25); assert.equal(result.paymentStatus, 'Betalt'); assert.equal(result.status, 'Annulleret');
  assert.equal(result.paymentMethod, 'Kontant'); assert.ok(!JSON.stringify(result).includes('private-invoice-payment'));
});

test('missing or malformed timestamps and unknown VAT never invent payment evidence or a VAT amount', () => {
  const input = order(); input.createdAt = new Date('invalid'); input.paidAt = new Date('invalid'); delete input.paymentDetails.vatAmount;
  const result = projectReceipt(input);
  assert.equal(result.createdAt, ''); assert.equal(result.paidAt, undefined); assert.equal(result.vat, undefined);
});

function loadPage(mocks) {
  const fs = require('node:fs'), ts = require('typescript');
  const source = fs.readFileSync('src/app/superadmin/sales/orders/[orderId]/receipt/page.tsx', 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  const jsx = (type, props) => ({ type, props });
  new Function('require', 'module', 'exports', code)(name => {
    if (name in mocks) return mocks[name];
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === '@/lib/receipts/preview') return { projectReceipt };
    if (name === '@/components/receipts/receipt-preview') return { ReceiptPreview: 'receipt' };
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
    '@/lib/receipts/settings-server': { readReceiptSettingsForOrder: async () => { calls.push('settings'); throw Error('must_not_read'); } },
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
    '@/lib/receipts/settings-server': { readReceiptSettingsForOrder: async (...scope) => { calls.push(scope); return { settings: { heading: 'Example' } }; } },
  });
  const result = await page({ params: Promise.resolve({ orderId: 'order-a' }) });
  assert.deepEqual(calls, [['brand-a', 'location-a']]);
  const serialized = JSON.stringify(result);
  assert.ok(serialized.includes('order-a')); assert.ok(!serialized.includes('private-psp'));
  assert.ok(!serialized.includes('Rediger kvitteringslayout'));
});
