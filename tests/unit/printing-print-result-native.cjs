const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { createHash } = require('node:crypto');
const crypto = loadTs('src/lib/printing/device-auth.ts', { 'server-only': {} });
const { printJobId } = loadTs('src/lib/printing/domain.ts');
const binding = { brandId: 'b1', locationId: 'l1', printerId: 'p1', printerRevision: 3, credentialRevision: 1 };
const prefix = 'locations/l1/printers/p1';
const claimToken = 'c'.repeat(43), deliveryToken = 'd'.repeat(43);
const digest = value => createHash('sha256').update(value).digest('hex');
const query = (code = '200 OK', token = deliveryToken) => new URLSearchParams({ mac: '00:11:22:33:44:55', token, code }).toString();
const printer = () => ({ schemaVersion: 1, revision: 3, deletedAt: null, createdAt: {}, updatedAt: {},
  configuration: { id: 'p1', brandId: 'b1', locationId: 'l1', name: 'Pizza ÆØÅ', manufacturer: 'star',
    model: 'mc-print3', transport: 'cloudprnt-http', state: 'active', paperWidthMm: 80 } });
function fixture() {
  const draft = crypto.createPrinterDeviceCredentialDraft(binding);
  const rows = new Map([['brands/b1', { status: 'active' }], ['locations/l1', { brandId: 'b1' }],
    [prefix, printer()], [`${prefix}/deviceCredentials/current`, draft.record]]);
  let committed = 0, attempts = 0, onAttempt, afterRead, failCommit = false;
  const reads = [], operations = [];
  const collection = path => ({ doc: id => ({ id, path: `${path}/${id}`, collection: name => collection(`${path}/${id}/${name}`) }) });
  const db = { collection, async runTransaction(callback) {
    for (let attempt = 0; attempt < 2; attempt++) {
      attempts++; let wrote = false; const staged = [];
      const transaction = { async get(ref) {
        assert.equal(wrote, false, 'all native reads precede writes'); reads.push(ref.path);
        const value = rows.get(ref.path); if (afterRead) afterRead(ref.path);
        return { exists: value !== undefined, id: ref.id, data: () => value };
      }, create(ref, data) { wrote = true; staged.push(['create', ref.path, data]); },
      set(ref, data) { wrote = true; staged.push(['set', ref.path, data]); } };
      const output = await callback(transaction);
      if (onAttempt && await onAttempt(attempt, staged)) continue;
      if (failCommit) throw Error(`PRIVATE_COMMIT_${draft.secret}`);
      for (const [op, path] of staged) if (op === 'create' && rows.has(path)) throw Error('collision');
      for (const [op, path, data] of staged) { rows.set(path, data); operations.push([op, path]); }
      if (staged.length) committed++;
      return output;
    }
    throw Error('attempts exhausted');
  } };
  const api = loadTs('src/lib/printing/print-result-native.ts', { 'server-only': {}, '@/lib/firebase-admin': { getAdminDb: () => db } });
  function seed(orderId = 'o1') {
    const j = { brandId: 'b1', locationId: 'l1', printerId: 'p1', orderId, kind: 'kitchen', revision: 0,
      printerRevision: 3, createdAt: Date.now() - 5000 };
    j.id = printJobId(j);
    const bound = { ...binding, jobId: j.id }; delete bound.printerRevision; delete bound.credentialRevision;
    const envelope = { schemaVersion: 1, brandId: 'b1', locationId: 'l1', printerId: 'p1', state: 'delivered', job: j,
      printerRevision: 3, credentialRevision: 1, claimDigest: api.printDeliveryTokenDigest('claim', claimToken, bound),
      deliveryDigest: api.printDeliveryTokenDigest('delivery', deliveryToken, bound), contentDigest: digest('EXACT_IMMUTABLE_BYTES'),
      deliveredAt: Date.now() - 1000, expiresAt: Date.now() + 60000 };
    rows.set(`${prefix}/deliveries/${j.id}`, envelope);
    return { jobId: j.id, envelope, input: { ...bound, secret: draft.secret, claimToken, query: query() } };
  }
  const initial = seed();
  return { ...api, rows, reads, operations, draft, ...initial, seed,
    execute(patch = {}) { return api.persistNativePrintConfirmation({ ...initial.input, ...patch }); },
    retry(fn) { onAttempt = fn; }, failCommit() { failCommit = true; },
    afterRead(fn) { afterRead = fn; },
    get committed() { return committed; }, get attempts() { return attempts; } };
}
const rejects = (promise, code = 'invalid_print_result') => assert.rejects(promise, error => error.code === code && error.message === code);

