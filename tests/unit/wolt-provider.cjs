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

test('quote rejects native comment/quantity overflow before available quote or provider I/O', async () => {
  for (const fulfillment of [
    { ...request(), instructions: 'x'.repeat(501) },
    { ...request(), instructions: 'x'.repeat(499), dropoff: { ...address, unit: 'A' } },
    { ...request(), items: [{ name: 'Pizza', quantity: 101 }] },
  ]) {
    const f = fixture(), result = await createWoltProvider(f.deps).quote(fulfillment);
    assert.equal(result.kind, 'error'); assert.equal(result.error.code, 'invalid_request'); assert.equal(f.calls, 0);
  }
  const f = fixture(), provider = createWoltProvider(f.deps), fulfillment = { ...request(), instructions: 'x'.repeat(500), items: [{ name: 'Pizza', quantity: 100 }] };
  const result = await provider.quote(fulfillment);
  assert.equal(result.kind, 'available'); assert.equal(f.calls, 1);
  assert.equal((await provider.create(createRequest(result, fulfillment))).kind, 'accepted'); assert.equal(f.creates, 1);
});

test('create rejects unsupported native bounds definitively without any provider request', async () => {
  for (const fulfillment of [
    { ...request(), instructions: 'x'.repeat(501) },
    { ...request(), instructions: 'x'.repeat(499), dropoff: { ...address, unit: 'A' } },
    { ...request(), items: [{ name: 'Pizza', quantity: 101 }] },
    { ...request(), dropoffContact: { name: 'Test', phone: '123' } },
  ]) {
    const f = fixture(), provider = createWoltProvider(f.deps), quote = await provider.quote(request());
    const before = f.calls, result = await provider.create(createRequest(quote, fulfillment));
    assert.equal(result.kind, 'rejected'); assert.equal(result.error.code, 'invalid_request');
    assert.equal(f.calls, before); assert.equal(f.creates, 0);
  }
});

test('stored native payload failing local create schema is rejected, never ambiguous', async () => {
  const f = fixture(), provider = createWoltProvider(f.deps), quote = await provider.quote(request());
  f.stored.native.dropoff.formattedAddress = 'x'.repeat(501);
  const result = await provider.create(createRequest(quote));
  assert.equal(result.kind, 'rejected'); assert.equal(result.error.code, 'invalid_create_payload'); assert.equal(f.creates, 0);
});

test('unbookable native address or promise identity is rejected before offering/saving quote', async () => {
  for (const change of ['address', 'identity']) {
    const f = fixture(), originalFetch = f.deps.fetchImpl;
    f.deps.fetchImpl = async (url, options) => {
      const response = await originalFetch(url, options), body = await response.json();
      if (change === 'address') body.dropoff.location.formatted_address = 'x'.repeat(501);
      else body.id = 'invalid/id';
      return Response.json(body, { status: 201 });
    };
    const result = await createWoltProvider(f.deps).quote(request());
    assert.equal(result.kind, 'error'); assert.equal(result.error.code, 'invalid_native_quote');
    assert.equal(f.stored, undefined); assert.equal(f.creates, 0);
  }
});

test('shared optional preparation duration is bounded and fingerprinted without changing legacy requests', () => {
  const { woltFulfillmentFingerprint } = loadTs('src/lib/delivery/providers/wolt/provider.ts', { 'server-only': {} });
  assert.equal(contract.deliveryQuoteRequestSchema.safeParse(request()).success, true);
  for (const preparationMinutes of [0, 20, 240]) assert.equal(contract.deliveryQuoteRequestSchema.safeParse({ ...request(), preparationMinutes }).success, true);
  for (const preparationMinutes of [-1, 0.5, 241, NaN, '20']) assert.equal(contract.deliveryQuoteRequestSchema.safeParse({ ...request(), preparationMinutes }).success, false);
  assert.notEqual(woltFulfillmentFingerprint(request()), woltFulfillmentFingerprint({ ...request(), preparationMinutes: 20 }));
  assert.notEqual(woltFulfillmentFingerprint({ ...request(), preparationMinutes: 20 }), woltFulfillmentFingerprint({ ...request(), preparationMinutes: 21 }));
});

