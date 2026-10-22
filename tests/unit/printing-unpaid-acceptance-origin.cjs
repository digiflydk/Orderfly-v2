const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { loadTs } = require('../helpers/load-ts.cjs');
const { memoryDb } = require('../helpers/marketing-db.cjs');
const { checkout } = require('../helpers/checkout-fixture.cjs');
const input = { orderId: 'order', brandId: 'brand', locationId: 'location', selection: 'asap' };
const order = () => ({ id: 'order', brandId: 'brand', locationId: 'location', status: 'Pending', paymentStatus: 'Pending',
  paymentMethod: 'PayAtPickup', deliveryType: 'Pickup', discountReservation: 'held', customerContact: 'PRIVATE_CUSTOMER' });
const location = () => ({ brandId: 'brand', isActive: true, paymentMethods: { online: true, payAtPickup: true },
  deliveryTypes: ['pickup'], allowPreOrder: true, prep_time: 20, delivery_time: 20,
  openingHours: Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day => [day, { isOpen: true, open: '00:00', close: '23:59' }])) });
function fixture() {
  const rows = new Map([['orders/order', order()], ['locations/location', location()]]), db = memoryDb(rows), calls = [];
  const api = loadTs('src/lib/server/accept-pickup-checkout.ts', { 'server-only': {},
    '@/lib/firebase-admin': { getAdminDb: () => db, getAdminFieldValue: () => ({ serverTimestamp: () => 'SERVER_TIMESTAMP' }) } });
  const transact = (run, { failSet = false, failCommit = false, beforeRead } = {}) => db.runTransaction(async tx => {
    let writes = false;
    const native = { get: async ref => { assert.equal(writes, false); calls.push(['read', ref.path]); beforeRead?.(ref); return tx.get(ref); },
      update: (...args) => { writes = true; calls.push(['update', args[0].path]); return tx.update(...args); },
      set: (...args) => { writes = true; calls.push(['set', args[0].path]); if (failSet) throw Error('PRIVATE_NATIVE_SET'); return tx.set(...args); } };
    const result = await run(Object.freeze({ db, transaction: native }));
    if (failCommit) throw Error('PRIVATE_COMMIT');
    return result;
  });
  return { ...api, rows, db, calls, transact };
}
const safeReject = promise => assert.rejects(promise, error => error.code === 'pickup_order_rejected' && !/PRIVATE|SECRET/.test(error.message));

test('actual sole native acceptance owns exactly order/mail writes and immutable opaque capability', async () => {
  const f = fixture();
  await f.transact(async context => {
    const plan = await f.preparePickupCheckoutAcceptance(context, input);
    assert.equal(plan.writeCount, 2); assert.ok(Object.isFrozen(plan));
    assert.equal(JSON.stringify(plan.capability), '{}'); assert.ok(Object.isFrozen(plan.capability));
    const projection = f.readPickupAcceptanceCapability(context, plan.capability);
    assert.deepEqual(projection, { order: { id: 'order', brandId: 'brand', locationId: 'location', status: 'Received',
      paymentStatus: 'Pending', paymentMethod: 'PayAtPickup', deliveryType: 'Pickup', discountReservation: 'held' }, writeCount: 2, replay: false, acceptanceApplied: false });
    assert.ok(Object.isFrozen(projection) && Object.isFrozen(projection.order));
    assert.doesNotMatch(JSON.stringify(projection), /PRIVATE|customer|token|secret|dispatch/);
    assert.throws(() => f.readPickupAcceptanceCapability(context, plan.capability, true), /Unverified/);
    assert.equal(f.rows.get('orders/order').status, 'Pending');
    plan.apply(); assert.equal(f.readPickupAcceptanceCapability(context, plan.capability, true).acceptanceApplied, true);
    assert.throws(() => plan.apply(), /already applied/);
  });
  const accepted = f.rows.get('orders/order');
  assert.equal(accepted.status, 'Received'); assert.equal(accepted.paymentStatus, 'Pending');
  assert.equal(accepted.acceptedAt, 'SERVER_TIMESTAMP'); assert.equal(accepted.customerContact, 'PRIVATE_CUSTOMER');
  const key = createHash('sha256').update(JSON.stringify(['pickup-received', 'brand', 'order'])).digest('hex');
  const mail = f.rows.get('orderNotificationJobs/' + key);
  assert.equal(mail.kind, 'pickupReceived'); assert.equal(mail.state, 'pending'); assert.equal(mail.attempts, 0);
  assert.match(mail.eventId, /^[a-f0-9-]{36}$/); assert.equal(mail.createdAt, mail.nextAttemptAt);
  assert.deepEqual(f.calls.map(c => c[0]), ['read','read','update','set']);
  assert.equal(f.rows.size, 3, 'no queue, manifest, financial or activity writes');
});

