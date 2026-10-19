import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { plan, applyItem } from '../../scripts/migrations/delete-e2e-test-orders-2026-10-18.mjs';
const { memoryDb } = createRequire(import.meta.url)('../helpers/marketing-db.cjs');

const BRAND = 'oeypKaMyYcQjIwaa1PtV';
const hashId = parts => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
const T1 = Date.parse('2026-10-18T10:00:00Z'), T2 = Date.parse('2026-10-18T11:00:00Z'), REAL = Date.parse('2026-10-01T12:00:00Z');
const order = (extra = {}) => ({ brandId: BRAND, locationId: 'l1', customerName: 'TEST E2E-kunde', customerDetails: { id: 'c1' }, paymentStatus: 'Paid', paidAt: T1, totalAmount: 172, discountReservation: 'none', ...extra });
const capacity = {
  customer: `checkout_customer_capacity/${hashId([BRAND, 'c1'])}`,
  discount: `checkout_discount_capacity/${hashId([BRAND, 'd1'])}`,
  pair: `checkout_customer_discount_capacity/${hashId([BRAND, 'c1', 'd1'])}`,
};
function seed() {
  return new Map([
    ['orders/ORD-385369', order({ verifiedUpsellIds: ['u1', 'u-other-location', 'u-other-brand'] })],
    ['orders/ORD-389910', order({ totalAmount: 221, paidAt: T2, appliedDiscountId: 'd1', discountReservation: 'consumed' })],
    ['orders/ORD-489552', order({ paymentStatus: 'Pending', paidAt: undefined, totalAmount: 93, status: 'Received', discountReservation: 'held' })],
    ['orders/ORD-859925', order({ customerName: 'TEST E2E-kunde 2', paymentStatus: 'Failed', paidAt: undefined, status: 'Canceled', totalAmount: 93, discountReservation: 'released' })],
    ['orders/ORD-REAL', order({ customerName: 'Rigtig kunde', paidAt: REAL, totalAmount: 100 })],
    // Another brand's order pointing at the same customer id must never be read as this customer's history.
    ['orders/ORD-FOREIGN', order({ brandId: 'other', customerName: 'Rigtig kunde', paidAt: T2 + 5000, totalAmount: 50 })],
    [`orderNotificationJobs/${hashId(['order-confirmation', BRAND, 'ORD-385369'])}`, { orderId: 'ORD-385369' }],
    ['analytics_events/e1', { orderId: 'ORD-385369', brandId: BRAND }],
    ['analytics_events/e2', { orderId: 'ORD-REAL', brandId: BRAND }],
    // Another brand reused the same six-digit order reference.
    ['analytics_events/e3', { orderId: 'ORD-385369', brandId: 'other' }],
    ['upsells/u1', { brandId: BRAND, locationIds: ['l1'], conversions: 3 }],
    ['upsells/u-other-location', { brandId: BRAND, locationIds: ['l2'], conversions: 3 }],
    ['upsells/u-other-brand', { brandId: 'other', locationIds: ['l1'], conversions: 3 }],
    // Real order 100 + test orders 172 + 221 (one with discount d1), plus one held pickup order.
    ['customers/c1', { brandId: BRAND, totalOrders: 3, totalSpend: 493, lastOrderDate: T2, discountUsage: { d1: 2 }, name: 'x' }],
    [capacity.customer, { paid: 3, held: 1, firstTimeHeld: false }],
    [capacity.discount, { paid: 5, held: 0 }],
    [capacity.pair, { paid: 2, held: 0 }],
    ['discounts/d1', { brandId: BRAND, usedCount: 5 }],
  ]);
}
async function run(db) { for (const item of await plan(db)) await applyItem(db, item); }

test('deletes only the listed test orders and undoes totals, capacity, discount usage and last order date', async () => {
  const db = memoryDb(seed());
  const items = await plan(db);
  assert.equal(JSON.stringify(items).includes('okh@'), false, 'no personal data in the logged plan');
  await run(db);
  for (const id of ['ORD-385369', 'ORD-389910', 'ORD-489552', 'ORD-859925']) assert.equal(db.rows.has(`orders/${id}`), false);
  assert.equal(db.rows.has('orders/ORD-REAL'), true);
  assert.equal(db.rows.has(`orderNotificationJobs/${hashId(['order-confirmation', BRAND, 'ORD-385369'])}`), false);
  assert.equal(db.rows.has('analytics_events/e1'), false);
  assert.equal(db.rows.has('analytics_events/e2'), true);
  assert.equal(db.rows.has('analytics_events/e3'), true, 'another brand\'s event with the same order reference stays');
  assert.equal(db.rows.get('upsells/u1').conversions, 2);
  assert.equal(db.rows.get('upsells/u-other-location').conversions, 3, 'settlement never counted it');
  assert.equal(db.rows.get('upsells/u-other-brand').conversions, 3);
  const customer = db.rows.get('customers/c1');
  assert.deepEqual({ ...customer, lastOrderDate: undefined }, { brandId: BRAND, totalOrders: 1, totalSpend: 100, discountUsage: { d1: 1 }, name: 'x', lastOrderDate: undefined });
  assert.equal(new Date(customer.lastOrderDate).getTime(), REAL, 'falls back to the real paid order');
  assert.deepEqual(db.rows.get(capacity.customer), { paid: 1, held: 0, firstTimeHeld: false }, 'two paid and one held test order');
  assert.deepEqual(db.rows.get(capacity.discount), { paid: 4, held: 0 });
  assert.deepEqual(db.rows.get(capacity.pair), { paid: 1, held: 0 });
  assert.equal(db.rows.get('discounts/d1').usedCount, 4);
});

