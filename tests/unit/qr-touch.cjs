const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const previous = require.extensions['.ts'];
require.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, file);
const { handleQrRedirect } = require(path.join(root, 'src/lib/qr/redirect.ts'));
const { readClubQrTouchInTransaction, isClubQrDestination, QR_TOUCH_WINDOW_MS } = require(path.join(root, 'src/lib/qr/touch.ts'));
if (previous) require.extensions['.ts'] = previous; else delete require.extensions['.ts'];
const slug = 'a'.repeat(32), codeId = 'b'.repeat(32), eventId = '00000000-0000-4000-8000-000000000001', now = 1792584000000;
class Database {
  rows = new Map(); reads = []; fail = false;
  collection(prefix) { return { doc: id => ({ path: `${prefix}/${id}`, collection: suffix => this.collection(`${prefix}/${id}/${suffix}`) }) }; }
  async runTransaction(body) {
    const pending = new Map(this.rows); let wrote = false;
    const result = await body({
      get: async ref => { assert.equal(wrote, false); this.reads.push(ref.path); if (this.fail) throw Error('private db details');
        return { exists: pending.has(ref.path), id: ref.path.split('/').at(-1), data: () => structuredClone(pending.get(ref.path)) }; },
      set: (ref, data) => { wrote = true; pending.set(ref.path, structuredClone(data)); },
      create: (ref, data) => { wrote = true; assert.equal(pending.has(ref.path), false); pending.set(ref.path, structuredClone(data)); },
    }); this.rows = pending; return result;
  }
}
function fixture(destination = 'https://esmeralda.orderfly.dk/club/tilmeld?utm_campaign=table') {
  const db = new Database(), prefix = `brands/brandA/qrCodes/${codeId}`;
  db.rows.set('brands/brandA', { slug: 'esmeralda', status: 'active' });
  db.rows.set(`qrPublicCodes/${slug}`, { brandId: 'brandA', codeId });
  db.rows.set(prefix, { id: codeId, brandId: 'brandA', slug, destination, locationId: 'locA', campaign: 'Original campaign', tags: ['table'], status: 'active', revision: 1, expiresAt: null });
  db.rows.set('locations/locA', { brandId: 'brandA', isActive: true });
  const options = { db: () => db, enabled: true, environment: 'production', now: () => now, eventId: () => eventId };
  return { db, prefix, options };
}
const request = (method = 'GET', headers = {}) => new Request(`https://orderfly.dk/q/${slug}`, { method, headers: { 'user-agent': 'Mozilla/5.0 Safari/605.1.15', ...headers } });
async function issue(f) { const response = await handleQrRedirect(request(), slug, f.options); assert.equal(response.status, 302); return new URL(response.headers.get('location')).searchParams.get('qr_touch'); }
async function read(f, receipt, overrides = {}) { return f.db.runTransaction(tx => readClubQrTouchInTransaction(f.db, tx, { receipt, brandId: 'brandA', statisticsConsent: true, now: now + 1, ...overrides })); }

