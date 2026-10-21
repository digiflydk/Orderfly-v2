const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { loadTs } = require('../helpers/load-ts.cjs');
const { fixture, config, record, path, actorId } = require('../helpers/printing-fixture.cjs');
const { printJobId } = loadTs('src/lib/printing/domain.ts');
const { issuedQueueReviewSchema, QUEUE_REVIEW_TTL_MS } = loadTs('src/lib/printing/queue-review-storage.ts', { 'server-only': {} });
const scope = { brandId: 'brand', locationId: 'location', printerId: 'p1' };
const queuePath = `${path}/queue/state`;
const metadata = (patch = {}) => ({ schemaVersion: 1, ...scope, revision: 7, pendingCount: 0,
  oldestPendingAt: null, updatedAt: { seconds: 2 }, ...patch });
const command = (patch = {}) => ({ ...scope, printerRevision: 1, queueRevision: 7, decision: 'resume_empty', ...patch });
function job(orderId = 'o1', patch = {}) {
  const identity = { ...scope, orderId, kind: 'kitchen', revision: 0 };
  const value = { schemaVersion: 1, ...identity, id: printJobId(identity), printerRevision: 1,
    state: 'queued', attempts: 0, createdAt: Date.now() - 1000, updatedAt: { seconds: 1 }, ...patch };
  return [`${path}/jobs/${value.id}`, value];
}
const make = (options = {}) => fixture({ target: 'review', existing: record(),
  permissions: ['orderfly.catalog:edit'], extra: [[queuePath, metadata()]], ...options });

