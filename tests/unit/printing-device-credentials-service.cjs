const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { config, record, path, actorId, policy: companyPolicy } = require('../helpers/printing-fixture.cjs');
const authority = loadTs('src/lib/access/authority.ts', { 'server-only': {} });
const crypto = loadTs('src/lib/printing/device-auth.ts', { 'server-only': {} });
const current = `${path}/deviceCredentials/current`;
const command = (operation = 'issue', credentialRevision = 0, patch = {}) => ({ operation, brandId: 'brand', locationId: 'location', printerId: 'p1', printerRevision: 1, credentialRevision, ...patch });
function superPolicy() { const p = companyPolicy(); p.roles.push({ id: 'owner', name: 'Owner', companyId: null, kind: 'superuser', permissions: [], active: true });
  p.memberships.push({ id: 'owner', principalId: actorId, companyId: null, locationIds: null, roleIds: ['owner'], active: true }); return p; }
function fixture(options = {}) {
  const records = new Map([['platformAdminControl/access-v1', superPolicy()], ['brands/brand', { status: 'active' }],
    ['locations/location', { brandId: 'brand' }], [path, record()], ...(options.extra || [])]);
  const events = [], commits = [], generated = []; let staged, writes, writing, retried = false, queue = Promise.resolve(), dbCalls = 0;
  const ref = path => ({ path, id: path.split('/').at(-1), collection: name => ({ doc: id => ref(`${path}/${name}/${id}`) }) });
  // SDK reuses the same Transaction object after resetting its per-attempt state.
  const tx = { async get(ref) { assert.equal(writing, false); events.push(ref.path); return { id: ref.id, exists: staged.has(ref.path), data: () => structuredClone(staged.get(ref.path)) }; },
    create(ref, row) { writing = true; if (options.failAudit && ref.path.includes('/deviceCredentialAudit/')) throw Error('PRIVATE audit failure');
      if (staged.has(ref.path)) throw Error('PRIVATE conflict'); writes.push(['create', ref.path, structuredClone(row)]); staged.set(ref.path, structuredClone(row)); },
    set(ref, row) { writing = true; writes.push(['set', ref.path, structuredClone(row)]); staged.set(ref.path, structuredClone(row)); } };
  const db = { collection: name => ({ doc: id => ref(`${name}/${id}`) }), runTransaction(run) {
    const pending = queue.then(async () => { for (;;) { staged = new Map(structuredClone([...records])); writes = []; writing = false;
      const result = await run(tx); assert.equal(Object.getOwnPropertyDescriptor(result, 'secret'), undefined, 'transaction callback must never return plaintext');
      if (options.retry && !retried) { retried = true; options.retry(records); continue; }
      if (options.beforeCommit) await options.beforeCommit(staged);
      records.clear(); for (const row of staged) records.set(...row); commits.push(writes);
      if (options.afterCommitError) throw Error('PRIVATE unknown commit'); return result;
    }}); queue = pending.catch(() => {}); return pending;
  }};
  const session = { identity: { provider: 'firebase', subject: 'writer' }, superuser: true };
  const service = loadTs('src/lib/printing/device-credentials-service.ts', {
    'server-only': {}, '@/lib/firebase-admin': { getAdminDb: () => { dbCalls++; return db; } },
    '@/lib/access/orderfly-session': { requirePlatformSuperuser: async () => { if (options.denied) throw new authority.AuthorityError('forbidden'); return session; } },
    '@/lib/access/authority': authority, './authority': authority,
    './device-auth': { ...crypto, createPrinterDeviceCredentialDraft: input => { const draft = crypto.createPrinterDeviceCredentialDraft(input); generated.push(draft); return draft; } },
    'firebase-admin/firestore': { FieldValue: { serverTimestamp: () => ({ serverTimestamp: true }) } },
  });
  return { records, events, commits, generated, get dbCalls() { return dbCalls; },
    async run(input = command(), ...flags) { const flag = flags.length ? flags[0] : 'true'; const old = process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED;
      if (flag === undefined) delete process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED; else process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED = flag;
      try { return await service.writePrinterDeviceCredential(input); } finally { if (old === undefined) delete process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED; else process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED = old; } } };
}
function matches(row, secret, printerRevision = row.printerRevision) { return crypto.comparePrinterDeviceCredentialCandidates(row, {
  brandId: 'brand', locationId: 'location', printerId: 'p1', printerRevision, credentialRevision: row.credentialRevision }, secret).credentialMatches; }