test('strict caller input cannot supply identity, next-order state, booleans or arbitrary writer', async () => {
  for (const invalid of [null, [], {}, Object.create(input), { ...input, accepted: true }, { ...input, identity: {} }, { ...input, order: order() },
    { ...input, apply() {} }, { ...input, orderId: '../order' }, { ...input, orderId: 'a'.repeat(1000000) },
    { ...input, selection: 'a'.repeat(65) }, { ...input, selection: false }]) {
    const f = fixture(); await safeReject(f.transact(c => f.preparePickupCheckoutAcceptance(c, invalid)));
    assert.deepEqual(f.calls, []); assert.equal(f.rows.get('orders/order').status, 'Pending');
  }
  const f = fixture(), poison = { ...input };
  Object.defineProperty(poison, 'orderId', { get() { throw Error('SECRET_GETTER'); } });
  await safeReject(f.transact(c => f.preparePickupCheckoutAcceptance(c, poison))); assert.deepEqual(f.calls, []);
});

test('forged, serialized, other-module and cross-attempt capabilities cannot assert real acceptance', async () => {
  const f = fixture(), other = fixture();
  let foreign;
  await other.transact(async c => { foreign = (await other.preparePickupCheckoutAcceptance(c, input)).capability; });
  await f.transact(async c => {
    const plan = await f.preparePickupCheckoutAcceptance(c, input);
    for (const capability of [null, {}, { order: order() }, foreign, JSON.parse(JSON.stringify(plan.capability))])
      assert.throws(() => f.readPickupAcceptanceCapability(c, capability), /Unverified/);
    assert.throws(() => f.readPickupAcceptanceCapability({ ...c }, plan.capability), /Unverified/);
    assert.throws(() => f.readPickupAcceptanceCapability({ ...c, db: other.db }, plan.capability), /Unverified/);
  });
  for (const c of [null, {}, { db: other.db, transaction: {} }]) await assert.rejects(f.preparePickupCheckoutAcceptance(c, input), /unavailable/);
  assert.equal(f.rows.get('orders/order').status, 'Pending');
});

test('current native order eligibility and scoped identity reject Paid, foreign, refunded and already accepted rows', async () => {
  for (const patch of [{ id: 'foreign' }, { brandId: 'foreign' }, { locationId: 'foreign' }, { status: 'Received' },
    { status: 'Canceled' }, { status: 'Ready' }, { paymentStatus: 'Paid' }, { paymentStatus: 'Failed' },
    { paymentMethod: 'Stripe' }, { deliveryType: 'Delivery' }, { discountReservation: 'released' },
    { discountReservation: undefined }, { psp: {} }, { psp: false }, { paymentCollection: {} },
    { refundedAmountOre: 1 }, { refundedAmount: 0.01 }, { refundedAt: '2026-10-22' },
    { deleted: true }, { isDeleted: true }, { deletedAt: '2026-10-22' }]) {
    const f = fixture(); f.rows.set('orders/order', { ...order(), ...patch });
    await safeReject(f.transact(c => f.preparePickupCheckoutAcceptance(c, input)));
    assert.equal(f.calls.some(c => c[0] !== 'read'), false); assert.equal(f.rows.size, 2);
  }
  const f = fixture(); f.rows.delete('orders/order'); await safeReject(f.transact(c => f.preparePickupCheckoutAcceptance(c, input)));
});

test('current native location reassignment, deletion, disabled pickup and changed slots reject before writes', async () => {
  for (const patch of [{ id: 'foreign' }, { brandId: 'foreign' }, { deleted: true }, { isDeleted: true },
    { deletedAt: '2026-10-22' }, { isActive: false }, { deliveryTypes: ['delivery'] },
    { paymentMethods: { online: true, payAtPickup: false } }, { openingHours: {} }]) {
    const f = fixture(); f.rows.set('locations/location', { ...location(), ...patch });
    await safeReject(f.transact(c => f.preparePickupCheckoutAcceptance(c, input)));
    assert.equal(f.calls.some(c => c[0] !== 'read'), false); assert.equal(f.rows.get('orders/order').status, 'Pending');
  }
  const f = fixture(); f.rows.delete('locations/location'); await safeReject(f.transact(c => f.preparePickupCheckoutAcceptance(c, input)));
  const g = fixture(); await safeReject(g.transact(c => g.preparePickupCheckoutAcceptance(c, { ...input, selection: '2020-01-01T10:00:00.000Z' })));
});

