const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');

const NOW = Date.parse('2026-10-01T10:00:00Z');
const at = minutesAgo => ({ toMillis: () => NOW - minutesAgo * 60 * 1000 });
const { reconcileStaleDiscountHolds } = loadTs('src/lib/server/stale-discount-holds.ts', {
  'server-only': {}, stripe: { default: class {} },
  '@/lib/firebase-admin': { getAdminDb: () => { throw Error('fixture db must be injected'); } },
  '@/lib/discount-reservations': { releaseDiscount: async () => { throw Error('fixture release must be injected'); } },
  '@/lib/server/payment-settings': { getActiveStripeSecretKey: async () => null },
  '@/lib/server/settle-checkout': { settlePaidCheckoutSession: async () => { throw Error('fixture settle must be injected'); } },
});

function fixture(orders, sessions) {
  const calls = { released: [], settled: [], retrieved: [], filters: [] };
  const query = filters => ({
    where: (field, op, value) => query([...filters, [field, op, value]]),
    limit: () => query(filters),
    get: async () => {
      calls.filters = filters;
      return { docs: Object.entries(orders)
        .filter(([, o]) => filters.every(([f, , v]) => o[f] === v))
        .map(([id, o]) => ({ id, data: () => o })) };
    },
  });
  const deps = {
    db: { collection: () => query([]) }, now: () => NOW, stripeKey: async () => 'sk_test',
    stripe: () => ({ checkout: { sessions: { retrieve: async id => { calls.retrieved.push(id); if (!sessions[id]) throw Error('stripe unavailable'); return sessions[id]; } } } }),
    release: async (...args) => { calls.released.push(args); },
    settle: async session => { calls.settled.push(session.id); },
  };
  return { calls, run: () => reconcileStaleDiscountHolds('esmeralda', 'O2', deps) };
}
const heldOrder = (extra = {}) => ({ brandId: 'esmeralda', locationId: 'amager', appliedDiscountId: 'O2', discountReservation: 'held',
  paymentMethod: 'Stripe', paymentStatus: 'Pending', psp: { checkoutSessionId: 'cs_old' }, createdAt: at(24 * 60), ...extra });
const meta = { orderId: 'ORD-374737', brandId: 'esmeralda', locationId: 'amager' };

test('#210 a Stripe-verified expired session releases its old hold before checkout rejects the code', async () => {
  const f = fixture({ 'ORD-374737': heldOrder() }, { cs_old: { id: 'cs_old', status: 'expired', payment_status: 'unpaid', metadata: meta } });
  assert.deepEqual(await f.run(), { inspected: 1, released: 1, settled: 0 });
  assert.deepEqual(f.calls.released, [['ORD-374737', 'esmeralda', 'cs_old', 'amager']]);
  assert.deepEqual(f.calls.filters.map(([field]) => field), ['brandId', 'appliedDiscountId', 'discountReservation', 'paymentMethod']);
});

test('#210 a paid session whose webhook was missed is settled, not released', async () => {
  const f = fixture({ 'ORD-374737': heldOrder() }, { cs_old: { id: 'cs_old', status: 'complete', payment_status: 'paid', metadata: meta } });
  assert.deepEqual(await f.run(), { inspected: 1, released: 0, settled: 1 });
  assert.deepEqual(f.calls.released, []);
});

test('#210 open, young, pickup, foreign-scope and unreachable sessions keep their hold', async () => {
  const f = fixture({
    'ORD-OPEN': heldOrder({ psp: { checkoutSessionId: 'cs_open' } }),
    'ORD-YOUNG': heldOrder({ psp: { checkoutSessionId: 'cs_young' }, createdAt: at(20) }),
    'ORD-PICKUP': heldOrder({ paymentMethod: 'PayAtPickup', psp: { checkoutSessionId: 'cs_pickup' } }),
    'ORD-FOREIGN': heldOrder({ psp: { checkoutSessionId: 'cs_foreign' } }),
    'ORD-DOWN': heldOrder({ psp: { checkoutSessionId: 'cs_down' } }),
    'ORD-NOSESSION': heldOrder({ psp: { provider: 'stripe' } }),
  }, {
    cs_open: { id: 'cs_open', status: 'open', payment_status: 'unpaid', metadata: { ...meta, orderId: 'ORD-OPEN' } },
    cs_young: { id: 'cs_young', status: 'expired', payment_status: 'unpaid', metadata: { ...meta, orderId: 'ORD-YOUNG' } },
    cs_foreign: { id: 'cs_foreign', status: 'expired', payment_status: 'unpaid', metadata: { ...meta, orderId: 'ORD-FOREIGN', brandId: 'other' } },
  });
  const result = await f.run();
  assert.equal(result.released, 0);
  assert.equal(result.settled, 0);
  assert.deepEqual(f.calls.retrieved.sort(), ['cs_down', 'cs_foreign', 'cs_open']);
});

test('#210 no Stripe key or a failing order query leaves every hold untouched', async () => {
  const f = fixture({ 'ORD-374737': heldOrder() }, {});
  const { calls } = f;
  assert.deepEqual(await reconcileStaleDiscountHolds('esmeralda', 'O2', { db: { collection: () => ({ where() { return this; }, limit() { return this; }, get: async () => { throw Error('index'); } }) }, now: () => NOW }), { inspected: 0, released: 0, settled: 0 });
  assert.deepEqual(calls.released, []);
});

test('#210 an unresponsive Stripe is bounded by the reconciliation budget', async () => {
  let clock = NOW;
  const orders = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`ORD-${i}`, heldOrder({ psp: { checkoutSessionId: `cs_${i}` } })]));
  const f = fixture(orders, {});
  const retrieved = [];
  const result = await reconcileStaleDiscountHolds('esmeralda', 'O2', {
    db: { collection: () => ({ where() { return this; }, limit() { return this; },
      get: async () => ({ docs: Object.entries(orders).map(([id, o]) => ({ id, data: () => o })) }) }) },
    now: () => clock, stripeKey: async () => 'sk_test',
    stripe: () => ({ checkout: { sessions: { retrieve: async id => { retrieved.push(id); clock += 4000; throw Error('timeout'); } } } }),
    release: async () => assert.fail('must not release'), settle: async () => assert.fail('must not settle'),
  });
  // Each simulated call consumes 4 s of the 6 s budget: two calls, then stop.
  assert.equal(retrieved.length, 2);
  assert.deepEqual(result, { inspected: 2, released: 0, settled: 0 });
  assert.equal(f.calls.released.length, 0);
});
