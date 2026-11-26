const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { createWoltProvider, woltParcelDescription, woltFulfillmentFingerprint } = loadTs('src/lib/delivery/providers/wolt/provider.ts', { 'server-only': {} });
const contract = loadTs('src/lib/delivery/provider-contract.ts', { 'server-only': {} });
const { deliveryFulfillmentItems } = loadTs('src/lib/delivery/quotes/fulfillment-items.ts', { 'server-only': {} });

const start = Date.parse('2026-10-25T10:00:00Z');
const scope = { brandId: 'brand-A', locationId: 'location-A' };
const address = { country: 'DK', postcode: '1300', city: 'Copenhagen', street: 'Borgergade', building: '10', unit: null, coordinates: { latitude: 55.68, longitude: 12.58, source: 'test' } };
const margherita = { name: 'Margherita', quantity: 2, options: ['Ekstra ost', 'Uden løg'], unitPriceMinor: 8500 };
const request = (items = [margherita]) => ({ version: 1, scope, checkoutRef: 'checkout-A', providerId: 'wolt', pickup: address, dropoff: address,
  pickupContact: { name: 'Shop', phone: '+4511111111' }, dropoffContact: { name: 'Test', phone: '+4522222222' },
  instructions: '', readyAt: '2026-10-25T10:20:00Z', desiredDelivery: { kind: 'asap' }, items, bagCount: 1, requirements: [] });
function fixture() {
  let stored; const bodies = { quote: [], create: [] };
  const binding = { ...scope, provider: 'wolt', active: true, revision: '1', environment: 'sandbox', merchantId: 'merchant-A', venueId: 'venue-A', secretRef: 'sandbox/merchant-A' };
  const deps = { environment: 'sandbox', now: () => start, authorizeScope: async () => true, resolveBinding: async () => binding,
    resolveSecret: async () => 'synthetic_fake_credential', saveQuote: async q => { stored = structuredClone(q); }, loadQuote: async () => stored,
    validateClaimedAttempt: async () => true, loadCancellation: async () => null,
    fetchImpl: async (url, options) => {
      if (url.endsWith('/shipment-promises')) { bodies.quote.push(JSON.parse(options.body)); return Response.json({ id: 'promise-A', created_at: new Date(start).toISOString(), valid_until: new Date(start + 120000).toISOString(), is_binding: true, price: { amount: 4900, currency: 'DKK' }, pickup: { venue_id: 'venue-A', eta_minutes: 20 }, dropoff: { eta_minutes: 30, location: { coordinates: { lat: 55.68, lon: 12.58 }, formatted_address: 'Borgergade 10' } } }, { status: 201 }); }
      if (url.endsWith('/deliveries')) { bodies.create.push(JSON.parse(options.body)); return Response.json({ id: 'delivery-A', wolt_order_reference_id: 'wolt-A', merchant_order_reference_id: 'order-A', status: 'INFO_RECEIVED' }, { status: 201 }); }
      return Response.json({ status: 'REJECTED' });
    },
  };
  return { deps, bodies, get stored() { return stored; } };
}
const createRequest = (quote, fulfillment) => ({ version: 1, scope, providerId: 'wolt', orderRef: 'order-A', attemptRef: 'attempt-A', quoteRef: quote.quoteRef, requestDigest: 'a'.repeat(64), readyAt: fulfillment.readyAt, deliveryInterval: null, quotedCost: quote.cost, fulfillment });

test('contract: options and unit price are optional, bounded and validated', () => {
  const parse = items => contract.deliveryQuoteRequestSchema.safeParse(request(items)).success;
  assert.equal(parse([{ name: 'Pizza', quantity: 1 }]), true, 'stored quotes without the new fields still parse');
  assert.equal(parse([margherita]), true);
  assert.equal(parse([{ ...margherita, unitPriceMinor: 0 }]), true);
  for (const bad of [{ unitPriceMinor: -1 }, { unitPriceMinor: 12.5 }, { options: [''] }, { options: ['  '] }, { options: ['x'.repeat(151)] },
    { options: Array.from({ length: 101 }, (_, i) => `o${i}`) }, { options: 'Ekstra ost' }, { price: 8500 }]) {
    assert.equal(parse([{ ...margherita, ...bad }]), false, JSON.stringify(bad).slice(0, 80));
  }
  assert.deepEqual(contract.deliveryQuoteRequestSchema.parse(request([{ ...margherita, options: [' Ekstra ost '] }])).items[0].options, ['Ekstra ost']);
});

