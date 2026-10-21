const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');

const scope = { brandId: 'b1', locationId: 'l1' };
const target = (printerId = 'p1', patch = {}) => ({ printerId, printerRevision: 3, kinds: ['kitchen', 'packing'], ...patch });
const policy = (patch = {}) => ({ schemaVersion: 1, id: 'original', ...scope, revision: 2,
  deletedAt: null, enabled: true, targets: [target()], ...patch });
const printer = (id = 'p1', patch = {}) => ({ schemaVersion: 1, revision: 3, deletedAt: null,
  createdAt: { seconds: 1 }, updatedAt: { seconds: 2 },
  configuration: { id, ...scope, name: 'Pizza ÆØÅ', manufacturer: 'star', model: 'mc-print3',
    transport: 'cloudprnt-http', state: 'active', paperWidthMm: 80, ...patch } });

function fixture({ saved = policy() } = {}) {
  const rows = new Map([['brands/b1', {}], ['locations/l1', { brandId: 'b1' }],
    ['locations/l1/printIntentPolicies/original', saved], ['locations/l1/printers/p1', printer()]]);
  const reads = [], writes = [];
  let failure = false, overrideId;
  const collection = path => ({ doc: id => ({ path: `${path}/${id}`, id, collection: name => collection(`${path}/${id}/${name}`) }) });
  const db = { collection };
  const transaction = { get: async ref => {
    reads.push(ref.path); if (failure) throw Error('SECRET_SENTINEL');
    const value = rows.get(ref.path);
    return { id: overrideId ?? ref.id, exists: value !== undefined, data: () => value };
  }, create: () => writes.push('create'), set: () => writes.push('set'), update: () => writes.push('update'), delete: () => writes.push('delete') };
  const api = loadTs('src/lib/printing/intent-target-policy.ts', { 'server-only': {}, '@/lib/firebase-admin': { getAdminDb: () => db } });
  return { ...api, rows, reads, writes, context: { db, transaction }, fail: () => { failure = true; }, wrongId: id => { overrideId = id; },
    read(input = scope, context = { db, transaction }) { return api.preparePrintIntentTargetPolicy(context, input); } };
}
const rejects = (promise, code) => assert.rejects(promise, error => error.code === code && error.message === code);

test('missing and explicit OFF policy return no targets, no printer scans and never authorize output', async () => {
  for (const saved of [undefined, policy({ enabled: false, targets: [] })]) {
    const f = fixture(); f.rows.set('locations/l1/printIntentPolicies/original', saved);
    const result = await f.read();
    assert.deepEqual(result, { ...scope, policyRevision: saved ? 2 : null, enabled: false, dispatchAuthorized: false, targets: [] });
    assert.equal(f.reads.length, 3); assert.equal(f.reads.some(path => path.includes('/printers')), false);
    assert.deepEqual(f.writes, []); assert.ok(Object.isFrozen(result) && Object.isFrozen(result.targets));
  }
});

test('explicit active/paused targets preserve reviewed revisions and kinds as immutable credential-free copies', async () => {
  const f = fixture({ saved: policy({ targets: [target(), target('p2', { kinds: ['packing'] })] }) });
  f.rows.set('locations/l1/printers/p2', printer('p2', { state: 'paused' }));
  const result = await f.read();
  assert.equal(result.enabled, true); assert.equal(result.policyRevision, 2); assert.equal(result.dispatchAuthorized, false);
  assert.deepEqual(result.targets.map(t => [t.configuration.id, t.configuration.state, t.printerRevision, t.kinds, t.dispatchAuthorized]),
    [['p1', 'active', 3, ['kitchen', 'packing'], false], ['p2', 'paused', 3, ['packing'], false]]);
  for (const t of result.targets) assert.ok(Object.isFrozen(t) && Object.isFrozen(t.configuration) && Object.isFrozen(t.kinds));
  const serialized = JSON.stringify(result); assert.doesNotMatch(serialized, /createdAt|updatedAt|deletedAt|schemaVersion|credential|SECRET/);
  f.rows.get('locations/l1/printers/p1').configuration.name = 'Changed';
  f.rows.get('locations/l1/printIntentPolicies/original').targets[0].kinds.reverse();
  assert.equal(result.targets[0].configuration.name, 'Pizza ÆØÅ'); assert.deepEqual(result.targets[0].kinds, ['kitchen', 'packing']);
  assert.deepEqual(f.writes, []);
});

test('scope and context forgery fail before native I/O', async () => {
  const f = fixture();
  for (const input of [{}, { ...scope, brandId: '../b1' }, { ...scope, locationId: 'x'.repeat(401) }, { ...scope, extra: true }, null]) await rejects(f.read(input), 'invalid_scope');
  for (const context of [null, {}, { db: {}, transaction: f.context.transaction }]) await rejects(f.read(scope, context), 'policy_unverified');
  assert.deepEqual(f.reads, []); assert.deepEqual(f.writes, []);
});

test('native missing/deleted/foreign/malformed brand or location never permits even OFF policy', async () => {
  for (const [path, value] of [
    ['brands/b1', undefined], ['locations/l1', undefined], ['locations/l1', { brandId: 'other' }],
    ['brands/b1', { id: 'other' }], ['locations/l1', { brandId: 'b1', id: 'other' }],
    ...['brands/b1', 'locations/l1'].flatMap(path => [{ deletedAt: 1 }, { deleted: true }, { isDeleted: true }, { isDeleted: 'false' }, { deletedAt: false }].map(patch => [path, { brandId: 'b1', ...patch }])),
  ]) {
    const f = fixture({ saved: policy({ enabled: false, targets: [] }) }); f.rows.set(path, value);
    await rejects(f.read(), 'policy_unverified'); assert.equal(f.reads.length, 3); assert.deepEqual(f.writes, []);
  }
  const f = fixture(); f.wrongId('wrong'); await rejects(f.read(), 'policy_unverified');
});