test('fresh real native authentication and strict successful acknowledgement atomically persist private result and activity', async () => {
  for (const code of ['200 OK', 'OK']) {
    const f = fixture(), out = await f.execute({ query: query(code) });
    assert.deepEqual(out, { outcome: 'confirmed', duplicate: false, confirmedAt: out.confirmedAt });
    assert.equal(f.committed, 1); assert.equal(f.operations.length, 2);
    const saved = f.rows.get(`${prefix}/printResults/${f.jobId}`), activity = f.rows.get(`${prefix}/statusMetadata/current`);
    assert.equal(saved.contentDigest, f.envelope.contentDigest); assert.equal(saved.confirmedAt, out.confirmedAt);
    assert.equal(activity.printHistory, 'confirmed'); assert.equal(activity.lastConfirmedPrintAt, out.confirmedAt);
    assert.equal(activity.lastConfirmedJobId, f.jobId); assert.equal(activity.activatedAt, null);
    assert.equal(JSON.stringify([...f.rows.values()]).includes(f.draft.secret), false);
    assert.equal(JSON.stringify(out).includes(f.envelope.deliveryDigest), false);
    assert.deepEqual(f.reads.slice(0, 4), ['brands/b1', 'locations/l1', prefix, `${prefix}/deviceCredentials/current`]);
    assert.equal(f.operations.some(([, path]) => path.includes('/jobs/') || path.includes('/queue')), false);
  }
});

test('same identity duplicate preserves first confirmation without writes even after envelope expiry', async () => {
  const f = fixture(), first = await f.execute();
  const originalNow = Date.now; Date.now = () => f.envelope.expiresAt + 100;
  try {
    const second = await f.execute();
    assert.equal(second.duplicate, true); assert.equal(second.confirmedAt, first.confirmedAt);
    assert.equal(f.committed, 1); assert.equal(f.operations.length, 2);
  } finally { Date.now = originalNow; }
});

test('later arrival of an older delivered job advances confirmation time without regressing later duplicate', async () => {
  const f = fixture(), first = await f.execute(), next = f.seed('older');
  next.envelope.job.createdAt -= 10000; next.envelope.deliveredAt -= 500;
  const originalNow = Date.now; Date.now = () => first.confirmedAt + 1;
  try {
    const second = await f.persistNativePrintConfirmation(next.input);
    assert.equal(second.confirmedAt, first.confirmedAt + 1);
    assert.equal(f.rows.get(`${prefix}/statusMetadata/current`).lastConfirmedJobId, next.jobId);
    await f.execute();
    assert.equal(f.rows.get(`${prefix}/statusMetadata/current`).lastConfirmedPrintAt, second.confirmedAt);
    assert.equal(f.rows.get(`${prefix}/statusMetadata/current`).lastConfirmedJobId, next.jobId);
  } finally { Date.now = originalNow; }
});

test('same-time confirmations keep stable latest job identity while both results persist', async () => {
  const f = fixture(), next = f.seed('o2'), originalNow = Date.now, now = Date.now(); Date.now = () => now;
  try {
    await f.execute(); await f.persistNativePrintConfirmation(next.input);
    assert.equal(f.rows.get(`${prefix}/statusMetadata/current`).lastConfirmedJobId, f.jobId);
    assert.equal(f.rows.has(`${prefix}/printResults/${next.jobId}`), true);
  } finally { Date.now = originalNow; }
});

test('failures, busy, uncertain and invented success codes never confirm', async () => {
  for (const code of ['201 OK', '220 Busy', '500 Error', '1000 Error', '300 Unknown', 'success', '']) {
    const f = fixture(); await rejects(f.execute({ query: query(code) }));
    assert.equal(f.reads.length, 0); assert.equal(f.committed, 0);
  }
});