test('scheduled future opening uses effective duration and persists it; changed duration cannot create', async () => {
  const f = fixture(), originalFetch = f.deps.fetchImpl, requests = [];
  const target = '2026-10-26T17:00:00Z';
  f.deps.fetchImpl = async (url, options) => {
    const response = await originalFetch(url, options);
    if (!url.endsWith('/shipment-promises')) return response;
    requests.push(JSON.parse(options.body));
    const body = await response.json(); body.dropoff.options = { scheduled_time: target };
    return Response.json(body, { status: 201 });
  };
  const provider = createWoltProvider(f.deps);
  const fulfillment = { ...request(), readyAt: '2026-10-26T16:20:00Z', preparationMinutes: 20, desiredDelivery: { kind: 'scheduled', interval: { earliest: target, latest: target } } };
  const quote = await provider.quote(fulfillment);
  assert.equal(quote.kind, 'available');
  assert.equal(requests[0].min_preparation_time_minutes, 20);
  assert.equal(requests[0].scheduled_dropoff_time, '2026-10-26T17:00:00.000Z');
  assert.equal(f.stored.native.preparationMinutes, 20);
  assert.equal(f.stored.native.scheduledDropoffTime, target);
  const create = { ...createRequest(quote, fulfillment), deliveryInterval: fulfillment.desiredDelivery.interval };
  assert.equal((await provider.create({ ...create, fulfillment: { ...fulfillment, preparationMinutes: 21 } })).kind, 'rejected');
  assert.equal(f.creates, 0);
  assert.equal((await provider.create(create)).kind, 'accepted');
  assert.equal(f.creates, 1);
});

test('scheduled duration above Wolt bound and closed-now ASAP cannot request pickup using short explicit duration', async () => {
  for (const desiredDelivery of [{ kind: 'asap' }, { kind: 'scheduled', interval: { earliest: '2026-10-26T17:00:00Z', latest: '2026-10-26T17:00:00Z' } }]) {
    const f = fixture();
    const result = await createWoltProvider(f.deps).quote({ ...request(), readyAt: '2026-10-26T16:20:00Z', preparationMinutes: desiredDelivery.kind === 'asap' ? 20 : 61, desiredDelivery });
    assert.notEqual(result.kind, 'available'); assert.equal(f.calls, 0); assert.equal(f.stored, undefined);
    if (desiredDelivery.kind === 'scheduled') assert.equal(result.reason, 'unsupported_schedule');
  }
  const f = fixture(), originalFetch = f.deps.fetchImpl; let body;
  f.deps.fetchImpl = async (url, options) => { body = JSON.parse(options.body); return originalFetch(url, options); };
  assert.equal((await createWoltProvider(f.deps).quote({ ...request(), preparationMinutes: 1 })).kind, 'available');
  assert.equal(body.min_preparation_time_minutes, 20);
});

test('binding revoked or rotated during durable claim cannot send with earlier credentials', async () => {
  for (const mutate of [binding => { binding.active = false; }, binding => { binding.revision = '2'; },
    binding => { binding.merchantId = 'merchant-B'; }, binding => { binding.secretRef = 'sandbox/rotated'; }]) {
    const f = fixture(); f.deps.validateClaimedAttempt = async () => { mutate(f.binding); return true; };
    const provider = createWoltProvider(f.deps), quote = await provider.quote(request());
    const result = await provider.create(createRequest(quote));
    assert.equal(result.kind, 'rejected'); assert.equal(result.error.code, 'binding_changed_before_dispatch'); assert.equal(f.creates, 0);
  }
});

test('binding rotation during cancellation lookup prevents request using old credentials', async () => {
  const f = fixture(), load = f.deps.loadCancellation;
  f.deps.loadCancellation = async () => { const saved = await load(); f.binding.revision = '2'; return saved; };
  const result = await createWoltProvider(f.deps).cancel({ scope, providerDeliveryId: 'delivery-A', attemptRef: 'attempt-A', operatorReason: 'Customer request', acceptedFee: null, feeQuoteRef: null, feeQuoteRevision: null });
  assert.equal(result.kind, 'unknown'); assert.equal(result.error.code, 'binding_changed_before_cancellation'); assert.equal(f.calls, 0);
});
