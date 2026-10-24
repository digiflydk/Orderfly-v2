const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const scope = { brandId: 'b1', locationId: 'l1', printerId: 'p1' };
const binding = { ...scope, printerRevision: 3, credentialRevision: 1 };
const root = 'locations/l1/printers/p1', sessionId = 's'.repeat(43);
const url = 'https://orderfly.test/api/cloudprnt-pilot/b1/l1/p1';

// A real shared module graph preserves authentication error-class and service
// identity. Only external Admin I/O and the compile-time server marker are isolated.
function graph(mocks) {
  const cache = new Map();
  function load(filename) {
    const absolute = path.resolve(filename); if (cache.has(absolute)) return cache.get(absolute).exports;
    const mod = { exports: {} }; cache.set(absolute, mod);
    const code = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    new Function('require', 'module', 'exports', code)(name => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name === 'react') return require('next/dist/compiled/react');
      if (name.startsWith('@/')) return load(path.resolve('src', name.slice(2)) + '.ts');
      if (name.startsWith('.')) return load(path.resolve(path.dirname(absolute), name) + '.ts');
      return require(name);
    }, mod, mod.exports);
    return mod.exports;
  }
  return load;
}
function fixture() {
  const rows = new Map(), reads = [], writes = []; let admin = 0, unknownCommit = false;
  const ref = p => ({ path: p, id: p.split('/').at(-1), collection: name => ({ doc: id => ref(`${p}/${name}/${id}`) }) });
  const db = { collection: name => ({ doc: id => ref(`${name}/${id}`) }), async runTransaction(fn) {
    const staged = new Map();
    const result = await fn({ async get(r) { assert.equal(staged.size, 0); reads.push(r.path);
      return { id: r.id, exists: rows.has(r.path), data: () => structuredClone(rows.get(r.path)) }; },
      set(r, row) { staged.set(r.path, structuredClone(row)); } });
    for (const [p, row] of staged) { rows.set(p, row); writes.push(p); }
    if (unknownCommit) throw Error('PRIVATE_SENTINEL');
    return result;
  } };
  const load = graph({ 'server-only': {}, '@/lib/firebase-admin': { getAdminDb: () => { admin++; return db; } } });
  const crypto = load('src/lib/printing/device-auth.ts');
  const draft = crypto.createPrinterDeviceCredentialDraft(binding), now = Date.now();
  const api = load('src/lib/printing/synthetic-pilot-job.ts');
  const row = api.createSyntheticPilotJobRecord({ ...binding, sessionId, model: 'mc-print3', paperWidthMm: 80,
    createdAt: now, expiresAt: now + 600000 });
  rows.set('brands/b1', { status: 'active' }); rows.set('locations/l1', { brandId: 'b1' });
  rows.set(root, { schemaVersion: 1, revision: 3, deletedAt: null, configuration: { id: 'p1', brandId: 'b1', locationId: 'l1',
    name: 'Synthetic', manufacturer: 'star', model: 'mc-print3', transport: 'cloudprnt-http', state: 'active', paperWidthMm: 80 } });
  rows.set(`${root}/deviceCredentials/current`, draft.record);
  rows.set(`${root}/pilotJobs/${sessionId}`, row);
  rows.set(`${root}/pilotState/current`, { schemaVersion: 1, sessionId });
  rows.set(`${root}/pilotQualifications/${sessionId}`, { schemaVersion: 1, ...binding, sessionId,
    nonceDigest: 'a'.repeat(64), actorId: 'firebase:operator', state: 'consumed', trust: 'supervised_operator',
    issuedAt: now, expiresAt: now + 600000, consumedAt: now, jobId: sessionId, contentDigest: row.content.sha256,
    outputAuthorized: false, dispatchAuthorized: false, activationAuthorized: false, physicalCompatibilityVerified: false });
  const route = load('src/app/api/cloudprnt-pilot/[brandId]/[locationId]/[printerId]/route.ts');
  const authorization = 'Basic ' + Buffer.from('orderfly:' + draft.secret).toString('base64');
  const request = (method = 'POST', suffix = '', body, headers = {}) => new Request(url + suffix, {
    method, headers: { authorization, ...(method === 'POST' ? { 'content-type': 'application/json' } : {}), ...headers },
    ...(method === 'POST' || body !== undefined ? { body: body === undefined ? JSON.stringify({ statusCode: '200%20OK' }) : body } : {}),
  });
  return { route, rows, reads, writes, draft, authorization, request, row,
    get admin() { return admin; }, unknownCommit() { unknownCommit = true; },
    run(req = request(), params = scope) { return route[req.method](req, { params: Promise.resolve(params) }); },
    job() { return rows.get(`${root}/pilotJobs/${sessionId}`); } };
}
const query = token => `?mac=00%3A11%3A22%3A33%3A44%3A55&token=${token}`;
function enabled(fn) { return async () => {
  const keys = ['ORDERFLY_PRINTER_PILOT_OUTPUT_ENABLED', 'ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED'];
  const before = keys.map(k => process.env[k]); keys.forEach(k => process.env[k] = 'true');
  try { await fn(); } finally { keys.forEach((k, i) => before[i] === undefined ? delete process.env[k] : process.env[k] = before[i]); }
}; }
async function json(f, response, status, expected) {
  assert.equal(response.status, status); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('vary'), 'Authorization'); const data = await response.json();
  if (expected) assert.deepEqual(data, expected);
  for (const secret of [f.draft.secret, f.authorization, f.draft.record.secretDigest, 'PRIVATE_SENTINEL']) assert.equal(JSON.stringify(data).includes(secret), false);
  return data;
}

