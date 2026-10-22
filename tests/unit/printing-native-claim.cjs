const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const crypto = loadTs('src/lib/printing/device-auth.ts', { 'server-only': {} });
const { printJobId } = loadTs('src/lib/printing/domain.ts', { 'server-only': {} });
const scope = { brandId: 'b1', locationId: 'l1', printerId: 'p1' };
const prefix = 'locations/l1/printers/p1';
function fixture() {
  const draft = crypto.createPrinterDeviceCredentialDraft({ ...scope, printerRevision: 3, credentialRevision: 1 });
  const job = { schemaVersion: 1, ...scope, orderId: 'o1', kind: 'kitchen', revision: 0,
    printerRevision: 3, state: 'queued', attempts: 0, createdAt: Date.now() - 1000, updatedAt: { seconds: 1 } };
  job.id = printJobId(job);
  const rows = new Map([['brands/b1', { status: 'active' }], ['locations/l1', { brandId: 'b1' }],
    [prefix, { schemaVersion: 1, revision: 3, deletedAt: null, createdAt: {}, updatedAt: {}, configuration: {
      id: 'p1', brandId: 'b1', locationId: 'l1', name: 'Pizza ÆØÅ', manufacturer: 'star', model: 'mc-print3',
      transport: 'cloudprnt-http', state: 'active', paperWidthMm: 80 } }],
    [`${prefix}/deviceCredentials/current`, draft.record], [`${prefix}/jobs/${job.id}`, job]]);
  const reads = [], writes = [];
  const collection = path => ({ doc: id => ({ id, path: `${path}/${id}`, collection: name => collection(`${path}/${id}/${name}`) }) });
  const db = { collection };
  let beforeRead, failCommit = false;
  const api = loadTs('src/lib/printing/native-claim.ts', { 'server-only': {}, '@/lib/firebase-admin': { getAdminDb: () => db } });
  const request = { ...scope, jobId: job.id, secret: draft.secret };
  const attempt = api.createNativePrintClaimAttempt(request);
  async function run(handle = attempt, options = {}) {
    const staged = new Map();
    const transaction = { get: async ref => {
      assert.equal(staged.size, 0, 'all reads before writes'); reads.push(ref.path);
      if (beforeRead) beforeRead(ref.path);
      const value = rows.get(ref.path); return { id: ref.id, exists: value !== undefined, data: () => value };
    }, create: (ref, value) => { assert.equal(rows.has(ref.path), false); staged.set(ref.path, value); } };
    const result = await api.reserveNativePrintClaim({ db, transaction }, handle);
    if (options.beforeCommit) await options.beforeCommit();
    if (failCommit) throw Error('PRIVATE_COMMIT_FAILED');
    if (options.retry) { if (options.mutate) options.mutate(rows); return run(handle); }
    for (const [path] of staged) if (rows.has(path)) throw Error('ALREADY_EXISTS');
    for (const [path, value] of staged) { rows.set(path, value); writes.push(path); }
    return result;
  }
  return { ...api, draft, job, rows, reads, writes, request, attempt, db, run,
    failCommit() { failCommit = true; }, beforeRead(fn) { beforeRead = fn; } };
}
function enabled(fn) { return async () => {
  const previous = process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED;
  process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED = 'true';
  try { await fn(); } finally { if (previous === undefined) delete process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED; else process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED = previous; }
}; }
const reject = promise => assert.rejects(promise, error => error.code === 'invalid_claim' && error.message === error.code);