test('eligible native signup atomically receives hashed proof; validation returns historical identity-free projection', async () => {
  const f = fixture(), receipt = await issue(f);
  assert.match(receipt, /^[a-f0-9]{32}\.[a-f0-9-]{36}\.[a-f0-9]{64}$/);
  const event = f.db.rows.get(`${f.prefix}/qrScanEvents/${eventId}`);
  assert.equal(event.touch.qrRevision, 1); assert.equal(event.touch.expiresAt, now + QR_TOUCH_WINDOW_MS);
  assert.equal(JSON.stringify([...f.db.rows]).includes(receipt.split('.')[2]), false, 'raw proof never stored');
  assert.deepEqual(await read(f, receipt), { schemaVersion: 1, brandId: 'brandA', locationId: 'locA', qrId: codeId,
    qrRevision: 1, scanEventId: eventId, occurredAt: now, expiresAt: now + QR_TOUCH_WINDOW_MS, campaign: 'Original campaign', tags: ['table'] });
});
test('only fixed native brand signup destination receives handoff', async () => {
  for (const destination of ['https://other.orderfly.dk/club/tilmeld', 'https://esmeralda.orderfly.dk/club/login',
    'https://esmeralda.orderfly.dk/club/tilmeld?next=https://evil.example', 'https://esmeralda.orderfly.dk/club/tilmeld#hash',
    'https://esmeralda.orderfly.dk.evil.com/club/tilmeld', 'https://www.esmeraldapizza.dk/club/tilmeld',
    'https://orderfly.dk/esmeralda/club/tilmeld', 'https://esmeralda.orderfly.dk/club/tilmeld/',
    'https://esmeralda.orderfly.dk/club/tilmeld?qr_touch=attacker']) {
    assert.equal(isClubQrDestination(destination, 'esmeralda'), false, destination);
    const f = fixture(destination), response = await handleQrRedirect(request(), slug, f.options);
    assert.equal(response.status, 302); assert.equal(response.headers.get('location'), destination);
    assert.equal(f.db.rows.get(`${f.prefix}/qrScanEvents/${eventId}`).touch, undefined);
  }
});
test('HEAD, bots and prefetch never receive proof', async () => {
  for (const [method, headers] of [['HEAD', {}], ['GET', { 'user-agent': 'Googlebot' }], ['GET', { purpose: 'prefetch' }]]) {
    const f = fixture(), response = await handleQrRedirect(request(method, headers), slug, f.options);
    assert.equal(response.status, 302); assert.equal(new URL(response.headers.get('location')).searchParams.has('qr_touch'), false);
    assert.equal(f.db.rows.get(`${f.prefix}/qrScanEvents/${eventId}`)?.touch, undefined);
  }
});
test('denied/revoked consent and malformed receipt perform no reads or writes', async () => {
  const f = fixture(), receipt = await issue(f), before = structuredClone([...f.db.rows]); f.db.reads = [];
  for (const candidate of ['', 'forged', null, receipt]) {
    assert.equal(await read(f, candidate, { statisticsConsent: false }), null);
  }
  assert.equal(await read(f, 'forged'), null); assert.deepEqual(f.db.reads, []); assert.deepEqual([...f.db.rows], before);
});
test('foreign brand fails before foreign brand/code/event read', async () => {
  const f = fixture(), receipt = await issue(f); f.db.reads = [];
  assert.equal(await read(f, receipt, { brandId: 'brandB' }), null);
  assert.deepEqual(f.db.reads, [`qrPublicCodes/${slug}`]);
});
test('forgery, expiry, future, removed event and changed native scope fail closed', async () => {
  for (const mode of ['forged', 'expired', 'future', 'deleted', 'revision', 'destination', 'foreign-location', 'inactive-location', 'brand-slug', 'paused', 'bad-hash']) {
    const f = fixture(); let receipt = await issue(f); const overrides = {}, code = f.db.rows.get(f.prefix);
    if (mode === 'forged') receipt = receipt.slice(0, -1) + (receipt.endsWith('0') ? '1' : '0');
    if (mode === 'expired') overrides.now = now + QR_TOUCH_WINDOW_MS;
    if (mode === 'future') overrides.now = now - 1;
    if (mode === 'deleted') f.db.rows.delete(`${f.prefix}/qrScanEvents/${eventId}`);
    if (mode === 'revision') code.revision++;
    if (mode === 'destination') code.destination = 'https://esmeralda.orderfly.dk/club/tilmeld?utm_campaign=new';
    if (mode === 'foreign-location') f.db.rows.get('locations/locA').brandId = 'brandB';
    if (mode === 'inactive-location') f.db.rows.get('locations/locA').isActive = false;
    if (mode === 'brand-slug') f.db.rows.get('brands/brandA').slug = 'other';
    if (mode === 'paused') code.status = 'paused';
    if (mode === 'bad-hash') f.db.rows.get(`${f.prefix}/qrScanEvents/${eventId}`).touch.proofHash = 'bad';
    assert.equal(await read(f, receipt, overrides), null, mode);
  }
});
test('optional lookup errors produce no error disclosure or business mutation', async () => {
  const f = fixture(), receipt = await issue(f), before = structuredClone([...f.db.rows]); f.db.fail = true;
  assert.equal(await read(f, receipt), null); assert.deepEqual([...f.db.rows], before);
});
test('transaction retry reuses one proof and event identity; aborted writes never survive', async () => {
  const f = fixture(), original = f.db.runTransaction.bind(f.db); let first;
  f.db.runTransaction = async body => {
    const before = structuredClone(f.db.rows);
    first = await original(body);
    f.db.rows = before; // Native transaction conflict discards this entire attempt.
    return original(body);
  };
  const response = await handleQrRedirect(request(), slug, f.options);
  assert.equal(response.status, 302); assert.equal(response.headers.get('location'), first);
  assert.equal([...f.db.rows.keys()].filter(key => key.includes('/qrScanEvents/')).length, 1);
  assert.equal(f.db.rows.get(`${f.prefix}/qrRateLimits/${Math.floor(now / 60000)}`).count, 1);
});
