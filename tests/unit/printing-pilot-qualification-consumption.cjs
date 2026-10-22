const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { record, path, actorId, policy: basePolicy } = require('../helpers/printing-fixture.cjs');
const authority = loadTs('src/lib/access/authority.ts', { 'server-only': {} });
const scope = { brandId: 'brand', locationId: 'location', printerId: 'p1', printerRevision: 1, credentialRevision: 1 };
const credentialPath = `${path}/deviceCredentials/current`;
function fixture() {
  const policy = basePolicy();
  policy.roles.push({ id: 'owner', name: 'Owner', companyId: null, kind: 'superuser', permissions: [], active: true });
  policy.memberships.push({ id: 'owner', principalId: actorId, companyId: null, locationIds: null, roleIds: ['owner'], active: true });
  const printer = record(); printer.configuration.state = 'active';
  const records = new Map([['platformAdminControl/access-v1', policy], ['brands/brand', { status: 'active' }],
    ['locations/location', { brandId: 'brand' }], [path, printer],
    [credentialPath, { schemaVersion: 1, ...scope, secretDigest: 'a'.repeat(64), issuedAt: 1, revokedAt: null }]]);
  const options = {}, commits = [], reads = [];
  const ref = path => ({ path, id: path.split('/').at(-1), collection: name => ({ doc: id => ref(`${path}/${name}/${id}`) }) });
  let dbCalls = 0, retried = false;
  const db = { collection: name => ({ doc: id => ref(`${name}/${id}`) }), async runTransaction(run) {
    for (;;) {
      const staged = new Map(structuredClone([...records])), writes = []; let writing = false;
      const put = (r, value, create) => {
        writing = true;
        if (options.failAudit && r.path.endsWith('-consume')) throw Error('PRIVATE');
        if (create) assert.equal(staged.has(r.path), false);
        staged.set(r.path, structuredClone(value)); writes.push(r.path);
      };
      const result = await run({ async get(r) { assert.equal(writing, false, 'all reads before writes'); reads.push(r.path);
        return { id: r.id, exists: staged.has(r.path), data: () => structuredClone(staged.get(r.path)) }; },
        create: (r, value) => put(r, value, true), set: (r, value) => put(r, value, false) });
      if (options.retry && !retried) { retried = true; options.retry(records); continue; }
      if (options.failCommit) throw Error('PRIVATE');
      records.clear(); for (const row of staged) records.set(...row); commits.push(writes);
      if (options.unknownCommit) throw Error('PRIVATE');
      return result;
    }
  } };
  const mocks = { 'server-only': {}, '@/lib/firebase-admin': { getAdminDb: () => { dbCalls++; return db; } },
    '@/lib/access/authority': authority, './authority': authority,
    '@/lib/access/orderfly-session': { requirePlatformSuperuser: async () => {
      if (options.denied) throw new authority.AuthorityError('forbidden');
      return { identity: { provider: 'firebase', subject: 'writer' } };
    } } };
  const issuance = loadTs('src/lib/printing/pilot-qualification.ts', mocks);
  const consumer = loadTs('src/lib/printing/pilot-qualification-consumption.ts', mocks);
  const content = loadTs('src/lib/printing/job-content.ts', { 'server-only': {} });
  async function enabled(run, flag = true) {
    const previous = process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED;
    if (flag) process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED = 'true'; else delete process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED;
    try { return await run(); } finally {
      if (previous === undefined) delete process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED;
      else process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED = previous;
    }
  }
  return { records, reads, options, commits, consumer, content, get dbCalls() { return dbCalls; },
    issue: () => enabled(() => issuance.issuePilotQualificationSession(scope)),
    consume: (a, flag) => enabled(() => consumer.consumePilotQualification(a), flag) };
}
function attestation(session, patch = {}) { return { ...scope, sessionId: session.sessionId, nonce: session.nonce,
  trust: 'supervised_operator', operatorId: 'onsite1', physicalDeviceIdentified: true, nativeEnrollmentCorrelated: true,
  method: 'stario_firmware_query', model: 'mc-print3', labelSku: 'MCP31LB', firmware: '3.2', captureDigest: 'b'.repeat(64),
  paperWidthMm: 80, rasterWidthDots: 576, transport: 'cloudprnt-http', mediaType: 'image/png', ...patch }; }