test('a newer real order keeps its last order date, and a customer with no other paid order gets none', async () => {
  const newer = memoryDb(seed());
  newer.rows.get('customers/c1').lastOrderDate = T2 + 1000;
  await run(newer);
  assert.equal(newer.rows.get('customers/c1').lastOrderDate, T2 + 1000);
  const only = memoryDb(seed());
  only.rows.delete('orders/ORD-REAL');
  await run(only);
  assert.equal(only.rows.get('customers/c1').lastOrderDate, null);
});

test('is idempotent: a second run plans nothing and changes nothing', async () => {
  const db = memoryDb(seed());
  await run(db);
  const after = structuredClone([...db.rows]);
  assert.deepEqual(await plan(db), []);
  await run(db);
  assert.deepEqual([...db.rows], after);
});

test('refuses foreign orders and customers, game vouchers, and orders changed after the preview', async () => {
  const foreign = memoryDb(new Map([['orders/ORD-385369', order({ customerName: 'Rigtig kunde' })]]));
  await assert.rejects(plan(foreign), /not the Esmeralda test order/);
  // Each order must carry its own test name, not just any test name.
  const swapped = memoryDb(new Map([['orders/ORD-385369', order({ customerName: 'TEST E2E-kunde 2' })]]));
  await assert.rejects(plan(swapped), /not the Esmeralda test order/);
  const voucher = memoryDb(new Map([['orders/ORD-385369', order({ appliedDiscountId: 'game_v1' })]]));
  await assert.rejects(plan(voucher), /game voucher/);
  const otherBrand = memoryDb(seed());
  otherBrand.rows.get('customers/c1').brandId = 'other';
  await assert.rejects(plan(otherBrand), /outside Esmeralda/);
  const otherDiscount = memoryDb(seed());
  otherDiscount.rows.get('discounts/d1').brandId = 'other';
  await assert.rejects(plan(otherDiscount), /discount outside Esmeralda/);

  for (const change of [{ customerName: 'Rigtig kunde' }, { customerDetails: { id: 'c2' } }, { paymentStatus: 'Refunded' }, { appliedDiscountId: 'd2' }, { verifiedUpsellIds: ['u9'] }]) {
    const db = memoryDb(seed());
    const [first] = await plan(db);
    Object.assign(db.rows.get('orders/ORD-385369'), change);
    await assert.rejects(applyItem(db, first), /changed since the preview/);
    assert.equal(db.rows.has('orders/ORD-385369'), true);
  }
  // The customer moved to another brand between preview and apply: nothing is written.
  const moved = memoryDb(seed());
  const [first] = await plan(moved);
  moved.rows.get('customers/c1').brandId = 'other';
  const before = structuredClone([...moved.rows]);
  await assert.rejects(applyItem(moved, first), /outside Esmeralda/);
  assert.deepEqual([...moved.rows], before);
  // An offer's location scope changed between preview and apply: nothing is written.
  for (const locationIds of [['l2'], ['l1']]) {
    const rescoped = memoryDb(seed());
    const planned = (await plan(rescoped)).find(item => item.orderId === 'ORD-385369' && item.kind === 'order');
    assert.deepEqual(planned.upsellsCounted, ['u1']);
    rescoped.rows.get(locationIds[0] === 'l2' ? 'upsells/u1' : 'upsells/u-other-location').locationIds = locationIds;
    const unchanged = structuredClone([...rescoped.rows]);
    await assert.rejects(applyItem(rescoped, planned), /upsell scope changed/);
    assert.deepEqual([...rescoped.rows], unchanged);
  }
  // The discount moved to another brand between preview and apply: nothing is written.
  const movedDiscount = memoryDb(seed());
  const items = await plan(movedDiscount);
  movedDiscount.rows.get('discounts/d1').brandId = 'other';
  const untouched = structuredClone([...movedDiscount.rows]);
  await assert.rejects(applyItem(movedDiscount, items.find(item => item.orderId === 'ORD-389910' && item.kind === 'order')), /discount outside Esmeralda/);
  assert.deepEqual([...movedDiscount.rows], untouched);
});
