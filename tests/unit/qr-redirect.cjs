const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');
const root = path.resolve(__dirname, '../..');
const originalTs = require.extensions['.ts'];
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { handleQrRedirect, QR_GETS_PER_CODE_MINUTE } = require(path.join(root, 'src/lib/qr/redirect.ts'));
const { QR_PATHS } = require(path.join(root, 'src/lib/qr/store.ts'));
if (originalTs) require.extensions['.ts'] = originalTs; else delete require.extensions['.ts'];

const slug = 'a'.repeat(32), codeId = 'b'.repeat(32), at = Date.parse('2026-10-21T12:34:20Z');
class Database {
  rows = new Map(); pending = Promise.resolve(); failWrites = false; transactions = 0;
  collection(prefix) {
    return { doc: id => ({ path: prefix + '/' + id, collection: suffix => this.collection(prefix + '/' + id + '/' + suffix) }) };
  }
  async runTransaction(body) {
    const prev = this.pending; let release; this.pending = new Promise(r => { release = r; }); await prev;
    this.transactions++; const staged = new Map(this.rows); let wrote = false;
    const write = (ref, data, create) => { wrote = true; if (this.failWrites) throw new Error('PRIVATE_DATABASE_MESSAGE token=secret');
      if (create && staged.has(ref.path)) throw new Error('duplicate'); staged.set(ref.path, structuredClone(data)); };
    try {
      const result = await body({
        get: async ref => { assert.equal(wrote, false, 'all reads precede writes'); const row = staged.get(ref.path);
          return { id: ref.path.split('/').at(-1), exists: !!row, data: () => row && structuredClone(row) }; },
        set: (ref, data) => write(ref, data, false), create: (ref, data) => write(ref, data, true),
      }); this.rows = staged; return result;
    } finally { release(); }
  }
}
function fixture() {
  const db = new Database(), prefix = `brands/brandA/${QR_PATHS.codes}/${codeId}`;
  db.rows.set('brands/brandA', { status: 'active' });
  db.rows.set(`${QR_PATHS.publicCodes}/${slug}`, { brandId: 'brandA', codeId });
  db.rows.set(prefix, { id: codeId, brandId: 'brandA', slug, destination: 'https://www.esmeraldapizza.dk/menu?utm_source=table',
    locationId: null, campaign: 'Menu', tags: ['table'], status: 'active', revision: 1, expiresAt: null });
  let serial = 0;
  return { db, prefix, options: { db: () => db, enabled: true, environment: 'production', now: () => at,
    eventId: () => `00000000-0000-4000-8000-${(++serial).toString().padStart(12, '0')}` } };
}
const request = (method = 'GET', headers = {}, url = `https://orderfly.dk/q/${slug}`) => new Request(url, {
  method, headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1', ...headers },
});
const events = db => [...db.rows].filter(([key]) => key.includes(`/${QR_PATHS.events}/`)).map(([, row]) => row);

test('GET records an atomic sanitized event and responds with an uncached temporary redirect', async () => {
  const f = fixture();
  const response = await handleQrRedirect(request('GET', { referer: 'https://referrer.example/cart?email=private@example.com#token', cookie: 'secret-cookie=abc', 'x-forwarded-for': '192.0.2.10' }), slug, f.options);
  assert.equal(response.status, 302); assert.equal(response.headers.get('location'), 'https://www.esmeraldapizza.dk/menu?utm_source=table');
  assert.match(response.headers.get('cache-control'), /no-store/); assert.equal(response.headers.get('referrer-policy'), 'no-referrer'); assert.equal(response.headers.get('set-cookie'), null);
  const [event] = events(f.db); assert.equal(event.timestamp, at); assert.equal(event.qrId, codeId); assert.equal(event.brandId, 'brandA'); assert.equal(event.locationId, null);
  assert.equal(event.classification.probableScan, true); assert.equal(event.classification.referrerOrigin, 'https://referrer.example');
  assert.equal(event.expiresAt.getTime(), at + 90 * 86400000); assert.equal('visitorKey' in event, false);
  assert.deepEqual(Object.keys(event).sort(), ['brandId', 'campaign', 'classification', 'expiresAt', 'locationId', 'qrId', 'tags', 'timestamp']);
  assert.doesNotMatch(JSON.stringify(event), /private@example|secret-cookie|192\.0\.2\.10|AppleWebKit|cart\?/);
  assert.equal(f.db.rows.get(`${f.prefix}/qrRateLimits/${Math.floor(at / 60000)}`).count, 1);
  assert.equal(f.db.rows.get(`${f.prefix}/qrRateLimits/${Math.floor(at / 60000)}`).brandId, 'brandA');
  assert.equal(f.db.rows.get(`${f.prefix}/qrRateLimits/${Math.floor(at / 60000)}`).qrId, codeId);
});

