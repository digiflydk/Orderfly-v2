const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { checkout } = require('../helpers/checkout-fixture.cjs');
const { paymentFixture, actorId } = require('../helpers/merchant-payment-fixture.cjs');
const { createHash } = require('node:crypto');
const methods = loadTs('src/lib/merchant-payment-methods.ts');
const capacityKey = parts => createHash('sha256').update(JSON.stringify(parts)).digest('hex');

test('existing locations migrate lazily to online-only and empty/malformed settings cannot be saved', () => {
  assert.deepEqual(methods.availableCheckoutMethods({}, 'pickup'), ['online']);
  assert.deepEqual(methods.availableCheckoutMethods({}, 'delivery'), ['online']);
  for (const value of [{ online: false, payAtPickup: false }, { online: 'true', payAtPickup: false }, { online: false }, { online: true, payAtPickup: false, foreign: true }]) assert.equal(methods.locationPaymentMethodsSchema.safeParse(value).success, false);
});

for (const config of [{ online: true, payAtPickup: false }, { online: false, payAtPickup: true }, { online: true, payAtPickup: true }, { online: false, payAtPickup: false }]) {
  for (const mode of ['pickup', 'delivery']) for (const selected of ['online', 'pay_at_pickup']) for (const kind of ['none', 'code']) {
    test(`checkout ${JSON.stringify(config)} / ${mode} / ${selected} / ${kind}`, async () => {
      const f = await checkout({ realReservations: true, kind, discountOrderTypes: ['pickup', 'delivery'],
        locationOverrides: { paymentMethods: config }, deliveryType: mode,
        customerOverrides: { paymentMethod: selected, street: 'Testvej 1', zipCode: '2300', city: 'København' } });
      const allowed = selected === 'online' ? config.online : config.payAtPickup && mode === 'pickup';
      assert.equal(f.result.success, allowed);
      assert.equal(f.events.includes('stripe'), allowed && selected === 'online');
      if (!allowed) { assert.equal([...f.records.keys()].some(key => key.startsWith('orders/')), false); return; }
      const order = f.records.get('orders/ORD-TEST');
      assert.equal(order.paymentStatus, 'Pending');
      assert.equal(order.status, selected === 'online' ? 'Pending' : 'Received');
      assert.equal(order.totalAmount, kind === 'code' ? 94 : 104);
      assert.equal(order.discountReservation, 'held');
      assert.equal(order.invoice, undefined);
      if (selected === 'pay_at_pickup') { assert.equal(order.psp, undefined); assert.equal(f.coupon, undefined); }
    });
  }
}

test('cash/card registration commits invoice, employee, promotion and KPI exactly once on concurrent/repeated requests', async () => {
  for (const method of ['cash', 'card']) {
    const f = await paymentFixture({ kind: 'code' });
    assert.equal(f.result.success, true);
    assert.deepEqual(f.kpis(), { count: 0, amount: 0 });
    const before = structuredClone(f.order().paymentDetails);
    assert.deepEqual(await Promise.all([f.pay(method), f.pay(method), f.pay(method)]), [true, false, false]);
    assert.equal(await f.pay(method === 'cash' ? 'card' : 'cash'), false);
    assert.deepEqual(f.kpis(), { count: 1, amount: 94 });
    assert.equal(f.order().paymentCollection.employeeId, actorId);
    assert.equal(f.order().paymentCollection.employeeName, 'Testmedarbejder');
    assert.equal(f.order().paymentCollection.method, method);
    assert.ok(Number.isFinite(Date.parse(f.order().paymentCollection.receivedAt)));
    assert.equal(f.order().invoice.paymentMethod, method === 'cash' ? 'Cash' : 'CardInRestaurant');
    assert.deepEqual(f.order().paymentDetails, before);
    assert.equal(f.records.get('discounts/d').usedCount, 1);
    assert.equal(f.records.get('customers/' + f.order().customerDetails.id).totalOrders, 1);
    assert.equal(f.order().discountReservation, 'consumed');
    assert.equal([...f.records.keys()].filter(key => key.startsWith('orderNotificationJobs/')).length, 1);
    assert.equal([...f.records.keys()].filter(key => key.startsWith('auditLogs/')).length, 1);
    await assert.rejects(f.cancel(), /betalt ordre/);
  }
});

