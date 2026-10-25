const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { createWoltProvider } = loadTs('src/lib/delivery/providers/wolt/provider.ts', { 'server-only': {} });
const contract = loadTs('src/lib/delivery/provider-contract.ts', { 'server-only': {} });
const start = Date.parse('2026-10-25T10:00:00Z');
const scope = { brandId: 'brand-A', locationId: 'location-A' };
const address = { country: 'DK', postcode: '1300', city: 'Copenhagen', street: 'Borgergade', building: '10', unit: null, coordinates: { latitude: 55.68, longitude: 12.58, source: 'test' } };
const request = () => ({ version: 1, scope, checkoutRef: 'checkout-A', providerId: 'wolt', pickup: address, dropoff: address,
  pickupContact: { name: 'Shop', phone: '+4511111111' }, dropoffContact: { name: 'Test', phone: '+4522222222' },
  instructions: '', readyAt: '2026-10-25T10:20:00Z', desiredDelivery: { kind: 'asap' }, items: [{ name: 'Pizza', quantity: 1 }], bagCount: 1, requirements: [] });
function fixture() {
  let time = start, stored, creates = 0, calls = 0, claimed = true;
  const binding = { ...scope, provider: 'wolt', active: true, revision: '1', environment: 'sandbox', merchantId: 'merchant-A', venueId: 'venue-A', secretRef: 'sandbox/merchant-A' };
  const deps = { environment: 'sandbox', now: () => time, authorizeScope: async () => true, resolveBinding: async () => binding,
    resolveSecret: async () => 'synthetic_fake_credential', saveQuote: async q => { stored = q; }, loadQuote: async () => stored,
    validateClaimedAttempt: async () => claimed,
    loadCancellation: async () => ({ scope, providerDeliveryId: 'delivery-A', woltOrderReferenceId: 'wolt-A', merchantId: 'merchant-A', venueId: 'venue-A', environment: 'sandbox', pickupStarted: false, pickupCompleted: false, reason: 'Customer request' }),
    fetchImpl: async (url, options) => {
      calls++;
      if (url.endsWith('/shipment-promises')) return Response.json({ id: 'promise-A', created_at: new Date(start).toISOString(), valid_until: new Date(start + 120000).toISOString(), is_binding: true, price: { amount: 4900, currency: 'DKK' }, pickup: { venue_id: 'venue-A', eta_minutes: 20 }, dropoff: { eta_minutes: 30, location: { coordinates: { lat: 55.68, lon: 12.58 }, formatted_address: 'Borgergade 10' } } }, { status: 201 });
      if (url.endsWith('/deliveries')) { creates++; return Response.json({ id: 'delivery-A', wolt_order_reference_id: 'wolt-A', merchant_order_reference_id: 'attempt-A', status: 'INFO_RECEIVED', price: { amount: 4900, currency: 'DKK' } }, { status: 201 }); }
      return Response.json({ status: 'REJECTED' });
    },
  };
  return { deps, binding, get stored() { return stored; }, set stored(v) { stored = v; }, setTime: v => { time = v; }, setClaim: v => { claimed = v; }, get creates() { return creates; }, get calls() { return calls; } };
}
const createRequest = (quote, fulfillment = request()) => ({ version: 1, scope, providerId: 'wolt', orderRef: 'order-A', attemptRef: 'attempt-A', quoteRef: quote.quoteRef, requestDigest: 'a'.repeat(64), readyAt: fulfillment.readyAt, deliveryInterval: null, quotedCost: quote.cost, fulfillment });

test('real shared schema accepts mapped quote/create/cancel; native snapshot stays private', async () => {
  const f = fixture(), provider = createWoltProvider(f.deps);
  const quote = await provider.quote(request());
  assert.equal(quote.kind, 'available'); assert.equal(contract.deliveryQuoteResultSchema.safeParse(quote).success, true);
  assert.equal('native' in quote, false); assert.equal(quote.cost.amountMinor, 4900);
  const created = await provider.create(createRequest(quote));
  assert.equal(created.kind, 'accepted'); assert.equal(contract.deliveryCreateResultSchema.safeParse(created).success, true); assert.equal(f.creates, 1);
  const cancelled = await provider.cancel({ scope, providerDeliveryId: 'delivery-A', attemptRef: 'attempt-A', operatorReason: 'Customer request', acceptedFee: null, feeQuoteRef: null, feeQuoteRevision: null });
  assert.deepEqual(cancelled, { kind: 'cancelled', fee: null });
});

