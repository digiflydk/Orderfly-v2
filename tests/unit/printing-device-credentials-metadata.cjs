const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { config, record, path, actorId, policy } = require('../helpers/printing-fixture.cjs');
const authority = loadTs('src/lib/access/authority.ts', { 'server-only': {} });
const crypto = loadTs('src/lib/printing/device-auth.ts', { 'server-only': {} });
const command = (patch = {}) => ({ brandId: 'brand', locationId: 'location', printerId: 'p1', ...patch });
const credentialPath = `${path}/deviceCredentials/current`;
const draft = crypto.createPrinterDeviceCredentialDraft({ ...command(), printerRevision: 1, credentialRevision: 3 });
function superPolicy() { const p = policy(); p.roles.push({ id: 'owner', name: 'Owner', companyId: null, kind: 'superuser', permissions: [], active: true });
  p.memberships.push({ id: 'owner', principalId: actorId, companyId: null, locationIds: null, roleIds: ['owner'], active: true }); return p; }
function fixture(options = {}) {
  const rows = new Map([['platformAdminControl/access-v1', superPolicy()], ['brands/brand', { status: 'active' }],
    ['locations/location', { brandId: 'brand' }], [path, record()], ...(options.credential ? [[credentialPath, options.credential]] : [])]);
  const events = []; let txCount = 0, dbCalls = 0, retried = false;
  const ref = path => ({ path, id: path.split('/').at(-1), collection: name => ({ doc: id => ref(`${path}/${name}/${id}`) }) });
  const tx = { async get(ref) { events.push(ref.path); return { id: ref.id, exists: rows.has(ref.path), data: () => structuredClone(rows.get(ref.path)) }; },
    create() { assert.fail('read-only cannot create'); }, set() { assert.fail('read-only cannot set'); }, delete() { assert.fail('read-only cannot delete'); } };
  const db = { collection: name => ({ doc: id => ref(`${name}/${id}`) }), async runTransaction(run, opts) { assert.deepEqual(opts, { readOnly: true });
    txCount++; const result = await run(tx); if (options.retry && !retried) { retried = true; options.retry(rows); return run(tx); } return result; } };
  const session = { requirePlatformSuperuser: async () => { if (options.denied) throw new authority.AuthorityError('PRIVATE session', options.denied); return { identity: { provider: 'firebase', subject: 'writer' }, superuser: true }; } };
  const mocks = { 'server-only': {}, '@/lib/firebase-admin': { getAdminDb: () => { dbCalls++; return db; } },
    '@/lib/access/authority': authority, './authority': authority, '@/lib/access/orderfly-session': session };
  const service = loadTs('src/lib/printing/device-credentials-metadata.ts', mocks);
  const route = loadTs('src/app/api/superadmin/printers/device-credentials/route.ts', mocks);
  return { rows, events, get txCount() { return txCount; }, get dbCalls() { return dbCalls; }, service,
    read: (input = command()) => service.readPrinterCredentialMetadata(input),
    async get(req = new Request('https://orderfly.dk/api/superadmin/printers/device-credentials?brandId=brand&locationId=location&printerId=p1')) {
      const response = await route.GET(req); return { status: response.status, body: await response.json(), cache: response.headers.get('cache-control'), vary: response.headers.get('vary') };
    } };
}
const safeKeys = ['activationAuthorized', 'brandId', 'credentialRevision', 'dispatchAuthorized', 'locationId', 'printerId', 'printerRevision', 'state'];
function safe(output) { assert.deepEqual(Object.keys(output).sort(), safeKeys); assert.equal(JSON.stringify(output).includes(draft.secret), false);
  assert.doesNotMatch(JSON.stringify(output), /secret|Digest|issuedAt|revokedAt|actor|audit/); assert.equal(output.dispatchAuthorized, false); assert.equal(output.activationAuthorized, false); }

