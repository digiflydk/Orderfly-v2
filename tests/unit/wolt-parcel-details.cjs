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

// Catalog shaped like the rehearsal's: a required base group whose free default is
// "Almindelig bund", paid extras, and a pizza menu whose pizza carries modifiers.
const { validateCheckoutItems } = loadTs('src/lib/checkout-items.ts', { 'server-only': {} });
const product = (id, productName, price, toppingGroupIds) => ({ id, brandId: 'b', locationIds: ['l'], isActive: true, productName, price, ...(toppingGroupIds ? { toppingGroupIds } : {}) });
const topping = (id, groupId, toppingName, price, extra = {}) => ({ id, groupId, locationIds: ['l'], isActive: true, toppingName, price, ...extra });
const catalog = {
  products: [product('marg', '1. Margherita (V)', 75, ['base', 'extra']), product('pep', '4. Pepperoni', 85, ['base', 'extra']), product('pepsi', 'Pepsi Max 0,33 l', 20), product('dip', 'Hvidløgsbæger', 10)],
  combos: [{ id: 'menu', brandId: 'b', locationIds: ['l'], isActive: true, comboName: 'Pizzamenu', pickupPrice: 129, deliveryPrice: 129, orderTypes: ['pickup', 'delivery'], activeDays: [], activeTimeSlots: [],
    productGroups: [{ id: 'g-pizza', groupName: 'Pizza', productIds: ['pep', 'marg'], minSelection: 1, maxSelection: 1 }, { id: 'g-drink', groupName: 'Drik', productIds: ['pepsi'], minSelection: 1, maxSelection: 1 }, { id: 'g-dip', groupName: 'Dip', productIds: ['dip'], minSelection: 1, maxSelection: 1 }] }],
  groups: [{ id: 'base', groupName: 'Bund', locationIds: ['l'], minSelection: 1, maxSelection: 1, selectionMode: 'single' }, { id: 'extra', groupName: 'Ekstra', locationIds: ['l'], minSelection: 0, maxSelection: 0 }],
  toppings: [topping('almindelig', 'base', 'Almindelig bund', 0, { isDefault: true }), topping('fuldkorn', 'base', 'Fuldkornsbund', 10),
    topping('svampe', 'extra', 'Svampe', 10), topping('kylling', 'extra', 'Kylling', 15), topping('rucola', 'extra', 'Rucola', 0), topping('ost', 'extra', 'Ekstra ost', 5, { isDefault: true }),
    topping('dobbelt', 'extra', 'Dobbelt kylling', 0, { isDefault: true, maxQuantity: 2 })],
  discounts: [], upsells: [],
};
const checkoutScope = { brandId: 'b', locationId: 'l', deliveryType: 'delivery', now: new Date('2026-10-25T10:00:00Z') };
const pizza = (toppingIds, quantities, totalPrice) => ({ id: 'marg', itemType: 'product', name: 'browser label', quantity: 1, unitPrice: 75, totalPrice, toppings: toppingIds.map(() => 'browser label'), toppingIds, toppingQuantities: quantities ?? toppingIds.map(() => 1) });
const menu = (modifiers, totalPrice = 129) => ({ id: 'menu', itemType: 'combo', name: 'browser label', quantity: 1, unitPrice: 129, totalPrice, toppings: [],
  comboSelections: [{ groupId: 'g-pizza', groupName: 'Pizza', products: [{ id: 'pep', name: 'x', ...(modifiers ? { modifiers } : {}) }] }, { groupId: 'g-drink', groupName: 'Drik', products: [{ id: 'pepsi', name: 'x' }] }, { groupId: 'g-dip', groupName: 'Dip', products: [{ id: 'dip', name: 'x' }] }] });
const parcels = cart => { const validated = validateCheckoutItems(cart, catalog, checkoutScope); return deliveryFulfillmentItems(validated.items, validated.options); };

test('rehearsal cart: included defaults are left out and combo modifiers sit under their selection', () => {
  const items = parcels([pizza(['svampe', 'kylling', 'almindelig'], null, 100), menu([{ id: 'almindelig', quantity: 1 }, { id: 'rucola', quantity: 1 }])]);
  assert.deepEqual(items, [
    { name: '1. Margherita (V)', quantity: 1, options: ['Svampe', 'Kylling'], unitPriceMinor: 10000 },
    { name: 'Pizzamenu', quantity: 1, options: ['4. Pepperoni: Rucola', 'Pepsi Max 0,33 l', 'Hvidløgsbæger'], unitPriceMinor: 12900 },
  ]);
  assert.equal(woltParcelDescription(items[0]), '1. Margherita (V) (Svampe, Kylling)');
  assert.equal(woltParcelDescription(items[1]), 'Pizzamenu (4. Pepperoni: Rucola, Pepsi Max 0,33 l, Hvidløgsbæger)');
  assert.equal(contract.deliveryQuoteRequestSchema.safeParse(request(items)).success, true);
});

