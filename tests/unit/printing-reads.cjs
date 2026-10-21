const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { AuthorityError } = loadTs('src/lib/access/authority.ts', { 'server-only': {} });

const configuration = (id, patch = {}) => ({ id, brandId: 'brand', locationId: 'location', name: 'Pizza ÆØÅ',
  manufacturer: 'star', model: 'mc-print3', transport: 'cloudprnt-http', state: 'disabled', paperWidthMm: 80, ...patch });
const record = (id, patch = {}) => ({ schemaVersion: 1, configuration: configuration(id), revision: 1,
  deletedAt: null, createdAt: { seconds: 1 }, updatedAt: { seconds: 2 }, ...patch });

function fixture({ rows = {}, locations = { location: { brandId: 'brand' } }, anonymous = false,
  forbidden = false, failDatabase = false, identityStatus, authorityStatus, totalOverride } = {}) {
  const calls = [];
  const snapshot = (id, value) => ({ id, exists: value !== undefined, data: () => value });
  const database = { collection(name) {
    assert.equal(name, 'locations');
    return { doc(locationId) { return {
      async get() { calls.push(['location', locationId]); return snapshot(locationId, locations[locationId]); },
      collection(collection) {
        assert.equal(collection, 'printers');
        calls.push(['printers', locationId]);
        return {
          doc(id) { return { async get() { calls.push(['detail', id]); if (failDatabase) throw Error('PRIVATE_SENTINEL'); return snapshot(id, rows[id]); } }; },
          where(field, op, value) {
            calls.push(['where', field, op, value]); assert.deepEqual([field, op, value], ['deletedAt', '==', null]);
            const makeQuery = (filters = [], after = '', limit) => {
              const matching = () => Object.keys(rows).sort().filter(id => rows[id].deletedAt === null && filters.every(([field, value]) => field.split('.').reduce((row, key) => row?.[key], rows[id]) === value));
              return {
                where(field, op, value) { assert.equal(op, '=='); assert.ok(['configuration.model', 'configuration.brandId', 'configuration.locationId'].includes(field)); return makeQuery([...filters, [field, value]], after, limit); },
                count() { return { get: async () => ({ data: () => ({ count: totalOverride === undefined ? matching().length : totalOverride }) }) }; },
                orderBy(field) { calls.push(['orderBy', field]); assert.equal(field, '__name__'); return makeQuery(filters, after, limit); },
                startAfter(cursor) { calls.push(['after', cursor]); return makeQuery(filters, cursor, limit); },
                limit(count) { calls.push(['limit', count]); assert.ok(count <= 51); return makeQuery(filters, after, count); },
                async get() {
                  calls.push(['list']); if (failDatabase) throw Error('PRIVATE_SENTINEL');
                  return { docs: matching().filter(id => id > after).slice(0, limit).map(id => snapshot(id, rows[id])) };
                },
              };
            };
            return makeQuery();
          },
        };
      },
    }; } };
  } };
  const { GET } = loadTs('src/app/api/merchant/printers/route.ts', {
    'server-only': {}, '@/lib/firebase-admin': { getAdminDb: () => database },
    '@/lib/access/authority': { AuthorityError },
    '@/lib/access/orderfly-session': { requirePlatformSuperuser: async () => ({ superuser: true }),
      verifiedOrderflyIdentity: async () => {
        if (identityStatus) throw new AuthorityError('PRIVATE_SENTINEL', identityStatus);
        if (anonymous) throw new AuthorityError('unauthorized', 401);
        return { provider: 'firebase', subject: 'user' };
      },
      requireOrderflyAccess: async (brandId, locationIds, permission) => {
        calls.push(['authorize', brandId, locationIds, permission]);
        assert.equal(permission, 'orderfly.catalog:view');
        if (authorityStatus) throw new AuthorityError('PRIVATE_SENTINEL', authorityStatus);
        if (forbidden || brandId !== 'brand' || locationIds.some(id => id !== 'location')) throw new AuthorityError('forbidden');
      },
    },
  });
  return { calls, async read(query = 'brandId=brand&locationId=location') {
    const response = await GET(new Request(`https://orderfly.dk/api/merchant/printers?${query}`));
    return { status: response.status, body: await response.json(), cache: response.headers.get('cache-control'), vary: response.headers.get('vary') };
  } };
}