test('real native auth reserves one digest-bound attempt without modifying queued job, ledger or activity', enabled(async () => {
  const f = fixture(), original = structuredClone(f.job), result = await f.run();
  assert.equal(result.dispatchAuthorized, false); assert.equal(result.attemptNumber, 1);
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(f.writes, [`${prefix}/claims/${f.job.id}`]);
  assert.deepEqual(f.rows.get(`${prefix}/jobs/${f.job.id}`), original);
  const saved = f.rows.get(f.writes[0]); assert.equal(f.nativePrintClaimSchema.safeParse(saved).success, true);
  assert.match(saved.claimDigest, /^[a-f0-9]{64}$/); assert.match(saved.deliveryDigest, /^[a-f0-9]{64}$/);
  assert.notEqual(saved.claimDigest, saved.deliveryDigest);
  assert.equal(JSON.stringify([...f.rows.values()]).includes(f.draft.secret), false);
  assert.equal(JSON.stringify(result).includes('Digest'), false); assert.equal(JSON.stringify(f.attempt), '{}');
}));

test('same opaque attempt retry/replay is idempotent and never extends the lease', enabled(async () => {
  const f = fixture(); const first = await f.run({ ...f.attempt }).catch(error => error);
  assert.equal(first.code, 'invalid_claim');
  const result = await f.run(f.attempt, { retry: true });
  const stored = structuredClone(f.rows.get(`${prefix}/claims/${f.job.id}`));
  assert.deepEqual(await f.run(), result); assert.deepEqual(f.rows.get(`${prefix}/claims/${f.job.id}`), stored);
  assert.equal(f.writes.length, 1);
  await reject(f.run(f.createNativePrintClaimAttempt(f.request))); assert.equal(f.writes.length, 1);
}));

test('gate is exact default-off and forged handles never reserve', async () => {
  const previous = process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED;
  try { for (const gate of [undefined, 'false', 'TRUE', '1']) {
    if (gate === undefined) delete process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED; else process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED = gate;
    const f = fixture(); await assert.rejects(f.run(), error => error.code === 'claims_unavailable');
    assert.deepEqual(f.reads, []); assert.deepEqual(f.writes, []);
  } } finally { if (previous === undefined) delete process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED; else process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED = previous; }
});

test('bounded strict request refuses caller token/revision/time and does not invoke getters', () => {
  const f = fixture();
  for (const input of [null, [], {}, { ...f.request, token: 'caller' }, { ...f.request, expiresAt: 1 },
    { ...f.request, attemptNumber: 1 }, { ...f.request, printerId: '../p1' }, { ...f.request, secret: 'x'.repeat(1000000) }])
    assert.throws(() => f.createNativePrintClaimAttempt(input), error => error.code === 'invalid_claim');
  let invoked = false; const poison = { ...f.request };
  Object.defineProperty(poison, 'secret', { enumerable: true, get() { invoked = true; throw Error('PRIVATE'); } });
  assert.throws(() => f.createNativePrintClaimAttempt(poison), error => error.code === 'invalid_claim'); assert.equal(invoked, false);
});

test('foreign scope, suspended brand and revoked credentials fail before private claim reads', enabled(async () => {
  for (const mutate of [f => f.rows.get('locations/l1').brandId = 'foreign', f => f.rows.get('brands/b1').status = 'suspended',
    f => f.rows.set(`${prefix}/deviceCredentials/current`, { ...f.rows.get(`${prefix}/deviceCredentials/current`), revokedAt: Date.now() })]) {
    const f = fixture(); mutate(f); await assert.rejects(f.run());
    assert.equal(f.reads.some(path => path.includes('/claims/')), false); assert.deepEqual(f.writes, []);
  }
}));

test('non-active printer, wrong native job/revision and malformed canonical identity fail without reservation', enabled(async () => {
  for (const mutate of [f => f.rows.get(prefix).configuration.state = 'paused', f => f.rows.get(prefix).configuration.state = 'disabled',
    f => f.rows.delete(`${prefix}/jobs/${f.job.id}`), f => f.job.printerRevision++, f => f.job.brandId = 'foreign',
    f => f.job.orderId = 'other', f => f.job.state = 'confirmed', f => f.job.attempts = 1, f => f.job.createdAt = Date.now() + 60000]) {
    const f = fixture(); mutate(f); await assert.rejects(f.run()); assert.deepEqual(f.writes, []);
  }
}));