test('only free, unchanged defaults are hidden; chosen, charged, changed-quantity and non-default choices stay', () => {
  // Non-default base, a charged default and a default at a changed quantity are all listed.
  const [line] = parcels([pizza(['fuldkorn', 'ost', 'dobbelt'], [1, 1, 2], 90)]);
  assert.deepEqual(line.options, ['Fuldkornsbund', 'Ekstra ost', '2 × Dobbelt kylling']);
  // A product override can make an option a default (or remove its default status).
  const overridden = structuredClone(catalog);
  overridden.products[0].toppingOverrides = { svampe: { isDefault: true, price: 0 }, almindelig: { isDefault: false } };
  const validated = validateCheckoutItems([pizza(['svampe', 'almindelig'], null, 75)], overridden, checkoutScope);
  assert.deepEqual(deliveryFulfillmentItems(validated.items, validated.options)[0].options, ['Almindelig bund']);
  // Only defaults: the parcel carries just the name.
  const [plain] = parcels([pizza(['almindelig'], null, 75)]);
  assert.deepEqual(plain, { name: '1. Margherita (V)', quantity: 1, unitPriceMinor: 7500 });
  assert.equal(woltParcelDescription(plain), '1. Margherita (V)');
});

test('combo components: several modifiers join under one selection, plain and legacy components list just the product', () => {
  assert.deepEqual(parcels([menu([{ id: 'almindelig', quantity: 1 }, { id: 'rucola', quantity: 1 }, { id: 'kylling', quantity: 1 }], 144)])[0].options,
    ['4. Pepperoni: Rucola + Kylling', 'Pepsi Max 0,33 l', 'Hvidløgsbæger']);
  assert.deepEqual(parcels([menu([{ id: 'almindelig', quantity: 1 }])])[0].options, ['4. Pepperoni', 'Pepsi Max 0,33 l', 'Hvidløgsbæger']);
  assert.deepEqual(parcels([menu()])[0].options, ['4. Pepperoni', 'Pepsi Max 0,33 l', 'Hvidløgsbæger']);
  // Options never repeat the menu name or a component prefix.
  const [line] = parcels([menu([{ id: 'almindelig', quantity: 1 }, { id: 'rucola', quantity: 1 }])]);
  assert.ok(line.options.every(option => !option.includes('Pizzamenu')));
  assert.equal(line.options.filter(option => option.includes('4. Pepperoni')).length, 1);
});

test('fulfillment mapping keeps per-unit price, option bounds and requires the parallel option list', () => {
  const none = { components: [], toppings: [] };
  const items = deliveryFulfillmentItems([
    { name: 'Margherita', quantity: 2, unitPrice: 75, totalPrice: 170 },
    { name: 'Cola', quantity: 3, unitPrice: 25, totalPrice: 75 },
    { name: 'Odd', quantity: 3, unitPrice: 0.33, totalPrice: 1 },
  ], [{ components: [], toppings: [{ label: 'Ekstra ost', includedDefault: false }, { label: ' Uden løg ', includedDefault: false }, { label: '', includedDefault: false }] }, none, none]);
  assert.deepEqual(items, [
    { name: 'Margherita', quantity: 2, options: ['Ekstra ost', 'Uden løg'], unitPriceMinor: 8500 },
    { name: 'Cola', quantity: 3, unitPriceMinor: 2500 },
    { name: 'Odd', quantity: 3 },
  ]);
  const many = deliveryFulfillmentItems([{ name: 'Big', quantity: 1, unitPrice: 1, totalPrice: 1 }],
    [{ components: [{ name: 'C'.repeat(140), modifiers: [{ label: 'm'.repeat(40), includedDefault: false }] }], toppings: Array.from({ length: 150 }, (_, i) => ({ label: `${'t'.repeat(200)}${i}`, includedDefault: false })) }]);
  assert.equal(many[0].options.length, 100); assert.ok(many[0].options.every(o => o.length <= 150));
  assert.equal(contract.deliveryQuoteRequestSchema.safeParse(request(many)).success, true);
  assert.throws(() => deliveryFulfillmentItems([{ name: 'A', quantity: 1, unitPrice: 1, totalPrice: 1 }], []), /delivery_items_options_mismatch/);
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

test('checkout Etage/dør reaches the Wolt drop-off comment apart from the message and is bound by the fingerprint', async () => {
  const { normalizeDanishDeliveryAddress } = loadTs('src/lib/delivery/quotes/address.ts');
  const normalized = normalizeDanishDeliveryAddress({ street: 'Borgergade 10, 4. tv.', postcode: '1300', city: 'Copenhagen', country: 'DK', unit: ' 2. th. ' });
  const dropoff = { ...normalized, coordinates: address.coordinates };
  const fulfillment = { ...request(), dropoff, instructions: 'Ring på hos Jensen' };
  const f = fixture(), provider = createWoltProvider(f.deps), quote = await provider.quote(fulfillment);
  assert.equal(quote.kind, 'available');
  assert.equal(JSON.stringify(f.bodies.quote[0]).includes('2. th.'), false, 'floor/door is not part of the priced address');
  assert.equal((await provider.create(createRequest(quote, fulfillment))).kind, 'accepted');
  assert.equal(f.bodies.create[0].dropoff.comment, 'Etage/dør: 2. th.\nBesked: Ring på hos Jensen');
  // A changed or removed unit after quoting cannot dispatch the old quote, exactly like a changed address or message.
  for (const changed of [{ dropoff: { ...dropoff, unit: '3. th.' } }, { dropoff: { ...dropoff, unit: null } }, { instructions: 'Ring på hos Hansen' }]) {
    const g = fixture(), other = createWoltProvider(g.deps), q = await other.quote(fulfillment);
    assert.notEqual(woltFulfillmentFingerprint({ ...fulfillment, ...changed }), woltFulfillmentFingerprint(fulfillment));
    const result = await other.create(createRequest(q, { ...fulfillment, ...changed }));
    assert.equal(result.kind, 'rejected'); assert.equal(result.error.code, 'quote_changed_or_expired'); assert.equal(g.bodies.create.length, 0);
  }
});