test('strict versioned policy rejects corrupt identity, ownership, revision, tombstones and unknown fields', async () => {
  for (const patch of [{ schemaVersion: 0 }, { id: 'other' }, { brandId: 'other' }, { locationId: 'other' },
    { revision: 0 }, { revision: Number.MAX_SAFE_INTEGER + 1 }, { revision: '2' }, { deletedAt: 1 },
    { enabled: 'true' }, { credentials: 'SECRET_SENTINEL' }, { targets: [] }, { enabled: false },
    { targets: [target('p1', { printerRevision: 0 })] }, { targets: [target('p1', { kinds: ['receipt'] })] },
    { targets: [target('p1', { kinds: [] })] }, { targets: [target('p1', { kinds: ['kitchen', 'kitchen'] })] },
    { targets: [target(), target()] }, { targets: [target('p1', { extra: true })] }]) {
    const f = fixture({ saved: policy(patch) }); await rejects(f.read(), 'policy_unverified');
    assert.equal(f.reads.some(path => path.includes('/printers/')), false); assert.deepEqual(f.writes, []);
  }
});

test('missing, disabled, deleted, foreign, stale and corrupt selected printers fail whole policy', async () => {
  for (const row of [undefined, { ...printer(), deletedAt: 1 }, { ...printer(), revision: 2 },
    { ...printer(), revision: '3' }, { ...printer(), schemaVersion: 0 }, { ...printer(), secret: 'SECRET_SENTINEL' },
    ...[{ state: 'disabled' }, { state: 'broken' }, { id: 'other' }, { brandId: 'other' }, { locationId: 'other' },
      { model: 'mc-print2', paperWidthMm: 80 }, { name: 'bad\ncommand' }, { token: 'SECRET_SENTINEL' }].map(patch => printer('p1', patch)),
  ]) {
    const f = fixture(); f.rows.set('locations/l1/printers/p1', row);
    await rejects(f.read(), 'target_unverified'); assert.deepEqual(f.writes, []);
  }
});

test('any failing fanout target rejects without partial output or mutations', async () => {
  const f = fixture({ saved: policy({ targets: [target(), target('missing')] }) });
  await rejects(f.read(), 'target_unverified'); assert.equal(f.reads.length, 5); assert.deepEqual(f.writes, []);
});

test('boundaries accept sixteen explicit printers and reject seventeenth before printer reads', async () => {
  const targets = Array.from({ length: 16 }, (_, i) => target(`p${i}`));
  const f = fixture({ saved: policy({ targets }) });
  for (const t of targets) f.rows.set(`locations/l1/printers/${t.printerId}`, printer(t.printerId));
  assert.equal((await f.read()).targets.length, 16); assert.equal(f.reads.length, 19);
  const g = fixture({ saved: policy({ targets: [...targets, target('p17')] }) });
  await rejects(g.read(), 'policy_unverified'); assert.equal(g.reads.length, 3);
});

test('huge nested arrays and strings reject before traversal or regex/trim', async () => {
  const huge = new Array(1_000_000); Object.defineProperty(huge, '0', { get() { throw Error('TRAVERSED'); } });
  for (const saved of [policy({ targets: huge }), policy({ targets: [target('p1', { kinds: huge })] }),
    policy({ targets: [target('x'.repeat(1000000))] }), policy({ unknown: 'x'.repeat(1000000) })]) {
    const f = fixture({ saved }); await rejects(f.read(), 'policy_unverified'); assert.equal(f.reads.length, 3);
  }
  const f = fixture(); f.rows.set('locations/l1/printers/p1', printer('p1', { name: 'x'.repeat(1000000) }));
  await rejects(f.read(), 'target_unverified');
});

test('data accessors and non-data policy shapes reject without getter invocation', async () => {
  let touched = false;
  const saved = policy(); Object.defineProperty(saved, 'enabled', { get() { touched = true; throw Error('GETTER'); }, enumerable: true });
  const f = fixture({ saved }); await rejects(f.read(), 'policy_unverified'); assert.equal(touched, false);
  for (const targets of [[undefined], new Array(1), [{ ...target(), kinds: new Date() }]]) {
    const g = fixture({ saved: policy({ targets }) }); await rejects(g.read(), 'policy_unverified');
  }
});

test('each retry rereads current policy, native ownership and selected config revisions', async () => {
  const f = fixture(); const first = await f.read();
  f.rows.set('locations/l1/printers/p1', { ...printer(), revision: 4 });
  await rejects(f.read(scope, { ...f.context }), 'target_unverified');
  f.rows.set('locations/l1/printIntentPolicies/original', policy({ revision: 3, targets: [target('p1', { printerRevision: 4 })] }));
  const next = await f.read(scope, { ...f.context }); assert.equal(next.policyRevision, 3); assert.equal(next.targets[0].printerRevision, 4);
  assert.equal(first.policyRevision, 2); assert.equal(first.targets[0].printerRevision, 3);
  f.rows.set('locations/l1', { brandId: 'other' }); await rejects(f.read(), 'policy_unverified');
  assert.deepEqual(f.writes, []);
});

test('native I/O failure is generic and has no side effects', async () => {
  const f = fixture(); f.fail(); await rejects(f.read(), 'policy_unavailable'); assert.deepEqual(f.writes, []);
});