test('actual route -> native lifecycle -> auth/crypto delivers immutable PNG once then commits strict DELETE result', enabled(async () => {
  const f = fixture(); const offered = await json(f, await f.run(), 200);
  assert.equal(offered.jobReady, true); assert.deepEqual(offered.mediaTypes, ['image/png']); assert.equal(offered.deleteMethod, 'DELETE');
  assert.equal(f.job().state, 'offered');
  const download = await f.run(f.request('GET', query(offered.jobToken) + '&type=image%2Fpng'));
  assert.equal(download.status, 200); assert.equal(download.headers.get('content-type'), 'image/png');
  assert.equal(download.headers.get('cache-control'), 'no-store');
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), Buffer.from(f.row.content.payloadBase64, 'base64'));
  assert.equal(f.job().state, 'download_started');
  await json(f, await f.run(f.request('GET', query(offered.jobToken))), 409, { error: 'pilot_job_unavailable' });
  await json(f, await f.run(f.request('DELETE', query(offered.jobToken) + '&code=200%20OK')), 200, {});
  const saved = structuredClone(f.job()); assert.equal(saved.state, 'confirmed');
  await json(f, await f.run(f.request('DELETE', query(offered.jobToken) + '&code=OK')), 200, {});
  assert.deepEqual(f.job(), saved);
  await json(f, await f.run(), 200, { jobReady: false });
  assert.equal(JSON.stringify([...f.rows]).includes(offered.jobToken), false);
}));

test('HEAD explicitly rejects rather than consuming GET, and busy/error/progress polls only withhold', enabled(async () => {
  for (const body of [{ statusCode: '220%20Busy' }, { statusCode: '500%20Error' },
    { statusCode: '200%20OK', printingInProgress: true }, { statusCode: '200%20OK', jobToken: 'old' }]) {
    const f = fixture(); await json(f, await f.run(f.request('POST', '', JSON.stringify(body))), 200, { jobReady: false });
    assert.equal(f.reads.includes(`${root}/deviceCredentials/current`), true); assert.deepEqual(f.writes, [`${root}/connection/current`]); assert.equal(f.job().state, 'queued');
  }
  const f = fixture(); await json(f, await f.run(f.request('HEAD')), 405, {});
  assert.equal(f.admin, 0); assert.equal(f.job().state, 'queued');
}));

