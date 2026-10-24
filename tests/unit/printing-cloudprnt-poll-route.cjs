const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const crypto = loadTs('src/lib/printing/device-auth.ts', { 'server-only': {} });
const scope = { brandId: 'b1', locationId: 'l1', printerId: 'p1' };
const filename = 'src/app/api/cloudprnt/[brandId]/[locationId]/[printerId]/route.ts';
const { createCloudPrntPollAdmission } = loadTs('src/lib/printing/cloudprnt-poll-admission.ts', { 'server-only': {} });

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
  let staged = [];
  const transaction = {
    get: async ref => { reads.push(ref.path); if (fail) throw fail;
      return { id: ref.id, exists: rows.has(ref.path), data: () => rows.get(ref.path) }; },
    create: ref => staged.push(ref.path), set: ref => staged.push(ref.path), update: ref => staged.push(ref.path), delete: ref => staged.push(ref.path),
  };
  const db = { collection, runTransaction: async (callback, opts) => {
    options.push(opts); staged = []; await callback(transaction);
    if (retry) { retry(); staged = []; await callback(transaction); }
    if (finish) await finish(); writes.push(...staged);
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
  assert.equal(response.headers.get('vary'), 'Authorization'); assert.ok(f.writes.every(path => path === 'locations/l1/printers/p1/connection/current'));
  for (const secret of [f.authorization, f.draft.secret, f.draft.record.secretDigest, 'PRIVATE_SENTINEL']) {
    assert.equal(JSON.stringify(body).includes(secret), false);
  }
}

test('real exported POST authenticates native route scope and returns only no-job after authenticated contact commit', async () => {
  const f = fixture(); assert.deepEqual(Object.keys(f.route).sort(), ['DELETE', 'GET', 'HEAD', 'POST', 'dynamic', 'runtime']);
  assert.equal(f.route.runtime, 'nodejs'); assert.equal(f.route.dynamic, 'force-dynamic');
  let release; const pending = new Promise(resolve => { release = resolve; }); f.finish(() => pending);
  let finished = false; const response = f.run().then(value => { finished = true; return value; });
  await new Promise(resolve => setImmediate(resolve)); assert.equal(finished, false);
  release(); await check(f, await response, 200, { jobReady: false });
  assert.deepEqual(f.options, [undefined]); assert.deepEqual(f.writes, ['locations/l1/printers/p1/connection/current']);
  assert.deepEqual(f.reads, ['brands/b1', 'locations/l1', 'locations/l1/printers/p1', f.credentialPath, 'locations/l1/printers/p1/connection/current']);
});

test('path scope remains a selector and foreign or revoked native identity never receives a job', async () => {
  for (const params of [{ ...scope, brandId: 'foreign' }, { ...scope, locationId: 'foreign' }, { ...scope, printerId: 'foreign' }]) {
    const f = fixture(); await check(f, await f.run(undefined, params), 401, { error: 'device_unverified' }); assert.deepEqual(f.writes, []);
  }
  const f = fixture(); f.rows.set(f.credentialPath, { ...f.draft.record, state: 'revoked' });
  await check(f, await f.run(), 401, { error: 'device_unverified' });
  const g = fixture(); g.retry(() => g.rows.set('locations/l1', { brandId: 'foreign' }));
  await check(g, await g.run(), 401, { error: 'device_unverified' }); assert.deepEqual(g.writes, []);
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

test('real route rejects excess credential polls before context, body or Admin I/O', async () => {
  const f = fixture();
  for (let i = 0; i < 10; i++) await check(f, await f.run(), 200, { jobReady: false });
  const before = f.adminCalls;
  const context = { get params() { throw Error('must not inspect context'); } };
  const response = await f.route.POST(f.request(), context);
  await check(f, response, 429, { error: 'poll_rate_limited' });
  assert.equal(response.headers.get('retry-after'), '5');
  assert.equal(f.adminCalls, before);
});

test('real route bounds concurrent transactions and releases slots after success/failure', async () => {
  const f = fixture(); let release;
  const pending = new Promise(resolve => { release = resolve; }); f.finish(() => pending);
  const requests = Array.from({ length: 8 }, () => f.run());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.options.length, 8); const before = f.adminCalls;
  await check(f, await f.run(), 429, { error: 'poll_rate_limited' });
  assert.equal(f.adminCalls, before);
  release(); for (const response of await Promise.all(requests)) await check(f, response, 200, { jobReady: false });
  await check(f, await f.run(), 200, { jobReady: false });
  const g = fixture(); g.fail(Error('PRIVATE_SENTINEL'));
  for (let i = 0; i < 9; i++) await check(g, await g.run(), 503, { error: 'poll_unavailable' });
  assert.equal(g.options.length, 9);
});

test('admission bounds rotating credentials globally, refills monotonically and release is idempotent', () => {
  let time = 0; const admit = createCloudPrntPollAdmission(() => time);
  for (let i = 0; i < 20; i++) { const release = admit('rotating' + i); assert.equal(typeof release, 'function'); release(); release(); }
  assert.equal(admit('new'), null);
  time = 499; assert.equal(admit('new'), null);
  time = 500; const release = admit('new'); assert.equal(typeof release, 'function'); release();
  time = 499; assert.equal(admit('new'), null);
  time = Number.NaN; assert.equal(admit('new'), null);
});

test('admission bounds per-key rate, live keys and never lets oversized headers allocate caller keys', () => {
  let time = 0; const admit = createCloudPrntPollAdmission(() => time);
  for (let i = 0; i < 10; i++) admit('one')();
  assert.equal(admit('one'), null);
  time = 1999; assert.equal(admit('one'), null);
  time = 2000; admit('one')();
  for (let i = 0; i < 10; i++) admit('x'.repeat(257 + i))();
  assert.equal(admit(null), null);
  // A steady rotating source can fill only a bounded map; existing keys remain usable.
  let t = 0; const rotating = createCloudPrntPollAdmission(() => t);
  for (let i = 0; i < 128; i++) { rotating('key' + i)(); t += 450; }
  assert.equal(rotating('new-key'), null);
  rotating('key0')();
  t = 60_500;
  // Idle keys expire instead of allowing unbounded growth.
  assert.equal(typeof rotating('new-key'), 'function');
});

test('equivalent Basic casing and spacing share one credential bucket', () => {
  let time = 0; const admit = createCloudPrntPollAdmission(() => time);
  const encoded = Buffer.from('orderfly:' + 'a'.repeat(43)).toString('base64');
  const variants = ['Basic ', 'basic ', 'BASIC  ', 'bAsIc     '].map(prefix => prefix + encoded);
  for (let i = 0; i < 10; i++) admit(variants[i % variants.length])();
  for (const header of variants) assert.equal(admit(header), null);
  time = 2000; admit(variants[3])();
  for (const header of variants) assert.equal(admit(header), null);
});
