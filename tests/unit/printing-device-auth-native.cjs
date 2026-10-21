const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const crypto = loadTs('src/lib/printing/device-auth.ts', { 'server-only': {} });
const scope = { brandId: 'b1', locationId: 'l1', printerId: 'p1' };
const binding = { ...scope, printerRevision: 3, credentialRevision: 1 };
const credentialPath = 'locations/l1/printers/p1/deviceCredentials/current';
const printer = (patch = {}) => ({ schemaVersion: 1, revision: 3, deletedAt: null,
  createdAt: { seconds: 1 }, updatedAt: { seconds: 2 }, configuration: { id: 'p1', brandId: 'b1', locationId: 'l1',
    name: 'Pizza ÆØÅ', manufacturer: 'star', model: 'mc-print3', transport: 'cloudprnt-http', state: 'disabled', paperWidthMm: 80, ...patch } });
function fixture() {
  const draft = crypto.createPrinterDeviceCredentialDraft(binding);
  const rows = new Map([['brands/b1', { status: 'active' }], ['locations/l1', { brandId: 'b1' }], ['locations/l1/printers/p1', printer()], [credentialPath, draft.record]]);
  const reads = [], writes = [];
  let broken = false, wrongId; const failures = new Map();
  const collection = path => ({ doc: id => ({ id, path: `${path}/${id}`, collection: name => collection(`${path}/${id}/${name}`) }) });
  const db = { collection }, transaction = { get: async ref => {
    reads.push(ref.path); if (broken) throw Error(`SECRET_${draft.secret}`);
    if (failures.has(ref.path)) throw failures.get(ref.path);
    const value = rows.get(ref.path);
    return { exists: value !== undefined, id: wrongId ?? ref.id, data: () => value };
  }, create: () => writes.push('create'), set: () => writes.push('set'), update: () => writes.push('update'), delete: () => writes.push('delete') };
  const api = loadTs('src/lib/printing/device-auth-native.ts', { 'server-only': {}, '@/lib/firebase-admin': { getAdminDb: () => db } });
  return { ...api, rows, reads, writes, draft, db, transaction, context: { db, transaction },
    fail() { broken = true; }, failOn(path, error) { failures.set(path, error); }, wrongId(id) { wrongId = id; },
    read(input = { ...scope, secret: draft.secret }, context = { db, transaction }) { return api.verifyNativePrinterDevice(context, input); } };
}
const rejects = (promise, code = 'device_unverified') => assert.rejects(promise, error => error.code === code && error.message === code);

test('native identity reads exact four authoritative paths, including disabled onboarding, without output authority or secret echo', async () => {
  for (const state of ['disabled', 'paused', 'active']) {
    const f = fixture(); f.rows.set('locations/l1/printers/p1', printer({ state }));
    const result = await f.read();
    assert.deepEqual(f.reads, ['brands/b1', 'locations/l1', 'locations/l1/printers/p1', credentialPath]);
    assert.deepEqual(result, { ...binding, printerState: state, deviceVerifiedForAttempt: true,
      dispatchAuthorized: false, capabilityAuthorized: false, physicalCompatibilityVerified: false });
    assert.equal(Object.isFrozen(result), true);
    assert.equal(JSON.stringify(result).includes(f.draft.secret), false); assert.equal(JSON.stringify(result).includes(f.draft.record.secretDigest), false);
    assert.deepEqual(f.writes, []);
  }
});

test('canonical brand status rejects suspended scope and malformed lifecycle while allowing identity-only onboarding', async () => {
  for (const status of ['suspended', undefined, 'unknown', '', null, true, 'ACTIVE', 'x'.repeat(1000000)]) {
    const f = fixture(); f.rows.set('brands/b1', { status, isActive: true });
    await rejects(f.read()); assert.deepEqual(f.writes, []);
  }
  for (const status of ['active', 'pending', 'trialing']) {
    const f = fixture(); f.rows.set('brands/b1', { status });
    const identity = await f.read();
    assert.equal(identity.deviceVerifiedForAttempt, true);
    assert.equal(identity.dispatchAuthorized, false); assert.equal(identity.capabilityAuthorized, false);
    // The same native SDK transaction must reread suspension before another operation.
    f.rows.set('brands/b1', { status: 'suspended' }); await rejects(f.read());
    assert.equal(f.reads.length, 6); assert.deepEqual(f.reads.slice(-2), ['brands/b1', 'locations/l1']); assert.deepEqual(f.writes, []);
  }
});

