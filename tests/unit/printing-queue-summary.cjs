const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { fixture, config, record, path } = require('../helpers/printing-fixture.cjs');
const { printJobId } = loadTs('src/lib/printing/domain.ts');
const scope = { brandId: 'brand', locationId: 'location', printerId: 'p1' };
const query = '?brandId=brand&locationId=location&printerId=p1';
const queuePath = `${path}/queue/state`;
const now = Date.now(), older = now - 120000, newer = now - 30000;
function job(orderId = 'o1', createdAt = older, patch = {}) {
  const identity = { ...scope, orderId, kind: 'kitchen', revision: 0 };
  const value = { schemaVersion: 1, ...identity, id: printJobId(identity), printerRevision: 1,
    state: 'queued', attempts: 0, createdAt, updatedAt: { seconds: 1 }, ...patch };
  return [`${path}/jobs/${value.id}`, value];
}
const metadata = (patch = {}) => ({ schemaVersion: 1, ...scope, revision: 7,
  pendingCount: 2, oldestPendingAt: older, updatedAt: { seconds: 2 }, ...patch });
function make(options = {}) {
  const f = fixture({ target: 'queue', existing: record(), permissions: ['orderfly.catalog:view'],
    extra: [[queuePath, metadata()], job(), job('o2', newer)], ...options });
  return { ...f, async read(q = query) { return f.request('GET', null, { query: q }); } };
}