test('tenant denial occurs before secret, quote storage and provider I/O', async () => {
  const f = fixture(); f.deps.authorizeScope = async () => false;
  f.deps.resolveSecret = async () => { throw new Error('must not resolve'); };
  const result = await createWoltProvider(f.deps).quote(request());
  assert.equal(result.kind, 'error'); assert.equal(f.calls, 0); assert.equal(f.stored, undefined);
});

test('changed address, provider price, binding revision and foreign snapshots cannot dispatch', async () => {
  for (const change of ['address', 'price', 'revision', 'scope']) {
    const f = fixture(), provider = createWoltProvider(f.deps), quote = await provider.quote(request()), raw = createRequest(quote);
    if (change === 'address') raw.fulfillment = { ...request(), dropoff: { ...address, building: '11' } };
    if (change === 'price') raw.quotedCost = { ...quote.cost, amountMinor: 1 };
    if (change === 'revision') f.binding.revision = '2';
    if (change === 'scope') f.stored.scope = { ...scope, brandId: 'brand-B' };
    assert.equal((await provider.create(raw)).kind, 'rejected'); assert.equal(f.creates, 0);
  }
});

test('missing claim is unknown; quote expiry during claim verification prevents dispatch', async () => {
  const f = fixture(), provider = createWoltProvider(f.deps), quote = await provider.quote(request());
  f.setClaim(false);
  assert.equal((await provider.create(createRequest(quote))).kind, 'unknown'); assert.equal(f.creates, 0);
  const g = fixture(); g.deps.validateClaimedAttempt = async () => { g.setTime(start + 120000); return true; };
  const other = createWoltProvider(g.deps), q = await other.quote(request());
  assert.equal((await other.create(createRequest(q))).kind, 'rejected'); assert.equal(g.creates, 0);
});

test('lost response remains unknown and no second request is sent', async () => {
  const f = fixture(), originalFetch = f.deps.fetchImpl; let creates = 0;
  f.deps.fetchImpl = async (url, options) => { if (url.endsWith('/deliveries')) { creates++; throw new Error('lost response'); } return originalFetch(url, options); };
  const provider = createWoltProvider(f.deps), quote = await provider.quote(request());
  const result = await provider.create(createRequest(quote));
  assert.equal(result.kind, 'unknown'); assert.equal(result.error.retry, 'after_reconciliation'); assert.equal(creates, 1);
});

test('unsupported schedule window/requirements never request a quote; reconciliation truthful', async () => {
  const f = fixture(), provider = createWoltProvider(f.deps);
  assert.equal((await provider.quote({ ...request(), requirements: ['alcohol'] })).reason, 'unsupported_requirements');
  assert.equal((await provider.quote({ ...request(), desiredDelivery: { kind: 'scheduled', interval: { earliest: '2026-10-25T12:00:00Z', latest: '2026-10-25T12:30:00Z' } } })).reason, 'unsupported_schedule');
  assert.deepEqual(await provider.reconcile({ scope, attemptRef: 'attempt-A', providerDeliveryId: null }), { kind: 'unsupported' });
  assert.equal(f.calls, 0);
});

test('foreign cancellation context cannot invoke provider', async () => {
  const f = fixture(); f.deps.loadCancellation = async () => ({ scope: { ...scope, brandId: 'B' }, providerDeliveryId: 'delivery-A' });
  const result = await createWoltProvider(f.deps).cancel({ scope, providerDeliveryId: 'delivery-A', attemptRef: 'attempt-A', operatorReason: 'Customer request', acceptedFee: null, feeQuoteRef: null, feeQuoteRevision: null });
  assert.equal(result.kind, 'unknown'); assert.equal(f.calls, 0);
});