test('cancel is idempotent, releases a reserved code and never increments paid sales or usage', async () => {
  const f = await paymentFixture({ kind: 'code' });
  const key = 'checkout_discount_capacity/' + capacityKey(['b', 'd']);
  assert.deepEqual(f.records.get(key), { paid: 0, held: 1 });
  assert.deepEqual(await Promise.all([f.cancel(), f.cancel()]), [true, false]);
  assert.deepEqual(f.records.get(key), { paid: 0, held: 0 });
  assert.deepEqual(f.kpis(), { count: 0, amount: 0 });
  assert.equal(f.records.get('discounts/d').usedCount, 0);
  assert.equal(f.order().status, 'Canceled');
  assert.equal(f.order().invoice, undefined);
  await assert.rejects(f.pay(), /godkendt|Canceled/);
  const next = await checkout({ realReservations: true, kind: 'code', orderId: 'ORD-SECOND', seed: [...f.records], locationOverrides: { paymentMethods: { online: false, payAtPickup: true } }, customerOverrides: { paymentMethod: 'pay_at_pickup' } });
  assert.equal(next.result.success, true);
});

test('a one-use code is blocked across pickup and online while held, then remains used after payment', async () => {
  const f = await paymentFixture({ kind: 'code' });
  for (const paymentMethod of ['online', 'pay_at_pickup']) {
    const other = await checkout({ realReservations: true, kind: 'code', seed: [...f.records], orderId: 'ORD-OTHER', locationOverrides: { paymentMethods: { online: true, payAtPickup: true } }, customerOverrides: { paymentMethod } });
    assert.equal(other.result.success, false); assert.equal(other.events.includes('stripe'), false);
  }
  await f.pay();
  const other = await checkout({ realReservations: true, kind: 'code', seed: [...f.records], orderId: 'ORD-OTHER', locationOverrides: { paymentMethods: { online: true, payAtPickup: true } }, customerOverrides: { paymentMethod: 'pay_at_pickup' } });
  assert.equal(other.result.success, false);
});

test('race between cancellation and payment has one authoritative outcome', async () => {
  for (const first of ['cancel', 'pay']) {
    const f = await paymentFixture({ kind: 'code' });
    const outcomes = await Promise.allSettled(first === 'cancel' ? [f.cancel(), f.pay()] : [f.pay(), f.cancel()]);
    assert.equal(outcomes[0].status, 'fulfilled'); assert.equal(outcomes[1].status, 'rejected');
    assert.deepEqual(f.kpis(), first === 'cancel' ? { count: 0, amount: 0 } : { count: 1, amount: 94 });
  }
});

test('foreign brand/location, revoked membership and read-only staff cannot collect or cancel payment or change settings', async () => {
  for (const fault of ['foreign', 'other-location', 'revoked', 'view-only']) {
    const f = await paymentFixture();
    if (fault === 'foreign') f.order().brandId = 'foreign';
    if (fault === 'other-location') f.order().locationId = 'other';
    if (fault === 'revoked') f.records.get('platformAdminControl/access-v1').memberships[0].active = false;
    if (fault === 'view-only') f.records.get('platformAdminControl/access-v1').roles[0].permissions = ['orderfly.orders:view', 'orderfly.catalog:view'];
    const before = structuredClone([...f.records]);
    await assert.rejects(f.pay(), /forbidden/); await assert.rejects(f.cancel(), /forbidden/);
    const location = fault === 'other-location' ? 'other' : 'l';
    if (fault === 'foreign') f.records.get('locations/l').brandId = 'foreign';
    if (fault === 'other-location') f.records.set('locations/other', { brandId: 'b', deliveryTypes: ['pickup'] });
    await assert.rejects(f.settings.updateMerchantPaymentMethods(location, { online: false, payAtPickup: true }), /forbidden/);
    assert.equal(f.kpis().count, 0); assert.equal(f.order().paymentCollection, undefined);
    assert.deepEqual([...f.records].filter(([key]) => !key.startsWith('locations/')), before.filter(([key]) => !key.startsWith('locations/')));
  }
});