test('invalid request bounds and caller-supplied credential/revision authority are rejected before native paths', async () => {
  const f = fixture();
  for (const input of [null, {}, [], { ...scope, secret: 'short' }, { ...scope, secret: 'x'.repeat(1000000) },
    { ...scope, secret: f.draft.secret, storedCredential: f.draft.record }, { ...scope, secret: f.draft.secret, printerRevision: 3 },
    { ...scope, printerId: '../p1', secret: f.draft.secret }, { ...scope, brandId: 'x'.repeat(1000000), secret: f.draft.secret }]) {
    await rejects(f.read(input), 'invalid_device_request');
  }
  let invoked = false;
  const getter = { ...scope }; Object.defineProperty(getter, 'secret', { get() { invoked = true; throw Error('SECRET'); }, enumerable: true });
  await rejects(f.read(getter), 'invalid_device_request'); assert.equal(invoked, false);
  const proxy = new Proxy({}, { ownKeys() { throw Error('SECRET'); } }); await rejects(f.read(proxy), 'invalid_device_request');
  for (const context of [null, {}, { db: {}, transaction: f.transaction }, { db: f.db, transaction: {} }]) await rejects(f.read(undefined, context));
  assert.deepEqual(f.reads, []); assert.deepEqual(f.writes, []);
});

test('missing, deleted, inactive, foreign and reassigned native scope cannot authenticate', async () => {
  for (const [path, value] of [['brands/b1', undefined], ['locations/l1', undefined], ['locations/l1', { brandId: 'foreign' }],
    ...['brands/b1', 'locations/l1'].flatMap(path => [{ id: 'foreign' }, { deletedAt: 1 }, { deleted: true }, { isDeleted: true }, { isActive: false }, { isTestData: true }].map(patch => [path, { status: 'active', brandId: 'b1', ...patch }]))]) {
    const f = fixture(); f.rows.set(path, value); await rejects(f.read()); assert.deepEqual(f.writes, []);
  }
  const f = fixture(); f.wrongId('foreign'); await rejects(f.read());
});

test('strict native printer schema/current revision and supported configuration are required', async () => {
  for (const value of [undefined, { ...printer(), revision: 4 }, { ...printer(), revision: 0 }, { ...printer(), deletedAt: 1 },
    { ...printer(), token: 'SECRET' }, { ...printer(), schemaVersion: 2 }, ...[{ id: 'other' }, { brandId: 'foreign' }, { locationId: 'other' },
      { state: 'deleted' }, { model: 'unknown' }, { model: 'mc-print2', paperWidthMm: 80 }, { transport: 'unknown' },
      { model: 'mc-print2', transport: 'cloudprnt-mqtt' }, { capability: true }, { name: 'x'.repeat(1000000) }].map(printer)]) {
    const f = fixture(); f.rows.set('locations/l1/printers/p1', value); await rejects(f.read()); assert.deepEqual(f.writes, []);
  }
});

test('missing, corrupt, foreign, stale, revoked and unknown private credentials fail without an existence oracle', async () => {
  for (const mutate of [() => undefined, row => ({ ...row, schemaVersion: 2 }), row => ({ ...row, revokedAt: Date.now() }),
    row => ({ ...row, brandId: 'other' }), row => ({ ...row, locationId: 'other' }), row => ({ ...row, printerId: 'other' }),
    row => ({ ...row, printerRevision: 2 }), row => ({ ...row, credentialRevision: 2 }), row => ({ ...row, credentialRevision: 0 }),
    row => ({ ...row, secret: 'SECRET' }), row => ({ ...row, secretDigest: 'x'.repeat(1000000) }), row => ({ ...row, issuedAt: Date.now() + 60000 })]) {
    const f = fixture(); f.rows.set(credentialPath, mutate(f.draft.record)); await rejects(f.read()); assert.deepEqual(f.writes, []);
  }
  const f = fixture(), other = crypto.createPrinterDeviceCredentialDraft(binding);
  await rejects(f.read({ ...scope, secret: other.secret }));
  f.rows.delete(credentialPath); f.rows.set('locations/l1/printers/p1/deviceCredentials/old', f.draft.record); await rejects(f.read());
});

