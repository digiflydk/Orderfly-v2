const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { fixture, config, record, path, actorId } = require('../helpers/printing-fixture.cjs');
const { loadTs } = require('../helpers/load-ts.cjs');
const { printJobId } = loadTs('src/lib/printing/domain.ts');
const scope = { brandId: 'brand', locationId: 'location', printerId: 'p1' };
const queuePath = `${path}/queue/state`;
const metadata = (patch = {}) => ({ schemaVersion: 1, ...scope, revision: 7,
  pendingCount: 0, oldestPendingAt: null, updatedAt: { seconds: 1 }, ...patch });
const digest = token => createHash('sha256').update(token).digest('hex');
const reviewPath = token => `${path}/queueReviews/${digest(token)}`;
const setup = (options = {}) => fixture({ target: 'lifecycle', existing: record(),
  permissions: ['orderfly.catalog:edit'], extra: [[queuePath, metadata()]], ...options });
const issue = f => f.review({ ...scope, printerRevision: 1, queueRevision: 7, decision: 'resume_empty' });
const command = (receipt, patch = {}) => ({ ...scope, action: 'resume', revision: 1, queueRevision: 7, receipt, ...patch });
const job = (patch = {}) => {
  const value = { schemaVersion: 1, ...scope, orderId: 'o1', kind: 'kitchen', revision: 0,
    printerRevision: 1, state: 'queued', attempts: 0, createdAt: Date.now() - 100, updatedAt: { seconds: 1 }, ...patch };
  value.id = printJobId(value); return [`${path}/jobs/${value.id}`, value];
};
const frozenNow = async (now, run) => {
  const previous = Date.now; Date.now = () => now;
  try { return await run(); } finally { Date.now = previous; }
};

test('actual issued receipt resumes paused/disabled exactly once with atomic consumption, revision, audit and capability invalidation', async () => {
  for (const state of ['paused', 'disabled']) {
    const f = setup({ existing: record({ configuration: config({ state }) }), extra: [[queuePath, metadata()],
      [`${path}/audit/1`, { historical: true }], ['locations/location/printerCapabilityVerifications/p1', { trusted: true }],
      ['privateCredentials/p1', { secret: 'PRIVATE_SENTINEL' }], ['printJobs/historical', { old: true }]] });
    const receipt = (await issue(f)).receipt, review = structuredClone(f.records.get(reviewPath(receipt)));
    const issuanceAuditPath = `${path}/queueReviewAudit/${digest(receipt)}`;
    const issuanceAudit = structuredClone(f.records.get(issuanceAuditPath));
    const start = Date.now(), r = await f.request('POST', command(receipt));
    assert.deepEqual(r, { status: 200, body: { item: { configuration: config({ state: 'active' }), revision: 2 } }, cache: 'no-store', vary: 'Cookie' });
    assert.equal(f.records.get(path).revision, 2); assert.equal(f.records.get(path).configuration.state, 'active');
    const consumed = f.records.get(reviewPath(receipt));
    assert.ok(consumed.consumedAt >= start); assert.ok(consumed.consumedAt < review.expiresAt);
    assert.deepEqual(consumed, { ...review, consumedAt: consumed.consumedAt });
    assert.deepEqual(f.records.get(issuanceAuditPath), issuanceAudit);
    assert.deepEqual(f.records.get(`${path}/audit/2`), { schemaVersion: 1, actorId, action: 'printer.resume', revision: 2,
      before: config({ state }), after: config({ state: 'active' }), deleted: false,
      capabilityInvalidated: true, createdAt: { serverTimestamp: true }, queueReview: {
        tokenHash: digest(receipt), queueRevision: 7, decision: 'resume_empty', issuedAt: review.issuedAt,
        expiresAt: review.expiresAt, consumedAt: consumed.consumedAt } });
    assert.deepEqual(f.commits.at(-1), [['set', reviewPath(receipt)], ['delete', 'locations/location/printerCapabilityVerifications/p1'],
      ['create', `${path}/audit/2`], ['set', path]]);
    assert.equal(f.records.has('locations/location/printerCapabilityVerifications/p1'), false);
    assert.deepEqual(f.records.get(`${path}/audit/1`), { historical: true });
    assert.deepEqual(f.records.get('privateCredentials/p1'), { secret: 'PRIVATE_SENTINEL' });
    assert.deepEqual(f.records.get('printJobs/historical'), { old: true });
    assert.deepEqual(f.records.get(queuePath), metadata());
    assert.doesNotMatch(JSON.stringify([...f.records]), new RegExp(receipt));
    assert.doesNotMatch(JSON.stringify(r.body), /receipt|tokenHash|actorId|queueReview|PRIVATE_SENTINEL/);
    assert.equal((await f.request('POST', command(receipt))).status, 409);
    assert.equal((await f.request('POST', command(receipt, { revision: 2 }))).status, 409);
    assert.equal(f.commits.length, 2);
  }
});