test('HEAD resolves with no event, no limit increment and no response body, including failures', async () => {
  const f = fixture(); const before = structuredClone([...f.db.rows]);
  const response = await handleQrRedirect(request('HEAD'), slug, f.options); assert.equal(response.status, 302); assert.equal(await response.text(), '');
  assert.deepEqual([...f.db.rows], before);
  const error = await handleQrRedirect(request('HEAD'), 'bad', f.options); assert.equal(error.status, 404); assert.equal(await error.text(), '');
});

test('known bots and prefetch are retained as excluded openings and consume the same limit', async () => {
  const f = fixture();
  assert.equal((await handleQrRedirect(request('GET', { 'user-agent': 'Googlebot/2.1' }), slug, f.options)).status, 302);
  assert.equal((await handleQrRedirect(request('GET', { 'sec-purpose': 'prefetch' }), slug, f.options)).status, 302);
  assert.deepEqual(events(f.db).map(e => e.classification.exclusion), ['bot', 'prefetch']);
  assert.ok(events(f.db).every(e => e.classification.opening && !e.classification.probableScan));
  assert.equal(f.db.rows.get(`${f.prefix}/qrRateLimits/${Math.floor(at / 60000)}`).count, 2);
});

test('persistent per-code-minute quota allows only one winner at the boundary; HEAD remains read-only', async () => {
  const f = fixture(); f.db.rows.set(`${f.prefix}/qrRateLimits/${Math.floor(at / 60000)}`, { count: QR_GETS_PER_CODE_MINUTE - 1 });
  const responses = await Promise.all([handleQrRedirect(request(), slug, f.options), handleQrRedirect(request(), slug, f.options)]);
  assert.deepEqual(responses.map(r => r.status).sort(), [302, 429]); assert.equal(events(f.db).length, 1);
  assert.equal(responses.find(r => r.status === 429).headers.get('retry-after'), '40');
  assert.equal(f.db.rows.get(`${f.prefix}/qrRateLimits/${Math.floor(at / 60000)}`).count, QR_GETS_PER_CODE_MINUTE);
  assert.equal((await handleQrRedirect(request('HEAD'), slug, f.options)).status, 302);
  const nextMinute = await handleQrRedirect(request(), slug, { ...f.options, now: () => at + 60000 });
  assert.equal(nextMinute.status, 302); assert.equal(events(f.db).length, 2);
});

test('missing, disabled, paused, archived, expired and foreign/inactive location targets never record', async () => {
  for (const state of ['missing', 'paused', 'archived', 'expired', 'suspended', 'pending', 'unknown-brand', 'foreign-location', 'inactive-location']) {
    const f = fixture(), row = f.db.rows.get(f.prefix);
    if (state === 'missing') f.db.rows.delete(`${QR_PATHS.publicCodes}/${slug}`);
    else if (['paused', 'archived'].includes(state)) row.status = state;
    else if (state === 'expired') row.expiresAt = at;
    else if (['suspended', 'pending', 'unknown-brand'].includes(state)) f.db.rows.get('brands/brandA').status = state;
    else { row.locationId = 'locA'; f.db.rows.set('locations/locA', { brandId: state === 'foreign-location' ? 'brandB' : 'brandA', isActive: state !== 'inactive-location' }); }
    const response = await handleQrRedirect(request(), slug, f.options); assert.equal(response.status, 404, state); assert.equal(events(f.db).length, 0, state);
    assert.equal([...f.db.rows.keys()].some(k => k.includes('/qrRateLimits/')), false, state);
  }
  const f = fixture(); f.db.rows.get('brands/brandA').status = 'trialing'; assert.equal((await handleQrRedirect(request(), slug, f.options)).status, 302);
  const before = f.db.transactions; assert.equal((await handleQrRedirect(request(), slug, { ...f.options, enabled: false })).status, 404); assert.equal(f.db.transactions, before);
});