test('malformed requests including extra timestamps and poisoned accessors reject before native reads', async () => {
  const f = fixture(); let called = false;
  for (const input of [null, {}, [], { ...f.input, confirmedAt: 1 }, { ...f.input, success: true },
    { ...f.input, jobId: '../x' }, { ...f.input, query: 'x'.repeat(1000000) }, { ...f.input, claimToken: 'short' }]) {
    await rejects(f.persistNativePrintConfirmation(input));
  }
  const input = { ...f.input }; Object.defineProperty(input, 'secret', { get() { called = true; throw Error('SECRET'); } });
  await rejects(f.persistNativePrintConfirmation(input)); assert.equal(called, false);
  await rejects(f.persistNativePrintConfirmation(new Proxy({}, { ownKeys() { throw Error('SECRET'); } })));
  assert.equal(f.reads.length, 0);
});

test('current native scope, credentials and rotation reject before private delivered/result reads', async () => {
  for (const mutate of [f => f.rows.get('brands/b1').status = 'suspended', f => f.rows.get('locations/l1').brandId = 'foreign',
    f => f.rows.set(`${prefix}/deviceCredentials/current`, { ...f.draft.record, revokedAt: Date.now() }),
    f => f.rows.get(prefix).revision = 4, f => f.rows.delete(`${prefix}/deviceCredentials/current`)]) {
    const f = fixture(); mutate(f); await rejects(f.execute(), 'print_result_unavailable');
    assert.equal(f.reads.some(path => /\/(deliveries|printResults)\//.test(path)), false); assert.equal(f.committed, 0);
  }
});

test('wrong or stale exact claim/delivery and native revisions fail closed', async () => {
  for (const patch of [{ claimToken: 'e'.repeat(43) }, { query: query('OK', 'wrong') }]) {
    const f = fixture(); await rejects(f.execute(patch)); assert.equal(f.committed, 0);
  }
  for (const patch of [{ brandId: 'foreign' }, { printerId: 'foreign' }, { credentialRevision: 2 }, { printerRevision: 2 },
    { state: 'claimed' }, { contentDigest: 'bad' }, { deliveredAt: Date.now() + 10000 }, { expiresAt: Date.now() - 1 }]) {
    const f = fixture(); Object.assign(f.envelope, patch); await rejects(f.execute()); assert.equal(f.committed, 0);
  }
});

test('missing producer envelope, malformed immutable job and still-pending original job cannot confirm', async () => {
  for (const mutate of [f => f.rows.delete(`${prefix}/deliveries/${f.jobId}`), f => f.envelope.job.orderId = 'different',
    f => f.envelope.job.brandId = 'foreign', f => f.envelope.job.createdAt = Date.now() + 1000,
    f => f.rows.set(`${prefix}/jobs/${f.jobId}`, { state: 'queued' })]) {
    const f = fixture(); mutate(f); await rejects(f.execute()); assert.equal(f.committed, 0);
  }
});

test('corrupt or rebound existing result and inconsistent activity cannot become an idempotent success', async () => {
  for (const mutate of [r => r.contentDigest = digest('DIFFERENT_BYTES'), r => r.deliveryDigest = digest('DIFFERENT_DELIVERY'),
    r => r.claimDigest = digest('DIFFERENT_CLAIM'), r => r.brandId = 'foreign', r => r.jobId = 'f'.repeat(64),
    r => r.credentialRevision = 2, r => r.confirmedAt = 0, r => r.confirmedAt = Date.now() + 100000]) {
    const f = fixture(); await f.execute(); mutate(f.rows.get(`${prefix}/printResults/${f.jobId}`));
    await rejects(f.execute()); assert.equal(f.committed, 1);
  }
  const f = fixture(); await f.execute(); f.rows.delete(`${prefix}/statusMetadata/current`);
  await rejects(f.execute()); assert.equal(f.committed, 1);
});

test('retry reruns fresh real native auth and commits only final attempt', async () => {
  const f = fixture(); f.retry(attempt => attempt === 0);
  await f.execute(); assert.equal(f.attempts, 2); assert.equal(f.committed, 1);
  assert.equal(f.reads.filter(path => path === `${prefix}/deviceCredentials/current`).length, 2);
  assert.equal(f.operations.length, 2);
});

test('revocation between retry attempts leaves result and activity absent', async () => {
  const f = fixture(); f.retry(attempt => { if (attempt === 0) { f.rows.set(`${prefix}/deviceCredentials/current`, { ...f.draft.record, revokedAt: Date.now() }); return true; } });
  await rejects(f.execute(), 'print_result_unavailable'); assert.equal(f.committed, 0);
  assert.equal(f.rows.has(`${prefix}/printResults/${f.jobId}`), false);
  assert.equal(f.rows.has(`${prefix}/statusMetadata/current`), false);
});

test('commit failure rolls back both writes and generic errors contain no secret or raw provider cause', async () => {
  const f = fixture(); f.failCommit();
  await assert.rejects(f.execute(), error => {
    assert.equal(error.code, 'print_result_unavailable');
    assert.equal(String(error).includes(f.draft.secret), false); assert.equal(error.cause, undefined); return true;
  });
  assert.equal(f.rows.has(`${prefix}/printResults/${f.jobId}`), false);
  assert.equal(f.rows.has(`${prefix}/statusMetadata/current`), false); assert.equal(f.committed, 0);
});

test('canonical job and delivery digest bind kind, scope and exact tokens', () => {
  const f = fixture(), binding = { brandId: 'b1', locationId: 'l1', printerId: 'p1', jobId: f.jobId };
  assert.notEqual(f.printDeliveryTokenDigest('claim', claimToken, binding), f.printDeliveryTokenDigest('delivery', claimToken, binding));
  assert.notEqual(f.printDeliveryTokenDigest('claim', claimToken, binding), f.printDeliveryTokenDigest('claim', claimToken, { ...binding, printerId: 'p2' }));
  assert.throws(() => f.printDeliveryTokenDigest('claim', claimToken, { ...binding, jobId: 'bad' }), /invalid_print_result/);
});

test('never-used metadata cannot survive producer dispatch and then silently become confirmed', async () => {
  const f = fixture();
  f.rows.set(`${prefix}/statusMetadata/current`, { schemaVersion: 1, brandId: 'b1', locationId: 'l1', printerId: 'p1',
    activatedAt: null, activationRevision: null, printHistory: 'never', lastConfirmedPrintAt: null, lastConfirmedJobId: null });
  await rejects(f.execute()); assert.equal(f.committed, 0);
});

test('slow native read uses post-read clock and rejects a lease that expired during authentication', async () => {
  const f = fixture(), oldNow = Date.now; let now = oldNow(); Date.now = () => now;
  f.afterRead(path => { if (path === `${prefix}/jobs/${f.jobId}`) now = f.envelope.expiresAt + 1; });
  try { await rejects(f.execute()); assert.equal(f.committed, 0); }
  finally { Date.now = oldNow; }
});

test('invalid clocks and backwards history fail closed without altering a saved confirmation', async () => {
  for (const clock of [NaN, -1, 0, Infinity, 8.64e15 + 1]) {
    const f = fixture(), oldNow = Date.now;
    f.afterRead(path => { if (path === `${prefix}/jobs/${f.jobId}`) Date.now = () => clock; });
    try { await rejects(f.execute()); assert.equal(f.committed, 0); }
    finally { Date.now = oldNow; }
  }
  const f = fixture(), first = await f.execute(), next = f.seed('o2'), oldNow = Date.now;
  Date.now = () => first.confirmedAt - 1;
  try { await rejects(f.persistNativePrintConfirmation(next.input), 'print_result_unavailable'); assert.equal(f.committed, 1); }
  finally { Date.now = oldNow; }
});

test('exclusive lease boundary rejects at expiry, including a forged committed result at exact expiry', async () => {
  const f = fixture(), oldNow = Date.now; Date.now = () => f.envelope.expiresAt;
  try { await rejects(f.execute()); assert.equal(f.committed, 0); }
  finally { Date.now = oldNow; }
  Date.now = () => f.envelope.expiresAt - 1;
  try { await f.execute(); assert.equal(f.committed, 1); }
  finally { Date.now = oldNow; }
  const saved = f.rows.get(`${prefix}/printResults/${f.jobId}`);
  saved.confirmedAt = f.envelope.expiresAt;
  const activity = f.rows.get(`${prefix}/statusMetadata/current`); activity.lastConfirmedPrintAt = saved.confirmedAt;
  Date.now = () => saved.confirmedAt + 1;
  try { await rejects(f.execute()); assert.equal(f.committed, 1); }
  finally { Date.now = oldNow; }
});