test('receipt expires at server boundary, future/invalid server times fail closed, and TTL never extends', async () => {
  for (const which of ['before-issued', 'expiry', 'after-expiry', 'invalid-clock']) {
    const f = setup(), receipt = (await issue(f)).receipt, review = f.records.get(reviewPath(receipt));
    const now = which === 'before-issued' ? review.issuedAt - 1 : which === 'expiry' ? review.expiresAt
      : which === 'after-expiry' ? review.expiresAt + 1 : NaN;
    const before = structuredClone([...f.records]);
    const r = await frozenNow(now, () => f.request('POST', command(receipt)));
    assert.deepEqual(r.body, { error: 'queue_review_blocked' }); assert.equal(r.status, 409);
    assert.deepEqual([...f.records], before); assert.equal(f.commits.length, 1);
  }
  const f = setup(), receipt = (await issue(f)).receipt, review = f.records.get(reviewPath(receipt));
  assert.equal((await frozenNow(review.expiresAt - 1, () => f.request('POST', command(receipt)))).status, 200);
});

test('fabricated, consumed, corrupt, foreign actor/scope/state/revision/decision/hash receipt records cannot resume', async () => {
  const mutations = [r => r.delete('TARGET'), r => r.set('TARGET', {}),
    ...[{ consumedAt: Date.now() }, { tokenHash: 'a'.repeat(64) }, { actorId: 'b'.repeat(64) }, { brandId: 'foreign' },
      { locationId: 'other' }, { printerId: 'other' }, { printerState: 'paused' }, { printerRevision: 2 },
      { queueRevision: 8 }, { decision: 'replay_all' }, { schemaVersion: 2 }, { token: 'PRIVATE_SENTINEL' },
      { issuedAt: 0 }, { expiresAt: 1 }].map(patch => r => r.set('TARGET', { ...r.get('TARGET'), ...patch }))];
  for (const mutate of mutations) {
    const f = setup(), receipt = (await issue(f)).receipt, key = reviewPath(receipt);
    const remap = { delete: () => f.records.delete(key), set: (_, value) => f.records.set(key, value), get: () => f.records.get(key) };
    mutate(remap); const before = structuredClone([...f.records]);
    const r = await f.request('POST', command(receipt));
    assert.equal(r.status, 409); assert.deepEqual(r.body, { error: 'queue_review_required' });
    assert.deepEqual([...f.records], before); assert.equal(f.commits.length, 1);
  }
  const f = setup(); assert.equal((await f.request('POST', command('A'.repeat(43)))).status, 409); assert.equal(f.commits.length, 0);
});

test('native ownership, current grant and nondeleted strict printer are independently reauthorized after issuance', async () => {
  for (const [change, status] of [[r => r.get('platformAdminControl/access-v1').memberships[0].active = false, 403],
    [r => r.get('platformAdminControl/access-v1').roles[0].permissions = [], 403],
    [r => r.delete('brands/brand'), 403], [r => r.get('locations/location').brandId = 'foreign', 403],
    [r => r.get(path).deletedAt = 1, 404], [r => r.get(path).configuration.brandId = 'foreign', 404],
    [r => r.get(path).configuration.state = 'paused', 409], [r => r.get(path).revision++, 409],
    [r => r.get(path).configuration.state = 'active', 409]]) {
    const f = setup(), receipt = (await issue(f)).receipt; change(f.records);
    const before = structuredClone([...f.records]); const r = await f.request('POST', command(receipt));
    assert.equal(r.status, status); assert.deepEqual([...f.records], before); assert.equal(f.commits.length, 1);
  }
});

test('whole canonical ledger/job set must still be valid and empty at consumption', async () => {
  for (const change of [r => r.delete(queuePath), r => r.set(queuePath, { schemaVersion: 0 }),
    r => r.get(queuePath).brandId = 'foreign', r => r.get(queuePath).revision++,
    r => r.get(queuePath).pendingCount = 1, r => r.get(queuePath).oldestPendingAt = 1,
    ...[{}, { state: 'uncertain' }, { state: 'dispatching' }, { state: 'expired' },
      { credential: 'PRIVATE_SENTINEL' }, { createdAt: Date.now() + 600000 }].map(patch => r => r.set(...job(patch))),
    r => { for (let i = 0; i < 501; i++) r.set(...job({ orderId: `o${i}` })); }]) {
    const f = setup(), receipt = (await issue(f)).receipt; change(f.records);
    const before = structuredClone([...f.records]); const result = await f.request('POST', command(receipt));
    assert.equal(result.status, 409); assert.deepEqual(result.body, { error: 'queue_review_blocked' });
    assert.deepEqual([...f.records], before); assert.equal(f.commits.length, 1);
  }
  const f = setup(), receipt = (await issue(f)).receipt, row = job(); f.records.set(...row);
  f.records.set(queuePath, metadata({ pendingCount: 1, oldestPendingAt: row[1].createdAt }));
  assert.equal((await f.request('POST', command(receipt))).status, 409); assert.equal(f.commits.length, 1);
});