test('native errors remain unknown outcome, late apply/commit failure rolls back both records and invalidates failed plan', async () => {
  const f = fixture(); let context, capability;
  await assert.rejects(f.transact(async c => { context = c; const plan = await f.preparePickupCheckoutAcceptance(c, input);
    capability = plan.capability; plan.apply(); }, { failSet: true }), /PRIVATE_NATIVE_SET/);
  assert.equal(f.rows.get('orders/order').status, 'Pending'); assert.equal(f.rows.size, 2);
  assert.throws(() => f.readPickupAcceptanceCapability(context, capability), /expired/);
  const g = fixture(); await assert.rejects(g.transact(async c => { (await g.preparePickupCheckoutAcceptance(c, input)).apply(); }, { failCommit: true }), /PRIVATE_COMMIT/);
  assert.equal(g.rows.get('orders/order').status, 'Pending'); assert.equal(g.rows.size, 2);
  const h = fixture(); await assert.rejects(h.transact(c => h.preparePickupCheckoutAcceptance(c, input), { beforeRead() { throw Error('PRIVATE_READ'); } }), e => e.code === undefined);
});

test('each transaction retry rebuilds from native state; discarded attempt cannot make acceptance true', async () => {
  const f = fixture();
  await assert.rejects(f.transact(async c => { (await f.preparePickupCheckoutAcceptance(c, input)).apply(); throw Error('RETRY_DISCARD'); }), /RETRY_DISCARD/);
  assert.equal(f.rows.get('orders/order').status, 'Pending'); assert.equal(f.rows.size, 2);
  f.rows.get('locations/location').brandId = 'foreign';
  await safeReject(f.transact(c => f.preparePickupCheckoutAcceptance(c, input)));
  assert.equal(f.rows.get('orders/order').status, 'Pending');
  f.rows.set('locations/location', location());
  await f.transact(async c => (await f.preparePickupCheckoutAcceptance(c, input)).apply());
  await safeReject(f.transact(c => f.preparePickupCheckoutAcceptance(c, input)));
  assert.equal(f.rows.size, 3, 'replay cannot replace mail or reaccept');
});

test('clock expiry/backwards movement irreversibly invalidates capability without caller timestamps', async () => {
  const actual = Date.now; let now = actual(); Date.now = () => now;
  try {
    for (const change of [n => n + 300000, n => n - 1, () => NaN]) {
      const f = fixture(); now = actual();
      await f.transact(async c => {
        const plan = await f.preparePickupCheckoutAcceptance(c, input), issued = now;
        now = change(now); assert.throws(() => f.readPickupAcceptanceCapability(c, plan.capability));
        now = issued + 1; assert.throws(() => plan.apply(), /expired/);
      });
      assert.equal(f.rows.get('orders/order').status, 'Pending'); assert.equal(f.rows.size, 2);
    }
  } finally { Date.now = actual; }
});

test('clock reversal or expiry during current native reads cannot mint a plan', async () => {
  const actual = Date.now; let now = actual(); Date.now = () => now;
  try {
    for (const offset of [-1, 300000]) {
      const f = fixture(); now = actual(); let moved = false;
      await assert.rejects(f.transact(c => f.preparePickupCheckoutAcceptance(c, input), { beforeRead() {
        if (!moved) { now += offset; moved = true; }
      } }), /unavailable/);
      assert.equal(f.rows.get('orders/order').status, 'Pending'); assert.equal(f.calls.some(c => c[0] !== 'read'), false);
    }
  } finally { Date.now = actual; }
});

test('actual checkout action uses the real closed native writer and keeps response, reservation and received mail', async () => {
  const f = await checkout({ realReservations: true, kind: 'code', locationOverrides: { paymentMethods: { online: true, payAtPickup: true } },
    customerOverrides: { paymentMethod: 'pay_at_pickup' } });
  assert.equal(f.result.success, true, f.result.error);
  assert.equal(f.records.get('orders/ORD-TEST').status, 'Received');
  assert.equal(f.records.get('orders/ORD-TEST').paymentStatus, 'Pending');
  assert.equal(f.records.get('orders/ORD-TEST').discountReservation, 'held');
  assert.equal(f.events.includes('stripe'), false); assert.equal([...f.records.keys()].filter(k => k.startsWith('orderNotificationJobs/')).length, 1);
  assert.match(f.result.url, /confirmation\?order_id=ORD-TEST&receipt_token=/);
  assert.doesNotMatch(JSON.stringify(f.result), /capability|acceptanceApplied|writeCount/);
});

