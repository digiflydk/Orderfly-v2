const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { kitchenPrintEligibility, printJobId } = loadTs('src/lib/printing/domain.ts');
const printer = { id: 'p', brandId: 'b', locationId: 'l', name: 'Pizza', manufacturer: 'star', model: 'mc-print2', transport: 'cloudprnt-http', state: 'active', paperWidthMm: 80 };
const order = { id: 'ORD-1', brandId: 'b', locationId: 'l', status: 'Received', paymentStatus: 'Paid', paymentMethod: 'Stripe', deliveryType: 'Pickup' };
const identity = { brandId: 'b', locationId: 'l', orderId: 'ORD-1', printerId: 'p', kind: 'kitchen', revision: 0 };

test('only production orders with eligible server payment state can enter the kitchen', () => {
  for (const status of ['Received', 'In Progress', 'Ready']) {
    for (const deliveryType of ['Pickup', 'Delivery']) {
      assert.deepEqual(kitchenPrintEligibility({ ...order, status, deliveryType }, printer), { eligible: true });
    }
  }
  for (const status of ['Pending', 'Canceled', 'Error', 'Completed', 'Delivered', '', 'accepted']) {
    assert.equal(kitchenPrintEligibility({ ...order, status }, printer).reason, 'order_not_in_production');
  }
  for (const patch of [{ paymentStatus: 'Pending' }, { paymentStatus: 'Failed' }, { paymentStatus: 'unknown' }, { paymentMethod: 'Cash' }, { paymentMethod: 'Other' }, { deliveryType: 'unknown' }]) {
    assert.equal(kitchenPrintEligibility({ ...order, ...patch }, printer).reason, 'payment_not_eligible');
  }
});

test('accepted unpaid pickup can print; later payment has the same original job identity', () => {
  const pickup = { ...order, paymentMethod: 'PayAtPickup', paymentStatus: 'Pending', discountReservation: 'held' };
  assert.deepEqual(kitchenPrintEligibility(pickup, printer), { eligible: true });
  assert.deepEqual(kitchenPrintEligibility({ ...pickup, paymentStatus: 'Paid', discountReservation: 'consumed' }, printer), { eligible: true });
  const key = current => printJobId({ ...identity, orderId: current.id });
  assert.equal(key(pickup), key({ ...pickup, paymentStatus: 'Paid' }));
  for (const patch of [{ discountReservation: 'released' }, { discountReservation: undefined }, { deliveryType: 'Delivery' }, { psp: { checkoutSessionId: 'cs' } }, { paymentStatus: 'Failed' }]) {
    assert.equal(kitchenPrintEligibility({ ...pickup, ...patch }, printer).eligible, false);
  }
});

test('scope boundaries and unavailable printers fail closed', () => {
  for (const field of ['brandId', 'locationId']) {
    assert.equal(kitchenPrintEligibility(order, { ...printer, [field]: 'another' }).reason, 'scope_mismatch');
    for (const invalid of ['', undefined, '../other', 'a/b', 'a b', 'x'.repeat(129)]) {
      assert.equal(kitchenPrintEligibility({ ...order, [field]: invalid }, printer).reason, 'invalid_scope');
      assert.equal(kitchenPrintEligibility(order, { ...printer, [field]: invalid }).reason, 'invalid_scope');
    }
  }
  for (const state of ['paused', 'disabled', undefined, 'unknown']) {
    assert.equal(kitchenPrintEligibility(order, { ...printer, state }).reason, 'printer_inactive');
  }
});

test('job keys deduplicate repeated delivery but separate every routing dimension', () => {
  const key = printJobId(identity);
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.equal(key, printJobId({ ...identity }));
  for (const patch of [{ brandId: 'other' }, { locationId: 'other' }, { orderId: 'other' }, { printerId: 'other' }, { kind: 'packing' }, { revision: 1 }]) {
    assert.notEqual(key, printJobId({ ...identity, ...patch }));
  }
  assert.notEqual(printJobId({ ...identity, brandId: 'a-b', locationId: 'c' }), printJobId({ ...identity, brandId: 'a', locationId: 'b-c' }));
  for (const revision of [-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '0', undefined]) {
    assert.throws(() => printJobId({ ...identity, revision }), /Invalid print job identity/);
  }
  for (const field of ['brandId', 'locationId', 'orderId', 'printerId']) {
    assert.throws(() => printJobId({ ...identity, [field]: 'a/b' }), /Invalid print job identity/);
  }
  assert.throws(() => printJobId({ ...identity, kind: 'unknown' }), /Invalid print job identity/);
});
