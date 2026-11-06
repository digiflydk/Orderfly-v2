const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { paymentFixture } = require('../helpers/merchant-payment-fixture.cjs');

// Actual exported settlement callers, actual capacity/invoice/authority modules.
// Only session/Admin I/O and optional analytics/marketing are isolated.
async function fixture(kind = 'stripe', options = {}) {
  const f = await paymentFixture({ kind: options.discount ? 'code' : 'none' });
  const order = f.order();
  if (kind === 'stripe') Object.assign(order, { paymentMethod: 'Stripe', status: 'Pending', psp: { checkoutSessionId: 'cs_test_settlement_346' } });
  const customer = f.records.get('customers/' + order.customerDetails.id);
  customer.marketingConsent = !!options.marketing;
  customer.email = order.customerContact;
  if (options.maximum) {
    order.appliedDiscountId = 'game_voucher';
    f.records.set('discounts/game_voucher', { brandId: 'b', usedCount: 0 });
    f.records.set('gameVouchers/voucher', { brandId: 'b', discountId: 'game_voucher', state: 'issued', campaignId: 'campaign', playId: 'play', prizeName: 'Pizza', codeMode: 'generated' });
    order.verifiedUpsellIds = Array.from({ length: 98 }, (_, i) => 'upsell' + i);
    for (const id of order.verifiedUpsellIds) f.records.set('upsells/' + id, { brandId: 'b', locationIds: ['l'], conversions: 0 });
  }
  const nativeRun = f.db.runTransaction;
  const attempts = [];
  let retry = !!options.retry;
  const stableTransaction = {};
  const retrySignal = new Error('fixture transaction conflict');
  f.db.runTransaction = async fn => {
    const run = () => nativeRun(async tx => {
      const events = []; attempts.push(events);
      let wrote = false;
      const wrapWrite = name => (ref, data, ...rest) => {
        events.push({ method: name, path: ref.path }); wrote = true;
        if (options.failPath && ref.path.startsWith(options.failPath)) throw Error('fixture atomic failure');
        return tx[name](ref, data, ...rest);
      };
      Object.assign(stableTransaction, {
        get: ref => { assert.equal(wrote, false, 'all settlement reads precede all writes'); events.push({ method: 'get', path: ref.path }); return tx.get(ref); },
        set: wrapWrite('set'), update: wrapWrite('update'), create: wrapWrite('create'),
      });
      const result = await fn(stableTransaction);
      if (retry) { retry = false; throw retrySignal; }
      return result;
    });
    try { return await run(); } catch (error) {
      if (error !== retrySignal) throw error;
      if (options.onRetry) options.onRetry(f);
      return run();
    }
  };
  const afterCallbacks=[];
  const mocks = { ...f.mocks, 'next/server':{after:callback=>afterCallbacks.push(callback)}, '@/lib/marketing/config': { paidOrderMarketingEnabled: () => !!options.marketing } };
  if (Object.hasOwn(options, 'capacityReservation')) {
    const actual = loadTs('src/lib/server/discount-capacity.ts', { 'server-only': {} });
    mocks['@/lib/server/discount-capacity'] = { prepareAdminCapacitySettlement: async (...args) => {
      const apply = await actual.prepareAdminCapacitySettlement(...args);
      // Fault injection of a larger reservation exercises the 500-write boundary
      // without introducing hundreds of artificial production write operations.
      return Object.assign(() => apply(), { writeCount: options.capacityReservation });
    } };
  }
  const api = loadTs('src/lib/server/settle-checkout.ts', mocks);
  const session = { id: 'cs_test_settlement_346', payment_status: 'paid', currency: 'dkk', amount_total: Math.round(order.totalAmount * 100),
    metadata: { orderId: f.orderId, brandId: 'b', locationId: 'l' } };
  return { ...f, afterCallbacks, attempts, api, session, settle: () => kind === 'stripe' ? api.settlePaidCheckoutSession(session) : api.settlePaidPickupOrder(f.orderId, 'cash') };
}
const writes = attempt => attempt.filter(event => event.method !== 'get');

test('#346 native capacity callback reports exact 1/3 write count and preserves callable API', async () => {
  const { prepareAdminCapacitySettlement } = loadTs('src/lib/server/discount-capacity.ts', { 'server-only': {} });
  for (const appliedDiscountId of [null, 'discount']) {
    const calls = [], db = { collection: collection => ({ doc: id => ({ path: collection + '/' + id }) }) };
    const tx = { get: async () => ({ data: () => ({ paid: 4, held: 2 }) }), set: (ref, value) => calls.push({ ref, value }) };
    const apply = await prepareAdminCapacitySettlement(db, tx, { brandId: 'b', customerDetails: { id: 'c' }, appliedDiscountId, discountReservation: 'held' }, true);
    assert.equal(calls.length, 0); assert.equal(apply.writeCount, appliedDiscountId ? 3 : 1);
    apply(); assert.equal(calls.length, apply.writeCount); assert.ok(calls.every(call => call.value.paid === 5 && call.value.held === 1));
  }
});