test('authorized list and detail expose only validated DTOs and revision', async () => {
  const f = fixture({ rows: { p1: record('p1') } });
  const result = await f.read();
  assert.deepEqual(result, { status: 200, body: { items: [{ configuration: configuration('p1'), revision: 1 }], nextCursor: null }, cache: 'no-store', vary: 'Cookie' });
  assert.deepEqual(f.calls[0], ['authorize', 'brand', ['location'], 'orderfly.catalog:view']);
  assert.deepEqual(f.calls[1], ['location', 'location']);
  assert.ok(f.calls.some(call => call[0] === 'limit' && call[1] === 21));
  const detail = await f.read('brandId=brand&locationId=location&printerId=p1');
  assert.deepEqual(detail.body, { item: { configuration: configuration('p1'), revision: 1 } });
  assert.doesNotMatch(JSON.stringify(detail.body), /schemaVersion|createdAt|updatedAt|deletedAt/);
});

test('bounded ID pagination has no duplicates and tombstones are excluded', async () => {
  const f = fixture({ rows: { p1: record('p1'), p2: record('p2'), p3: record('p3'), p4: record('p4', { deletedAt: { seconds: 3 } }) } });
  const first = await f.read('brandId=brand&locationId=location&limit=2');
  assert.deepEqual(first.body.items.map(item => item.configuration.id), ['p1', 'p2']);
  assert.equal(first.body.nextCursor, 'p2');
  const second = await f.read('brandId=brand&locationId=location&limit=2&after=p2');
  assert.deepEqual(second.body.items.map(item => item.configuration.id), ['p3']);
  assert.equal(second.body.nextCursor, null);
  assert.ok(f.calls.some(call => call[0] === 'limit' && call[1] === 3));
  assert.equal((await f.read('brandId=brand&locationId=location&printerId=p4')).status, 404);
  assert.equal((await f.read('brandId=brand&locationId=location&printerId=missing')).status, 404);
  assert.deepEqual((await fixture().read()).body, { items: [], nextCursor: null });
});

test('unauthenticated and forbidden requests cannot read printer or location records', async () => {
  for (const anonymous of [true, false]) {
    const f = fixture({ anonymous, forbidden: !anonymous });
    const response = await f.read();
    assert.equal(response.status, anonymous ? 401 : 403);
    assert.equal(response.cache, 'no-store');
    assert.equal(f.calls.some(call => ['location', 'printers', 'list', 'detail'].includes(call[0])), false);
  }
  const anonymous = fixture({ anonymous: true });
  assert.equal((await anonymous.read('invalid=1')).status, 401);
});

test('foreign requested scope and independently loaded ownership mismatch fail closed', async () => {
  for (const query of ['brandId=foreign&locationId=location', 'brandId=brand&locationId=foreign']) {
    const f = fixture();
    assert.equal((await f.read(query)).status, 403);
    assert.equal(f.calls.some(call => call[0] === 'printers'), false);
  }
  for (const locations of [{}, { location: { brandId: 'foreign' } }]) {
    const f = fixture({ locations });
    assert.equal((await f.read()).status, 403);
    assert.equal(f.calls.some(call => call[0] === 'printers'), false);
  }
});

test('malformed query fields, duplicate parameters and excessive pages fail before database access', async () => {
  const base = 'brandId=brand&locationId=location';
  for (const query of ['', 'brandId=brand', `${base}&brandId=other`, `${base}&unknown=PRIVATE_SENTINEL`,
    `${base}&printerId=..%2Fsecret`, `${base}&after=a%2Fb`, `${base}&brandId=${'x'.repeat(129)}`,
    ...['0', '51', '1000', '-1', '1.5', 'NaN', '01', ''].map(limit => `${base}&limit=${limit}`),
    `${base}&printerId=p1&limit=1`, `${base}&printerId=p1&after=p0`]) {
    const f = fixture();
    const result = await f.read(query);
    assert.equal(result.status, 400, query);
    assert.deepEqual(result.body, { error: 'invalid_request' });
    assert.equal(f.calls.length, 0);
  }
  const max = fixture();
  assert.equal((await max.read(`${base}&limit=50`)).status, 200);
  assert.ok(max.calls.some(call => call[0] === 'limit' && call[1] === 51));
});

