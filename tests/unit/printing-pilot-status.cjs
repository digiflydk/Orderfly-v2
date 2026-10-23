const { test } = require('node:test');
const assert = require('node:assert/strict');
const { moduleGraph } = require('../helpers/load-ts-graph.cjs');
const { record, path, actorId, policy: basePolicy } = require('../helpers/printing-fixture.cjs');
const scope = { brandId: 'brand', locationId: 'location', printerId: 'p1', printerRevision: 1, credentialRevision: 1 };
const sessionId = Buffer.alloc(32, 7).toString('base64url');
const jobPath = `${path}/pilotJobs/${sessionId}`, sessionPath = `${path}/pilotQualifications/${sessionId}`;
function fixture() {
  const policy = basePolicy();
  policy.roles.push({ id: 'owner', name: 'Owner', companyId: null, kind: 'superuser', permissions: [], active: true });
  policy.memberships.push({ id: 'owner', principalId: actorId, companyId: null, locationIds: null, roleIds: ['owner'], active: true });
  const printer = record(); printer.configuration.state = 'active';
  const records = new Map([['platformAdminControl/access-v1', policy], ['brands/brand', { status: 'active' }],
    ['locations/location', { brandId: 'brand' }], [path, printer],
    [`${path}/deviceCredentials/current`, { schemaVersion: 1, ...scope, secretDigest: 'a'.repeat(64), issuedAt: 1, revokedAt: null }]]);
  const options = {}, reads = []; let dbCalls = 0;
  const ref = path => ({ path, id: path.split('/').at(-1), collection: name => ({ doc: id => ref(`${path}/${name}/${id}`) }) });
  const db = { collection: name => ({ doc: id => ref(`${name}/${id}`) }), async runTransaction(run, config) {
    assert.deepEqual(config, { readOnly: true });
    if (options.failure) throw Error('PRIVATE native failure');
    return run({ async get(r) { reads.push(r.path); return { id: r.id, exists: records.has(r.path), data: () => structuredClone(records.get(r.path)) }; },
      create() { assert.fail('status must not write'); }, set() { assert.fail('status must not write'); }, delete() { assert.fail('status must not write'); } });
  } };
  let authority;
  const load = moduleGraph({ 'server-only': {}, react: require('next/dist/compiled/react'), '@/lib/firebase-admin': { getAdminDb: () => { dbCalls++; return db; } },
    '@/lib/access/orderfly-session': { requirePlatformSuperuser: async () => {
      if (options.denied) throw new authority.AuthorityError('unauthorized', 401);
      return { identity: { provider: 'firebase', subject: 'writer' } };
    } }, '@/lib/url': { getOrigin: async () => 'https://orderfly.dk' } });
  authority = load('src/lib/access/authority.ts');
  const route = load('src/app/api/superadmin/printers/pilot/route.ts');
  const service = load('src/lib/printing/pilot-status.ts');
  const jobs = load('src/lib/printing/synthetic-pilot-job.ts');
  function seed(state = 'queued', expired = false) {
    const now = Date.now(), issuedAt = now - (expired ? 700000 : 10000), createdAt = issuedAt + 1000, expiresAt = issuedAt + 600000;
    const job = jobs.createSyntheticPilotJobRecord({ ...scope, sessionId, model: 'mc-print3', paperWidthMm: 80, createdAt, expiresAt });
    job.state = state;
    if (state !== 'queued') { job.tokenDigest = 'b'.repeat(64); job.offeredAt = createdAt + 100; }
    if (!['queued', 'offered'].includes(state)) job.downloadStartedAt = createdAt + 200;
    if (['confirmed', 'failed', 'unknown'].includes(state)) { job.outcome = state; if (state === 'confirmed') job.confirmedAt = createdAt + 300; }
    records.set(jobPath, job);
    records.set(`${path}/pilotState/current`, { schemaVersion: 1, sessionId });
    records.set(sessionPath, { schemaVersion: 1, ...scope, sessionId, nonceDigest: 'c'.repeat(64), actorId,
      state: 'consumed', trust: 'supervised_operator', issuedAt, expiresAt,
      outputAuthorized: false, dispatchAuthorized: false, activationAuthorized: false, physicalCompatibilityVerified: false,
      jobId: sessionId, contentDigest: job.content.sha256, consumedAt: createdAt });
  }
  async function get(query = new URLSearchParams(scope).toString(), headers = {}) {
    const response = await route.GET(new Request(`https://orderfly.dk/api/superadmin/printers/pilot?${query}`, { headers }));
    assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(response.headers.get('vary'), 'Cookie');
    return { status: response.status, body: await response.json() };
  }
  return { records, options, reads, seed, get, service, get dbCalls() { return dbCalls; } };
}