test('issue commits private digest and immutable audit, returns one-time nonenumerable secret after commit only', async () => {
  const f = fixture(); const before = structuredClone(f.records.get(path)); const result = await f.run();
  assert.equal(result.secret.length, 43); assert.equal(matches(f.records.get(current), result.secret), true);
  assert.equal(result.credentialRevision, 1); assert.equal(result.dispatchAuthorized, false); assert.equal(result.activationAuthorized, false);
  assert.equal(Object.isFrozen(result), true); assert.equal(Object.keys(result).includes('secret'), false);
  assert.doesNotMatch(JSON.stringify(result), /secret|Digest/); assert.equal(JSON.stringify([...f.records]).includes(result.secret), false);
  assert.deepEqual(f.records.get(path), before); assert.equal(f.commits.length, 1);
  assert.equal(f.records.get(`${path}/deviceCredentialAudit/1`).actorId, actorId);
  assert.doesNotMatch(JSON.stringify(f.records.get(`${path}/deviceCredentialAudit/1`)), /secret|Digest/);
});
test('rotate invalidates old secret, revoke advances revision and explicit rotate is required to restore identity', async () => {
  const f = fixture(); const first = await f.run(); const second = await f.run(command('rotate', 1));
  assert.equal(matches(f.records.get(current), first.secret), false); assert.equal(matches(f.records.get(current), second.secret), true);
  const revoked = await f.run(command('revoke', 2)); assert.equal(revoked.revoked, true); assert.equal(revoked.secret, undefined);
  assert.equal(matches(f.records.get(current), second.secret), false); assert.equal(f.records.get(current).credentialRevision, 3);
  await assert.rejects(f.run(command('revoke', 3)), /record_conflict/);
  const restored = await f.run(command('rotate', 3)); assert.equal(matches(f.records.get(current), restored.secret), true);
  assert.equal(matches(f.records.get(current), second.secret), false); assert.equal(f.commits.length, 4);
});
test('onboarding lifecycle and printer states never activate or grant output; canonical suspension fails', async () => {
  for (const status of ['active', 'pending', 'trialing']) for (const state of ['disabled', 'paused', 'active']) {
    const f = fixture(); f.records.set('brands/brand', { status }); f.records.set(path, record({ configuration: config({ state }) }));
    assert.equal((await f.run()).dispatchAuthorized, false); assert.equal(f.records.get(path).configuration.state, state);
  }
  for (const status of ['suspended', undefined, 'unknown', false]) { const f = fixture(); f.records.set('brands/brand', { status, isActive: true });
    await assert.rejects(f.run(), /not_found/); assert.equal(f.commits.length, 0); }
});
test('session, exact default-off write gate and strict input reject before native paths or secret generation', async () => {
  const denied = fixture({ denied: true }); await assert.rejects(denied.run(), /forbidden/); assert.equal(denied.dbCalls, 0);
  for (const flag of [undefined, 'false', 'TRUE', '1', ' true ']) { const f = fixture(); await assert.rejects(f.run(command(), flag), /writes_unavailable/); assert.equal(f.dbCalls, 0); assert.equal(f.generated.length, 0); }
  for (const input of [null, {}, { ...command(), secret: 'PRIVATE' }, command('issue', 1), command('rotate', 0), command('revoke', Number.MAX_SAFE_INTEGER), command('issue', 0, { printerId: '../foreign' }), command('issue', 0, { printerRevision: 0 })]) {
    const f = fixture(); await assert.rejects(f.run(input), /invalid_request/); assert.equal(f.dbCalls, 0); assert.equal(f.generated.length, 0);
  }
});
test('current native platform superuser and catalog policy reread prevents delegation, revocation and foreign scopes', async () => {
  for (const mutate of [r => r.set('platformAdminControl/access-v1', companyPolicy()), r => r.get('platformAdminControl/access-v1').principals[0].active = false,
    r => r.get('platformAdminControl/access-v1').roles.find(x => x.id === 'owner').active = false,
    r => r.delete('brands/brand'), r => r.set('locations/location', { brandId: 'foreign' }), r => r.get('platformAdminControl/access-v1').companies[0].active = false]) {
    const f = fixture(); mutate(f.records); await assert.rejects(f.run(), /forbidden/); assert.equal(f.commits.length, 0);
  }
});
test('deleted corrupt foreign and stale native printer or credential records fail without replacement or audit', async () => {
  for (const existing of [undefined, record({ deletedAt: 1 }), { corrupt: true }, record({ configuration: config({ brandId: 'foreign' }) }), record({ revision: 2 })]) {
    const f = fixture(); existing === undefined ? f.records.delete(path) : f.records.set(path, existing);
    await assert.rejects(f.run(), /not_found|record_conflict/); assert.equal(f.commits.length, 0);
  }
  const original = fixture(); await original.run(); const saved = original.records.get(current);
  for (const patch of [{ credentialRevision: 2 }, { brandId: 'foreign' }, { locationId: 'foreign' }, { printerRevision: 2 }, { secretDigest: 'bad' }, { issuedAt: Date.now() + 100000 }, { revokedAt: Date.now() + 100000 }, { secret: 'PRIVATE' }]) {
    const f = fixture({ extra: [[current, { ...saved, ...patch }]] }); await assert.rejects(f.run(command('rotate', 1)), /record_conflict/); assert.equal(f.commits.length, 0);
  }
  const duplicate = fixture({ extra: [[current, saved]] }); await assert.rejects(duplicate.run(), /record_conflict/); assert.equal(duplicate.commits.length, 0);
});
test('SDK retry reuses one generated secret while reauthorizing and rereading native CAS', async () => {
  const f = fixture({ retry: () => {} }); const result = await f.run(); assert.equal(f.generated.length, 1); assert.equal(f.commits.length, 1);
  assert.equal(f.generated[0].secret, result.secret); assert.equal(f.events.filter(x => x === current).length, 2);
  for (const retry of [r => r.get('platformAdminControl/access-v1').memberships.find(x => x.id === 'owner').active = false,
    r => r.set('locations/location', { brandId: 'foreign' }), r => r.set(path, record({ revision: 2 })), r => r.set('brands/brand', { status: 'suspended' })]) {
    const f = fixture({ retry }); await assert.rejects(f.run(), /forbidden|record_conflict|not_found/); assert.equal(f.commits.length, 0); assert.equal(f.generated.length, 1);
  }
});
test('concurrent/replayed requests CAS exactly one credential rotation and audit', async () => {
  const f = fixture(); const first = await f.run(); const results = await Promise.allSettled([f.run(command('rotate', 1)), f.run(command('rotate', 1))]);
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1); assert.equal(f.records.get(current).credentialRevision, 2);
  assert.equal(f.commits.length, 2); assert.equal(matches(f.records.get(current), first.secret), false);
  await assert.rejects(f.run(command('rotate', 1)), /record_conflict/); assert.equal(f.commits.length, 2);
});
test('audit/commit failures roll back; unknown commit returns no secret and stale replay cannot duplicate', async () => {
  for (const options of [{ failAudit: true }, { beforeCommit: () => { throw Error('PRIVATE commit'); } }]) {
    const f = fixture(options); const before = structuredClone([...f.records]); await assert.rejects(f.run(), error => error.message === 'credentials_unavailable');
    assert.deepEqual([...f.records], before); assert.equal(f.commits.length, 0);
  }
  const f = fixture({ afterCommitError: true }); await assert.rejects(f.run(), error => error.message === 'credentials_unavailable');
  assert.equal(f.commits.length, 1); assert.equal(f.records.has(current), true);
  await assert.rejects(f.run(), /record_conflict/); assert.equal(f.commits.length, 1);
});

test('rotation binds edited current printer revision and failures never return private text', async () => {
  const f = fixture(); const first = await f.run(); f.records.set(path, record({ revision: 2 }));
  const rotated = await f.run(command('rotate', 1, { printerRevision: 2 }));
  assert.equal(f.records.get(current).printerRevision, 2); assert.equal(matches(f.records.get(current), rotated.secret, 2), true);
  assert.equal(matches(f.records.get(current), first.secret, 2), false);
  for (const nativePath of ['brands/brand', 'locations/location']) for (const patch of [{ deleted: true }, { isActive: false }, { deletedAt: 1 }, { isTestData: true }]) {
    const g = fixture(); g.records.set(nativePath, { ...g.records.get(nativePath), ...patch });
    await assert.rejects(g.run(), error => error.message === 'not_found'); assert.equal(g.commits.length, 0);
  }
  const bad = fixture(); const proxy = new Proxy({}, { get() { throw Error('PRIVATE input'); } });
  await assert.rejects(bad.run(proxy), error => error.message === 'invalid_request'); assert.equal(bad.dbCalls, 0);
});