test('server-validated cart maps toppings, combo selections and per-unit price', () => {
  const items = deliveryFulfillmentItems([
    { id: 'p1', itemType: 'product', name: 'Margherita', quantity: 2, unitPrice: 75, totalPrice: 170, toppings: ['Ekstra ost', ' Uden løg ', ''] },
    { id: 'c1', itemType: 'combo', name: 'Burgermenu', quantity: 1, unitPrice: 119, totalPrice: 129, toppings: ['Burger: Bacon'],
      comboSelections: [{ groupId: 'g1', groupName: 'Burger', products: [{ id: 'b', name: 'Cheeseburger' }] }, { groupId: 'g2', groupName: 'Drik', products: [{ id: 'd', name: 'Cola' }] }] },
    { id: 'p2', name: 'Cola', quantity: 3, unitPrice: 25, totalPrice: 75 },
    { id: 'p3', name: 'Odd', quantity: 3, unitPrice: 0.33, totalPrice: 1 },
  ]);
  assert.deepEqual(items, [
    { name: 'Margherita', quantity: 2, options: ['Ekstra ost', 'Uden løg'], unitPriceMinor: 8500 },
    { name: 'Burgermenu', quantity: 1, options: ['Cheeseburger', 'Cola', 'Burger: Bacon'], unitPriceMinor: 12900 },
    { name: 'Cola', quantity: 3, unitPriceMinor: 2500 },
    { name: 'Odd', quantity: 3 },
  ]);
  assert.equal(contract.deliveryQuoteRequestSchema.safeParse(request(items)).success, true);
  const many = deliveryFulfillmentItems([{ name: 'Big', quantity: 1, unitPrice: 1, totalPrice: 1, toppings: Array.from({ length: 150 }, (_, i) => `${'t'.repeat(200)}${i}`) }]);
  assert.equal(many[0].options.length, 100); assert.ok(many[0].options.every(o => o.length <= 150));
  assert.equal(contract.deliveryQuoteRequestSchema.safeParse(request(many)).success, true);
});

test('Wolt quote and create send options in description and per-unit price with count', async () => {
  const f = fixture(), provider = createWoltProvider(f.deps), fulfillment = request([margherita, { name: 'Cola', quantity: 1, unitPriceMinor: 2500 }]);
  const quote = await provider.quote(fulfillment);
  assert.equal(quote.kind, 'available');
  assert.deepEqual(f.bodies.quote[0].parcels, [{ count: 2, price: { amount: 8500, currency: 'DKK' } }, { count: 1, price: { amount: 2500, currency: 'DKK' } }]);
  assert.equal(f.stored.fingerprint, woltFulfillmentFingerprint(fulfillment));
  const created = await provider.create(createRequest(quote, structuredClone(fulfillment)));
  assert.equal(created.kind, 'accepted');
  assert.deepEqual(f.bodies.create[0].parcels, [
    { count: 2, description: 'Margherita (Ekstra ost, Uden løg)', identifier: 'order-A-0', price: { amount: 8500, currency: 'DKK' } },
    { count: 1, description: 'Cola', identifier: 'order-A-1', price: { amount: 2500, currency: 'DKK' } },
  ]);
});

test('legacy items without options/price keep the previous parcel shape', async () => {
  const f = fixture(), provider = createWoltProvider(f.deps), fulfillment = request([{ name: 'Pizza', quantity: 1 }]);
  const quote = await provider.quote(fulfillment);
  assert.deepEqual(f.bodies.quote[0].parcels, [{ count: 1 }]);
  assert.equal((await provider.create(createRequest(quote, fulfillment))).kind, 'accepted');
  assert.deepEqual(f.bodies.create[0].parcels, [{ count: 1, description: 'Pizza', identifier: 'order-A-0' }]);
});

test('changed options or price after the quote cannot dispatch (fingerprint binds them)', async () => {
  for (const change of [{ options: ['Ekstra ost'] }, { unitPriceMinor: 1 }, { options: undefined }]) {
    const f = fixture(), provider = createWoltProvider(f.deps), quote = await provider.quote(request());
    const changed = request([{ ...margherita, ...change }]);
    if (change.options === undefined && 'options' in change) delete changed.items[0].options;
    const result = await provider.create(createRequest(quote, changed));
    assert.equal(result.kind, 'rejected'); assert.equal(result.error.code, 'quote_changed_or_expired'); assert.equal(f.bodies.create.length, 0);
  }
});

test('long option lists are capped to the Wolt description limit and still book', async () => {
  const options = Array.from({ length: 100 }, (_, i) => `Tilvalg nummer ${i} ${'x'.repeat(100)}`);
  const item = { name: 'P'.repeat(150), quantity: 1, options, unitPriceMinor: 100 };
  const description = woltParcelDescription(item);
  assert.equal(description.length, 500); assert.ok(description.endsWith('…')); assert.ok(description.startsWith(`${'P'.repeat(150)} (Tilvalg nummer 0`));
  assert.equal(woltParcelDescription({ name: 'Pizza', quantity: 1, options: [] }), 'Pizza');
  const f = fixture(), provider = createWoltProvider(f.deps), fulfillment = request([item]);
  const quote = await provider.quote(fulfillment);
  assert.equal(quote.kind, 'available');
  assert.equal((await provider.create(createRequest(quote, fulfillment))).kind, 'accepted');
  assert.equal(f.bodies.create[0].parcels[0].description, description);
});

test('a long description is cut on code points and never splits an emoji', () => {
  const name = `${'P'.repeat(498)}🍕🍕`;
  const description = woltParcelDescription({ name, quantity: 1 });
  assert.ok(description.length <= 500); assert.ok(description.endsWith('…'));
  assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(description), 'no lone surrogate');
});