test('#346 sole writer preserves both callers, exact simple financial writes and replay repair', async () => {
  for (const kind of ['stripe', 'pickup']) {
    const f = await fixture(kind);
    assert.equal(await f.settle(), true);
    assert.equal(writes(f.attempts[0]).length, kind === 'stripe' ? 5 : 6);
    assert.equal(f.order().paymentStatus, 'Paid'); assert.equal(f.order().status, 'Received');
    assert.equal(f.records.get('customers/' + f.order().customerDetails.id).totalOrders, 1);
    assert.equal(await f.settle(), false); assert.equal(writes(f.attempts[1]).length, 0);
    const confirmation = [...f.records].find(([path, value]) => path.startsWith('orderNotificationJobs/') && value.kind === 'orderConfirmation');
    f.records.delete(confirmation[0]);
    assert.equal(await f.settle(), false); assert.deepEqual(writes(f.attempts[2]).map(event => event.path), [confirmation[0]]);
    assert.equal(f.records.get('customers/' + f.order().customerDetails.id).totalOrders, 1);
  }
});

test('#346 maximum financial fanout is exactly 108 Stripe /109 staff writes with marketing and voucher', async () => {
  for (const kind of ['stripe', 'pickup']) {
    const f = await fixture(kind, { maximum: true, marketing: true });
    assert.equal(await f.settle(), true);
    assert.equal(writes(f.attempts[0]).length, kind === 'stripe' ? 108 : 109);
    assert.equal(f.records.get('gameVouchers/voucher').state, 'redeemed');
    assert.equal([...f.records.keys()].filter(path => path.startsWith('gameConversions/')).length, 1);
    assert.equal(f.records.get('upsells/upsell96').conversions, 1); assert.equal(f.records.get('upsells/upsell97').conversions, 0);
    assert.equal(f.records.get('discounts/game_voucher').usedCount, 1);
    assert.equal([...f.records.keys()].filter(path => path.startsWith('marketingOrderOutbox/')).length, 1);
    const before = structuredClone([...f.records]); assert.equal(await f.settle(), false);
    assert.deepEqual([...f.records], before); assert.equal(writes(f.attempts[1]).length, 0);
  }
});

test('#346 plan and accounting are recomputed after native transaction retry with reused SDK object', async () => {
  for (const kind of ['stripe', 'pickup']) {
    const f = await fixture(kind, { retry: true, onRetry: state => {
      state.records.set('invoiceCounters/b-' + new Date().getUTCFullYear(), { brandId: 'b', lastNumber: 10 });
      const customer = state.records.get('customers/' + state.order().customerDetails.id); customer.totalOrders = 7; customer.totalSpend = 1000;
    } });
    assert.equal(await f.settle(), true); assert.equal(f.attempts.length, 2);
    assert.equal(writes(f.attempts[0]).length, writes(f.attempts[1]).length);
    assert.equal(f.records.get('customers/' + f.order().customerDetails.id).totalOrders, 8);
    assert.equal(f.records.get('customers/' + f.order().customerDetails.id).totalSpend, 1000 + f.order().totalAmount);
    assert.match(f.order().invoice.number, /000011$/);
    assert.equal([...f.records.keys()].filter(path => path.startsWith('orderNotificationJobs/') && f.records.get(path).kind === 'orderConfirmation').length, 1);
  }
});

test('#346 late write failure rolls back all financial, voucher, audit and outbox mutations', async () => {
  for (const kind of ['stripe', 'pickup']) {
    const f = await fixture(kind, { maximum: true, marketing: true, failPath: 'marketingOrderOutbox/' });
    const before = structuredClone([...f.records]);
    await assert.rejects(f.settle(), /fixture atomic failure/); assert.deepEqual([...f.records], before);
    assert.equal(writes(f.attempts[0]).at(-1).path.startsWith('marketingOrderOutbox/'), true);
    assert.ok(writes(f.attempts[0]).some(event => event.path === 'orders/' + f.orderId));
  }
});

test('#346 exact shared-budget sum accepts 500 and rejects 501 before the first mutation', async () => {
  for (const kind of ['stripe', 'pickup']) {
    const otherWrites = kind === 'stripe' ? 4 : 5;
    const allowed = await fixture(kind, { capacityReservation: 500 - otherWrites });
    assert.equal(await allowed.settle(), true);
    const blocked = await fixture(kind, { capacityReservation: 501 - otherWrites });
    const before = structuredClone([...blocked.records]);
    await assert.rejects(blocked.settle(), /Settlement write budget exceeded/);
    assert.equal(writes(blocked.attempts[0]).length, 0); assert.deepEqual([...blocked.records], before);
  }
});

test('#346 invalid budget preparation cannot apply partial writes', async () => {
  for (const capacityReservation of [undefined, NaN, Infinity, -100, -1, 0, 0.5]) {
    const f = await fixture('stripe', { capacityReservation }); const before = structuredClone([...f.records]);
    await assert.rejects(f.settle(), /Settlement write budget exceeded/); assert.equal(writes(f.attempts[0]).length, 0);
    assert.deepEqual([...f.records], before);
  }
});

