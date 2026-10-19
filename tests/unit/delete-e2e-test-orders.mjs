import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { plan, applyItem } from '../../scripts/migrations/delete-e2e-test-orders-2026-10-18.mjs';
const { memoryDb } = createRequire(import.meta.url)('../helpers/marketing-db.cjs');

const BRAND = 'oeypKaMyYcQjIwaa1PtV';
const hashId = parts => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
const order = (extra = {}) => ({ brandId: BRAND, customerName: 'TEST E2E-kunde', customerDetails: { id: 'c1' }, paymentStatus: 'Paid', totalAmount: 172, ...extra });
function seed() {
  return new Map([
    ['orders/ORD-385369', order()],
    ['orders/ORD-389910', order({ totalAmount: 221 })],
    ['orders/ORD-489552', order({ paymentStatus: 'Pending', totalAmount: 93 })],
    ['orders/ORD-REAL', order({ customerName: 'Rigtig kunde' })],
    [`orderNotificationJobs/${hashId(['order-confirmation', BRAND, 'ORD-385369'])}`, { orderId: 'ORD-385369' }],
    ['analytics_events/e1', { orderId: 'ORD-385369' }],
    ['analytics_events/e2', { orderId: 'ORD-REAL' }],
    ['customers/c1', { totalOrders: 5, totalSpend: 1000, name: 'x' }],
  ]);
}
async function run(db) { for (const item of await plan(db)) await applyItem(db, item); }

test('deletes only the listed test orders, their jobs and metrics, and undoes the paid totals', async () => {
  const db = memoryDb(seed());
  const items = await plan(db);
  assert.equal(JSON.stringify(items).includes('okh@'), false, 'no personal data in the logged plan');
  await run(db);
  for (const id of ['ORD-385369', 'ORD-389910', 'ORD-489552']) assert.equal(db.rows.has(`orders/${id}`), false);
  assert.equal(db.rows.has('orders/ORD-REAL'), true);
  assert.equal(db.rows.has(`orderNotificationJobs/${hashId(['order-confirmation', BRAND, 'ORD-385369'])}`), false);
  assert.equal(db.rows.has('analytics_events/e1'), false);
  assert.equal(db.rows.has('analytics_events/e2'), true);
  assert.deepEqual(db.rows.get('customers/c1'), { totalOrders: 3, totalSpend: 607, name: 'x' }, 'two paid orders, 172 + 221 kr.');
});

test('is idempotent: a second run plans nothing and changes nothing', async () => {
  const db = memoryDb(seed());
  await run(db);
  const after = structuredClone([...db.rows]);
  assert.deepEqual(await plan(db), []);
  await run(db);
  assert.deepEqual([...db.rows], after);
});

test('refuses an order that is not the test order, and an order changed after the preview', async () => {
  const foreign = memoryDb(new Map([['orders/ORD-385369', order({ customerName: 'Rigtig kunde' })]]));
  await assert.rejects(plan(foreign), /not the Esmeralda test order/);
  const db = memoryDb(seed());
  const [first] = await plan(db);
  db.rows.set('orders/ORD-385369', order({ customerName: 'Rigtig kunde' }));
  await assert.rejects(applyItem(db, first), /changed since the preview/);
  assert.equal(db.rows.has('orders/ORD-385369'), true);
});
