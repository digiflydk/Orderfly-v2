const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { createGeoapifyRoutingAdapter: create } = loadTs('src/lib/delivery/routing/geoapify/adapter.ts', { 'server-only': {} });
const address = { street: 'Testvej 1', postalCode: '2300', city: 'København', countryCode: 'DK' };
function geocode(number = '1') { return { results: [{ place_id: 'osm-' + number, lat: 55.6, lon: 12.5,
  country_code: 'dk', postcode: '2300', street: 'Testvej', housenumber: number, result_type: 'building',
  rank: { confidence: 1, match_type: 'full_match' }, datasource: { sourcename: 'openstreetmap' } }] }; }
const route = () => ({ type: 'FeatureCollection', features: [{ properties: { distance: 1234.2, distance_units: 'Meters', time: 120.1 } }] });
const json = data => Response.json(data);
function setup(extra = {}) {
  const events = [], calls = [];
  const options = { apiKey: 'synthetic-key', reserveQuote: async () => { events.push('quote'); return true; },
    reserveRequest: async () => { events.push('request'); return true; }, fetch: async (url, init) => {
      calls.push({ url: new URL(url), init }); events.push('fetch');
      return json(url.includes('/geocode/') ? geocode(new URL(url).searchParams.get('housenumber')) : route());
    }, ...extra };
  return { adapter: create(options), options, calls, events };
}
async function points(adapter) {
  const pickup = await adapter.resolve(address), dropoff = await adapter.resolve({ ...address, street: 'Testvej 2' });
  assert.equal(pickup.kind, 'verified'); assert.equal(dropoff.kind, 'verified');
  return { pickup: pickup.address, dropoff: dropoff.address, profile: 'car' };
}
test('single lazy reservation covers exactly two projected EU geocodes and one metric route', async () => {
  const f = setup(); assert.deepEqual(f.events, []);
  const p = await points(f.adapter);
  assert.deepEqual(await f.adapter.route(p), { kind: 'route', meters: 1235, durationSeconds: 121 });
  assert.deepEqual(f.events, ['quote', 'request', 'fetch', 'request', 'fetch', 'request', 'fetch']);
  for (const { url, init } of f.calls) {
    assert.equal(url.origin, 'https://api-eu.geoapify.com'); assert.equal(init.redirect, 'error');
    assert.equal(init.cache, 'no-store'); assert.equal(init.method, 'GET'); assert.equal(url.searchParams.get('apiKey'), 'synthetic-key');
  }
  const query = f.calls[0].url.searchParams;
  assert.equal(query.get('filter'), 'countrycode:dk'); assert.equal(query.get('limit'), '2');
  assert.equal(query.get('street'), 'Testvej'); assert.equal(query.get('housenumber'), '1');
  const rq = f.calls[2].url.searchParams;
  assert.equal(rq.get('waypoints'), '55.6,12.5|55.6,12.5'); assert.equal(rq.get('mode'), 'drive');
  assert.equal(rq.get('units'), 'metric'); assert.equal(rq.get('traffic'), 'free_flow'); assert.equal(rq.has('details'), false);
  assert.equal((await f.adapter.resolve(address)).kind, 'unavailable');
  assert.equal((await f.adapter.route(p)).kind, 'unavailable'); assert.equal(f.calls.length, 3);
});
test('unsupported and incomplete addresses cause no budget or network use', async () => {
  for (const bad of [{ ...address, countryCode: 'SE' }, { ...address, street: 'Testvej' }, { ...address, street: 'Testvej 1, 2. tv' }, { ...address, postalCode: '23' }]) {
    const f = setup(); assert.equal((await f.adapter.resolve(bad)).kind, 'invalid'); assert.deepEqual(f.events, []);
  }
});
test('reject corrected, ambiguous, nonbuilding, low-confidence, foreign and non-OSM results', async () => {
  for (const mutate of [d => d.results.push(d.results[0]), d => d.results[0].country_code = 'se', d => d.results[0].postcode = '2200',
    d => d.results[0].housenumber = '3', d => d.results[0].street = 'Testgade', d => d.results[0].result_type = 'street',
    d => d.results[0].rank.confidence = 0.94, d => d.results[0].rank.match_type = 'match_by_street',
    d => d.results[0].rank.confidence_building_level = 0, d => d.results[0].datasource.sourcename = 'other',
    d => d.results[0].lat = 91, d => d.results[0].lon = null, d => d.results[0].place_id = '' ]) {
    const data = geocode(); mutate(data);
    const f = setup({ fetch: async () => json(data) }); assert.notEqual((await f.adapter.resolve(address)).kind, 'verified');
  }
  assert.equal((await setup({ fetch: async () => json({ results: [] }) }).adapter.resolve(address)).kind, 'invalid');
});
test('budget denial and exception fail closed without requests or second reservation', async () => {
  for (const reserveQuote of [async () => false, async () => { throw Error('private'); }]) {
    let reservations = 0;
    const f = setup({ reserveQuote: async () => { reservations++; return reserveQuote(); } });
    assert.equal((await f.adapter.resolve(address)).kind, 'unavailable'); assert.equal((await f.adapter.resolve(address)).kind, 'unavailable');
    assert.equal(reservations, 1); assert.equal(f.calls.length, 0);
  }
  for (const reserveRequest of [async () => false, async () => { throw Error('private'); }]) {
    const f = setup({ reserveRequest }); assert.equal((await f.adapter.resolve(address)).kind, 'unavailable'); assert.equal(f.calls.length, 0);
  }
});
test('concurrent resolves share reservation and third resolve cannot escape request cap', async () => {
  const f = setup(); const results = await Promise.all([f.adapter.resolve(address), f.adapter.resolve(address), f.adapter.resolve(address)]);
  assert.equal(results.filter(r => r.kind === 'verified').length, 2); assert.equal(f.calls.length, 2);
  assert.equal(f.events.filter(e => e === 'quote').length, 1);
});
test('route requires the instance verified endpoints and supported profile before I/O', async () => {
  const f = setup(), p = await points(f.adapter);
  for (const bad of [{ ...p, profile: 'bicycle' }, { ...p, pickup: { ...p.pickup, latitude: 55.7 } }, { ...p, pickup: p.dropoff, dropoff: p.pickup }]) {
    assert.equal((await f.adapter.route(bad)).kind, 'unavailable'); assert.equal(f.calls.length, 2);
  }
  assert.equal((await f.adapter.route(p)).kind, 'route');
});
test('missing numeric evidence never becomes zero; empty route remains distinct', async () => {
  for (const mutate of [d => delete d.features[0].properties.distance, d => d.features[0].properties.distance = -1,
    d => d.features[0].properties.distance = '12', d => d.features[0].properties.time = null,
    d => d.features[0].properties.distance_units = 'Miles', d => d.features.push(d.features[0])]) {
    const data = route(); mutate(data);
    const f = setup({ fetch: async url => json(url.includes('/geocode/') ? geocode(new URL(url).searchParams.get('housenumber')) : data) });
    assert.equal((await f.adapter.route(await points(f.adapter))).kind, 'unavailable');
  }
  const f = setup({ fetch: async url => json(url.includes('/geocode/') ? geocode() : { type: 'FeatureCollection', features: [] }) });
  const p1 = await f.adapter.resolve(address), p2 = await f.adapter.resolve(address);
  assert.deepEqual(await f.adapter.route({ pickup: p1.address, dropoff: p2.address, profile: 'car' }), { kind: 'no_route' });
});
test('transport failures and oversized bodies return safe outcomes without retry', async () => {
  for (const reply of [async () => new Response('private', { status: 429 }), async () => { throw Error('synthetic-key private URL'); },
    async () => new Response('bad-json'), async () => new Response(' '.repeat(1_000_001))]) {
    let count = 0; const f = setup({ fetch: async () => { count++; return reply(); } });
    assert.deepEqual(await f.adapter.resolve(address), { kind: 'unavailable' }); assert.equal(count, 1);
  }
  let signal; const f = setup({ timeoutMs: 10, fetch: async (_, init) => { signal = init.signal; return new Promise(() => {}); } });
  assert.deepEqual(await f.adapter.resolve(address), { kind: 'unavailable' }); assert.equal(signal.aborted, true);
});
test('mutable caller dependencies and address cannot change an in-flight operation', async () => {
  let release; const wait = new Promise(resolve => { release = resolve; });
  const f = setup({ reserveQuote: async () => { await wait; return true; } }), input = { ...address };
  const pending = f.adapter.resolve(input);
  input.street = 'Changed 9'; input.postalCode = '9999'; f.options.apiKey = 'changed-key'; f.options.fetch = async () => { throw Error('mutated'); };
  release(); assert.equal((await pending).kind, 'verified'); assert.equal(f.calls[0].url.searchParams.get('apiKey'), 'synthetic-key');
  assert.equal(f.calls[0].url.searchParams.get('street'), 'Testvej');
});
