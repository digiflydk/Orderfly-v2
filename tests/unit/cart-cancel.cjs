const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { loadTs } = require('../helpers/load-ts.cjs');

async function fixture() {
  const token = 'a'.repeat(64), data = new Map();
  const session = { status: 'open', payment_status: 'unpaid', metadata: { orderId: 'ORD-ONE', brandId: 'b', locationId: 'l' } };
  const snapshot = ref => ({ exists: () => data.has(ref), data: () => data.get(ref) });
  const sdk = {
    doc: (_, collection, id) => `${collection}/${id}`, getDoc: async ref => snapshot(ref),
    runTransaction: async (_, callback) => callback({ get: async ref => snapshot(ref), set: (ref, value) => data.set(ref, value), update: (ref, value) => data.set(ref, { ...data.get(ref), ...value }) }),
  };
  const mocks = { '@/lib/firebase': { db: {} }, 'firebase/firestore': sdk };
  const reservations = loadTs('src/lib/discount-reservations.ts', mocks);
  data.set('customers/c', { brandId: 'b', totalOrders: 0 });
  data.set('discounts/d', { brandId: 'b', isActive: true, usageLimit: 1, perCustomerLimit: 1, usedCount: 0 });
  const order = { brandId: 'b', locationId: 'l', customerDetails: { id: 'c' }, appliedDiscountId: 'd', paymentStatus: 'Pending', psp: { checkoutSessionId: 'cs_one' }, cancelTokenHash: createHash('sha256').update(token).digest('hex') };
  data.set('orders/ORD-ONE', order);
  await reservations.reserveDiscount('ORD-ONE', 'd', 'c', 'b');
  let expires = 0, fail = false;
  const api = loadTs('src/app/checkout/cancel-actions.ts', { ...mocks,
    '@/lib/discount-reservations': reservations,
    '@/app/superadmin/settings/actions': { getActiveStripeSecretKey: async () => 'fixture' },
    stripe: { default: class Stripe { checkout = { sessions: {
      retrieve: async () => session,
      expire: async () => { expires++; if (fail) throw Error('provider unavailable'); session.status = 'expired'; return session; },
    } }; } },
  });
  return { data, order, session, token, api, reservations, expires: () => expires, fail: () => { fail = true; } };
}

test('cancel expires first, releases once, and permits a fresh order to reserve the same limited discount', async () => {
  const f = await fixture();
  assert.equal((await f.api.cancelCheckout('ORD-ONE', f.token)).status, 'canceled');
  assert.equal((await f.api.cancelCheckout('ORD-ONE', f.token)).status, 'canceled');
  assert.equal(f.expires(), 1); assert.equal(f.data.get('orders/ORD-ONE').discountReservation, 'released');
  for (const [key, value] of f.data) if (key.startsWith('checkout_')) { assert.equal(value.held, 0); assert.equal(value.paid, 0); }
  f.data.set('orders/ORD-TWO', { ...f.order, psp: { checkoutSessionId: 'cs_two' } });
  await f.reservations.reserveDiscount('ORD-TWO', 'd', 'c', 'b');
  assert.equal(f.data.get('orders/ORD-TWO').discountReservation, 'held');
  for (const [key, value] of f.data) if (key.startsWith('checkout_')) assert.equal(value.held, 1);
});

test('unconfirmed cancellation, wrong token/scope and paid sessions never free an active reservation', async () => {
  for (const variant of ['failure', 'token', 'scope', 'paid']) {
    const f = await fixture();
    if (variant === 'failure') f.fail();
    if (variant === 'scope') f.session.metadata.brandId = 'other';
    if (variant === 'paid') { f.session.status = 'complete'; f.session.payment_status = 'paid'; }
    const result = await f.api.cancelCheckout('ORD-ONE', variant === 'token' ? 'b'.repeat(64) : f.token);
    assert.equal(result.status, variant === 'paid' ? 'paid' : 'error');
    assert.equal(f.data.get('orders/ORD-ONE').discountReservation, 'held');
  }
});