test('configuration saves only for own location, preserves other settings and exposes only allowed locations', async () => {
  const f = await paymentFixture();
  f.records.set('locations/foreign', { brandId: 'foreign', name: 'Do not reveal' });
  const before = structuredClone(f.records.get('locations/l'));
  await f.settings.updateMerchantPaymentMethods('l', { online: false, payAtPickup: true });
  assert.deepEqual(f.records.get('locations/l'), { ...before, paymentMethods: { online: false, payAtPickup: true }, updatedAt: f.records.get('locations/l').updatedAt });
  const locations = await f.settings.merchantPaymentLocations();
  assert.equal(locations.length, 1); assert.equal(locations[0].id, 'l');
  await assert.rejects(f.settings.updateMerchantPaymentMethods('l', { online: false, payAtPickup: false }), /mindst én/);
});

test('Stripe settlement and failure events cannot touch a pickup order, and restaurant collection cannot touch Stripe', async () => {
  const f = await paymentFixture({ kind: 'code' });
  const session = { id: 'cs_test_mock', payment_status: 'paid', currency: 'dkk', amount_total: 9400, metadata: { orderId: f.orderId, brandId: 'b', locationId: 'l' } };
  await assert.rejects(f.settlement.settlePaidCheckoutSession(session), /scope mismatch/);
  const nativeOrder = structuredClone(f.order());
  const compat = { db: {}, doc: (_, c, id) => f.db.collection(c).doc(id), runTransaction: (_, run) => f.db.runTransaction(tx => run({ ...tx, get: async ref => { const snap = await tx.get(ref); return { exists: () => snap.exists, data: snap.data }; } })) };
  const release = loadTs('src/lib/discount-reservations.ts', { '@/lib/server/firestore-compat': compat }).releaseDiscount;
  await assert.rejects(release(f.orderId, 'b', session.id, 'l'), /scope mismatch/);
  assert.deepEqual(f.order(), nativeOrder);
  const online = await paymentFixture({ customerOverrides: { paymentMethod: 'online' } });
  await assert.rejects(online.pay(), /Kun afhentningsordrer/);
  await assert.rejects(online.cancel(), /kun betaling ved afhentning/);
});

test('production sales dashboard excludes accepted unpaid pickup and increases count/revenue once after payment', async () => {
  const f = await paymentFixture({ kind: 'code' });
  const read = () => f.sales.getSalesDashboardData({ dateFrom: '2026-01-01', dateTo: '2026-12-31', brandId: 'b', locationIds: ['l'] });
  const before = (await read()).kpis;
  assert.equal(before.totalOrders, 0); assert.equal(before.totalSales, 0); assert.equal(before.pendingOrders, 1); assert.equal(before.totalDiscounts, 0);
  await f.pay('card'); await f.pay('card');
  const after = (await read()).kpis;
  assert.equal(after.totalOrders, 1); assert.equal(after.totalSales, 94); assert.equal(after.pendingOrders, 0); assert.equal(after.totalDiscounts, 10);
  const canceled = await paymentFixture({ kind: 'code' }); await canceled.cancel();
  const final = (await canceled.sales.getSalesDashboardData({ dateFrom: '2026-01-01', dateTo: '2026-12-31' })).kpis;
  assert.equal(final.totalOrders, 0); assert.equal(final.totalSales, 0); assert.equal(final.canceledOrders, 1);
});

test('pickup receipt requires its scoped random capability and never discloses staff or connects to Stripe', async () => {
  const f = await paymentFixture({ kind: 'code' });
  const url = new URL(f.result.url), receiptToken = url.searchParams.get('receipt_token');
  const proof = { orderId: f.orderId, receiptToken, brandId: 'b', locationId: 'l' };
  assert.equal(url.searchParams.has('session_id'), false);
  const pending = await f.receipts.readGuestReceipt(proof);
  assert.equal(pending.paymentStatus, 'Pending'); assert.equal(pending.status, 'Received'); assert.equal(pending.totalAmount, 94);
  for (const patch of [{ receiptToken: undefined }, { receiptToken: 'a'.repeat(64) }, { brandId: 'foreign' }, { locationId: 'foreign' }, { sessionId: 'cs_test_unrelated' }]) assert.equal(await f.receipts.readGuestReceipt({ ...proof, ...patch }), null);
  await f.pay('card');
  const paid = await f.receipts.readGuestReceipt(proof);
  assert.deepEqual(paid.paymentCollection, { method: 'card' }); assert.equal(paid.invoice.paymentMethod, 'CardInRestaurant');
  for (const field of ['psp', 'receiptTokenHash', 'paymentRefId', 'employeeId', 'employeeName']) assert.equal(JSON.stringify(paid).includes(field), false);
});

