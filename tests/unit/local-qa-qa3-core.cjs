'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Firestore } = require('@google-cloud/firestore');
const { environment, PROJECT } = require('../../scripts/local-qa/environment.cjs');
const { Qa3CoreContractError, describeQa3CoreProof, prepareQa3CoreProof } = require('../../scripts/local-qa/qa3-core-proof.cjs');
const marker = Symbol.for('orderfly.qa0.loopback-guard');
async function guarded(run, patch = {}) {
  const previous = process.env, descriptor = Object.getOwnPropertyDescriptor(globalThis, marker);
  process.env = { ...environment(), ...patch }; Object.defineProperty(globalThis, marker, { value: true, configurable: true });
  try { return await run(); } finally { process.env = previous; if (descriptor) Object.defineProperty(globalThis, marker, descriptor); else delete globalThis[marker]; }
}
function fixture(options = {}) {
  const events = [], entries = new Set(['doc:brands/qa0-brand', 'doc:locations/qa0-location']);
  // Build a supplied SDK handle independently: the SDK otherwise overwrites bad
  // constructor hosts with FIRESTORE_EMULATOR_HOST before our boundary sees them.
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST; delete process.env.FIRESTORE_EMULATOR_HOST;
  let db;
  try { db = new Firestore({ projectId: options.projectId || PROJECT, host: options.host || '127.0.0.1:8088', ssl: options.ssl ?? false,
    databaseId: options.databaseId || '(default)', credentials: { client_email: 'qa0@demo-orderfly-qa0.invalid', private_key: 'LOCAL_EMULATOR_ONLY_NOT_A_PRIVATE_KEY' } }); }
  finally { if (emulatorHost === undefined) delete process.env.FIRESTORE_EMULATOR_HOST; else process.env.FIRESTORE_EMULATOR_HOST = emulatorHost; }
  for (const key of ['doc', 'collection', 'batch', 'runTransaction', 'request']) db[key] = () => { events.push('NATIVE_IO'); throw Error('PRIVATE native I/O must not run'); };
  const resources = { projectId: PROJECT, baseUrl: 'http://127.0.0.1:3100', sourceCommit: 'c2745f90017f80dfe025158f577d668714604007', db,
    session: { cookie: '__session=PRIVATE_SESSION_VALUE_0123456789' }, scope: { brandId: 'qa0-brand', locationId: 'qa0-location' }, fixtureKey: 'case1',
    registry: { has(path, recursive) { events.push(['has', path, recursive]); return entries.has((recursive ? 'tree:' : 'doc:') + path); },
      async register(plan) { events.push(['register', plan]); for (const p of plan.documents) entries.add('doc:' + p); for (const p of plan.recursiveRoots) entries.add('tree:' + p); } } };
  return { resources, db, entries, events };
}
const safeError = code => error => error instanceof Qa3CoreContractError && error.message === code && error.code === code && !JSON.stringify(error).includes('PRIVATE') && !error.cause;

