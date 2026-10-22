const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { record, path, actorId, policy: basePolicy } = require('../helpers/printing-fixture.cjs');
const authority = loadTs('src/lib/access/authority.ts', { 'server-only': {} });
const input = () => ({ brandId: 'brand', locationId: 'location', printerId: 'p1', printerRevision: 1, credentialRevision: 1 });
const credentialPath = `${path}/deviceCredentials/current`;
function fixture(options = {}) {
  const policy = basePolicy(); policy.roles.push({ id: 'owner', name: 'Owner', companyId: null, kind: 'superuser', permissions: [], active: true });
  policy.memberships.push({ id: 'owner', principalId: actorId, companyId: null, locationIds: null, roleIds: ['owner'], active: true });
  const records = new Map([['platformAdminControl/access-v1', policy], ['brands/brand', { status: 'active' }],
    ['locations/location', { brandId: 'brand' }], [path, record()], [credentialPath, { schemaVersion: 1, ...input(), secretDigest: 'a'.repeat(64), issuedAt: 1, revokedAt: null }]]);
  let calls = 0, commits = 0, retried = false; const events = [];
  const ref = path => ({ path, id: path.split('/').at(-1), collection: name => ({ doc: id => ref(`${path}/${name}/${id}`) }) });
  const db = { collection: name => ({ doc: id => ref(`${name}/${id}`) }), async runTransaction(run) {
    for (;;) {
      const staged = new Map(structuredClone([...records])); let writing = false;
      const result = await run({ async get(r) { assert.equal(writing, false); events.push(r.path); return { id: r.id, exists: staged.has(r.path), data: () => structuredClone(staged.get(r.path)) }; },
        create(r, data) { writing = true; if (options.failAudit && r.path.includes('Audit')) throw Error('PRIVATE'); assert.equal(staged.has(r.path), false); staged.set(r.path, structuredClone(data)); } });
      assert.equal(result.nonce, undefined, 'nonce must not leave callback');
      if (options.retry && !retried) { retried = true; options.retry(records); continue; }
      if (options.failCommit) throw Error('PRIVATE');
      records.clear(); for (const row of staged) records.set(...row); commits++;
      if (options.unknownCommit) throw Error('PRIVATE'); return result;
    }
  } };
  const service = loadTs('src/lib/printing/pilot-qualification.ts', { 'server-only': {},
    '@/lib/firebase-admin': { getAdminDb: () => { calls++; return db; } },
    '@/lib/access/authority': authority, './authority': authority,
    '@/lib/access/orderfly-session': { requirePlatformSuperuser: async () => { if (options.denied) throw new authority.AuthorityError('forbidden'); return { identity: { provider: 'firebase', subject: 'writer' } }; } },
  });
  return { records, events, service, get calls() { return calls; }, get commits() { return commits; }, async run(c = input(), enabled = true) {
    const previous = process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED;
    if (enabled) process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED = 'true'; else delete process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED;
    try { return await service.issuePilotQualificationSession(c); } finally { if (previous === undefined) delete process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED; else process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED = previous; }
  } };
}
function saved(f, result) { return f.records.get(`${path}/pilotQualifications/${result.sessionId}`); }
function attestation(result, patch = {}) { return { ...input(), sessionId: result.sessionId, nonce: result.nonce, trust: 'supervised_operator', operatorId: 'operator1',
  physicalDeviceIdentified: true, nativeEnrollmentCorrelated: true, method: 'stario_firmware_query', model: 'mc-print3', labelSku: 'MCP31LB', firmware: '3.2',
  captureDigest: 'b'.repeat(64), paperWidthMm: 80, rasterWidthDots: 576, transport: 'cloudprnt-http', mediaType: 'image/png', ...patch }; }

