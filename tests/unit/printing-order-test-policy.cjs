const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { record, path, actorId, policy: basePolicy } = require('../helpers/printing-fixture.cjs');
const authority = loadTs('src/lib/access/authority.ts', { 'server-only': {} });
const scope = { brandId: 'brand', locationId: 'location', printerId: 'p1', printerRevision: 1, credentialRevision: 1 };
const qid = 'A'.repeat(43), now = 1_800_000_000_000;
const credentialPath = `${path}/deviceCredentials/current`, windowPath = `${path}/orderTestWindows/current`;
const intentPath = 'locations/location/printIntentPolicies/original';
function fixture() {
  const access = basePolicy();
  access.roles.push({ id: 'owner', name: 'Owner', companyId: null, kind: 'superuser', permissions: [], active: true });
  access.memberships.push({ id: 'owner', principalId: actorId, companyId: null, locationIds: null, roleIds: ['owner'], active: true });
  const printer = record(); printer.configuration.state = 'active';
  const records = new Map([['platformAdminControl/access-v1', access], ['brands/brand', { status: 'active' }],
    ['locations/location', { brandId: 'brand' }], [path, printer],
    [credentialPath, { schemaVersion: 1, ...scope, secretDigest: 'a'.repeat(64), issuedAt: 1, revokedAt: null }],
    ['locations/location/printerRouting/original', { schemaVersion: 1, id: 'original', brandId: 'brand', locationId: 'location',
      revision: 1, deletedAt: null, rules: [{ id: 'all', brandId: 'brand', locationId: 'location', printerId: 'p1', match: { type: 'all' }, effect: 'include' }] }],
    [`${path}/pilotState/current`, { schemaVersion: 1, sessionId: qid }]]);
  const options = {}, commits = [];
  const ref = path => ({ path, id: path.split('/').at(-1), collection: name => ({ doc: id => ref(`${path}/${name}/${id}`) }) });
  let retried = false;
  const db = { collection: name => ({ doc: id => ref(`${name}/${id}`) }), async runTransaction(run) {
    for (;;) {
      const staged = new Map(structuredClone([...records])), writes = []; let writing = false;
      const put = (r, value, create) => { writing = true; if (create) assert.equal(staged.has(r.path), false);
        if (options.failAudit && r.path.includes('/orderTestAudit/')) throw Error('PRIVATE');
        staged.set(r.path, structuredClone(value)); writes.push(r.path); };
      const value = await run({ get: async r => { assert.equal(writing, false, 'all reads before writes');
        return { id: r.id, exists: staged.has(r.path), data: () => structuredClone(staged.get(r.path)) }; },
        create: (r,v) => put(r,v,true), set: (r,v) => put(r,v,false) });
      if (options.retry && !retried) { retried = true; options.retry(records); continue; }
      if (options.failCommit) throw Error('PRIVATE');
      records.clear(); for (const row of staged) records.set(...row); commits.push(writes); return value;
    }
  } };
  const mocks = { 'server-only': {}, '@/lib/firebase-admin': { getAdminDb: () => db }, '@/lib/access/authority': authority,
    './authority': authority, '@/lib/access/orderfly-session': { requirePlatformSuperuser: async () => {
      if (options.denied) throw new authority.AuthorityError('forbidden'); return { identity: { provider: 'firebase', subject: 'writer' } };
    } } };
  const api = loadTs('src/lib/printing/ordinary-output-policy.ts', mocks);
  const intents = loadTs('src/lib/printing/intent-target-policy.ts', mocks);
  const content = loadTs('src/lib/printing/job-content.ts', { 'server-only': {} }).createSyntheticTestBonContent({
    brandId: 'brand', locationId: 'location', printerId: 'p1', printerRevision: 1, model: 'mc-print3', paperWidthMm: 80 });
  records.set(`${path}/pilotJobs/${qid}`, { schemaVersion: 1, purpose: 'synthetic-testbon', ...scope, sessionId: qid, jobId: qid,
    model: 'mc-print3', paperWidthMm: 80, createdAt: now - 5000, expiresAt: now + 590000, content,
    state: 'confirmed', tokenDigest: 'b'.repeat(64), offeredAt: now - 4000, downloadStartedAt: now - 3000,
    confirmedAt: now - 2000, outcome: 'confirmed' });
  records.set(`${path}/pilotQualifications/${qid}`, { schemaVersion: 1, ...scope, sessionId: qid, nonceDigest: 'c'.repeat(64),
    actorId, state: 'consumed', trust: 'supervised_operator', issuedAt: now - 10000, expiresAt: now + 590000,
    outputAuthorized: false, dispatchAuthorized: false, activationAuthorized: false, physicalCompatibilityVerified: false,
    jobId: qid, contentDigest: content.sha256, consumedAt: now - 5000 });
  records.set(`${path}/pilotQualificationAudit/${qid}-consume`, { ...scope, sessionId: qid, trust: 'supervised_operator',
    method: 'stario_firmware_query', model: 'mc-print3', firmware: '3.2', contentDigest: content.sha256 });
  const identity = { ...scope, printerState: 'active', deviceVerifiedForAttempt: true,
    dispatchAuthorized: false, capabilityAuthorized: false, physicalCompatibilityVerified: false };
  return { records, options, commits, api, start: () => api.controlOrderTestWindow({ ...scope, operation: 'start',
    physicalPaperChecked: true, deviceUnchanged: true, supervisingPurchases: true }),
    read: () => api.controlOrderTestWindow({ ...scope, operation: 'read' }),
    stop: () => api.controlOrderTestWindow({ ...scope, operation: 'stop' }),
    admit: () => db.runTransaction(tx => api.requireOrdinaryOutputPolicy({ db, transaction: tx }, identity)),
    targets: () => db.runTransaction(tx => intents.preparePrintIntentTargetPolicy({ db, transaction: tx }, { brandId: 'brand', locationId: 'location' })),
  };
}
async function enabled(run) {
  const names = ['ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED', 'ORDERFLY_PRINTER_ORDER_TEST_OUTPUT_ENABLED', 'ORDERFLY_PRINT_INTENTS_ENABLED'];
  const old = names.map(n => process.env[n]), clock = Date.now;
  names.forEach(n => process.env[n] = 'true'); Date.now = () => now;
  try { await run(); } finally { names.forEach((n,i) => { if (old[i] === undefined) delete process.env[n]; else process.env[n] = old[i]; }); Date.now = clock; }
}
test('confirmed test plus explicit human checks creates one supervised window, audit and intent atomically; stop prevents admission and new intents', () => enabled(async () => {
  const f = fixture(); assert.equal((await f.read()).state, 'not_started');
  const started = await f.start(); assert.equal(started.state, 'active'); assert.equal(started.expiresAt, now + 3600000);
  assert.equal(f.records.get(windowPath).unattendedAuthorized, false); assert.equal(f.records.get(intentPath).supervisedOrderTest, true);
  assert.equal((await f.admit()).paperWidthMm, 80); assert.equal((await f.targets()).targets.length, 1);
  await assert.rejects(f.start(), /order_test_conflict/);
  assert.equal((await f.stop()).state, 'stopped'); await assert.rejects(f.admit(), /order_test_conflict/);
  assert.equal((await f.targets()).targets.length, 0); assert.equal((await f.stop()).state, 'stopped');
}));
test('missing paper confirmation, pending/unknown test, old firmware, foreign scope and conflicting policy cannot activate', () => enabled(async () => {
  const mutations = [r => r.get(`${path}/pilotJobs/${qid}`).state = 'unknown', r => r.get(`${path}/pilotJobs/${qid}`).confirmedAt = null,
    r => r.get(`${path}/pilotQualificationAudit/${qid}-consume`).firmware = '3.1', r => r.get('locations/location').brandId = 'other',
    r => r.get(credentialPath).revokedAt = now, r => r.get(path).revision++, r => r.get('brands/brand').status = 'suspended',
    r => r.set(intentPath, { enabled: true }), r => r.delete('locations/location/printerRouting/original'),
    r => r.get('locations/location/printerRouting/original').rules[0].deliveryTypes = ['Pickup']];
  for (const mutate of mutations) { const f = fixture(); mutate(f.records); await assert.rejects(f.start()); assert.equal(f.records.has(windowPath), false); }
  const f = fixture(); await assert.rejects(f.api.controlOrderTestWindow({ ...scope, operation: 'start', physicalPaperChecked: false,
    deviceUnchanged: true, supervisingPurchases: true }), /invalid_order_test/);
}));
test('fresh revision, credential, tenant, profile, expiry and output gates are checked at every admission', () => enabled(async () => {
  const mutations = [r => r.get(path).revision++, r => r.get(path).configuration.paperWidthMm = 58,
    r => r.get(credentialPath).credentialRevision++, r => r.get(credentialPath).revokedAt = now,
    r => r.get('brands/brand').status = 'suspended', r => r.get(windowPath).brandId = 'foreign',
    r => { r.get(windowPath).issuedAt = now - 3600000; r.get(windowPath).expiresAt = now; }];
  for (const mutate of mutations) { const f = fixture(); await f.start(); mutate(f.records); await assert.rejects(f.admit(), /order_test_conflict/); }
  const f = fixture(); await f.start(); delete process.env.ORDERFLY_PRINTER_ORDER_TEST_OUTPUT_ENABLED;
  await assert.rejects(f.admit(), /order_test_unavailable/); assert.equal((await f.targets()).targets.length, 0);
  assert.equal((await f.stop()).state, 'stopped', 'stop remains durable when output disabled');
}));
test('expired, stopped, changed profile or rotated credential suppresses new purchase intents without breaking settlement', () => enabled(async () => {
  for (const mutate of [r => { r.get(windowPath).issuedAt = now - 3600000; r.get(windowPath).expiresAt = now; },
    r => r.get(path).configuration.state = 'disabled', r => r.get(path).configuration.paperWidthMm = 58,
    r => r.get(credentialPath).brandId = 'foreign', r => r.get(credentialPath).credentialRevision++,
    r => r.get('locations/location/printerRouting/original').revision++]) {
    const f = fixture(); await f.start(); mutate(f.records); assert.equal((await f.targets()).targets.length, 0);
  }
}));
test('transaction retries reauthorize and failed audit/commit leaves neither window nor policy', () => enabled(async () => {
  for (const option of ['failAudit', 'failCommit']) { const f = fixture(); f.options[option] = true;
    await assert.rejects(f.start(), /order_test_unavailable/); assert.equal(f.records.has(windowPath), false); assert.equal(f.records.has(intentPath), false); }
  const f = fixture(); f.options.retry = r => r.get(credentialPath).revokedAt = now;
  await assert.rejects(f.start(), /order_test_conflict/); assert.equal(f.records.has(windowPath), false);
}));
