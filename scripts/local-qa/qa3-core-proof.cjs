'use strict';
// Contract/registration only. HTTP case engine is held for the external-driver handoff.
const { Firestore } = require('@google-cloud/firestore');
const { PROJECT, environment } = require('./environment.cjs');
const BASE = 'http://127.0.0.1:3100';
const guard = Symbol.for('orderfly.qa0.loopback-guard');
const id = /^[A-Za-z0-9_-]{1,128}$/;
const errors = new WeakSet();
class Qa3CoreContractError extends Error {
  constructor(code) {
    code = ['runtime_invalid', 'resources_invalid', 'scope_unregistered', 'registration_failed'].includes(code) ? code : 'resources_invalid';
    super(code); this.name = 'Qa3CoreContractError'; this.code = code; errors.add(this); Object.freeze(this);
  }
}
function fail(code) { throw new Qa3CoreContractError(code); }
function record(input, keys) {
  if (!input || typeof input !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) fail('resources_invalid');
  const descriptors = Object.getOwnPropertyDescriptors(input), names = Reflect.ownKeys(descriptors);
  if (names.length !== keys.length || names.some(k => typeof k !== 'string' || !keys.includes(k))) fail('resources_invalid');
  const result = Object.create(null);
  for (const key of keys) {
    const d = descriptors[key];
    if (!d || !Object.hasOwn(d, 'value')) fail('resources_invalid');
    result[key] = d.value;
  }
  return result;
}
function runtime() {
  const expected = environment();
  for (const key of ['NODE_ENV', 'ORDERFLY_LOCAL_QA', 'GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT', 'FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'SITE_URL',
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'NEXT_PUBLIC_FIREBASE_API_KEY', 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', 'NEXT_PUBLIC_FIREBASE_APP_ID',
    'MPANEL_PLATFORM_ADMIN_EMPLOYEE_ID', 'MPANEL_PLATFORM_ADMIN_ORGANIZATION_ID', 'ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED', 'NODE_OPTIONS']) {
    if (process.env[key] !== expected[key]) fail('runtime_invalid');
  }
  const bootstrap = new Set(['MPANEL_PLATFORM_ADMIN_EMPLOYEE_ID', 'MPANEL_PLATFORM_ADMIN_ORGANIZATION_ID']);
  for (const key of Object.keys(process.env)) if (!bootstrap.has(key) && process.env[key] !== undefined
    && (/SERVICE_ACCOUNT|GOOGLE_APPLICATION_CREDENTIALS|CLOUDSDK|GCE_METADATA|GOOGLE_METADATA|GOOGLE_OAUTH|GCLOUD_ACCESS_TOKEN|FIREBASE_TOKEN|FIREBASE_CONFIG|STRIPE|SMTP|RESEND|SENDGRID|OMNISEND|MPANEL|WOLT|UBER|GOOGLE_AUTH/.test(key)
      || /PRINT_(?:INTENTS|OUTPUT|DISPATCH)_ENABLED/.test(key))) fail('runtime_invalid');
  if (Reflect.get(globalThis, guard) !== true) fail('runtime_invalid');
}
function freeze(value) {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
function inspect(input) {
  try {
    runtime();
    const r = record(input, ['projectId', 'baseUrl', 'sourceCommit', 'db', 'session', 'scope', 'fixtureKey', 'registry']);
    const scope = record(r.scope, ['brandId', 'locationId']);
    const session = record(r.session, ['cookie']);
    const registry = record(r.registry, ['has', 'register']);
    if (r.projectId !== PROJECT || r.baseUrl !== BASE || typeof r.sourceCommit !== 'string' || !/^[a-f0-9]{40}$/.test(r.sourceCommit)
      || typeof r.fixtureKey !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(r.fixtureKey)
      || typeof scope.brandId !== 'string' || typeof scope.locationId !== 'string' || !id.test(scope.brandId) || !id.test(scope.locationId)
      || typeof session.cookie !== 'string' || !/^__session=[A-Za-z0-9._~-]{20,10000}$/.test(session.cookie)
      || typeof registry.has !== 'function' || typeof registry.register !== 'function') fail('resources_invalid');
    // SDK options are inspected, never credentials, ADC, connection startup or I/O.
    // This installed SDK normalizes host into servicePath/port; docs pin the contract.
    if (!(r.db instanceof Firestore) || r.db.projectId !== PROJECT || r.db.databaseId !== '(default)'
      || r.db._settings?.servicePath !== '127.0.0.1' || r.db._settings?.port !== 8088 || r.db._settings?.ssl !== false) fail('resources_invalid');
    if (registry.has.call(r.registry, `brands/${scope.brandId}`, false) !== true
      || registry.has.call(r.registry, `locations/${scope.locationId}`, false) !== true) fail('scope_unregistered');
    const variants = ['core', 'rollback'].map(kind => {
      const printerId = `qa3-${kind}-${r.fixtureKey}`, printer = `locations/${scope.locationId}/printers/${printerId}`;
      return { kind, printerId, printer, queue: printer + '/queue/state', nextAudit: printer + '/audit/2',
        capability: `locations/${scope.locationId}/printerCapabilityVerifications/${printerId}` };
    });
    const registration = freeze({ documents: variants.flatMap(v => [v.printer, v.queue, v.nextAudit, v.capability]), recursiveRoots: variants.map(v => v.printer) });
    const plan = freeze({ contractVersion: 1, projectId: PROJECT, baseUrl: BASE, sourceCommit: r.sourceCommit,
      scope: { ...scope }, variants, registration });
    return { resource: r, session, registry, plan };
  } catch (error) {
    if (errors.has(error)) throw error;
    fail('resources_invalid');
  }
}
/** A frozen cleanup registration plan, not a session, native ownership or dispatch proof. */
function describeQa3CoreProof(resources) { return inspect(resources).plan; }
/** Only owner bookkeeping is called. No database, HTTP, seed, cleanup or case engine. */
async function prepareQa3CoreProof(resources) {
  const before = inspect(resources);
  try {
    await before.registry.register.call(before.resource.registry, before.plan.registration);
    const after = inspect(resources);
    if (after.resource.db !== before.resource.db || after.session.cookie !== before.session.cookie
      || after.registry.has !== before.registry.has || after.registry.register !== before.registry.register
      || JSON.stringify(after.plan) !== JSON.stringify(before.plan)) fail('registration_failed');
    for (const path of before.plan.registration.documents) if (after.registry.has.call(after.resource.registry, path, false) !== true) fail('registration_failed');
    for (const path of before.plan.registration.recursiveRoots) if (after.registry.has.call(after.resource.registry, path, true) !== true) fail('registration_failed');
    return freeze({ contractVersion: 1, status: 'WAITING_ENGINE_HANDOFF', registeredDocuments: before.plan.registration.documents.length,
      registeredRecursiveRoots: before.plan.registration.recursiveRoots.length, nativeExecutionVerified: false, productionAcceptance: false, physicalPrintVerified: false });
  } catch { fail('registration_failed'); }
}
module.exports = { Qa3CoreContractError, describeQa3CoreProof, prepareQa3CoreProof };