test('legacy committed or failed settlement never schedules a managed courier callback',async()=>{
 const legacy=await fixture();await legacy.settle();assert.equal(legacy.afterCallbacks.length,0);
 const failed=await fixture('stripe',{failPath:'orders/'});await assert.rejects(failed.settle(),/fixture atomic failure/);assert.equal(failed.afterCallbacks.length,0);
});

function enableClub(f, settings = {}) {
  const { defaultProgramSettings } = loadTs('src/lib/loyalty/stamp-card/rules.ts');
  f.records.set('loyaltyPrograms/b', {brandId:'b',version:1,settings:{...defaultProgramSettings('Club'),active:true,
    reward:{type:'fixed_amount',amountOre:1000},rewardDescription:'10 kr.',terms:'Vilkår',consentText:'Ja tak',minimumAmountOre:1,...settings}});
  f.records.set('loyaltyMembers/member', {brandId:'b',companyId:'company',customerId:f.order().customerDetails.id,status:'active',
    joinedAt:Date.now()-1000,currentCardId:null,stampDay:null,stampsOnDay:0,normalizedEmail:f.order().customerContact});
}
const stampEvents = f => [...f.records.values()].filter(v=>v.type==='stamp_added' && v.source==='order');

test('Club stamps commit with verified payment for Stripe and pay-at-pickup and never repeat on webhook replay', async () => {
  for (const kind of ['stripe','pickup']) {
    const f=await fixture(kind);enableClub(f);
    assert.equal(await f.settle(),true);
    assert.equal(stampEvents(f).length,1);
    const e=stampEvents(f)[0];
    assert.equal(e.orderId,f.orderId);assert.equal(e.orderNumber,f.orderId);assert.equal(e.customerId,f.order().customerDetails.id);
    assert.equal(e.amountOre,Math.round(f.order().totalAmount*100));assert.equal(e.memberId,'member');
    assert.equal(f.records.get('loyaltyCards/'+f.records.get('loyaltyMembers/member').currentCardId).stamps,1);
    assert.equal(await f.settle(),false);assert.equal(stampEvents(f).length,1);
  }
});

test('Club payment retries recompute stamps and failure rolls back both payment and stamps', async () => {
  const f=await fixture('stripe',{retry:true});enableClub(f,{stampsRequired:1});
  await f.settle();assert.equal(stampEvents(f).length,1);
  assert.equal([...f.records.values()].filter(v=>v.type==='reward_earned').length,1);
  const broken=await fixture('stripe',{failPath:'invoiceCounters/'});enableClub(broken);
  await assert.rejects(broken.settle(),/fixture atomic failure/);
  assert.notEqual(broken.order().paymentStatus,'Paid');assert.equal(stampEvents(broken).length,0);
  assert.equal(broken.records.get('loyaltyMembers/member').currentCardId,null);
  const unpaid=await fixture('stripe');enableClub(unpaid);unpaid.session.amount_total++;
  await assert.rejects(unpaid.settle(),/amount mismatch/);assert.equal(stampEvents(unpaid).length,0);
});

test('Club respects thresholds, channels, discounts, membership and tenant boundaries without blocking payment', async () => {
  const cases=[
    ['inactive',f=>enableClub(f,{active:false})],
    ['minimum',f=>enableClub(f,{minimumAmountOre:10000000})],
    ['channel',f=>enableClub(f,{orderTypes:['delivery']})],
    ['discount',f=>{enableClub(f);f.order().paymentDetails.discountTotal=1;}],
    ['personal card',f=>{enableClub(f,{discountedOrdersQualify:true});f.order().discountCard={purchaseStampsEligible:false};}],
    ['deleted',f=>{enableClub(f);f.records.get('loyaltyMembers/member').status='deleted';}],
    ['foreign brand',f=>{enableClub(f);f.records.get('loyaltyMembers/member').brandId='other';}],
    ['foreign company',f=>{enableClub(f);f.records.get('loyaltyMembers/member').companyId='other';}],
    ['wrong customer',f=>{enableClub(f);f.records.get('loyaltyMembers/member').customerId='other';}],
    ['ambiguous',f=>{enableClub(f);f.records.set('loyaltyMembers/duplicate',{...f.records.get('loyaltyMembers/member')});}],
    ['daily limit',f=>{enableClub(f,{maxStampsPerDay:1});const m=f.records.get('loyaltyMembers/member');m.stampDay=loadTs('src/lib/loyalty/stamp-card/day.ts').copenhagenDay(Date.now());m.stampsOnDay=1;}],
  ];
  for (const [label,configure] of cases) {
    const f=await fixture('stripe');configure(f);assert.equal(await f.settle(),true,label);assert.equal(stampEvents(f).length,0,label);
  }
  const allowed=await fixture('stripe');enableClub(allowed,{discountedOrdersQualify:true});allowed.order().paymentDetails.discountTotal=1;
  await allowed.settle();assert.equal(stampEvents(allowed).length,1);
});
