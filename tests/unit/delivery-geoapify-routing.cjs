const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { createGeoapifyRoutingAdapter: create } = loadTs('src/lib/delivery/routing/geoapify/adapter.ts', { 'server-only': {} });
const address = { street: 'Testvej 1', postalCode: '2300', city: 'København', countryCode: 'DK' };
function geocode(number = '1') { return { results: [{ place_id: 'osm-' + number, lat: 55.6, lon: 12.5,
  country_code: 'dk', postcode: '2300', street: 'Testvej', housenumber: number, result_type: 'building',
  rank: { confidence: 1, match_type: 'full_match' }, datasource: { sourcename: 'openstreetmap' } }] }; }
const route = () => ({ type: 'FeatureCollection', features: [{ properties: { distance: 1234.2, distance_units: 'meters', time: 120.1 } }] });
const json = data => Response.json(data);
function setup(extra = {}) {
  const events = [], calls = [];
  const options = { apiKey: 'synthetic-key', reserveQuote: async () => { events.push('quote'); return true; },
    reserveRequest: async () => { events.push('request'); return { sendBeforeMs: Date.now() + 1000 }; }, fetch: async (url, init) => {
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
test('concurrent geocodes preserve invocation order when dropoff finishes first',{timeout:2000},async()=>{
 let releasePickup,dropoffReturned=false;
 const gate=new Promise(resolve=>{releasePickup=resolve;});
 const f=setup({fetch:async(url)=>{
  const parsed=new URL(url);
  if(parsed.pathname.includes('/geocode/')){
   const number=parsed.searchParams.get('housenumber');
   if(number==='1')await gate;else dropoffReturned=true;
   const data=geocode(number);data.results[0].lat=number==='1'?55.6:55.7;return json(data);
  }
  assert.equal(parsed.searchParams.get('waypoints'),'55.6,12.5|55.7,12.5');return json(route());
 }});
 const pickup=f.adapter.resolve(address),dropoff=f.adapter.resolve({...address,street:'Testvej 2'});
 const destination=await dropoff;assert.equal(dropoffReturned,true);assert.equal(destination.kind,'verified');
 // An unresolved pickup cannot be replaced by the already resolved destination.
 assert.equal((await f.adapter.route({pickup:destination.address,dropoff:destination.address,profile:'car'})).kind,'unavailable');
 releasePickup();const origin=await pickup;assert.equal(origin.kind,'verified');
 assert.equal((await f.adapter.route({pickup:origin.address,dropoff:destination.address,profile:'car'})).kind,'route');
 assert.equal(f.events.filter(event=>event==='quote').length,1);
 assert.equal(f.events.filter(event=>event==='request').length,3);
});
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
  for (const reserveRequest of [async () => null, async () => { throw Error('private'); }]) {
    const f = setup({ reserveRequest }); assert.equal((await f.adapter.resolve(address)).kind, 'unavailable'); assert.equal(f.calls.length, 0);
  }
});
test('expired, boundary and malformed request grants cannot initiate network requests', async () => {
  const realNow = Date.now;
  Date.now = () => 2000;
  try {
    for (const grant of [null, true, false, {}, [], { sendBeforeMs: '3000' }, { sendBeforeMs: Infinity },
      { sendBeforeMs: NaN }, { sendBeforeMs: 3000.5 }, { sendBeforeMs: Number.MAX_SAFE_INTEGER + 1 },
      { sendBeforeMs: 1999 }, { sendBeforeMs: 2000 }, { sendBeforeMs: 3001 }]) {
      let reservations = 0;
      const f = setup({ reserveRequest: async () => { reservations++; return grant; } });
      assert.deepEqual(await f.adapter.resolve(address), { kind: 'unavailable' });
      assert.equal(f.calls.length, 0); assert.equal(reservations, 1);
    }
    const f = setup({ reserveRequest: async () => ({ sendBeforeMs: 2001 }) });
    assert.equal((await f.adapter.resolve(address)).kind, 'verified'); assert.equal(f.calls.length, 1);
  } finally { Date.now = realNow; }
});
test('grant delayed past its send deadline fails closed without renewal', async () => {
  const realNow = Date.now;
  let now = 1000, reservations = 0;
  Date.now = () => now;
  try {
    const f = setup({ reserveRequest: async () => {
      reservations++;
      const grant = { sendBeforeMs: now + 1000 };
      await Promise.resolve();
      now = 2000;
      return grant;
    } });
    assert.deepEqual(await f.adapter.resolve(address), { kind: 'unavailable' });
    assert.equal(f.calls.length, 0); assert.equal(reservations, 1);
  } finally { Date.now = realNow; }
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
    d => d.features[0].properties.distance_units = 'Miles', d => d.features[0].properties.distance_units = 'miles',
    d => d.features[0].properties.distance_units = 'METERS', d => delete d.features[0].properties.distance_units,
    d => d.features.push(d.features[0])]) {
    const data = route(); mutate(data);
    const f = setup({ fetch: async url => json(url.includes('/geocode/') ? geocode(new URL(url).searchParams.get('housenumber')) : data) });
    assert.equal((await f.adapter.route(await points(f.adapter))).kind, 'unavailable');
  }
  const f = setup({ fetch: async url => json(url.includes('/geocode/') ? geocode() : { type: 'FeatureCollection', features: [] }) });
  const p1 = await f.adapter.resolve(address), p2 = await f.adapter.resolve(address);
  assert.deepEqual(await f.adapter.route({ pickup: p1.address, dropoff: p2.address, profile: 'car' }), { kind: 'no_route' });
});
test('documented capitalized Meters remains compatible with observed lowercase meters', async () => {
  const data = route(); data.features[0].properties.distance_units = 'Meters';
  const f = setup({ fetch: async url => json(url.includes('/geocode/') ? geocode(new URL(url).searchParams.get('housenumber')) : data) });
  assert.deepEqual(await f.adapter.route(await points(f.adapter)), { kind: 'route', meters: 1235, durationSeconds: 121 });
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
test('default timeout allows a six-second connection response and clears its abort timer', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let started, signal, calls = 0;
  const ready = new Promise(resolve => { started = resolve; });
  const f = setup({ fetch: async (_, init) => {
    calls++; signal = init.signal; started();
    return new Promise(resolve => setTimeout(() => resolve(json(geocode())), 6000));
  } });
  const pending = f.adapter.resolve(address);
  await ready;
  t.mock.timers.tick(4500);
  assert.equal(signal.aborted, false);
  t.mock.timers.tick(1500);
  assert.equal((await pending).kind, 'verified');
  t.mock.timers.tick(4000);
  assert.equal(signal.aborted, false); assert.equal(calls, 1);
  assert.deepEqual(f.events, ['quote', 'request']);
});
test('default timeout aborts at ten seconds without a retry or renewed quota', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let started, signal, calls = 0;
  const ready = new Promise(resolve => { started = resolve; });
  const f = setup({ fetch: async (_, init) => {
    calls++; signal = init.signal; started(); return new Promise(() => {});
  } });
  const pending = f.adapter.resolve(address);
  await ready;
  t.mock.timers.tick(9999);
  assert.equal(signal.aborted, false);
  t.mock.timers.tick(1);
  assert.deepEqual(await pending, { kind: 'unavailable' });
  assert.equal(signal.aborted, true); assert.equal(calls, 1);
  assert.deepEqual(f.events, ['quote', 'request']);
});
test('invalid timeout configuration rejects before reserving quota or making requests', () => {
  let calls = 0;
  for (const timeoutMs of [0, -1, 10001, 1.5, NaN, Infinity, '10000']) {
    assert.throws(() => create({ apiKey: 'synthetic-key', timeoutMs,
      reserveQuote: async () => { calls++; return true; },
      reserveRequest: async () => { calls++; return { sendBeforeMs: Date.now() + 1000 }; },
      fetch: async () => { calls++; return json(geocode()); },
    }), /invalid_routing_configuration/);
  }
  assert.equal(calls, 0);
});
test('mutable caller dependencies and address cannot change an in-flight operation', async () => {
  let release; const wait = new Promise(resolve => { release = resolve; });
  const f = setup({ reserveQuote: async () => { await wait; return true; } }), input = { ...address };
  const pending = f.adapter.resolve(input);
  input.street = 'Changed 9'; input.postalCode = '9999'; f.options.apiKey = 'changed-key'; f.options.fetch = async () => { throw Error('mutated'); };
  release(); assert.equal((await pending).kind, 'verified'); assert.equal(f.calls[0].url.searchParams.get('apiKey'), 'synthetic-key');
  assert.equal(f.calls[0].url.searchParams.get('street'), 'Testvej');
});