test('rotation/revocation and printer revision changes are reread on each reused SDK transaction attempt', async () => {
  const f = fixture(), tx = f.transaction;
  const first = await f.read();
  const rotated = crypto.createPrinterDeviceCredentialDraft({ ...binding, credentialRevision: 2 }); f.rows.set(credentialPath, rotated.record);
  await rejects(f.read());
  const second = await f.read({ ...scope, secret: rotated.secret }, { db: f.db, transaction: tx });
  assert.equal(second.credentialRevision, 2); assert.equal(first.credentialRevision, 1); assert.notEqual(first, second);
  f.rows.set(credentialPath, { ...rotated.record, revokedAt: Date.now() }); await rejects(f.read({ ...scope, secret: rotated.secret }));
  const next = crypto.createPrinterDeviceCredentialDraft({ ...binding, printerRevision: 4, credentialRevision: 3 });
  f.rows.set(credentialPath, next.record); await rejects(f.read({ ...scope, secret: next.secret }));
  f.rows.set('locations/l1/printers/p1', { ...printer(), revision: 4 });
  assert.equal((await f.read({ ...scope, secret: next.secret })).printerRevision, 4);
  f.rows.set('locations/l1', { brandId: 'reassigned' }); await rejects(f.read({ ...scope, secret: next.secret }));
  assert.equal(f.transaction, tx); assert.equal(f.reads.length, 26); assert.deepEqual(f.reads.slice(-2), ['brands/b1', 'locations/l1']); assert.deepEqual(f.writes, []);
});

test('native reflective exceptions/accessors and Admin outage never leak secret values or raw errors', async () => {
  const f = fixture(); f.fail(); await rejects(f.read(), 'device_unavailable'); assert.deepEqual(f.writes, []);
  const proxy = new Proxy({}, { getPrototypeOf() { throw Error('SECRET_SENTINEL'); } });
  for (const path of ['brands/b1', 'locations/l1', 'locations/l1/printers/p1', credentialPath]) {
    const f = fixture(); f.rows.set(path, proxy); await rejects(f.read(), 'device_unavailable');
  }
  const g = fixture(); let invoked = false;
  const row = { ...g.draft.record }; Object.defineProperty(row, 'credentialRevision', { get() { invoked = true; throw Error('SECRET'); }, enumerable: true });
  g.rows.set(credentialPath, row); await rejects(g.read()); assert.equal(invoked, false);
  const h = fixture(); h.rows.get('brands/b1').isActive = true;
  Object.defineProperty(h.rows.get('brands/b1'), 'isActive', { get() { invoked = true; throw Error('SECRET'); } });
  await rejects(h.read()); assert.equal(invoked, false);
  const i = fixture();
  Object.defineProperty(i.rows.get('brands/b1'), 'status', { get() { invoked = true; throw Error('SECRET'); } });
  await rejects(i.read()); assert.equal(invoked, false);
});


test('native brand/location authority rejects before touching any foreign printer or private credential', async () => {
  for (const mutate of [
    f => f.rows.set('locations/l1', { brandId: 'brand_B' }),
    f => f.rows.delete('locations/l1'),
    f => f.rows.get('locations/l1').deletedAt = 1,
    f => f.rows.get('brands/b1').status = 'suspended',
    f => f.rows.delete('brands/b1'),
  ]) {
    const f = fixture(); mutate(f);
    await rejects(f.read());
    assert.deepEqual(f.reads, ['brands/b1', 'locations/l1'], 'scope rejection must precede ALL printer/private reads');
    assert.deepEqual(f.writes, []);
  }
});

test('foreign private credential provider failures and metadata cannot affect rejected tenant authentication', async () => {
  const f = fixture();
  f.rows.set('locations/l1', { brandId: 'brand_B' });
  f.rows.set('locations/l1/printers/p1', printer({ brandId: 'brand_B', name: 'PRIVATE_FOREIGN_NAME' }));
  const foreign = crypto.createPrinterDeviceCredentialDraft({ ...binding, brandId: 'brand_B' });
  f.rows.set(credentialPath, foreign.record);
  f.failOn('locations/l1/printers/p1', Error('PRIVATE_FOREIGN_NAME ' + foreign.secret));
  f.failOn(credentialPath, Error('PRIVATE_FOREIGN_CREDENTIAL ' + foreign.secret));
  await assert.rejects(f.read(), error => {
    assert.equal(error.code, 'device_unverified'); assert.equal(error.message, 'device_unverified');
    for (const privateValue of ['PRIVATE_FOREIGN', foreign.secret, foreign.record.secretDigest, f.draft.secret]) {
      assert.equal((String(error) + JSON.stringify(error) + error.stack).includes(privateValue), false);
    }
    return true;
  });
  assert.deepEqual(f.reads, ['brands/b1', 'locations/l1']); assert.deepEqual(f.writes, []);
});