test('pickup retry uses the existing encrypted checkout attempt and retains one order and one reservation', async () => {
  const f = await paymentFixture({ createOnly: true, kind: 'code' });
  const { runCheckoutAttempt } = loadTs('src/lib/checkout-attempt.ts', { '@/lib/server/firestore-compat': f.compat });
  let creations = 0;
  const input = [[{ id: 'p', name: 'Pizza', quantity: 1, unitPrice: 100, totalPrice: 100 }], { name: 'Test', email: 'test@example.test', phone: '12345678', acceptTerms: true, subscribeToNewsletter: false, paymentMethod: 'pay_at_pickup' }, 'pickup', 'b', 'l', { subtotal: 100, deliveryFee: 0, discountTotal: 0, tips: 0, taxes: 0, bagFee: 4 }, 'd', 'brand', 'location'];
  const key = 'checkout-pickup-retry-'.padEnd(64, 'k');
  const create = () => { creations++; return f.actions.createStripeCheckoutSessionAction(...input); };
  const first = await runCheckoutAttempt(key, input, create), retry = await runCheckoutAttempt(key, input, create);
  assert.equal(first.success, true, JSON.stringify(first)); assert.deepEqual(retry, first); assert.equal(creations, 1);
  assert.equal([...f.records.keys()].filter(key => key.startsWith('orders/')).length, 1);
  assert.equal(f.events.includes('stripe'), false);
  assert.equal((await runCheckoutAttempt(key, [...input, 'changed'], create)).success, false);
});

test('accepted pickup can prepare before payment but cannot finish or cancel through a status shortcut', async () => {
  const f = await paymentFixture();
  assert.equal((await f.statuses.updateOrderStatus(f.orderId, 'In Progress')).success, true);
  assert.equal((await f.statuses.updateOrderStatus(f.orderId, 'Ready')).success, true);
  for (const status of ['Completed', 'Delivered', 'Canceled']) assert.equal((await f.statuses.updateOrderStatus(f.orderId, status)).success, false);
  assert.deepEqual(f.kpis(), { count: 0, amount: 0 });
  await f.pay(); assert.equal((await f.statuses.updateOrderStatus(f.orderId, 'Completed')).success, true);
  const online = await paymentFixture({ customerOverrides: { paymentMethod: 'online' } });
  for (const status of ['Received', 'In Progress', 'Ready', 'Completed', 'Canceled']) assert.equal((await online.statuses.updateOrderStatus(online.orderId, status)).success, false);
});