test('scoped transaction summary derives bounded ages, exposes no job/order payloads and authorizes no resume', async () => {
  const f = make(); const before = structuredClone([...f.records]); const r = await f.read();
  assert.equal(r.status, 200); assert.equal(r.body.status, 'verified'); assert.equal(r.body.queueRevision, 7);
  assert.equal(r.body.printerRevision, 1); assert.equal(r.body.printerState, 'disabled');
  assert.equal(r.body.resumeAuthorized, false); assert.equal(r.body.reason, null);
  assert.deepEqual(r.body.summary, { pendingCount: 2, oldestCreatedAt: older, newestCreatedAt: newer,
    oldestAgeMs: r.body.evaluatedAt - older, newestAgeMs: r.body.evaluatedAt - newer });
  assert.equal(r.cache, 'no-store'); assert.equal(r.vary, 'Cookie');
  assert.doesNotMatch(JSON.stringify(r.body), /orderId|attempts|configuration|updatedAt|credential|customer|o1|o2/);
  assert.deepEqual([...f.records], before); assert.deepEqual(f.commits, [[]]);
  assert.equal(f.events[0][1], 'platformAdminControl/access-v1');
  assert.ok(f.events.some(e => e[1] === `${path}/jobs`));
});
test('existing explicit empty ledger is verified, missing ledger with or without jobs is blocked without initialization', async () => {
  const f = make({ extra: [[queuePath, metadata({ pendingCount: 0, oldestPendingAt: null })]] });
  assert.deepEqual((await f.read()).body.summary, { pendingCount: 0, oldestCreatedAt: null, newestCreatedAt: null, oldestAgeMs: null, newestAgeMs: null });
  for (const extra of [[], [job()]]) {
    const g = make({ extra }); const before = structuredClone([...g.records]); const r = await g.read();
    assert.equal(r.body.status, 'blocked'); assert.equal(r.body.reason, 'missing_metadata');
    assert.equal(r.body.summary, null); assert.equal(r.body.queueRevision, null);
    assert.equal(r.body.resumeAuthorized, false); assert.deepEqual([...g.records], before);
  }
});
test('all printer operational states can be inspected, without enabling or mutating any state', async () => {
  for (const state of ['active', 'paused', 'disabled']) {
    const f = make({ existing: record({ configuration: config({ state }) }) });
    const r = await f.read(); assert.equal(r.body.printerState, state); assert.equal(r.body.resumeAuthorized, false);
    assert.equal(f.records.get(path).configuration.state, state); assert.deepEqual(f.commits, [[]]);
  }
});
test('authentication and actual transaction policy/native tenant boundaries precede printer/queue reads', async () => {
  for (const options of [{ anonymous: true }, { permissions: [] }, { permissions: ['orderfly.catalog:edit'] },
    { extra: [['locations/location', { brandId: 'foreign' }]] }, { extra: [['brands/brand', undefined]] }]) {
    const f = make(options); if (options.extra?.[0][0] === 'brands/brand') f.records.delete('brands/brand');
    const r = await f.read(); assert.equal(r.status, options.anonymous ? 401 : 403);
    assert.equal(f.events.some(e => e[1] === path || e[1] === queuePath || e[1] === `${path}/jobs`), false);
    assert.deepEqual(f.commits, []);
  }
  assert.equal((await make().read('?brandId=foreign&locationId=location&printerId=p1')).status, 403);
});
test('strict query rejects duplicate/missing/malformed keys and client review/count/clock claims before DB access', async () => {
  for (const q of ['', '?brandId=brand&locationId=location', query + '&printerId=p1', query + '&now=1',
    query + '&pendingCount=0', query + '&reviewed=true', query + '&credential=PRIVATE_SENTINEL', query.replace('p1','a%2Fb')]) {
    const f = make(); const r = await f.read(q); assert.equal(r.status, 400); assert.deepEqual(f.events, []);
    assert.doesNotMatch(JSON.stringify(r.body), /PRIVATE_SENTINEL/);
  }
});
test('missing/deleted/malformed/foreign printer uses uniform 404 and never reads queue', async () => {
  for (const existing of [undefined, record({ deletedAt: 1 }), record({ revision: 0 }),
    record({ configuration: config({ id: 'other' }) }), record({ configuration: config({ brandId: 'foreign' }) })]) {
    const f = make({ existing }); const r = await f.read(); assert.deepEqual(r.body, { error: 'not_found' }); assert.equal(r.status, 404);
    assert.equal(f.events.some(e => e[1] === queuePath), false);
  }
});
test('legacy/foreign/invalid metadata and inconsistent count or oldest never produce verified empty/fresh summary', async () => {
  for (const [value, reason] of [[{ schemaVersion: 0 }, 'invalid_metadata'], [metadata({ brandId: 'foreign' }), 'invalid_metadata'],
    [metadata({ pendingCount: 0, oldestPendingAt: null }), 'inconsistent_metadata'], [metadata({ pendingCount: 3 }), 'inconsistent_metadata'],
    [metadata({ oldestPendingAt: newer }), 'inconsistent_metadata'], [metadata({ revision: 0 }), 'invalid_metadata']]) {
    const f = make(); f.records.set(queuePath, value); const r = await f.read();
    assert.equal(r.body.status, 'blocked'); assert.equal(r.body.reason, reason); assert.equal(r.body.summary, null); assert.deepEqual(f.commits, [[]]);
  }
});
test('every later job must validate scope, ID, schema, credentials and required age', async () => {
  for (const patch of [{ brandId: 'foreign' }, { createdAt: undefined }, { orderId: 'foreign' },
    { credential: 'PRIVATE_SENTINEL' }, { attempts: -1 }, { schemaVersion: 2 }]) {
    const f = make(); Object.assign(f.records.get(job('o2', newer)[0]), patch); const r = await f.read();
    assert.equal(r.body.reason, 'invalid_jobs'); assert.equal(r.body.summary, null);
    assert.doesNotMatch(JSON.stringify(r.body), /PRIVATE_SENTINEL|foreign/);
  }
});
test('expired and unknown-result jobs explicitly block, other unsupported states do not pass v1', async () => {
  for (const [state, reason] of [['expired', 'expired_jobs'], ['uncertain','unknown_outcome_jobs'], ['dispatching','unknown_outcome_jobs'],
    ['confirmed','invalid_jobs'], ['scheduled','invalid_jobs'], ['failed','invalid_jobs']]) {
    const f = make(); f.records.get(job('o2', newer)[0]).state = state;
    const r = await f.read(); assert.equal(r.body.status, 'blocked'); assert.equal(r.body.reason, reason); assert.equal(r.body.resumeAuthorized, false);
  }
});
test('future or invalid job clocks block age calculations rather than clipping to fresh', async () => {
  for (const createdAt of [0, -1, NaN, Number.MAX_SAFE_INTEGER, Date.now() + 600000]) {
    const f = make(); f.records.get(job('o2', newer)[0]).createdAt = createdAt;
    const r = await f.read(); assert.equal(r.body.status, 'blocked'); assert.equal(r.body.summary, null);
    assert.ok(['clock_invalid','invalid_jobs'].includes(r.body.reason));
  }
});
test('complete 500-row queue is accepted; 501st row blocks without pretending page complete', async () => {
  const jobs = Array.from({ length: 500 }, (_, i) => job(`order${i}`, older + i));
  const f = make({ extra: [[queuePath, metadata({ pendingCount: 500 })], ...jobs] });
  assert.equal((await f.read()).body.summary.pendingCount, 500);
  f.records.set(...job('overflow', newer)); Object.assign(f.records.get(queuePath), { pendingCount: 501 });
  assert.equal((await f.read()).body.reason, 'queue_too_large'); assert.deepEqual(f.commits, [[], []]);
});
test('transaction retry rechecks revoked grants, native reassignment and current printer/queue revisions', async () => {
  for (const retry of [records => records.get('platformAdminControl/access-v1').memberships[0].active = false,
    records => records.get('locations/location').brandId = 'foreign']) {
    const f = make({ retry }); const r = await f.read(); assert.equal(r.status, 403); assert.deepEqual(f.commits, []);
  }
  const f = make({ retry: records => { records.get(path).revision = 2; records.get(queuePath).revision = 8; } });
  const r = await f.read(); assert.equal(r.body.printerRevision, 2); assert.equal(r.body.queueRevision, 8);
});
test('identity/storage outages are generic 503, all errors are no-store and no private details leak', async () => {
  for (const options of [{ identityStatus: 503 }, { beforeCommit: () => { throw Error('PRIVATE_SENTINEL'); } }]) {
    const f = make(options); const r = await f.read(); assert.equal(r.status, 503); assert.deepEqual(r.body, { error: 'queue_unavailable' });
    assert.equal(r.cache, 'no-store'); assert.equal(r.vary, 'Cookie'); assert.deepEqual(f.commits, []);
  }
  const unauth = await make({ anonymous: true }).read(query + '&secret=PRIVATE_SENTINEL');
  assert.equal(unauth.status, 401); assert.deepEqual(unauth.body, { error: 'unauthorized' });
});