test('competing same/different receipts have exactly one resume and all remaining receipts are invalidated by revision', async () => {
  for (const separate of [false, true]) {
    const f = setup(), a = (await issue(f)).receipt, b = separate ? (await issue(f)).receipt : a;
    const results = await Promise.all([a, b].map(receipt => f.request('POST', command(receipt))));
    assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
    assert.equal([...f.records.keys()].filter(k => k === `${path}/audit/2`).length, 1);
    assert.equal(f.records.get(path).revision, 2);
    if (separate) {
      assert.equal(f.records.get(reviewPath(b)).consumedAt, null);
      // A later stop/config state cannot reuse a receipt issued for an old revision.
      f.records.get(path).configuration.state = 'disabled';
      assert.equal((await f.request('POST', command(b, { revision: 2 }))).status, 409);
    }
  }
});

test('receipt consumption, capability invalidation, printer update and audit all roll back on audit or commit failure', async () => {
  for (const failure of ['audit', 'commit']) {
    const f = setup(), receipt = (await issue(f)).receipt;
    const seeded = structuredClone([...f.records]);
    const broken = setup({ extra: seeded, ...(failure === 'audit' ? { failAudit: true } : { beforeCommit: () => { throw Error('PRIVATE_SENTINEL'); } }) });
    const before = structuredClone([...broken.records]); const r = await broken.request('POST', command(receipt));
    assert.equal(r.status, 503); assert.deepEqual(r.body, { error: 'printers_unavailable' });
    assert.deepEqual([...broken.records], before); assert.equal(broken.records.get(reviewPath(receipt)).consumedAt, null);
    assert.equal(broken.commits.length, 0);
  }
});

test('transaction retries recheck grants, scope, printer, queue, receipt consumption and expiry', async () => {
  for (const [change, status] of [[r => r.get('platformAdminControl/access-v1').memberships[0].active = false, 403],
    [r => r.get('locations/location').brandId = 'foreign', 403], [r => r.get(path).revision++, 409],
    [r => r.get(queuePath).revision++, 409], [r => r.set(...job()), 409],
    [r => { for (const [k,v] of r) if(k.includes('/queueReviews/')) v.consumedAt = Date.now(); }, 409],
    [r => { for (const [k,v] of r) if(k.includes('/queueReviews/')) { v.issuedAt -= 120001; v.expiresAt -= 120001; } }, 409]]) {
    const minted = setup(), receipt = (await issue(minted)).receipt;
    const f = setup({ extra: structuredClone([...minted.records]), retry: change });
    assert.equal((await f.request('POST', command(receipt))).status, status); assert.equal(f.commits.length, 0);
    assert.equal(f.events.filter(e => e[1] === 'platformAdminControl/access-v1').length, 2);
  }
  const minted = setup(), receipt = (await issue(minted)).receipt;
  const f = setup({ extra: structuredClone([...minted.records]), retry: () => {} });
  assert.equal((await f.request('POST', command(receipt))).status, 200); assert.equal(f.commits.length, 1);
});

test('strict resume command keeps missing review fail-closed and rejects invented authority and stop receipt fields', async () => {
  for (const input of [command('fake'), command('A'.repeat(43), { queueRevision: undefined }),
    command(undefined), command('A'.repeat(43), { queueRevision: 0 }),
    command('A'.repeat(43), { queueRevision: Number.MAX_SAFE_INTEGER + 1 }),
    command('A'.repeat(43), { action: 'pause' }), command('A'.repeat(43), { resumeAuthorized: true }),
    command('A'.repeat(43), { now: Date.now() }), command('A'.repeat(43), { decision: 'resume_empty' })]) {
    const f = setup(); assert.equal((await f.request('POST', input)).status, 400); assert.equal(f.dbCalls, 0);
  }
  const f = setup(); assert.deepEqual((await f.request('POST', { ...scope, action: 'resume', revision: 1 })).body, { error: 'queue_review_required' });
  const disabled = setup({ enabled: false }); assert.equal((await disabled.request('POST', command('A'.repeat(43)))).status, 503); assert.equal(disabled.dbCalls, 0);
});