const sessionPath = r => `${path}/pilotQualifications/${r.sessionId}`;
const jobPath = r => `${path}/pilotJobs/${r.sessionId}`;

test('actual pending issuance consumes once with canonical job, pointer and audit in one commit without output grant', async () => {
  const f = fixture(), issued = await f.issue(), before = structuredClone(f.records.get(path));
  const result = await f.consume(attestation(issued)), saved = f.records.get(sessionPath(issued)), job = f.records.get(jobPath(issued));
  assert.equal(f.consumer.consumedPilotQualificationSchema.safeParse(saved).success, true);
  assert.equal(saved.jobId, issued.sessionId); assert.equal(saved.contentDigest, job.content.sha256);
  assert.equal(saved.expiresAt, issued.expiresAt); assert.equal(saved.actorId, actorId);
  assert.equal(result.jobId, issued.sessionId); assert.equal(job.state, 'queued');
  const nativeContent = f.content.readSyntheticTestBonContent(job.content,
    { brandId: 'brand', locationId: 'location', printerId: 'p1', printerRevision: 1, model: 'mc-print3', paperWidthMm: 80 });
  assert.equal(nativeContent.sha256, result.contentDigest);
  assert.deepEqual(f.records.get(`${path}/pilotState/current`), { schemaVersion: 1, sessionId: issued.sessionId });
  assert.equal(f.commits.length, 2); assert.equal(f.commits[1].length, 4);
  assert.deepEqual(f.records.get(path), before);
  assert.equal(JSON.stringify([...f.records]).includes(issued.nonce), false);
  assert.equal(JSON.stringify(result).includes('payload'), false);
  for (const field of ['outputAuthorized', 'dispatchAuthorized', 'activationAuthorized', 'physicalCompatibilityVerified']) assert.equal(result[field], false);
  await assert.rejects(f.consume(attestation(issued)), /qualification_conflict/); assert.equal(f.commits.length, 2);
});
test('auth-first and default-off gate reject before poisoned input or native database access', async () => {
  const f = fixture(); f.options.denied = true;
  await assert.rejects(f.consume({ get brandId() { throw Error('poison'); } }), /forbidden/); assert.equal(f.dbCalls, 0);
  const disabled = fixture(); await assert.rejects(disabled.consume(attestation({ sessionId: 'a'.repeat(43), nonce: 'b'.repeat(43) }), false), /qualification_unavailable/);
  assert.equal(disabled.dbCalls, 0);
});
test('native ownership, current revision, credential revoke and issuing supervisor are required before consumption', async () => {
  const mutations = [r => r.get('platformAdminControl/access-v1').memberships.at(-1).active = false,
    r => r.get('locations/location').brandId = 'foreign', r => r.get('brands/brand').status = 'suspended',
    r => r.get(path).revision++, r => r.get(path).configuration.model = 'mc-print2',
    r => r.get(path).configuration.state = 'disabled', r => r.get(path).configuration.state = 'paused',
    r => r.get(path).configuration.paperWidthMm = 58, r => r.get(credentialPath).credentialRevision++,
    r => r.get(credentialPath).revokedAt = Date.now(), r => r.get(credentialPath).issuedAt = Date.now() + 60000];
  for (const mutate of mutations) {
    const f = fixture(), issued = await f.issue(); mutate(f.records);
    await assert.rejects(f.consume(attestation(issued)), /forbidden|qualification_conflict/);
    assert.equal(f.commits.length, 1); assert.equal(f.records.has(jobPath(issued)), false);
  }
  const f = fixture(), issued = await f.issue(); f.records.get(sessionPath(issued)).actorId = 'firebase:other';
  await assert.rejects(f.consume(attestation(issued)), /qualification_conflict/);
});
test('nonce/profile/expiry/foreign/replay and outstanding pointer never produce another job', async () => {
  for (const patch of [{ nonce: 'c'.repeat(43) }, { printerRevision: 2 }, { sessionId: 'c'.repeat(43) }, { brandId: 'foreign' },
    { outputAuthorized: true }, { captureDigest: 'invalid' }, { firmware: '3.1' }, { physicalDeviceIdentified: false }]) {
    const f = fixture(), issued = await f.issue(); await assert.rejects(f.consume(attestation(issued, patch)));
    assert.equal(f.commits.length, 1); assert.equal(f.records.has(jobPath(issued)), false);
  }
  for (const mutate of [(r, i) => { const row = r.get(sessionPath(i)); row.issuedAt = 1; row.expiresAt = 600001; },
    r => r.set(`${path}/pilotState/current`, { schemaVersion: 1, sessionId: 'c'.repeat(43) }),
    (r, i) => r.set(jobPath(i), { corrupt: true })]) {
    const f = fixture(), issued = await f.issue(); mutate(f.records, issued);
    await assert.rejects(f.consume(attestation(issued))); assert.equal(f.commits.length, 1);
  }
});
test('late attestation preserves one full server delivery minute before creating a permanent pointer', async () => {
  const late = fixture(), issued = await late.issue(), realNow = Date.now;
  try {
    Date.now = () => issued.expiresAt - 59_999;
    await assert.rejects(late.consume(attestation(issued)), /invalid_qualification/);
  } finally { Date.now = realNow; }
  assert.equal(late.commits.length, 1);
  assert.equal(late.records.has(jobPath(issued)), false);
  assert.equal(late.records.has(`${path}/pilotState/current`), false);
  assert.equal(late.records.get(sessionPath(issued)).state, 'pending_operator_attestation');

  const boundary = fixture(), boundaryIssued = await boundary.issue();
  try {
    Date.now = () => boundaryIssued.expiresAt - 60_000;
    await boundary.consume(attestation(boundaryIssued));
  } finally { Date.now = realNow; }
  const job = boundary.records.get(jobPath(boundaryIssued));
  assert.equal(job.expiresAt - job.createdAt, 60_000);
  assert.deepEqual(boundary.records.get(`${path}/pilotState/current`),
    { schemaVersion: 1, sessionId: boundaryIssued.sessionId });
});
test('retry reauthorizes current policy/revisions and commits only one canonical job', async () => {
  const success = fixture(), issued = await success.issue(); success.options.retry = () => {};
  await success.consume(attestation(issued)); assert.equal(success.commits.length, 2);
  assert.equal(success.records.get(sessionPath(issued)).state, 'consumed');
  for (const retry of [r => r.get(path).revision++, r => r.get(credentialPath).revokedAt = Date.now(),
    r => r.get('platformAdminControl/access-v1').memberships.at(-1).active = false]) {
    const f = fixture(), i = await f.issue(); f.options.retry = retry;
    await assert.rejects(f.consume(attestation(i)), /qualification_conflict|forbidden/);
    assert.equal(f.commits.length, 1); assert.equal(f.records.get(sessionPath(i)).state, 'pending_operator_attestation');
    assert.equal(f.records.has(jobPath(i)), false);
  }
});
test('late audit failure and commit failure roll back all four writes; unknown commit cannot be replayed', async () => {
  for (const option of ['failAudit', 'failCommit', 'unknownCommit']) {
    const f = fixture(), issued = await f.issue(); f.options[option] = true;
    await assert.rejects(f.consume(attestation(issued)), e => e.message === 'qualification_unavailable' && !JSON.stringify(e).includes('PRIVATE'));
    assert.equal(f.commits.length, option === 'unknownCommit' ? 2 : 1);
    assert.equal(f.records.has(jobPath(issued)), option === 'unknownCommit');
    if (option === 'unknownCommit') {
      delete f.options[option]; await assert.rejects(f.consume(attestation(issued)), /qualification_conflict/);
      assert.equal(f.commits.length, 2);
    } else assert.equal(f.records.get(sessionPath(issued)).state, 'pending_operator_attestation');
  }
});
