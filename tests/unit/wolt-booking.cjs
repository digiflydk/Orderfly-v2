const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const mocks = { 'server-only': {} };
const { buildWoltCreateRequest, createWoltDelivery } = loadTs('src/lib/delivery/providers/wolt/create.ts', mocks);
const { bookWoltDelivery } = loadTs('src/lib/delivery/providers/wolt/booking.ts', mocks);
const { cancelWoltDelivery } = loadTs('src/lib/delivery/providers/wolt/cancel.ts', mocks);
const now = new Date('2026-10-26T10:00:00Z');
const scope = { brandId: 'brand_a', locationId: 'loc_a' };
function input() { return { scope: { ...scope }, binding: { ...scope, venueId: 'venue_a' }, quote: { ...scope, venueId: 'venue_a', promiseId: 'promise_a', validUntil: '2026-10-26T10:05:00Z', fetchedAt: now.toISOString(), isBinding: true, dropoff: { coordinates: { lat: 55.68, lon: 12.58 }, formattedAddress: 'Synthetic street 1' }, scheduledDropoffTime: null }, merchantOrderReferenceId: 'attempt_a', recipient: { name: 'Test Recipient', phoneNumber: '+4512345678' }, parcels: [{ count: 1, description: 'Meal', identifier: 'bag_1' }] }; }
const accepted = { ok: true, status: 201, data: { id: 'delivery_a', wolt_order_reference_id: 'native_a', merchant_order_reference_id: 'attempt_a', status: 'INFO_RECEIVED', tracking: { url: 'https://track.wolt.com/example' }, price: { amount: 4500, currency: 'DKK' } } };
function repo() {
  let claim;
  return { async claimAttempt(key) { if (claim) { assert.deepEqual(key, claim.key); return { ...claim, disposition: 'existing' }; } claim = { key, attemptRef: 'attempt_a', revision: '1', disposition: 'dispatch_once', result: null }; return { ...claim }; }, async recordAttemptResult(c, result) { claim.result = result; } };
}
test('creation copies quoted location, stable reference and only supported fields', async () => {
  const request = buildWoltCreateRequest(input(), now);
  assert.equal(request.body.merchant_order_reference_id, 'attempt_a');
  assert.deepEqual(request.body.dropoff.location.coordinates, input().quote.dropoff.coordinates);
  assert.equal('price' in request.body, false);
  assert.equal('cash' in request.body, false);
  const result = await createWoltDelivery(input(), async () => accepted, now);
  assert.equal(result.kind, 'accepted'); assert.equal(result.providerDeliveryId, 'delivery_a'); assert.equal(result.woltOrderReferenceId, 'native_a');
  assert.equal(result.providerCost.taxBasis, 'inclusive'); assert.equal(result.pickupEta, null);
});
test('cross-scope, stale/missing-local-freshness, unsupported flags and invalid phone fail before I/O', async () => {
  const cases = [i => i.binding.brandId = 'brand_b', i => i.quote.venueId = 'foreign', i => i.quote.validUntil = now.toISOString(), i => i.quote.fetchedAt = '2026-10-26T09:54:59Z', i => i.cash = { amount: 10 }, i => i.recipient.phoneNumber = '123'];
  for (const change of cases) { const i = input(); change(i); let calls = 0; await assert.rejects(createWoltDelivery(i, async () => { calls++; return accepted; }, now)); assert.equal(calls, 0); }
  const i = input(); i.quote.validUntil = null; assert.ok(buildWoltCreateRequest(i, now));
});
test('lost response, duplicate reference and malformed success never imply rejection or retry', async () => {
  for (const transport of [async () => { throw Error('sensitive'); }, async () => ({ ok: false, error: { code: 'conflict', nativeCode: 'DUPLICATE_ORDER', outcome: 'rejected', retryClass: 'never' } }), async () => ({ ...accepted, data: { id: 'only_id' } }), async () => ({ ...accepted, data: { ...accepted.data, merchant_order_reference_id: 'foreign' } })]) {
    let calls = 0; const result = await createWoltDelivery(input(), async r => { calls++; return transport(r); }, now); assert.equal(result.kind, 'unknown'); assert.equal(calls, 1); assert.equal(result.merchantOrderReferenceId, 'attempt_a'); assert.doesNotMatch(JSON.stringify(result), /sensitive/);
  }
});
test('atomic reservation permits one network call for concurrent requests and replays', async () => {
  const store = repo(); let calls = 0;
  const network = async () => { calls++; await new Promise(r => setImmediate(r)); return accepted; };
  const results = await Promise.all(Array.from({ length: 8 }, () => bookWoltDelivery(input(), 'order_a', 'quote_a', store, network, now)));
  assert.equal(calls, 1); assert.equal(results.filter(r => r.kind === 'accepted').length, 1);
  assert.equal((await bookWoltDelivery(input(), 'order_a', 'quote_a', store, network, now)).kind, 'accepted'); assert.equal(calls, 1);
  const changed = input(); changed.recipient.name = 'Different'; await assert.rejects(bookWoltDelivery(changed, 'order_a', 'quote_a', store, network, now)); assert.equal(calls, 1);
});
test('failed result persistence leaves durable intent unresolved without redispatch', async () => {
  const store = repo(); store.recordAttemptResult = async () => { throw Error('db down'); }; let calls = 0;
  const network = async () => { calls++; return accepted; };
  assert.equal((await bookWoltDelivery(input(), 'order_a', 'quote_a', store, network, now)).code, 'ATTEMPT_PERSISTENCE_UNKNOWN');
  assert.equal((await bookWoltDelivery(input(), 'order_a', 'quote_a', store, network, now)).kind, 'unknown'); assert.equal(calls, 1);
});
test('foreign claimed intent is never dispatched', async () => {
  const store = repo(); const claim = store.claimAttempt; store.claimAttempt = async key => ({ ...await claim(key), key: { ...key, scope: { ...scope, brandId: 'foreign' } } });
  let calls = 0; await assert.rejects(bookWoltDelivery(input(), 'order_a', 'quote_a', store, async () => { calls++; return accepted; }, now), /ATTEMPT_CLAIM_MISMATCH/); assert.equal(calls, 0);
});
test('caller or repository mutation while claiming cannot change reserved dispatch', async () => {
  const i = input(); const store = repo(); const claim = store.claimAttempt;
  store.claimAttempt = async key => {
    const original = await claim(key);
    i.scope.brandId = 'foreign'; i.quote.venueId = 'foreign'; i.quote.dropoff.coordinates.lat = 0;
    i.recipient.name = 'Wrong person'; i.merchantOrderReferenceId = 'wrong_reference';
    key.scope.brandId = 'mutated'; key.merchantOrderReferenceId = 'mutated';
    return original;
  };
  const result = await bookWoltDelivery(i, 'order_a', 'quote_a', store, async request => {
    assert.equal(request.path, '/v1/venues/venue_a/deliveries'); assert.equal(request.body.recipient.name, 'Test Recipient');
    assert.equal(request.body.dropoff.location.coordinates.lat, 55.68); assert.equal(request.body.merchant_order_reference_id, 'attempt_a'); return accepted;
  }, now);
  assert.equal(result.kind, 'accepted'); assert.equal(result.merchantOrderReferenceId, 'attempt_a');
});
test('unexpected create status cannot be accepted', async () => {
  for (const status of ['REJECTED', 'UNKNOWN_NEW_STATE']) assert.equal((await createWoltDelivery(input(), async () => ({ ...accepted, data: { ...accepted.data, status } }), now)).kind, 'unknown');
});
function cancelInput() { return { scope, delivery: { ...scope, woltOrderReferenceId: 'native_a', pickupStarted: false, pickupCompleted: false }, reason: 'Customer requested cancellation' }; }
test('cancellation requires native REJECTED acknowledgement, handles pickup race and never invents fees', async () => {
  const success = await cancelWoltDelivery(cancelInput(), async r => { assert.equal(r.path, '/order/native_a/status/cancel'); return { ok: true, status: 200, data: { status: 'REJECTED' } }; });
  assert.deepEqual(success, { kind: 'cancelled', confirmedFee: null });
  const race = await cancelWoltDelivery(cancelInput(), async () => ({ ok: false, error: { code: 'state', nativeCode: 'INVALID_ORDER_STATE_TRANSITION', outcome: 'rejected', retryClass: 'never' } })); assert.equal(race.kind, 'not_cancellable');
  for (const status of [200, 202]) assert.equal((await cancelWoltDelivery(cancelInput(), async () => ({ ok: true, status, data: {} }))).kind, 'unknown');
  assert.equal((await cancelWoltDelivery(cancelInput(), async () => { throw Error('timeout'); })).kind, 'unknown');
});
test('known pickup and foreign cancellation do not call provider', async () => {
  let calls = 0; const transport = async () => { calls++; return { ok: true, status: 200, data: { status: 'REJECTED' } }; };
  const i = cancelInput(); i.delivery.pickupStarted = true; assert.equal((await cancelWoltDelivery(i, transport)).kind, 'not_cancellable');
  i.delivery.brandId = 'foreign'; await assert.rejects(cancelWoltDelivery(i, transport), /SCOPE_MISMATCH/); assert.equal(calls, 0);
});
