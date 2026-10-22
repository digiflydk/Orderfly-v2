const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const crypto = loadTs('src/lib/printing/device-auth.ts', { 'server-only': {} });
const scope = { brandId: 'b1', locationId: 'l1', printerId: 'p1' };
const filename = 'src/app/api/cloudprnt/[brandId]/[locationId]/[printerId]/route.ts';

function fixture() {
  const draft = crypto.createPrinterDeviceCredentialDraft({ ...scope, printerRevision: 3, credentialRevision: 1 });
  const credentialPath = 'locations/l1/printers/p1/deviceCredentials/current';
  const rows = new Map([
    ['brands/b1', { status: 'active' }], ['locations/l1', { brandId: 'b1' }],
    ['locations/l1/printers/p1', { schemaVersion: 1, revision: 3, deletedAt: null,
      configuration: { id: 'p1', brandId: 'b1', locationId: 'l1', name: 'Pilot', manufacturer: 'star',
        model: 'mc-print3', transport: 'cloudprnt-http', state: 'active', paperWidthMm: 80 } }],
    [credentialPath, draft.record],
  ]);
  const reads = [], writes = [], options = []; let adminCalls = 0, retry, fail, finish;
  const collection = path => ({ doc: id => ({ id, path: `${path}/${id}`, collection: name => collection(`${path}/${id}/${name}`) }) });
  const transaction = {
    get: async ref => { reads.push(ref.path); if (fail) throw fail;
      return { id: ref.id, exists: rows.has(ref.path), data: () => rows.get(ref.path) }; },
    create: () => writes.push('create'), set: () => writes.push('set'), update: () => writes.push('update'), delete: () => writes.push('delete'),
  };
  const db = { collection, runTransaction: async (callback, opts) => {
    options.push(opts); await callback(transaction);
    if (retry) { retry(); await callback(transaction); }
    if (finish) await finish();
  } };
  // Actual exported Next route -> real HTTP adapter -> Basic/native verifier ->
  // real credential crypto. Only native Admin I/O is isolated.
  const route = loadTs(filename, { 'server-only': {}, '@/lib/firebase-admin': { getAdminDb: () => { adminCalls++; return db; } } });
  const authorization = 'Basic ' + Buffer.from('orderfly:' + draft.secret).toString('base64');
  const request = (body = { statusCode: '200%20OK' }, suffix = '', headers = {}) => new Request(
    'https://orderfly.test/api/cloudprnt/b1/l1/p1' + suffix,
    { method: 'POST', headers: { authorization, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { route, rows, reads, writes, options, draft, authorization, credentialPath, request,
    get adminCalls() { return adminCalls; }, retry(callback) { retry = callback; }, fail(error) { fail = error; }, finish(callback) { finish = callback; },
    run(req = request(), params = scope) { return route.POST(req, { params: Promise.resolve(params) }); } };
}
async function check(f, response, status, expected) {
  assert.equal(response.status, status); const body = await response.json();
  assert.deepEqual(body, expected); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('vary'), 'Authorization'); assert.deepEqual(f.writes, []);
  for (const secret of [f.authorization, f.draft.secret, f.draft.record.secretDigest, 'PRIVATE_SENTINEL']) {
    assert.equal(JSON.stringify(body).includes(secret), false);
  }
}

test('real exported POST authenticates native route scope and returns only no-job after read-only completion', async () => {
  const f = fixture(); assert.deepEqual(Object.keys(f.route).sort(), ['POST', 'dynamic', 'runtime']);
  assert.equal(f.route.runtime, 'nodejs'); assert.equal(f.route.dynamic, 'force-dynamic');
  let release; const pending = new Promise(resolve => { release = resolve; }); f.finish(() => pending);
  let finished = false; const response = f.run().then(value => { finished = true; return value; });
  await new Promise(resolve => setImmediate(resolve)); assert.equal(finished, false);
  release(); await check(f, await response, 200, { jobReady: false });
  assert.deepEqual(f.options, [{ readOnly: true }]);
  assert.deepEqual(f.reads, ['brands/b1', 'locations/l1', 'locations/l1/printers/p1', f.credentialPath]);
});

test('path scope remains a selector and foreign or revoked native identity never receives a job', async () => {
  for (const params of [{ ...scope, brandId: 'foreign' }, { ...scope, locationId: 'foreign' }, { ...scope, printerId: 'foreign' }]) {
    const f = fixture(); await check(f, await f.run(undefined, params), 401, { error: 'device_unverified' });
  }
  const f = fixture(); f.rows.set(f.credentialPath, { ...f.draft.record, state: 'revoked' });
  await check(f, await f.run(), 401, { error: 'device_unverified' });
  const g = fixture(); g.retry(() => g.rows.set('locations/l1', { brandId: 'foreign' }));
  await check(g, await g.run(), 401, { error: 'device_unverified' });
});

test('route preserves adapter request bounds and ignores no supplied alternate query/body identity', async () => {
  const f = fixture();
  await check(f, await f.run(f.request(undefined, '?brandId=foreign')), 400, { error: 'invalid_poll_request' });
  await check(f, await f.run(f.request(undefined, '', { authorization: '' })), 401, { error: 'device_unverified' });
  for (const params of [null, {}, { ...scope, printerId: '../foreign' }, { ...scope, extra: 'PRIVATE_SENTINEL' }]) {
    await check(f, await f.run(undefined, params), 400, { error: 'invalid_poll_request' });
  }
  assert.equal(f.adminCalls, 0);
  const g = fixture(); await check(g, await g.run(g.request({ statusCode: '200', brandId: 'foreign', printerId: 'foreign', jobReady: true })), 200, { jobReady: false });
  assert.equal(g.reads.includes('brands/foreign'), false);
});

test('context and native failures remain fixed private errors with no partial writes', async () => {
  const f = fixture();
  await check(f, await f.route.POST(f.request(), { params: Promise.reject(Error('PRIVATE_SENTINEL')) }), 400, { error: 'invalid_poll_request' });
  await check(f, await f.route.POST(f.request(), undefined), 400, { error: 'invalid_poll_request' });
  assert.equal(f.adminCalls, 0);
  const g = fixture(); g.fail(Error('PRIVATE_SENTINEL'));
  await check(g, await g.run(), 503, { error: 'poll_unavailable' });
});
