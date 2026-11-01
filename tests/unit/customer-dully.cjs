const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('../helpers/feedback-fixture.cjs');
const { loadTs } = require('../helpers/load-ts.cjs');
const BRAND = 'brand1';
const NOW = Date.parse('2026-11-02T12:00:00+01:00');
const scope = { brandId: BRAND, locationId: 'loc1', accountId: 'account1', restaurantId: 'restaurant1', now: NOW };
function setup() {
  const f = fixture();
  f.records.set('brands/' + BRAND, { name: 'Esmeralda', status: 'active' });
  f.records.set('locations/loc1', { brandId: BRAND });
  f.records.set('locations/foreign', { brandId: 'other' });
  return { ...f, lib: loadTs('src/lib/customers/dully-customers.ts', f.mocks), contract: loadTs('src/lib/customers/dully-customer-contract.ts') };
}
const row = (o = {}) => ({ externalOrderId: '1001', orderNumber: '2154', externalRestaurantId: 'restaurant1', externalCustomerId: 'c77',
  email: 'Guest@Example.test', phone: '+45 12 34 56 78', customerName: 'Gæst Test', address: { street: 'Testvej 1', postalCode: '2300', city: 'København S' },
  experienceType: 'delivery', orderedAt: '2026-10-31T19:00:00+01:00', completedAt: '2026-10-31T19:40:00+01:00', status: 'completed', paymentStatus: 'paid',
  orderTotal: 249, orderLines: [{ name: 'Margherita', quantity: 2, total: 198 }, { name: 'Cola', quantity: 1, total: 51 }], ...o });
const docs = (f, prefix) => [...f.records.entries()].filter(([k]) => k.startsWith(prefix + '/')).map(([, v]) => v);

test('new Dully customer is created with purchases, stats and reservations; never touches orders, loyalty or consent', async () => {
  const f = setup(); const orders = docs(f, 'orders').length;
  const r = await f.lib.importDullyCustomerPurchases({ ...scope, rows: [row(), row({ externalOrderId: '1002', orderNumber: '2200', orderedAt: '2026-11-01T18:00:00+01:00', completedAt: null, status: 'pending', paymentStatus: 'unpaid', orderTotal: 100, orderLines: [] })] });
  assert.deepEqual(r, { customersCreated: 1, customersMatched: 1, purchasesCreated: 2, purchasesUpdated: 0, purchasesUnchanged: 0, conflicts: 0 });
  const [c] = docs(f, 'customers').filter(c => c.brandId === BRAND);
  assert.equal(c.normalizedEmail, 'guest@example.test'); assert.equal(c.fullName, 'Gæst Test'); assert.equal(c.street, 'Testvej 1');
  assert.equal(c.totalOrders, 0); assert.equal(c.totalSpend, 0); assert.equal(c.marketingConsent, undefined);
  assert.deepEqual({ ...c.externalPurchaseStats.dully, updatedAt: 0 }, { count: 1, amount: 249, firstPurchaseAt: '2026-10-31T19:00:00+01:00', lastPurchaseAt: '2026-10-31T19:00:00+01:00', updatedAt: 0 });
  const purchases = docs(f, 'dullyCustomerPurchases');
  assert.equal(purchases.length, 2); assert.ok(purchases.every(p => p.customerId === c.id && p.email === undefined && p.phone === undefined));
  assert.equal(docs(f, 'orders').length, orders);
  assert.equal(docs(f, 'integrationConsumerCustomerIdentities').length, 1); assert.equal(docs(f, 'integrationConsumerCustomerPhoneIdentities').length, 1);
  assert.equal(docs(f, 'feedbackMailJobs').length, 0);
});