test('malformed, legacy, foreign or credential-bearing records never escape list or detail', async () => {
  for (const value of [
    { ...record('p1'), schemaVersion: 0 }, { ...record('p1'), revision: 0 },
    { ...record('p1'), configuration: configuration('different') },
    { ...record('p1'), configuration: configuration('p1', { brandId: 'PRIVATE_SENTINEL' }) },
    { ...record('p1'), configuration: configuration('p1', { locationId: 'PRIVATE_SENTINEL' }) },
    { ...record('p1'), configuration: configuration('p1', { name: 'Pizza\u202e' }) },
    { ...record('p1'), configuration: configuration('p1', { credentials: 'PRIVATE_SENTINEL' }) },
    { ...record('p1'), token: 'PRIVATE_SENTINEL' },
  ]) {
    const f = fixture({ rows: { p1: value } });
    const list = await f.read();
    assert.deepEqual(list.body, { error: 'printers_unavailable' });
    assert.equal(list.status, 503);
    const detail = await f.read('brandId=brand&locationId=location&printerId=p1');
    assert.deepEqual(detail.body, { error: 'not_found' });
    assert.equal(detail.status, 404);
    assert.doesNotMatch(JSON.stringify([list.body, detail.body]), /PRIVATE_SENTINEL|different|token|credentials/);
  }
});

test('unexpected database failures are generic no-store errors without private details', async () => {
  const f = fixture({ failDatabase: true });
  for (const query of ['brandId=brand&locationId=location', 'brandId=brand&locationId=location&printerId=p1']) {
    const result = await f.read(query);
    assert.deepEqual(result, { status: 503, body: { error: 'printers_unavailable' }, cache: 'no-store', vary: 'Cookie' });
  }
});

test('authority outages/configuration failures remain 503 rather than permission denials', async () => {
  for (const phase of ['identityStatus', 'authorityStatus']) {
    for (const status of [400, 401, 403, 409, 500, 503]) {
      const f = fixture({ [phase]: status });
      const result = await f.read();
      const expectedStatus = [401, 403].includes(status) ? status : 503;
      const error = status === 401 ? 'unauthorized' : status === 403 ? 'forbidden' : 'printers_unavailable';
      assert.deepEqual(result, { status: expectedStatus, body: { error }, cache: 'no-store', vary: 'Cookie' });
      assert.equal(f.calls.some(call => ['location', 'printers', 'list', 'detail'].includes(call[0])), false);
    }
  }
});

 test('overview count is native scope total independent of server model filter and page', async () => {
  const rows = Object.fromEntries(Array.from({ length: 24 }, (_, i) => { const key = 'p' + String(i).padStart(2, '0'); return [key, record(key, { configuration: configuration(key, { model: i < 21 ? 'mc-print3' : 'mc-print2', paperWidthMm: i < 21 ? 80 : 58 }) })]; }));
  const f = fixture({ rows });
  const first = await f.read('brandId=brand&locationId=location&overview=true&model=mc-print2&limit=2');
  assert.equal(first.status, 200); assert.equal(first.body.totalPrinters, 24);
  assert.deepEqual(first.body.items.map(row => row.configuration.id), ['p21', 'p22']); assert.equal(first.body.nextCursor, 'p22');
  const second = await f.read('brandId=brand&locationId=location&overview=true&model=mc-print2&limit=2&after=p22');
  assert.equal(second.body.totalPrinters, 24); assert.deepEqual(second.body.items.map(row => row.configuration.id), ['p23']); assert.equal(second.body.nextCursor, null);
  for (const suffix of ['model=other', 'overview=false', 'printerId=p21&overview=true', 'printerId=p21&model=mc-print2']) assert.equal((await f.read('brandId=brand&locationId=location&' + suffix)).status, 400);
 });

test('overview count corruption fails closed without changing legacy/detail projections', async () => {
 for (const totalOverride of [-1, 0, 1.1, Number.MAX_SAFE_INTEGER + 1, '1', null]) {
  const f = fixture({ rows: { p1: record('p1') }, totalOverride });
  const result = await f.read('brandId=brand&locationId=location&overview=true');
  assert.equal(result.status, 503); assert.deepEqual(result.body, { error: 'printers_unavailable' });
  assert.equal((await f.read()).status, 200);
 }
});

test('overview aggregate excludes a foreign configuration even beyond the visible page', async () => {
 const f = fixture({ rows: { p1: record('p1'), p2: record('p2'), p3: record('p3', { configuration: configuration('p3', { brandId: 'foreign' }) }) } });
 const result = await f.read('brandId=brand&locationId=location&overview=true&limit=1');
 assert.equal(result.status, 200); assert.equal(result.body.totalPrinters, 2); assert.equal(result.body.items[0].configuration.id, 'p1');
});
