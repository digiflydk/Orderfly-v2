const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { retentionReport } = loadTs('src/lib/customers/retention.ts');
const at = s => Date.parse(s);
const NOW = at('2026-11-02T20:00:00+01:00');

test('repeat rate, source split, recency and median gap', () => {
  const r = retentionReport([
    { customerId: 'a', at: at('2026-09-01T12:00:00+02:00'), amount: 100, source: 'orderfly' },
    { customerId: 'a', at: at('2026-09-11T12:00:00+02:00'), amount: 50, source: 'dully' },
    { customerId: 'a', at: at('2026-10-31T12:00:00+01:00'), amount: 50, source: 'dully' },
    { customerId: 'b', at: at('2026-06-01T12:00:00+02:00'), amount: 80, source: 'dully' },
    { customerId: 'c', at: at('2026-10-20T12:00:00+02:00'), amount: 70, source: 'orderfly' },
    { customerId: 'd', at: at('2026-12-01T12:00:00+01:00'), amount: 70, source: 'orderfly' }, // future: ignored
  ], NOW);
  assert.equal(r.buyers, 3); assert.equal(r.repeatBuyers, 1); assert.equal(r.repeatRate, 33.3);
  assert.equal(r.purchases, 5); assert.equal(r.amount, 350); assert.equal(r.purchasesPerBuyer, 1.67);
  assert.equal(r.medianDaysBetween, 30); // gaps 10 and 50 days
  assert.deepEqual(r.active, { d30: 2, d60: 2, d90: 2 }); assert.equal(r.lapsed90, 1);
  assert.deepEqual([r.bySource.orderflyOnly, r.bySource.dullyOnly, r.bySource.both], [1, 1, 1]);
  assert.deepEqual([r.bySource.orderflyPurchases, r.bySource.dullyPurchases, r.bySource.dullyAmount], [2, 3, 180]);
});

test('monthly cohorts use Copenhagen months and leave future months empty', () => {
  const r = retentionReport([
    { customerId: 'a', at: at('2026-08-31T23:30:00+02:00'), amount: 1, source: 'dully' }, // 31 Aug in Copenhagen
    { customerId: 'a', at: at('2026-09-15T12:00:00+02:00'), amount: 1, source: 'dully' },
    { customerId: 'b', at: at('2026-08-10T12:00:00+02:00'), amount: 1, source: 'orderfly' },
    { customerId: 'b', at: at('2026-10-10T12:00:00+02:00'), amount: 1, source: 'orderfly' },
  ], NOW);
  assert.deepEqual(r.cohorts, [{ month: '2026-08', size: 2, retained: [50, 50, 0, null, null, null] }]);
  assert.deepEqual(retentionReport([], NOW).cohorts, []);
});

test('server report is limited to authorized brands and joins Dully only to that brand\'s customers', async () => {
  const { fixture } = require('../helpers/feedback-fixture.cjs');
  const f = fixture();
  f.records.set('customers/c1', { brandId: 'b1' }); f.records.set('customers/x', { brandId: 'b2' });
  f.records.set('orders/o1', { brandId: 'b1', customerDetails: { id: 'c1' }, paymentStatus: 'Paid', status: 'Completed', totalAmount: 100, paidAt: new Date('2026-10-01T12:00:00Z') });
  f.records.set('dullyCustomerPurchases/p1', { brandId: 'b1', customerId: 'c1', orderedAt: '2026-10-20T12:00:00+02:00', status: 'completed', paymentStatus: 'paid', orderTotal: 60 });
  f.records.set('dullyCustomerPurchases/p2', { brandId: 'b1', customerId: 'x', orderedAt: '2026-10-21T12:00:00+02:00', status: 'completed', paymentStatus: 'paid', orderTotal: 999 });
  f.records.set('dullyCustomerPurchases/p3', { brandId: 'b1', customerId: 'c1', orderedAt: '2026-10-22T12:00:00+02:00', status: 'completed', paymentStatus: 'refunded', orderTotal: 50 });
  const grants = ['b1'];
  const mocks = { ...f.mocks, '@/lib/access/scoped-data': { listScopedDocuments: async () => [...f.records.entries()].filter(([k, v]) => k.startsWith('customers/') && grants.includes(v.brandId)).map(([k, v]) => ({ id: k.split('/')[1], data: () => v })) } };
  const server = loadTs('src/lib/customers/retention-server.ts', mocks);
  const result = await server.retentionForBrand('b1', NOW);
  assert.equal(result.customers, 1); assert.equal(result.report.purchases, 2); assert.equal(result.report.amount, 160);
  assert.equal(result.report.repeatBuyers, 1); assert.equal(result.report.bySource.both, 1);
  assert.equal(await server.retentionForBrand('b2', NOW), null);
});
