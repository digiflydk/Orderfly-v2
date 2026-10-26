const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTs } = require('../helpers/load-ts.cjs');
// Allows independent testing of the coordinator's frozen integration candidate
// before its dependent Wolt components land on main. Default: this repository.
const sourceRoot = process.env.WOLT_ADAPTER_SOURCE_ROOT || process.cwd();
const load = name => loadTs(path.join(sourceRoot, name), { 'server-only': {} });
const { createWoltProvider } = load('src/lib/delivery/providers/wolt/provider.ts');
const { deliveryCreateResultSchema, deliveryCancelResultSchema } = load('src/lib/delivery/provider-contract.ts');
const at = Date.parse('2026-10-26T10:00:00Z');
const scope = { brandId: 'brand_a', locationId: 'location_a' };
const address = { country: 'DK', postcode: '1300', city: 'Copenhagen', street: 'Synthetic', building: '1', unit: null, coordinates: { latitude: 55.68, longitude: 12.58, source: 'synthetic' } };
const fulfillment = () => ({ version: 1, providerId: 'wolt', scope: { ...scope }, checkoutRef: 'checkout_a', pickup: address, dropoff: address, pickupContact: { name: 'Shop', phone: '+4511111111' }, dropoffContact: { name: 'Synthetic Test', phone: '+4522222222' }, instructions: '', readyAt: '2026-10-26T10:20:00Z', desiredDelivery: { kind: 'asap' }, items: [{ name: 'Meal', quantity: 1 }], bagCount: 1, requirements: [] });
function fixture({ loseCreate = false, pickupStarted = false, cancellationRace = false } = {}) {
  let savedQuote, originalClaim = null, consumed = false, cancelConsumed = false;
  const calls = [];
  const binding = { ...scope, provider: 'wolt', active: true, revision: '1', environment: 'sandbox', merchantId: 'merchant_a', venueId: 'venue_a', secretRef: 'sandbox/merchant_a' };
  const deps = {
    environment: 'sandbox', now: () => at, authorizeScope: async candidate => assert.deepEqual(candidate, scope) === undefined,
    resolveBinding: async () => binding, resolveSecret: async () => 'synthetic_fixture_not_a_key',
    saveQuote: async quote => { savedQuote = structuredClone(quote); }, loadQuote: async () => structuredClone(savedQuote),
    validateClaimedAttempt: async request => {
      // Same one-shot contract as the coordinator dispatcher: compare exact
      // immutable claim before synchronously consuming it ahead of any await.
      if (consumed || !originalClaim) return false;
      assert.deepEqual(request, originalClaim); consumed = true;
      await new Promise(resolve => setImmediate(resolve)); return true;
    },
    loadCancellation: async (candidate, attemptRef) => {
      assert.deepEqual(candidate, scope); assert.equal(attemptRef, 'attempt_a');
      if (cancelConsumed) return null; cancelConsumed = true;
      return { scope, providerDeliveryId: 'delivery_id', woltOrderReferenceId: 'native_order_ref', merchantId: 'merchant_a', venueId: 'venue_a', environment: 'sandbox', pickupStarted, pickupCompleted: false };
    },
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body); calls.push({ path: new URL(url).pathname, method: options.method, body });
      if (url.endsWith('/shipment-promises')) return Response.json({ id: 'promise_a', created_at: new Date(at).toISOString(), valid_until: new Date(at + 120000).toISOString(), is_binding: true, price: { amount: 4900, currency: 'DKK' }, pickup: { venue_id: 'venue_a', eta_minutes: 20 }, dropoff: { eta_minutes: 30, location: { coordinates: { lat: 55.68, lon: 12.58 }, formatted_address: 'Synthetic 1' } } }, { status: 201 });
      if (url.endsWith('/deliveries')) {
        if (loseCreate) throw new Error('simulated lost response');
        return Response.json({ id: 'delivery_id', wolt_order_reference_id: 'native_order_ref', merchant_order_reference_id: body.merchant_order_reference_id, status: 'INFO_RECEIVED' }, { status: 201 });
      }
      if (cancellationRace) return Response.json({ error_code: 'INVALID_ORDER_STATE_TRANSITION' }, { status: 400 });
      return Response.json({ status: 'REJECTED' }, { status: 200 });
    },
  };
  const provider = createWoltProvider(deps);
  return { provider, calls, async prepare() { const f = fulfillment(), quote = await provider.quote(f); assert.equal(quote.kind, 'available'); originalClaim = { version: 1, scope, providerId: 'wolt', orderRef: 'order_a', attemptRef: 'attempt_a', quoteRef: quote.quoteRef, requestDigest: 'a'.repeat(64), readyAt: f.readyAt, deliveryInterval: null, quotedCost: quote.cost, fulfillment: f }; return structuredClone(originalClaim); } };
}
const cancelRequest = () => ({ scope, providerDeliveryId: 'delivery_id', attemptRef: 'attempt_a', operatorReason: 'Customer requested cancellation', acceptedFee: null, feeQuoteRef: null, feeQuoteRevision: null });

test('shared-style one-shot claim dispatches one actual adapter create and retains both native identities', async () => {
  const f = fixture(), request = await f.prepare();
  const results = await Promise.all(Array.from({ length: 4 }, () => f.provider.create(structuredClone(request))));
  assert.equal(f.calls.filter(c => c.path.endsWith('/deliveries')).length, 1);
  const accepted = results.find(r => r.kind === 'accepted'); assert.ok(accepted); deliveryCreateResultSchema.parse(accepted);
  assert.equal(accepted.providerDeliveryId, 'delivery_id'); assert.equal(accepted.nativeReference, 'native_order_ref');
  assert.equal(results.filter(r => r.kind === 'unknown').length, 3);
  assert.equal((await f.provider.create(request)).kind, 'unknown'); assert.equal(f.calls.filter(c => c.path.endsWith('/deliveries')).length, 1);
});
test('consumed shared claim remains unknown after transport loss without retry or refund claim', async () => {
  const f = fixture({ loseCreate: true }), request = await f.prepare();
  for (let i = 0; i < 2; i++) { const result = await f.provider.create(request); assert.equal(result.kind, 'unknown'); assert.equal(result.error.retry, 'after_reconciliation'); assert.equal(result.attemptRef, 'attempt_a'); }
  assert.equal(f.calls.filter(c => c.path.endsWith('/deliveries')).length, 1);
  assert.deepEqual(await f.provider.reconcile({ scope, attemptRef: 'attempt_a', providerDeliveryId: null }), { kind: 'unsupported' });
});
test('shared operator reason and saved native reference reach cancellation exactly once', async () => {
  const f = fixture(); const result = await f.provider.cancel(cancelRequest()); deliveryCancelResultSchema.parse(result);
  assert.deepEqual(result, { kind: 'cancelled', fee: null }); assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].path, '/order/native_order_ref/status/cancel'); assert.deepEqual(f.calls[0].body, { reason: 'Customer requested cancellation' });
  assert.equal((await f.provider.cancel(cancelRequest())).kind, 'unknown'); assert.equal(f.calls.length, 1);
});
test('known pickup blocks before PATCH; a concurrent pickup rejection never becomes cancelled', async () => {
  const known = fixture({ pickupStarted: true }); assert.equal((await known.provider.cancel(cancelRequest())).kind, 'not_cancellable'); assert.equal(known.calls.length, 0);
  const racing = fixture({ cancellationRace: true }); const result = await racing.provider.cancel(cancelRequest()); assert.equal(result.kind, 'not_cancellable'); assert.equal(racing.calls.length, 1); assert.equal(result.error.retry, 'never');
});