test('expired, corrupt and changed claim bindings reject replay, preserving the record', enabled(async () => {
  for (const mutate of [claim => { claim.credentialRevision++; }, claim => { claim.job.orderId = 'other'; },
    claim => { claim.claimDigest = 'a'.repeat(64); }, claim => { claim.deliveryDigest = 'b'.repeat(64); },
    claim => { claim.printerId = 'foreign'; }, claim => { claim.attemptNumber = 2; },
    claim => { claim.reservedAt -= 60001; claim.expiresAt -= 60001; }]) {
    const f = fixture(); await f.run(); const saved = f.rows.get(`${prefix}/claims/${f.job.id}`); mutate(saved);
    const before = structuredClone(saved); await reject(f.run()); assert.deepEqual(f.rows.get(`${prefix}/claims/${f.job.id}`), before);
    assert.equal(f.writes.length, 1);
  }
}));

test('revocation between SDK attempts is re-read and first staged claim does not commit', enabled(async () => {
  const f = fixture();
  await assert.rejects(f.run(f.attempt, { retry: true, mutate(rows) {
    rows.set(`${prefix}/deviceCredentials/current`, { ...rows.get(`${prefix}/deviceCredentials/current`), revokedAt: Date.now() });
  } }));
  assert.deepEqual(f.writes, []); assert.equal(f.rows.has(`${prefix}/claims/${f.job.id}`), false);
  assert.equal(f.reads.filter(path => path === 'brands/b1').length, 2);
}));

test('commit failure leaves reservation absent and does not change job identity', enabled(async () => {
  const f = fixture(), before = structuredClone(f.job); f.failCommit();
  await assert.rejects(f.run()); assert.equal(f.rows.has(`${prefix}/claims/${f.job.id}`), false); assert.deepEqual(f.job, before);
}));

test('competing independent attempts cannot replace the committed claim identity', enabled(async () => {
  const f = fixture(), other = f.createNativePrintClaimAttempt(f.request);
  await assert.rejects(f.run(f.attempt, { beforeCommit: () => f.run(other) }), /ALREADY_EXISTS/);
  assert.equal(f.writes.length, 1);
  const saved = structuredClone(f.rows.get(`${prefix}/claims/${f.job.id}`));
  await reject(f.run(f.attempt)); await f.run(other);
  assert.deepEqual(f.rows.get(`${prefix}/claims/${f.job.id}`), saved);
}));

test('native provider errors do not expose supplied credentials or raw messages', enabled(async () => {
  const f = fixture(); f.beforeRead(() => { throw Error(`PRIVATE_PROVIDER ${f.draft.secret}`); });
  await assert.rejects(f.run(), error => {
    assert.equal(error.code, 'claims_unavailable');
    assert.equal((String(error) + error.stack + JSON.stringify(error)).includes('PRIVATE_PROVIDER'), false);
    assert.equal((String(error) + error.stack + JSON.stringify(error)).includes(f.draft.secret), false);
    return true;
  });
  assert.deepEqual(f.writes, []);
}));

test('expiry uses post-read clock; exact boundary and invalid clock fail closed', enabled(async () => {
  const originalNow = Date.now;
  try {
    const f = fixture(); await f.run(); const expires = f.rows.get(`${prefix}/claims/${f.job.id}`).expiresAt;
    f.beforeRead(path => { if (path.includes('/claims/')) Date.now = () => expires; });
    await reject(f.run()); assert.equal(f.writes.length, 1);
    for (const now of [NaN, Infinity, -1, 0, 8.64e15]) {
      Date.now = originalNow; const g = fixture();
      g.beforeRead(path => { if (path.includes('/claims/')) Date.now = () => now; });
      await reject(g.run()); assert.deepEqual(g.writes, []);
    }
  } finally { Date.now = originalNow; }
}));