test('strict resource contract uses real installed SDK identity/options without starting native I/O', () => guarded(() => {
  const f = fixture(), plan = describeQa3CoreProof(f.resources);
  assert.equal(plan.projectId, PROJECT); assert.equal(plan.baseUrl, 'http://127.0.0.1:3100'); assert.equal(plan.sourceCommit, f.resources.sourceCommit);
  assert.deepEqual(plan.variants.map(v => v.printerId), ['qa3-core-case1', 'qa3-rollback-case1']);
  assert.deepEqual(plan.registration, { documents: [
    'locations/qa0-location/printers/qa3-core-case1', 'locations/qa0-location/printers/qa3-core-case1/queue/state', 'locations/qa0-location/printers/qa3-core-case1/audit/2', 'locations/qa0-location/printerCapabilityVerifications/qa3-core-case1',
    'locations/qa0-location/printers/qa3-rollback-case1', 'locations/qa0-location/printers/qa3-rollback-case1/queue/state', 'locations/qa0-location/printers/qa3-rollback-case1/audit/2', 'locations/qa0-location/printerCapabilityVerifications/qa3-rollback-case1'],
    recursiveRoots: ['locations/qa0-location/printers/qa3-core-case1', 'locations/qa0-location/printers/qa3-rollback-case1'] });
  assert.equal(f.events.some(e => e === 'NATIVE_IO' || e[0] === 'register'), false);
  assert.equal(Object.isFrozen(plan), true); assert.equal(Object.isFrozen(plan.registration.documents), true); assert.equal(Object.isFrozen(plan.variants[0]), true);
  assert.throws(() => { plan.scope.locationId = 'foreign'; }, TypeError); assert.doesNotMatch(JSON.stringify(plan), /PRIVATE|cookie|credential/);
}));
test('registration acknowledges exact documents and unknown-receipt subtrees before any case-engine I/O', () => guarded(async () => {
  const f = fixture(), result = await prepareQa3CoreProof(f.resources);
  assert.deepEqual(result, { contractVersion: 1, status: 'WAITING_ENGINE_HANDOFF', registeredDocuments: 8, registeredRecursiveRoots: 2, nativeExecutionVerified: false, productionAcceptance: false, physicalPrintVerified: false });
  assert.equal(f.events.filter(e => Array.isArray(e) && e[0] === 'register').length, 1); assert.equal(f.events.includes('NATIVE_IO'), false);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|cookie|qa0-brand|token/); assert.equal(Object.isFrozen(result), true);
}));
test('wrong project/origin/source/fixture/scope/session and unknown fields reject before registration or native I/O', () => guarded(() => {
  const mutations = [r => { r.projectId = 'orderfly-39325'; }, r => { r.baseUrl = 'https://orderfly.dk'; }, r => { r.baseUrl += '/'; }, r => { r.baseUrl = 'http://localhost:3100'; },
    r => { r.sourceCommit = 'main'; }, r => { r.sourceCommit = [r.sourceCommit]; }, r => { r.fixtureKey = '../escape'; }, r => { r.fixtureKey = 'x'.repeat(33); },
    r => { r.scope.locationId = 'a/b'; }, r => { r.scope.brandId = ['qa0-brand']; }, r => { r.scope.extra = 'PRIVATE'; }, r => { r.session.cookie += '\r\nInjected: PRIVATE'; },
    r => { r.session.cookie = '__session='; }, r => { r.session.cookie += '; other=PRIVATE'; }, r => { r.session.headers = 'PRIVATE'; }, r => { r.credentials = 'PRIVATE'; }, r => { r.db = { projectId: PROJECT }; }];
  for (const mutate of mutations) { const f = fixture(); mutate(f.resources); assert.throws(() => describeQa3CoreProof(f.resources), safeError('resources_invalid')); assert.equal(f.events.length, 0); }
}));
test('native Firestore endpoint/database/project mismatch fails without credential access or native I/O', () => guarded(() => {
  for (const options of [{ projectId: 'production' }, { host: 'remote.example:8088' }, { host: '127.0.0.1:8080' }, { ssl: true }, { databaseId: 'other' }]) {
    const f = fixture(options); assert.throws(() => describeQa3CoreProof(f.resources), safeError('resources_invalid')); assert.equal(f.events.length, 0);
  }
}));
test('runtime mode, project, endpoint, credentials, provider/output configuration and guard fail closed first', () => guarded(async () => {
  const mutations = [{ ORDERFLY_LOCAL_QA: undefined }, { NODE_ENV: 'production' }, { GCLOUD_PROJECT: 'production' }, { FIRESTORE_EMULATOR_HOST: 'remote:8088' },
    { FIREBASE_AUTH_EMULATOR_HOST: 'remote:9099' }, { SITE_URL: 'https://orderfly.dk' }, { FB_SERVICE_ACCOUNT_JSON: 'PRIVATE' }, { GOOGLE_APPLICATION_CREDENTIALS: 'PRIVATE' }, { STRIPE_SECRET_KEY: 'PRIVATE' }, { ORDERFLY_PRINT_OUTPUT_ENABLED: 'true' }, { ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED: 'false' }, { NODE_OPTIONS: '' }];
  for (const patch of mutations) { const f = fixture(); await guarded(() => { assert.throws(() => describeQa3CoreProof(f.resources), safeError('runtime_invalid')); assert.equal(f.events.length, 0); }, patch); }
  const f = fixture(); Object.defineProperty(globalThis, marker, { value: false, configurable: true });
  assert.throws(() => describeQa3CoreProof(f.resources), safeError('runtime_invalid')); assert.equal(f.events.length, 0);
}));
test('scope ownership must be explicitly registered; truthy promises/strings are not authority', () => guarded(() => {
  for (const value of [false, 'true', Promise.resolve(true)]) { const f = fixture(); f.resources.registry.has = () => value; assert.throws(() => describeQa3CoreProof(f.resources), safeError('scope_unregistered')); }
}));
test('registration must acknowledge every exact document AND recursive receipt/audit subtree', () => guarded(async () => {
  for (const omit of ['document', 'tree', 'all']) {
    const f = fixture(); f.resources.registry.register = async plan => { if (omit !== 'all') { for (const p of plan.documents.slice(omit === 'document' ? 1 : 0)) f.entries.add('doc:' + p); if (omit !== 'tree') for (const p of plan.recursiveRoots) f.entries.add('tree:' + p); } };
    await assert.rejects(prepareQa3CoreProof(f.resources), safeError('registration_failed')); assert.equal(f.events.includes('NATIVE_IO'), false);
  }
}));
test('registry failure never reflects private errors or becomes a successful proof', () => guarded(async () => {
  const f = fixture(); f.resources.registry.register = async () => { throw Error('PRIVATE caller content'); };
  await assert.rejects(prepareQa3CoreProof(f.resources), safeError('registration_failed')); assert.equal(f.events.includes('NATIVE_IO'), false);
  f.resources.registry.has = () => { throw Error('PRIVATE has trap'); };
  assert.throws(() => describeQa3CoreProof(f.resources), safeError('resources_invalid'));
}));
test('resource mutation while awaiting owner registration rejects before future I/O', () => guarded(async () => {
  for (const mutate of [r => { r.session.cookie += 'changed'; }, r => { r.fixtureKey = 'changed'; }, r => { r.baseUrl = 'https://orderfly.dk'; }, r => { r.db._settings.servicePath = 'remote'; }]) {
    const f = fixture(), register = f.resources.registry.register; f.resources.registry.register = async function(plan) { await register.call(this, plan); mutate(f.resources); };
    await assert.rejects(prepareQa3CoreProof(f.resources), safeError('registration_failed')); assert.equal(f.events.includes('NATIVE_IO'), false);
  }
}));
test('hostile getters/proxy reflection and forged error objects never disclose attacker content', () => guarded(() => {
  const f = fixture(), getter = { ...f.resources }; Object.defineProperty(getter, 'db', { get() { throw Error('PRIVATE getter'); } });
  const hostile = [getter, new Proxy(f.resources, { ownKeys() { throw Error('PRIVATE ownKeys'); } }), new Proxy(f.resources, { getPrototypeOf() { throw Error('PRIVATE prototype'); } }), new Proxy(f.resources, { getOwnPropertyDescriptor() { throw Error('PRIVATE descriptor'); } })];
  const revoked = Proxy.revocable({}, {}); revoked.revoke(); hostile.push(revoked.proxy);
  for (const input of hostile) assert.throws(() => describeQa3CoreProof(input), safeError('resources_invalid'));
  assert.equal(new Qa3CoreContractError('PRIVATE arbitrary code').message, 'resources_invalid');
}));