test('strict bounded request/query/body failures reject before native I/O', enabled(async () => {
  const cases = [f => f.request('POST', '?token=foreign'), f => f.request('POST', '', '{bad'),
    f => f.request('POST', '', 'x'.repeat(8193)), f => f.request('POST', '', '{}', { 'content-encoding': 'gzip' }),
    f => f.request('POST', '', '{}', { 'content-type': 'text/plain' }),
    f => f.request('POST', '', '{}', { 'content-length': '1' }), f => f.request('GET', query('a'.repeat(43)) + '&token=other'),
    f => f.request('GET', query('a'.repeat(43)) + '&type=text%2Fplain'), f => f.request('GET', '?mac=%GG'),
    f => f.request('DELETE', query('a'.repeat(43)) + '&code=OK&extra=true'),
    f => f.request('DELETE', query('a'.repeat(43)) + '&code=OK', '{}')];
  for (const make of cases) { const f = fixture(); await json(f, await f.run(make(f)), 400, { error: make(f).method === 'POST' ? 'invalid_poll_request' : 'invalid_pilot_request' }); assert.equal(f.admin, 0); }
  const f = fixture(); await json(f, await f.run(undefined, { ...scope, extra: true }), 400, { error: 'invalid_poll_request' }); assert.equal(f.admin, 0);
}));

test('invalid/revoked native credentials get fixed 401, output gate off still records authenticated contact without dispatch', enabled(async () => {
  const f = fixture(); f.rows.set(`${root}/deviceCredentials/current`, { ...f.draft.record, revokedAt: Date.now() });
  const denied = await f.run(); await json(f, denied, 401, { error: 'device_unverified' }); assert.match(denied.headers.get('www-authenticate'), /^Basic /);
  assert.deepEqual(f.writes, []);
  const g = fixture(); await json(g, await g.run(g.request('POST', '', undefined, { authorization: '' })), 401, { error: 'device_unverified' }); assert.equal(g.admin, 0);
  const h = fixture(); delete process.env.ORDERFLY_PRINTER_PILOT_OUTPUT_ENABLED;
  await json(h, await h.run(), 200, { jobReady: false }); assert.deepEqual(h.writes, [`${root}/connection/current`]); assert.equal(h.job().state, 'queued');
}));

test('DELETE derives failed/unknown from strict Star status, never accepts a caller success flag', enabled(async () => {
  for (const [code, state] of [['500 Error', 'failed'], ['300 Unknown', 'unknown']]) {
    const f = fixture(); const offered = await json(f, await f.run(), 200);
    await f.run(f.request('GET', query(offered.jobToken)));
    await json(f, await f.run(f.request('DELETE', query(offered.jobToken) + '&code=' + encodeURIComponent(code))), 200, {});
    assert.equal(f.job().state, state); assert.equal(f.job().confirmedAt, null);
    await json(f, await f.run(f.request('DELETE', query(offered.jobToken) + '&code=OK')), 409, { error: 'pilot_job_unavailable' });
  }
}));

test('lost download response after committed state cannot resend bytes; repeated polls bounded before I/O', enabled(async () => {
  const f = fixture(); const offered = await json(f, await f.run(), 200); f.unknownCommit();
  await json(f, await f.run(f.request('GET', query(offered.jobToken))), 503, { error: 'pilot_unavailable' });
  assert.equal(f.job().state, 'download_started');
  await json(f, await f.run(f.request('GET', query(offered.jobToken))), 409, { error: 'pilot_job_unavailable' });
  const g = fixture(); for (let i = 0; i < 10; i++) await json(g, await g.run(), 200);
  const before = g.admin; await json(g, await g.run(), 429, { error: 'pilot_rate_limited' }); assert.equal(g.admin, before);
}));