test('actual read-only native service returns missing0/current/revoked/stale safe metadata without recovery plaintext', async () => {
  for (const [credential, printerRevision, state, revision] of [[null, 1, 'missing', 0], [draft.record, 1, 'current', 3],
    [{ ...draft.record, revokedAt: Date.now() }, 1, 'revoked', 3], [draft.record, 2, 'stale', 3], [{ ...draft.record, revokedAt: Date.now() }, 2, 'revoked', 3]]) {
    const f = fixture({ credential }); f.rows.set(path, record({ revision: printerRevision })); const before = structuredClone([...f.rows]);
    const output = await f.read(); safe(output); assert.equal(Object.isFrozen(output), true); assert.equal(output.state, state); assert.equal(output.credentialRevision, revision);
    assert.equal(output.printerRevision, printerRevision); assert.equal(f.txCount, 1); assert.deepEqual([...f.rows], before);
    assert.deepEqual(f.events.slice(-4), ['brands/brand', 'locations/location', path, credentialPath]);
    const response = await f.get(); assert.equal(response.status, 200); assert.deepEqual(response.body, output); assert.equal(response.cache, 'no-store'); assert.equal(response.vary, 'Cookie');
  }
});
test('session is required before input/query access and unknown input fields never start native reads', async () => {
  for (const denied of [401, 403, 503]) { const f = fixture({ denied }); const poison = new Proxy({}, { get() { throw Error('PRIVATE query'); }, ownKeys() { throw Error('PRIVATE input'); } });
    await assert.rejects(f.read(poison), /PRIVATE session/); assert.equal(f.dbCalls, 0);
    const response = await f.get(poison); assert.equal(response.status, denied); assert.doesNotMatch(JSON.stringify(response), /PRIVATE/); assert.equal(response.cache, 'no-store'); assert.equal(response.vary, 'Cookie');
  }
  for (const input of [null, {}, [], { ...command(), secret: 'PRIVATE' }, command({ printerId: '../x' }), command({ brandId: 'x'.repeat(129) })]) {
    const f = fixture(); await assert.rejects(f.read(input), /invalid_request/); assert.equal(f.dbCalls, 0);
  }
});
test('current native superuser/catalog policy and scope reject before private paths', async () => {
  for (const mutate of [r => r.set('platformAdminControl/access-v1', policy()), r => r.get('platformAdminControl/access-v1').principals[0].active = false,
    r => r.get('platformAdminControl/access-v1').memberships.find(x => x.id === 'owner').active = false,
    r => r.get('platformAdminControl/access-v1').companies[0].active = false, r => r.delete('brands/brand'),
    r => r.delete('locations/location'), r => r.set('locations/location', { brandId: 'foreign' }),
    r => r.set('brands/brand', { status: 'suspended' }), r => r.set('brands/brand', { status: 'active', deletedAt: 1 }),
    r => r.set('locations/location', { brandId: 'brand', isActive: false })]) {
    const f = fixture({ credential: draft.record }); mutate(f.rows); await assert.rejects(f.read(), /forbidden|not_found/);
    assert.equal(f.events.includes(path), false); assert.equal(f.events.includes(credentialPath), false);
  }
  for (const status of ['active', 'pending', 'trialing']) { const f = fixture(); f.rows.set('brands/brand', { status }); assert.equal((await f.read()).state, 'missing'); }
});
test('canonical printer failures reject before current private credential read', async () => {
  for (const printer of [undefined, { bad: true }, record({ deletedAt: 1 }), record({ revision: 0 }),
    record({ configuration: config({ brandId: 'foreign' }) }), record({ configuration: config({ id: 'foreign' }) }), record({ extra: 'PRIVATE' })]) {
    const f = fixture({ credential: draft.record }); printer === undefined ? f.rows.delete(path) : f.rows.set(path, printer);
    await assert.rejects(f.read(), /not_found/); assert.equal(f.events.includes(credentialPath), false);
  }
});
test('canonical365 schema rejects foreign/corrupt/future revision/time records with safe errors', async () => {
  for (const patch of [{ brandId: 'foreign' }, { locationId: 'foreign' }, { printerId: 'foreign' }, { printerRevision: 2 }, { credentialRevision: 0 },
    { secretDigest: 'PRIVATE' }, { issuedAt: Date.now() + 100000 }, { issuedAt: 0 }, { revokedAt: draft.record.issuedAt - 1 }, { revokedAt: Date.now() + 100000 }, { secret: draft.secret }]) {
    const f = fixture({ credential: { ...draft.record, ...patch } }); await assert.rejects(f.read(), error => error.message === 'credentials_unavailable');
    const response = await f.get(); assert.deepEqual(response.body, { error: 'credentials_unavailable' }); assert.equal(response.status, 503); assert.doesNotMatch(JSON.stringify(response), /PRIVATE|Digest|secret/);
  }
});
test('same SDK transaction retry rereads policy, native scope and current rotation/revocation state', async () => {
  const revoke = fixture({ credential: draft.record, retry: rows => rows.set(credentialPath, { ...draft.record, credentialRevision: 4, revokedAt: Date.now() }) });
  const output = await revoke.read(); assert.equal(output.state, 'revoked'); assert.equal(output.credentialRevision, 4); assert.equal(revoke.events.filter(p => p === credentialPath).length, 2);
  for (const retry of [r => r.get('platformAdminControl/access-v1').memberships.find(x => x.id === 'owner').active = false,
    r => r.set('locations/location', { brandId: 'foreign' }), r => r.set('brands/brand', { status: 'suspended' }), r => r.set(path, record({ deletedAt: 1 }))]) {
    const f = fixture({ credential: draft.record, retry }); await assert.rejects(f.read(), /forbidden|not_found/); assert.equal(f.events.filter(p => p === credentialPath).length, 1);
  }
});
test('GET rejects duplicate/unknown/oversized/malformed query and body before service I/O', async () => {
  for (const query of ['', '?brandId=brand&locationId=location', '?brandId=brand&brandId=brand&locationId=location&printerId=p1',
    '?brandId=brand&locationId=location&printerId=p1&secret=PRIVATE', '?brandId=brand&locationId=location&printerId=..%2Fp1', `?brandId=${'x'.repeat(1025)}`]) {
    const f = fixture(); const output = await f.get(new Request(`https://orderfly.dk/api/superadmin/printers/device-credentials${query}`));
    assert.equal(output.status, 400); assert.equal(f.dbCalls, 0); assert.equal(output.cache, 'no-store'); assert.equal(output.vary, 'Cookie'); assert.doesNotMatch(JSON.stringify(output), /PRIVATE/);
  }
  const f = fixture(); const output = await f.get({ method: 'GET', url: 'https://orderfly.dk/api/superadmin/printers/device-credentials?brandId=brand&locationId=location&printerId=p1', body: {} });
  assert.equal(output.status, 400); assert.equal(f.dbCalls, 0);
});
test('unexpected native reflection/transport failure never returns private text or writes', async () => {
  const f = fixture({ credential: draft.record }); f.rows.set(credentialPath, new Proxy({}, { ownKeys() { throw Error('PRIVATE native'); } }));
  const output = await f.get(); assert.equal(output.status, 503); assert.deepEqual(output.body, { error: 'credentials_unavailable' });
  assert.doesNotMatch(JSON.stringify(output), /PRIVATE|secret|Digest/); assert.equal(output.cache, 'no-store'); assert.equal(output.vary, 'Cookie');
});