test('actual GET reads none and every durable mc-print3 80mm delivery state without writes or sensitive projection', async () => {
  const f = fixture();
  assert.equal((await f.get()).body.state, 'none');
  for (const state of ['queued', 'offered', 'download_started', 'confirmed', 'failed', 'unknown']) {
    f.seed(state); const before = structuredClone([...f.records]);
    const r = await f.get(); assert.equal(r.status, 200); assert.equal(r.body.state, state);
    assert.equal(r.body.physicalCompatibilityVerified, false);
    assert.deepEqual(Object.keys(r.body).sort(), [...Object.keys(scope), 'state', 'createdAt', 'expiresAt', 'confirmedAt', 'physicalCompatibilityVerified'].sort());
    assert.deepEqual([...f.records], before);
    for (const forbidden of ['nonce', 'secret', 'token', 'payload', 'capture', 'sessionId']) assert.equal(JSON.stringify(r.body).includes(forbidden), false);
  }
});
test('expired nonterminal states are explicit; terminal confirmation remains readable after expiry without physical proof', async () => {
  const f = fixture();
  for (const state of ['queued', 'offered', 'download_started']) { f.seed(state, true); assert.equal((await f.get()).body.state, 'expired'); }
  for (const state of ['confirmed', 'failed', 'unknown']) { f.seed(state, true); assert.equal((await f.get()).body.state, state); }
});
test('auth first and strict bounded query reject before native access', async () => {
  const f = fixture(); f.options.denied = true;
  assert.equal((await f.get('poison')).status, 401); assert.equal(f.dbCalls, 0);
  f.options.denied = false;
  for (const query of ['brandId=brand', `${new URLSearchParams(scope)}&brandId=foreign`,
    `${new URLSearchParams(scope)}&extra=1`, new URLSearchParams({ ...scope, printerRevision: '1e0' }).toString(),
    new URLSearchParams({ ...scope, credentialRevision: '9007199254740992' }).toString()]) assert.equal((await f.get(query)).status, 400);
  assert.equal((await f.get(undefined, { 'sec-fetch-site': 'cross-site' })).status, 400); assert.equal(f.dbCalls, 0);
});
test('foreign owner, stale revisions, revoked credential, corrupt job/session and changed media fail closed', async () => {
  const changes = [r => r.get('locations/location').brandId = 'foreign', r => r.get(path).revision++,
    r => r.get(path).configuration.paperWidthMm = 58,
    r => r.get(`${path}/deviceCredentials/current`).revokedAt = Date.now(),
    r => r.get(jobPath).credentialRevision++, r => r.get(jobPath).createdAt = Date.now() + 1000,
    r => r.get(sessionPath).contentDigest = 'e'.repeat(64), r => r.delete(jobPath),
    r => r.get('platformAdminControl/access-v1').memberships.at(-1).active = false];
  for (const change of changes) {
    const f = fixture(); f.seed(); change(f.records); const result = await f.get();
    assert.ok([403, 409].includes(result.status)); assert.equal(result.body.state, undefined);
  }
});
test('native failure returns fixed unavailable response', async () => {
  const f = fixture(); f.options.failure = true;
  assert.deepEqual(await f.get(), { status: 503, body: { error: 'qualification_unavailable' } });
});
