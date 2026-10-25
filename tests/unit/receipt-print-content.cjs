const { test } = require('node:test');
const assert = require('node:assert/strict');
const { moduleGraph } = require('../helpers/load-ts-graph.cjs');
const { createHash } = require('node:crypto');
const scope = { orderId: 'o1', brandId: 'b1', locationId: 'l1', printerId: 'p1' };
function fixture() {
  const order = { brandId: 'b1', locationId: 'l1', brandName: 'Saved restaurant', locationName: 'Saved location',
    customerName: 'Saved customer', customerContact: 'saved@example.test', customerDetails: { phone: '12345678', deliveryInstructions: 'Pak separat' },
    status: 'Received', paymentStatus: 'Paid', paymentMethod: 'Stripe', deliveryType: 'Pickup', deliveryTime: 'Hurtigst muligt',
    createdAt: '2026-10-25T08:00:00Z', productItems: [{ id: 'pasta', name: 'Saved pasta', quantity: 2, itemType: 'product', toppings: ['Uden løg'], unitPrice: 75, totalPrice: 150 }],
    paymentDetails: { subtotal: 150, discountTotal: 0, deliveryFee: 0 }, totalAmount: 150 };
  const rows = new Map([
    ['orders/o1', order], ['brands/b1', { name: 'Current brand', companyName: 'Seller ApS', companyRegNo: '12345678', street: 'Road 1', city: 'Copenhagen' }],
    ['locations/l1', { brandId: 'b1', name: 'Current location' }],
    ['locations/l1/printers/p1', { schemaVersion: 1, revision: 1, deletedAt: null, configuration: { id: 'p1', brandId: 'b1', locationId: 'l1', name: 'Kitchen', manufacturer: 'star', model: 'mc-print3', paperWidthMm: 80, transport: 'cloudprnt-http', state: 'active' } }],
    ['products/pasta', { brandId: 'b1', isActive: true, categoryId: 'food', productName: 'Changed pasta', locationIds: ['l1'] }],
    ['categories/food', { brandId: 'b1', isActive: true, locationIds: ['l1'], categoryName: 'Pasta' }],
  ]);
  const ref = path => ({ path, id: path.split('/').at(-1), collection: name => col(`${path}/${name}`) });
  const col = path => ({ doc: name => ref(`${path}/${name}`) });
  const reads = [], tx = { get: async r => { reads.push(r.path); return { id: r.id, exists: rows.has(r.path), data: () => rows.get(r.path) }; } };
  let inside = false, logoReads = 0, renderReads = 0;
  const db = { collection: col, runTransaction: async fn => { inside = true; try { return await fn(tx); } finally { inside = false; } } };
  const load = moduleGraph({ 'server-only': {}, '@/lib/firebase-admin': { getAdminDb: () => db },
    '@/lib/receipts/print-raster': {
      rasterizeReceipt: async doc => { assert.equal(inside, false, 'render outside transaction'); renderReads++; const payload = Buffer.from(doc.svg); return { payload, sha256: createHash('sha256').update(payload).digest('hex') }; },
      resolveReceiptLogo: async url => { assert.equal(inside, false, 'logo fetch outside transaction'); logoReads++; return 'data:image/png;base64,aGVsbG8='; },
    } });
  return { api: load('src/lib/printing/receipt-print-content.ts'), db, tx, rows, reads, order, metrics: () => ({ logoReads, renderReads }) };
}
test('native kitchen snapshot shares saved content/settings/categories and actual paper width', async () => {
  const f = fixture(); const settings = { paperWidthMm: 58, heading: 'Produktion', showBrandName: true, showLocationName: true, showCustomer: false, showPhone: true, groupByCategory: true, textSize: 'normal' };
  f.rows.set('kitchenReceiptSettings/b1', { schemaVersion: 1, brandId: 'b1', revision: 2, settings });
  const result = await f.api.prepareKitchenPrintSnapshot({ db: f.db, transaction: f.tx }, scope);
  assert.equal(result.settings.heading, 'Produktion'); assert.equal(result.settings.paperWidthMm, 80);
  assert.equal(result.order.lines[0].name, 'Saved pasta'); assert.equal(result.order.lines[0].category, 'Pasta');
  assert.deepEqual(result.order.lines[0].modifiers, ['Uden løg']); assert.equal(result.order.customerPhone, '12345678');
  assert.equal(result.order.brandName, 'Saved restaurant'); assert.equal(result.order.notes, 'Pak separat');
});
test('automatic selected canonical lines cannot duplicate or exceed saved order', async () => {
  const f = fixture(); f.order.productItems.push({ id: 'soda', name: 'Soda', itemType: 'product', quantity: 1 });
  const snapshot = await f.api.prepareKitchenPrintSnapshot({ db: f.db, transaction: f.tx }, { ...scope, lineIds: ['line-1'] });
  assert.deepEqual(snapshot.order.lines.map(x => x.name), ['Soda']);
  for (const lineIds of [[], ['line-0', 'line-0'], ['line-9'], ['line-01'], ['wrong']]) {
    await assert.rejects(f.api.prepareKitchenPrintSnapshot({ db: f.db, transaction: f.tx }, { ...scope, lineIds }), /receipt_content_unavailable/);
  }
});
test('scope swaps, inactive printers, malformed settings and oversized selections fail closed', async () => {
  const mutations = [
    f => f.order.brandId = 'other', f => f.rows.get('locations/l1').brandId = 'other',
    f => f.rows.get('locations/l1/printers/p1').configuration.locationId = 'other',
    f => f.rows.get('locations/l1/printers/p1').configuration.state = 'disabled',
    f => f.rows.set('kitchenReceiptSettings/b1', { schemaVersion: 1, brandId: 'other', revision: 1, settings: {} }),
    f => f.order.productItems = Array(101).fill(f.order.productItems[0]),
  ];
  for (const mutate of mutations) { const f = fixture(); mutate(f); await assert.rejects(f.api.prepareReceiptPrintContent({ ...scope, kind: 'kitchen' }), /receipt_content_unavailable/); assert.equal(f.metrics().renderReads, 0); }
});
test('manual kitchen includes saved menu children and supports historical cancelled warning', async () => {
  const f = fixture(); f.order.status = 'Canceled';
  f.order.productItems = [{ id: 'menu', itemType: 'combo', name: 'Menu', quantity: 2, comboSelections: [{ groupName: 'Pizzaer', products: [{ id: 'pasta', name: 'Saved child' }, { id: 'pasta', name: 'Saved child' }] }] }];
  const result = await f.api.prepareReceiptPrintContent({ ...scope, kind: 'kitchen' });
  assert.match(result.payload.toString(), /ANNULLERET/); assert.match(result.payload.toString(), /4 × Saved child/); assert.match(result.payload.toString(), /Menuindhold i alt/);
});
test('customer content preserves immutable invoice fiscal facts and resolves logo after native reads', async () => {
  const f = fixture(); f.rows.get('brands/b1').logoUrl = 'https://firebasestorage.googleapis.com/logo.png';
  f.order.invoice = { number: 'INV-1', currency: 'DKK', seller: { legalName: 'Historical seller', tradingName: 'Historical brand', registrationNumber: '11111111', address: 'Old road' },
    fulfillmentLocation: { name: 'Historical location' }, customer: { name: 'Invoice customer', email: 'invoice@example.test' },
    lines: [{ description: 'Fiscal saved line', quantity: 1, unitAmount: 123, totalAmount: 123 }], subtotal: 123, itemDiscount: 0, orderDiscount: 0,
    deliveryFee: 0, bagFee: 0, adminFee: 0, vatAmount: 24.6, totalAmount: 123, paymentMethod: 'Stripe' };
  const result = await f.api.prepareReceiptPrintContent({ ...scope, kind: 'customer' });
  const svg = result.payload.toString(); assert.match(svg, /Historical seller/); assert.match(svg, /Fiscal saved line/); assert.doesNotMatch(svg, /Saved pasta/);
  assert.match(svg, /123,00/); assert.match(svg, /11111111/); assert.equal(f.metrics().logoReads, 1); assert.equal(f.metrics().renderReads, 1);
});
test('customer cannot invent missing monetary facts and catalog enrichment never leaks other scope', async () => {
  const f = fixture(); delete f.order.paymentDetails;
  await assert.rejects(f.api.prepareReceiptPrintContent({ ...scope, kind: 'customer' }), /receipt_content_unavailable/);
  const g = fixture(); g.rows.get('categories/food').locationIds = ['other-location'];
  const result = await g.api.prepareKitchenPrintSnapshot({ db: g.db, transaction: g.tx }, scope);
  assert.equal(result.order.lines[0].category, 'Varer');
});

test('physical headings accept native category ownership without legacy brandId, same as preview', async () => {
  const f = fixture(); delete f.rows.get('categories/food').brandId;
  const snapshot = await f.api.prepareKitchenPrintSnapshot({ db: f.db, transaction: f.tx }, scope);
  assert.equal(snapshot.order.lines[0].category, 'Pasta');
});