test('same write transaction issues actor/scope/revision bound expiring private capability and immutable audit only', async () => {
  for (const state of ['disabled', 'paused']) {
    const f = make({ existing: record({ configuration: config({ state }) }) });
    const original = structuredClone([...f.records]); const start = Date.now();
    const r = await f.request('POST', command());
    assert.equal(r.status, 200); assert.match(r.body.receipt, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(r.body.resumeAuthorized, false); assert.equal(r.body.decision, 'resume_empty');
    assert.equal(r.body.expiresAt >= start + QUEUE_REVIEW_TTL_MS, true);
    assert.equal(r.cache, 'no-store'); assert.equal(r.vary, 'Cookie');
    const digest = createHash('sha256').update(r.body.receipt).digest('hex');
    const receipt = f.records.get(`${path}/queueReviews/${digest}`);
    assert.equal(issuedQueueReviewSchema.safeParse(receipt).success, true);
    assert.deepEqual(receipt, { schemaVersion: 1, tokenHash: digest, actorId, ...scope,
      printerState: state, printerRevision: 1, queueRevision: 7, decision: 'resume_empty',
      issuedAt: r.body.expiresAt - QUEUE_REVIEW_TTL_MS, expiresAt: r.body.expiresAt,
      consumedAt: null, createdAt: { serverTimestamp: true } });
    assert.equal(f.records.get(`${path}/queueReviewAudit/${digest}`).action, 'printer.queue_review_issued');
    for (const [key, value] of original) assert.deepEqual(f.records.get(key), value);
    assert.deepEqual(f.commits, [[['create', `${path}/queueReviews/${digest}`], ['create', `${path}/queueReviewAudit/${digest}`]]]);
    assert.doesNotMatch(JSON.stringify([...f.records]), new RegExp(r.body.receipt));
    assert.doesNotMatch(JSON.stringify(r.body), /actorId|tokenHash|createdAt|consumedAt|orderId|jobId|configuration/);
    assert.equal(f.events[0][1], 'platformAdminControl/access-v1');
    assert.ok(f.events.some(e => e[1] === queuePath)); assert.ok(f.events.some(e => e[1] === `${path}/jobs`));
  }
});
test('repeated issuance creates independent random capabilities and never overwrites history or consumes/resumes', async () => {
  const f = make(); const a = await f.request('POST', command()), b = await f.request('POST', command());
  assert.equal(a.status, 200); assert.equal(b.status, 200); assert.notEqual(a.body.receipt, b.body.receipt);
  assert.equal([...f.records.keys()].filter(k => k.includes('/queueReviews/')).length, 2);
  assert.equal(f.records.get(path).configuration.state, 'disabled');
  for (const [key, value] of f.records) if (key.includes('/queueReviews/')) assert.equal(value.consumedAt, null);
  assert.equal((await f.transition({ ...scope, action: 'resume', revision: 1 }).catch(e => e.code)), 'queue_review_required');
});
test('schema reserves exact short expiry and unconsumed single-use contract; raw tokens or invented authority cannot be stored', async () => {
  const f = make(); const r = await f.request('POST', command());
  const value = [...f.records].find(([k]) => k.includes('/queueReviews/'))[1];
  for (const patch of [{ consumedAt: Date.now() }, { expiresAt: value.issuedAt }, { expiresAt: value.expiresAt + 1 },
    { issuedAt: 0 }, { printerState: 'active' }, { actorId: 'fake' }, { token: r.body.receipt }, { resumeAuthorized: true }]) {
    assert.equal(issuedQueueReviewSchema.safeParse({ ...value, ...patch }).success, false);
  }
});
test('missing ledger never means empty; legacy/foreign/inconsistent metadata and exhausted revision cannot issue', async () => {
  for (const extra of [[], [[queuePath, { schemaVersion: 0 }]], [[queuePath, metadata({ brandId: 'foreign' })]],
    [[queuePath, metadata({ pendingCount: 1, oldestPendingAt: 1 })]], [[queuePath, metadata({ revision: Number.MAX_SAFE_INTEGER })]]]) {
    const f = make({ extra }); const r = await f.request('POST', command({ queueRevision: extra[0]?.[1]?.revision || 7 }));
    assert.equal(r.status, 409); assert.deepEqual(f.commits, []);
    assert.equal([...f.records.keys()].some(k => /queueReview/.test(k)), false);
  }
});
test('explicit resume_empty never authorizes replay even for fresh valid queued originals', async () => {
  const row = job(); const f = make({ extra: [[queuePath, metadata({ pendingCount: 1, oldestPendingAt: row[1].createdAt })], row] });
  const r = await f.request('POST', command());
  assert.deepEqual(r.body, { error: 'queue_not_empty' }); assert.equal(r.status, 409); assert.deepEqual(f.commits, []);
});
test('all canonical rows are re-read, including corrupt, expired, unknown result, clocks and overflow', async () => {
  for (const patch of [{ brandId: 'foreign' }, { orderId: 'different' }, { credential: 'PRIVATE_SENTINEL' },
    { schemaVersion: 0 }, { state: 'expired' }, { state: 'uncertain' }, { state: 'dispatching' },
    { attempts: 1 }, { createdAt: 0 }, { createdAt: Date.now() + 600000 }]) {
    const f = make({ extra: [[queuePath, metadata()], job('o1', patch)] });
    const r = await f.request('POST', command()); assert.deepEqual(r.body, { error: 'queue_review_blocked' });
    assert.equal(r.status, 409); assert.deepEqual(f.commits, []); assert.doesNotMatch(JSON.stringify(r.body), /PRIVATE_SENTINEL/);
  }
  const f = make({ extra: [[queuePath, metadata()], ...Array.from({ length: 501 }, (_, i) => job(`o${i}`))] });
  assert.deepEqual((await f.request('POST', command())).body, { error: 'queue_review_blocked' }); assert.deepEqual(f.commits, []);
});
test('invalid server clock and unsafe expiry cannot mint an apparently fresh receipt', async () => {
  for (const now of [0, -1, NaN, 1.5, Number.MAX_SAFE_INTEGER]) {
    const f = make(); const previous = Date.now; Date.now = () => now;
    try { await assert.rejects(f.review(command()), /queue_review_blocked/); }
    finally { Date.now = previous; }
    assert.deepEqual(f.commits, []);
  }
});
test('current edit grants and native ownership precede all printer and queue reads', async () => {
  for (const options of [{ anonymous: true }, { permissions: [] }, { permissions: ['orderfly.catalog:view'] },
    { permissions: ['orderfly.catalog:create'] }, { extra: [['locations/location', { brandId: 'foreign' }]] }]) {
    const f = make(options); const r = await f.request('POST', command());
    assert.equal(r.status, options.anonymous ? 401 : 403); assert.deepEqual(f.commits, []);
    assert.equal(f.events.some(e => e[1] === path || e[1] === queuePath || e[1] === `${path}/jobs`), false);
  }
  for (const change of [r => r.delete('brands/brand'), r => r.delete('locations/location'),
    r => r.get('platformAdminControl/access-v1').memberships[0].active = false]) {
    const f = make(); change(f.records); assert.equal((await f.request('POST', command())).status, 403); assert.deepEqual(f.commits, []);
  }
  assert.equal((await make().request('POST', command({ brandId: 'foreign' }))).status, 403);
  assert.equal((await make().request('POST', command({ locationId: 'other' }))).status, 403);
});
test('invalid printers share 404; active, stale or exhausted printer/queue revisions conflict', async () => {
  for (const existing of [undefined, record({ deletedAt: 1 }), record({ token: 'PRIVATE_SENTINEL' }),
    record({ configuration: config({ id: 'other' }) }), record({ configuration: config({ brandId: 'foreign' }) })]) {
    const f = make({ existing }); assert.equal((await f.request('POST', command())).status, 404); assert.deepEqual(f.commits, []);
  }
  for (const options of [{ existing: record({ configuration: config({ state: 'active' }) }) },
    { existing: record({ revision: 2 }) }, { existing: record({ revision: Number.MAX_SAFE_INTEGER }) },
    { extra: [[queuePath, metadata({ revision: 8 })]] }]) {
    const f = make(options); assert.equal((await f.request('POST', command())).status, 409); assert.deepEqual(f.commits, []);
  }
});
test('transaction retries independently recheck revoked authority, reassignment, printer and queue changes', async () => {
  for (const [retry, status] of [[r => r.get('platformAdminControl/access-v1').memberships[0].active = false, 403],
    [r => r.get('locations/location').brandId = 'foreign', 403], [r => r.get(path).revision++, 409],
    [r => r.get(queuePath).revision++, 409], [r => { r.set(...job()); }, 409]]) {
    const f = make({ retry }); assert.equal((await f.request('POST', command())).status, status);
    assert.deepEqual(f.commits, []); assert.equal([...f.records.keys()].some(k => k.includes('/queueReview')), false);
  }
  const f = make({ retry: () => {} }); assert.equal((await f.request('POST', command())).status, 200);
  assert.equal(f.commits.length, 1); assert.equal(f.commits[0].length, 2);
});
test('audit/commit failure rolls back entire issuance; storage/identity errors disclose no details', async () => {
  for (const options of [{ failAudit: true }, { beforeCommit: () => { throw Error('PRIVATE_SENTINEL'); } }, { identityStatus: 503 }]) {
    const f = make(options); const before = structuredClone([...f.records]); const r = await f.request('POST', command());
    assert.equal(r.status, 503); assert.deepEqual(r.body, { error: 'queue_review_unavailable' });
    assert.deepEqual([...f.records], before); assert.deepEqual(f.commits, []);
    assert.equal(r.cache, 'no-store'); assert.equal(r.vary, 'Cookie');
  }
});
test('service enforces default-off gate, strict inputs, explicit decision and refuses client summary/token/clock evidence', async () => {
  for (const flag of [undefined, 'false', 'TRUE', '1']) {
    const f = make({ enabled: false }); await assert.rejects(f.review(command(), flag), /writes_unavailable/); assert.equal(f.dbCalls, 0);
  }
  for (const input of [null, {}, command({ brandId: 'a/b' }), command({ printerRevision: 0 }), command({ queueRevision: '7' }),
    command({ decision: 'replay_all' }), command({ decision: undefined }), command({ reviewed: true }), command({ pendingCount: 0 }),
    command({ evaluatedAt: Date.now() }), command({ receipt: 'fake' }), command({ actorId: 'PRIVATE_SENTINEL' }), command({ expiresAt: Date.now() + 999999 })]) {
    const f = make(); assert.equal((await f.request('POST', input)).status, 400); assert.equal(f.dbCalls, 0);
  }
});
test('HTTP auth-first, CSRF, strict JSON/query and byte limit precede service storage access', async () => {
  const unauth = make({ anonymous: true });
  assert.equal((await unauth.request('POST', {}, { raw: '{', headers: { origin: 'https://foreign.test' } })).status, 401);
  for (const headers of [{ origin: '' }, { origin: 'https://foreign.test' }, { 'sec-fetch-site': 'cross-site' }]) {
    const f = make(); assert.equal((await f.request('POST', command(), { headers })).status, 403); assert.equal(f.dbCalls, 0);
  }
  for (const options of [{ raw: '{' }, { raw: '' }, { raw: ' '.repeat(8193) }, { query: '?reviewed=true' },
    { headers: { 'content-type': 'text/plain' } }]) {
    const f = make(); assert.equal((await f.request('POST', command(), options)).status, 400); assert.equal(f.dbCalls, 0);
  }
  assert.equal((await make({ enabled: false }).request('POST', command())).status, 503);
});