test('matches an existing Orderfly customer by phone only, fills gaps without overwriting, and reimport is idempotent', async () => {
  const f = setup();
  f.records.set('customers/existing', { id: 'existing', brandId: BRAND, fullName: 'Ole Orderfly', email: 'ole@example.test', normalizedEmail: 'ole@example.test', phone: '12345678', normalizedPhone: '+4512345678', street: 'Gammelvej 2', totalOrders: 3, totalSpend: 600, marketingConsent: false, locationIds: ['loc0'] });
  const r = await f.lib.importDullyCustomerPurchases({ ...scope, rows: [row({ marketingSubscriber: true })] });
  assert.equal(r.customersMatched, 1); assert.equal(r.customersCreated, 0);
  const c = f.records.get('customers/existing');
  assert.equal(c.fullName, 'Ole Orderfly'); assert.equal(c.street, 'Gammelvej 2'); assert.equal(c.totalOrders, 3); assert.equal(c.totalSpend, 600);
  assert.equal(c.marketingConsent, false, 'Dully evidence never overrides Orderfly consent');
  assert.equal(c.integrationSources.dully.marketingSubscriber, true);
  assert.ok(c.emailAliases.includes('guest@example.test')); assert.deepEqual(c.locationIds, ['loc0', 'loc1']);
  const again = await f.lib.importDullyCustomerPurchases({ ...scope, rows: [row()] });
  assert.equal(again.purchasesUnchanged, 1); assert.equal(docs(f, 'dullyCustomerPurchases').length, 1);
  const refunded = await f.lib.importDullyCustomerPurchases({ ...scope, rows: [row({ paymentStatus: 'refunded', refundedAmount: 249 })] });
  assert.equal(refunded.purchasesUpdated, 1); assert.equal(f.records.get('customers/existing').externalPurchaseStats.dully.count, 0);
});

test('ambiguous identities are held as conflicts without personal data; identity, tenant and future rows are rejected', async () => {
  const f = setup();
  f.records.set('customers/a', { id: 'a', brandId: BRAND, email: 'guest@example.test', normalizedEmail: 'guest@example.test' });
  f.records.set('customers/b', { id: 'b', brandId: BRAND, email: 'x@example.test', phone: '+4512345678', normalizedPhone: '+4512345678' });
  const r = await f.lib.importDullyCustomerPurchases({ ...scope, rows: [row()] });
  assert.equal(r.conflicts, 1); assert.equal(docs(f, 'dullyCustomerPurchases').length, 0);
  const [conflict] = docs(f, 'dullyCustomerImportConflicts');
  assert.equal(conflict.code, 'customer_identity_conflict'); assert.ok(!JSON.stringify(conflict).includes('example.test'));
  const g = setup();
  await g.lib.importDullyCustomerPurchases({ ...scope, rows: [row({ phone: undefined })] });
  await assert.rejects(g.lib.importDullyCustomerPurchases({ ...scope, rows: [row({ phone: undefined, orderedAt: '2026-10-30T19:00:00+01:00' })] }), /Ordreidentiteten/);
  await assert.rejects(g.lib.importDullyCustomerPurchases({ ...scope, locationId: 'foreign', rows: [row()] }));
  await assert.rejects(g.lib.importDullyCustomerPurchases({ ...scope, rows: [row({ externalRestaurantId: 'other' })] }));
  await assert.rejects(g.lib.importDullyCustomerPurchases({ ...scope, rows: [row({ orderedAt: '2026-12-01T19:00:00+01:00', completedAt: null })] }));
  await assert.rejects(g.lib.importDullyCustomerPurchases({ ...scope, rows: [row({ email: undefined, phone: undefined })] }));
  await assert.rejects(g.lib.importDullyCustomerPurchases({ ...scope, rows: [row(), row()] }), /flere gange/);
});

test('a second order in the same batch with only the phone joins the customer created earlier in the batch', async () => {
  const f = setup();
  const r = await f.lib.importDullyCustomerPurchases({ ...scope, rows: [row(), row({ externalOrderId: '1003', orderNumber: '2300', email: undefined, orderedAt: '2026-11-01T12:00:00+01:00', completedAt: '2026-11-01T12:30:00+01:00', orderTotal: 100 })] });
  assert.equal(r.customersCreated, 1); assert.equal(r.customersMatched, 1);
  const [c] = docs(f, 'customers').filter(c => c.brandId === BRAND);
  assert.equal(c.externalPurchaseStats.dully.count, 2); assert.equal(c.externalPurchaseStats.dully.amount, 349);
  assert.equal(c.externalPurchaseStats.dully.lastPurchaseAt, '2026-11-01T12:00:00+01:00');
});