test('automatic/cart/product/quantity, combos and verified upsells save identical pricing for both methods', async () => {
  const base = { id: 'auto', brandId: 'b', locationIds: ['l'], orderTypes: ['pickup'], activeDays: [], activeTimeSlots: [], isActive: true, discountName: 'QA offer', discountValue: 20, referenceIds: ['p'] };
  const line = (id, price, quantity = 1, extra = {}) => ({ id, name: id, unitPrice: price, totalPrice: price * quantity, quantity, ...extra });
  const scenarios = [
    { standardDiscounts: [{ ...base, discountType: 'cart', discountMethod: 'percentage', discountValue: 10 }], expectedCartDiscount: 10, total: 94 },
    { standardDiscounts: [{ ...base, discountType: 'product', discountMethod: 'percentage' }], items: [line('p', 80)], total: 84 },
    { standardDiscounts: [{ ...base, discountType: 'category', referenceIds: ['pizza'], discountMethod: 'buy_x_pay_y', buyQuantity: 3, payQuantity: 2 }], items: [line('p', 100, 3)], expectedCartDiscount: 100, total: 204 },
    { seed: [['comboMenus/menu', { brandId: 'b', locationIds: ['l'], comboName: 'QA menu', isActive: true, pickupPrice: 80, deliveryPrice: 90, orderTypes: ['pickup'], activeDays: [], activeTimeSlots: [], productGroups: [{ id: 'g', groupName: 'Pizza', productIds: ['p'], minSelection: 1, maxSelection: 1 }] }]], items: [line('menu', 80, 1, { itemType: 'combo', comboSelections: [{ groupId: 'g', groupName: 'Pizza', products: [{ id: 'p', name: 'Pizza' }] }] })], total: 84 },
    { seed: [['products/q', { brandId: 'b', locationIds: ['l'], productName: 'Soda', price: 25, isActive: true }], ['upsells/u', { ...base, id: 'u', offerType: 'product', offerProductIds: ['q'], offerCategoryIds: [], triggerConditions: [{ type: 'product_in_cart', referenceId: 'p' }], discountType: 'percentage', discountValue: 10, conversions: 0 }]], items: [line('p', 100), line('q', 22.5, 1, { upsellId: 'u' })], total: 126.5 },
  ];
  for (const config of scenarios) {
    const pickup = await paymentFixture(config), online = await paymentFixture({ ...config, customerOverrides: { paymentMethod: 'online' } });
    assert.equal(pickup.result.success, true, pickup.result.error); assert.equal(online.result.success, true, online.result.error);
    assert.equal(pickup.order().totalAmount, config.total); assert.equal(online.order().totalAmount, config.total);
    assert.deepEqual(pickup.order().paymentDetails, online.order().paymentDetails); assert.deepEqual(pickup.order().productItems, online.order().productItems);
    await pickup.pay(); await pickup.pay();
    if (config.total === 126.5) assert.equal(pickup.records.get('upsells/u').conversions, 1);
  }
});

test('single-use game code is reserved at pickup, released on cancellation and redeemed once on payment', async () => {
  const voucherId = 'a'.repeat(64), discountId = 'game_' + voucherId;
  const discount = { id: discountId, brandId: 'b', applicationType: 'code', isActive: true, locationIds: ['l'], orderTypes: ['pickup'], activeDays: [], activeTimeSlots: [], discountType: 'fixed_amount', discountValue: 100, code: 'GAMEPIZZA', usedCount: 0, usageLimit: 1, perCustomerLimit: 1, gameProductId: 'p' };
  const seed = [['discounts/' + discountId, discount], ['gameVouchers/' + voucherId, { brandId: 'b', discountId, state: 'issued', codeMode: 'generated', campaignId: 'qa-game', playId: 'qa-play', prizeName: 'Pizza' }]];
  const f = await paymentFixture({ kind: 'code', discountId, seed });
  assert.equal(f.result.success, true, f.result.error); assert.equal(f.order().totalAmount, 4);
  const capacity = 'checkout_discount_capacity/' + capacityKey(['b', discountId]);
  assert.deepEqual(f.records.get(capacity), { held: 1, paid: 0 }); assert.equal(f.records.get('gameVouchers/' + voucherId).state, 'issued');
  await f.pay(); await f.pay();
  assert.equal(f.records.get('gameVouchers/' + voucherId).state, 'redeemed'); assert.equal(f.records.get('discounts/' + discountId).usedCount, 1);
  assert.equal([...f.records.keys()].filter(key => key.startsWith('gameConversions/')).length, 1);
  assert.deepEqual(f.records.get(capacity), { held: 0, paid: 1 });
  const canceled = await paymentFixture({ kind: 'code', discountId, seed }); await canceled.cancel();
  assert.deepEqual(canceled.records.get(capacity), { held: 0, paid: 0 }); assert.equal(canceled.records.get('gameVouchers/' + voucherId).state, 'issued');
  assert.equal([...canceled.records.keys()].filter(key => key.startsWith('gameConversions/')).length, 0);
});

test('revocation between status precheck and pickup preparation transaction prevents the write', async () => {
  const f = await paymentFixture(), session = f.mocks['@/lib/access/orderfly-session'], original = session.requireOrderflyAccess;
  session.requireOrderflyAccess = async (...args) => {
    const access = await original(...args); f.records.get('platformAdminControl/access-v1').memberships[0].active = false; return access;
  };
  assert.equal((await f.statuses.updateOrderStatus(f.orderId, 'In Progress')).success, false); assert.equal(f.order().status, 'Received');
});