test('pending ceremony commits nonce digest/audit and delivers nonce only after commit, no native config/output change', async () => {
  const f = fixture(), before = structuredClone(f.records.get(path)); const r = await f.run(), row = saved(f, r);
  assert.equal(r.nonce.length, 43); assert.equal(r.sessionId.length, 43); assert.notEqual(r.nonce, r.sessionId);
  assert.equal(f.service.pilotQualificationSessionSchema.safeParse(row).success, true);
  assert.equal(row.expiresAt - row.issuedAt, 600000); assert.equal(row.actorId, actorId);
  assert.equal(row.state, 'pending_operator_attestation'); assert.equal(row.trust, 'supervised_operator');
  assert.equal(Object.keys(r).includes('nonce'), false); assert.equal(Object.isFrozen(r), true);
  assert.equal(JSON.stringify([...f.records]).includes(r.nonce), false); assert.equal(JSON.stringify(r).includes('Digest'), false);
  for (const field of ['outputAuthorized', 'dispatchAuthorized', 'activationAuthorized', 'physicalCompatibilityVerified']) assert.equal(r[field], false);
  assert.deepEqual(f.records.get(path), before); assert.equal(f.commits, 1);
  assert.equal(f.records.has(`${path}/pilotQualificationAudit/${r.sessionId}`), true);
});
test('session auth precedes poisoned input; strict commands and disabled gate never read native storage', async () => {
  const f = fixture({ denied: true }); await assert.rejects(f.run({ get brandId() { throw Error('poison'); } }), /forbidden/); assert.equal(f.calls, 0);
  const disabled = fixture(); await assert.rejects(disabled.run(input(), false), /qualification_unavailable/); assert.equal(disabled.calls, 0);
  for (const value of [null, {}, { ...input(), outputAuthorized: true }, { ...input(), credentialRevision: 0 }, { ...input(), brandId: '../foreign' }]) {
    const f = fixture(); await assert.rejects(f.run(value), /invalid_qualification/); assert.equal(f.calls, 0);
  }
});
test('native policy/tenant/revision/credential eligibility rejects, no writes', async () => {
  for (const mutate of [r => r.get('platformAdminControl/access-v1').memberships.at(-1).active = false,
    r => r.get('locations/location').brandId = 'foreign', r => r.get('brands/brand').status = 'suspended',
    r => r.get(path).revision = 2, r => r.get(credentialPath).credentialRevision = 2,
    r => r.get(credentialPath).printerRevision = 2, r => r.get(credentialPath).revokedAt = Date.now(),
    r => r.get(credentialPath).issuedAt = Date.now() + 100000, r => r.get(path).deletedAt = 1]) {
    const f = fixture(); mutate(f.records); await assert.rejects(f.run(), /forbidden|qualification_conflict/); assert.equal(f.commits, 0);
  }
  const foreign = fixture(); foreign.records.get('locations/location').brandId = 'foreign'; await assert.rejects(foreign.run());
  assert.equal(foreign.events.some(p => p.includes('/deviceCredentials/')), false);
});
test('SDK retry reauthorizes and rereads current revisions, with one pending session after successful retry', async () => {
  const f = fixture({ retry: () => {} }); const r = await f.run(); assert.equal(f.commits, 1); assert.ok(saved(f, r));
  assert.equal(f.events.filter(p => p === credentialPath).length, 2);
  for (const retry of [r => r.get('platformAdminControl/access-v1').memberships.at(-1).active = false,
    r => r.get(path).revision++, r => r.get(credentialPath).revokedAt = Date.now()]) {
    const f = fixture({ retry }); await assert.rejects(f.run(), /forbidden|qualification_conflict/); assert.equal(f.commits, 0);
  }
});
test('rollback and unknown commit do not deliver nonce or leak raw provider details', async () => {
  for (const options of [{ failAudit: true }, { failCommit: true }, { unknownCommit: true }]) {
    const f = fixture(options); await assert.rejects(f.run(), e => e.message === 'qualification_unavailable' && !JSON.stringify(e).includes('PRIVATE'));
    assert.equal(f.commits, options.unknownCommit ? 1 : 0);
  }
});
test('future controlled consumption validation binds exact session/nonce/revisions and exclusive expiry without granting output', async () => {
  const f = fixture(), r = await f.run(), row = saved(f, r), a = attestation(r);
  const valid = f.service.validatePilotOperatorAttestation(row, a, row.issuedAt);
  assert.equal(valid.outputAuthorized, false); assert.equal(valid.physicalCompatibilityVerified, false);
  for (const patch of [{ nonce: 'c'.repeat(43) }, { sessionId: 'c'.repeat(43) }, { credentialRevision: 2 }, { printerRevision: 2 }, { brandId: 'other' },
    { trust: 'manufacturer_attestation' }, { method: 'poll' }, { firmware: '1.2' }, { firmware: '3.1' }, { model: 'mc-print2' },
    { paperWidthMm: 58 }, { outputAuthorized: true }, { captureDigest: 'x' }, { physicalDeviceIdentified: false }]) {
    assert.throws(() => f.service.validatePilotOperatorAttestation(row, { ...a, ...patch }, row.issuedAt), /invalid_qualification/);
  }
  for (const now of [0, row.issuedAt - 1, row.expiresAt, row.expiresAt + 1, NaN]) assert.throws(() => f.service.validatePilotOperatorAttestation(row, a, now), /invalid_qualification/);
  assert.throws(() => f.service.validatePilotOperatorAttestation({ ...row, expiresAt: row.expiresAt + 1 }, a, row.issuedAt), /invalid_qualification/);
  assert.equal(f.commits, 1, 'pure validator neither consumes nor writes the session');
});