async function checkoutWithTenantIds(brandId, locationId) {
  const f = await checkout({ createOnly: true, realReservations: true,
    brandOverrides: { id: brandId },
    locationOverrides: { id: locationId, brandId, paymentMethods: { online: true, payAtPickup: true } } });
  const brand = f.records.get('brands/b'), nativeLocation = f.records.get('locations/l');
  f.records.delete('brands/b'); f.records.delete('locations/l');
  f.records.set('brands/' + brandId, brand); f.records.set('locations/' + locationId, nativeLocation);
  f.records.set('products/p', { ...f.records.get('products/p'), brandId, locationIds: [locationId] });
  const result = await f.actions.createStripeCheckoutSessionAction(
    [{ id: 'p', name: 'Pizza', quantity: 1, unitPrice: 100, totalPrice: 100 }],
    { name: 'Test', email: 'test@example.test', phone: '12345678', subscribeToNewsletter: false,
      acceptTerms: true, paymentMethod: 'pay_at_pickup' },
    'pickup', brandId, locationId,
    { subtotal: 100, deliveryFee: 0, discountTotal: 0, tips: 0, taxes: 0, bagFee: 4 },
    null, 'brand', 'location');
  return { ...f, result };
}

test('actual checkout preserves dot and 129–160 character tenant IDs when print intents are OFF', async () => {
  const previous = process.env.ORDERFLY_PRINT_INTENTS_ENABLED;
  process.env.ORDERFLY_PRINT_INTENTS_ENABLED = 'false';
  try {
    for (const field of ['brandId', 'locationId']) for (const value of ['tenant.example', 'tenant ø.中 value', 't'.repeat(129), 't'.repeat(160)]) {
      const brandId = field === 'brandId' ? value : 'brand', locationId = field === 'locationId' ? value : 'location';
      const f = await checkoutWithTenantIds(brandId, locationId);
      assert.equal(f.result.success, true, `${field}/${value.length}: ${f.result.error}`);
      const saved = f.records.get('orders/ORD-TEST');
      assert.equal(saved.status, 'Received'); assert.equal(saved.paymentStatus, 'Pending');
      assert.equal(saved.brandId, brandId); assert.equal(saved.locationId, locationId);
      assert.equal(saved.discountReservation, 'held'); assert.equal(f.events.includes('stripe'), false);
      const mail = [...f.records].filter(([key]) => key.startsWith('orderNotificationJobs/'));
      assert.equal(mail.length, 1); assert.equal(mail[0][1].brandId, brandId); assert.equal(mail[0][1].locationId, locationId);
    }
  } finally {
    if (previous === undefined) delete process.env.ORDERFLY_PRINT_INTENTS_ENABLED;
    else process.env.ORDERFLY_PRINT_INTENTS_ENABLED = previous;
  }
});

test('checkout and the native acceptance boundary reject unsafe or over-160 tenant IDs before acceptance', async () => {
  for (const field of ['brandId', 'locationId']) for (const value of ['', 'a/b', 'a\\b', 'a?b', 'a#b', 't'.repeat(161)]) {
    const f = fixture();
    await safeReject(f.transact(c => f.preparePickupCheckoutAcceptance(c, { ...input, [field]: value })));
    assert.deepEqual(f.calls, []); assert.equal(f.rows.get('orders/order').status, 'Pending');
    const actual = await checkoutWithTenantIds(field === 'brandId' ? value : 'brand', field === 'locationId' ? value : 'location');
    assert.equal(actual.result.success, false, `${field}/${JSON.stringify(value)} must reject`);
    assert.equal(actual.records.has('orders/ORD-TEST'), false);
    assert.equal([...actual.records.keys()].some(key => key.startsWith('orderNotificationJobs/')), false);
  }
  // Order IDs are generated internally (ORD-######), not tenant IDs supplied by checkout.
  const f = fixture();
  await safeReject(f.transact(c => f.preparePickupCheckoutAcceptance(c, { ...input, orderId: 'o'.repeat(129) })));
  assert.deepEqual(f.calls, []);
});

test('actual checkout callsite rereads pickup configuration after reservation and retains lost-outcome semantics', async () => {
  for (const unknown of [false, true]) {
    const f = await checkout({ realReservations: true,
      locationOverrides: { paymentMethods: { online: true, payAtPickup: true } }, customerOverrides: { paymentMethod: 'pay_at_pickup' },
      beforeCustomerTransaction(rows) {
        if (rows.get('orders/ORD-TEST')?.discountReservation !== 'held') return;
        if (unknown) throw Error('NATIVE_UNAVAILABLE');
        rows.get('locations/l').paymentMethods.payAtPickup = false;
      } });
    assert.equal(f.result.success, false);
    const saved = f.records.get('orders/ORD-TEST');
    assert.equal(saved.status, unknown ? 'Pending' : 'Canceled');
    assert.equal(saved.discountReservation, unknown ? 'held' : 'released');
    assert.equal([...f.records.keys()].some(k => k.startsWith('orderNotificationJobs/')), false);
    assert.equal(f.events.includes('stripe'), false);
  }
});
