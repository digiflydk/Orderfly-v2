const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runRoutingQa, dayKey } = require('../../scripts/delivery/geoapify-sandbox-qa.cjs');
const key = 'synthetic_fixture_not_a_real_key';
const at = new Date('2026-10-26T10:00:00Z');
test('quota day uses UTC consistently with the runtime', () => {
  assert.equal(dayKey(new Date('2026-10-26T00:30:00+01:00')), '2026-10-25');
});
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'geoapify-qa-')); fs.chmodSync(dir, 0o700);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const configFile = path.join(dir, 'config.json'), journalFile = path.join(dir, 'quota.json');
  fs.writeFileSync(configFile, JSON.stringify({ apiKey: key }), { mode: 0o600 });
  return { configFile, journalFile, now: () => at };
}
function adapterFactory({ apiKey, fetch, reserveQuote, reserveRequest }) {
  let started = false, index = 0;
  async function call(endpoint) {
    if (!started) { started = true; if (!await reserveQuote()) return false; }
    if (!await reserveRequest()) return false;
    const r = await fetch(`https://api-eu.geoapify.com${endpoint}?apiKey=${apiKey}&text=private-address`, { method: 'GET', redirect: 'error' });
    return r.ok;
  }
  return { source: 'geoapify', async resolve() {
    try { if (!await call('/v1/geocode/search')) return { kind: 'unavailable' }; return { kind: 'verified', address: { reference: `private-reference-${index++}`, latitude: 55, longitude: 12 } }; }
    catch { return { kind: 'unavailable' }; }
  }, async route() { try { return await call('/v1/routing') ? { kind: 'route', meters: 1500, durationSeconds: 180 } : { kind: 'unavailable' }; } catch { return { kind: 'unavailable' }; } } };
}
test('reserves quota durably before each outbound intent; emits sanitized route proof only', async t => {
  const f = fixture(t); let calls = 0;
  const result = await runRoutingQa({ ...f, createAdapter: adapterFactory, fetchImpl: async () => {
    calls++; const j = JSON.parse(fs.readFileSync(f.journalFile)); const bucket = j.days[dayKey(at)];
    assert.equal(bucket.reservedRequests, 3); assert.equal(bucket.runs[0].requests.length, calls);
    assert.equal(bucket.runs[0].requests[calls - 1].state, 'outbound_intent');
    return new Response('{}', { status: 200 });
  } });
  assert.equal(result.status, 'passed'); assert.equal(calls, 3); assert.equal(result.meters, 1500);
  assert.equal(fs.statSync(f.journalFile).mode & 0o777, 0o600);
  const safe = JSON.stringify(result) + fs.readFileSync(f.journalFile, 'utf8');
  for (const secret of [key, 'private-address', 'private-reference', 'https://']) assert.equal(safe.includes(secret), false);
});
test('100/day cap rejects a whole three-request attempt without resetting existing budget', async t => {
  const f = fixture(t); fs.writeFileSync(f.journalFile, JSON.stringify({ version: 1, scope: 'local-routing-qa-only', days: { [dayKey(at)]: { reservedRequests: 99, runs: [] } } }), { mode: 0o600 });
  let calls = 0; const result = await runRoutingQa({ ...f, createAdapter: adapterFactory, fetchImpl: async () => { calls++; } });
  assert.equal(result.status, 'failed'); assert.equal(calls, 0);
  assert.equal(JSON.parse(fs.readFileSync(f.journalFile)).days[dayKey(at)].reservedRequests, 99);
});
test('private config permissions and an existing exclusive lock fail closed', async t => {
  const f = fixture(t); fs.chmodSync(f.configFile, 0o644);
  await assert.rejects(runRoutingQa({ ...f, createAdapter: adapterFactory }));
  fs.chmodSync(f.configFile, 0o600); fs.writeFileSync(`${f.journalFile}.lock`, 'existing', { mode: 0o600 });
  await assert.rejects(runRoutingQa({ ...f, createAdapter: adapterFactory }));
  assert.equal(fs.readFileSync(`${f.journalFile}.lock`, 'utf8'), 'existing');
});
test('transport uncertainty is journaled without error text and never retried', async t => {
  const f = fixture(t); let calls = 0;
  const result = await runRoutingQa({ ...f, createAdapter: adapterFactory, fetchImpl: async () => { calls++; throw Error(`SECRET ${key}`); } });
  assert.equal(result.status, 'failed'); assert.equal(calls, 2);
  const j = JSON.parse(fs.readFileSync(f.journalFile)); assert.equal(j.days[dayKey(at)].reservedRequests, 3);
  assert.equal(j.days[dayKey(at)].runs[0].requests.every(r => r.state === 'unknown'), true);
  assert.equal(JSON.stringify(j).includes(key), false);
});
test('endpoint substitution never reaches network', async t => {
  const f = fixture(t); let calls = 0;
  await assert.rejects(runRoutingQa({ ...f, fetchImpl: async () => { calls++; }, createAdapter: options => ({ source: 'geoapify', async resolve() {
    await options.reserveQuote(); await options.reserveRequest();
    await options.fetch('https://evil.invalid/v1/geocode/search', { redirect: 'error' });
  } }) }));
  assert.equal(calls, 0);
});
test('a fourth request reservation fails after the complete three-call run', async t => {
  const f = fixture(t); let reserve;
  const result = await runRoutingQa({ ...f, createAdapter: options => { reserve = options.reserveRequest; return adapterFactory(options); }, fetchImpl: async () => new Response('{}') });
  assert.equal(result.status, 'passed'); assert.equal(await reserve(), false);
});
test('journal symlinks are rejected and do not overwrite their target', async t => {
  const f = fixture(t); const target = path.join(path.dirname(f.journalFile), 'target');
  fs.writeFileSync(target, 'untouched', { mode: 0o600 }); fs.symlinkSync(target, f.journalFile);
  await assert.rejects(runRoutingQa({ ...f, createAdapter: adapterFactory }));
  assert.equal(fs.readFileSync(target, 'utf8'), 'untouched');
});