test('canonical URL and direct host validation denies spoofing, subdomains, ports and production localhost before DB', async () => {
  const f = fixture();
  for (const [url, headers] of [
    [`https://esmeralda.orderfly.dk/q/${slug}`, {}], [`https://orderfly.dk:444/q/${slug}`, {}],
    [`http://orderfly.dk/q/${slug}`, {}], [`http://localhost:3000/q/${slug}`, {}],
    [`https://orderfly.dk/q/${slug}`, { host: 'evil.example', 'x-forwarded-host': 'orderfly.dk' }],
    [`https://evil.example/q/${slug}`, { host: 'orderfly.dk' }],
  ]) assert.equal((await handleQrRedirect(request('GET', headers, url), slug, f.options)).status, 404);
  assert.equal(f.db.transactions, 0);
  assert.equal((await handleQrRedirect(request('GET', {}, `http://localhost:3000/q/${slug}`), slug, { ...f.options, environment: 'development' })).status, 302);
});

test('invalid slug/method never reach DB, and database failures cannot produce false redirects or leak detail', async () => {
  const f = fixture();
  assert.equal((await handleQrRedirect(request(), '../other', f.options)).status, 404);
  const method = await handleQrRedirect(request('POST'), slug, f.options); assert.equal(method.status, 405); assert.equal(method.headers.get('allow'), 'GET, HEAD'); assert.equal(f.db.transactions, 0);
  f.db.failWrites = true; const response = await handleQrRedirect(request(), slug, f.options);
  assert.equal(response.status, 503); assert.equal(response.headers.get('location'), null); assert.doesNotMatch(await response.text(), /PRIVATE|secret|token/);
  assert.equal(events(f.db).length, 0); assert.equal([...f.db.rows.keys()].some(k => k.includes('/qrRateLimits/')), false);
  const unavailable = await handleQrRedirect(request(), slug, { ...f.options, db: () => { throw new Error('PRIVATE'); } }); assert.equal(unavailable.status, 503);
});

test('malformed limiter state and unsafe persisted destination fail closed without an event', async () => {
  const f = fixture(); f.db.rows.set(`${f.prefix}/qrRateLimits/${Math.floor(at / 60000)}`, { count: 'bad' });
  assert.equal((await handleQrRedirect(request(), slug, f.options)).status, 503); assert.equal(events(f.db).length, 0);
  f.db.rows.delete(`${f.prefix}/qrRateLimits/${Math.floor(at / 60000)}`); f.db.rows.get(f.prefix).destination = 'javascript:alert(1)';
  assert.equal((await handleQrRedirect(request(), slug, f.options)).status, 404); assert.equal(events(f.db).length, 0);
});

test('actual route resolves async params and defaults module OFF without touching Firebase', async () => {
  const filename = path.join(root, 'src/app/q/[code]/route.ts'), mod = new Module(filename, module); let dbCalls = 0;
  const f = fixture();
  mod.require = name => name === '@/lib/firebase-admin' ? { getAdminDb: () => { dbCalls++; return f.db; } }
    : name === '@/lib/qr/redirect' ? { handleQrRedirect } : require(name);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
  const previous = process.env.QR_MODULE_ENABLED;
  try {
    delete process.env.QR_MODULE_ENABLED;
    assert.equal((await mod.exports.GET(request(), { params: Promise.resolve({ code: slug }) })).status, 404); assert.equal(dbCalls, 0);
    process.env.QR_MODULE_ENABLED = 'true';
    const response = await mod.exports.HEAD(request('HEAD'), { params: Promise.resolve({ code: slug }) }); assert.equal(response.status, 302); assert.equal(events(f.db).length, 0); assert.equal(dbCalls, 1);
  } finally { if (previous === undefined) delete process.env.QR_MODULE_ENABLED; else process.env.QR_MODULE_ENABLED = previous; }
});
