'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { environment } = require('../../scripts/local-qa/environment.cjs');
const { intentEnvironment } = require('../../scripts/local-qa/intent-environment.cjs');
const ordinary = loadTs('src/lib/local-qa-environment.ts');
const variant = loadTs('src/lib/local-qa-intent-environment.ts', { './local-qa-environment': ordinary });
const runtime = loadTs('src/lib/local-qa-runtime.ts', { './local-qa-environment': ordinary, './local-qa-intent-environment': variant });
const marker = Symbol.for('orderfly.qa0.loopback-guard');
function guarded(action) {
  const before = Object.getOwnPropertyDescriptor(globalThis, marker);
  Object.defineProperty(globalThis, marker, { value: true, configurable: true });
  try { return action(); } finally { if (before) Object.defineProperty(globalThis, marker, before); else delete globalThis[marker]; }
}
test('variant requires explicit complete intent-only mode, preserves caller environment and leaves ordinary ON rejection unchanged', () => guarded(() => {
  const env = intentEnvironment(); const before = { ...env };
  assert.equal(runtime.localQaRuntimeEnvironment(env).projectId, 'demo-orderfly-qa0');
  assert.deepEqual(env, before);
  assert.equal(env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED, 'false');
  assert.throws(() => ordinary.localQaEnvironment(env), /Local QA/);
  assert.equal(runtime.localQaRuntimeEnvironment(environment()).projectId, 'demo-orderfly-qa0');
  assert.equal(runtime.localQaRuntimeEnvironment({}), null);
}));
test('malformed/partial variants, unsafe modes and provider/output configuration fail before SDK access', () => guarded(() => {
  const valid = intentEnvironment();
  const patches = [
    { ORDERFLY_LOCAL_QA_INTENT_PROOF: '' }, { ORDERFLY_LOCAL_QA_INTENT_PROOF: 'false' },
    { ORDERFLY_LOCAL_QA_INTENT_PROOF: undefined }, { ORDERFLY_PRINT_INTENTS_ENABLED: undefined },
    { ORDERFLY_PRINT_INTENTS_ENABLED: 'false' }, { ORDERFLY_LOCAL_QA: undefined }, { NODE_ENV: 'production' },
    { ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED: undefined }, { ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED: 'true' },
    { GCLOUD_PROJECT: 'orderfly-39325' }, { GOOGLE_CLOUD_PROJECT: 'orderfly-v21-10334086-b3076' },
    { FIRESTORE_EMULATOR_HOST: 'localhost:8088' }, { FIREBASE_AUTH_EMULATOR_HOST: 'remote.example:9099' },
    { SITE_URL: 'https://orderfly.dk' }, { NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'production' },
    { ORDERFLY_LOCAL_QA_BROWSER: 'true' }, { QA0_BROWSER_PROOF: 'false' },
  ];
  for (const key of ['FB_SERVICE_ACCOUNT_JSON', 'GOOGLE_APPLICATION_CREDENTIALS', 'STRIPE_SECRET_KEY', 'SMTP_PASSWORD',
    'ORDERFLY_PRINT_OUTPUT_ENABLED', 'ORDERFLY_PRINT_DISPATCH_ENABLED', 'HTTP_PROXY', 'https_proxy', 'ALL_PROXY', 'NO_PROXY', 'GLOBAL_AGENT_HTTP_PROXY']) {
    for (const value of ['', 'false', 'PRIVATE']) patches.push({ [key]: value });
  }
  for (const patch of patches) {
    const env = { ...valid, ...patch };
    assert.throws(() => runtime.localQaRuntimeEnvironment(env), error => /Local QA/.test(error.message) && !error.message.includes('PRIVATE'));
    const prior = process.env; process.env = env; let sdk = 0;
    try {
      const admin = loadTs('src/lib/firebase-admin.ts', { 'server-only': {}, './local-qa-runtime': runtime,
        'firebase-admin': { get apps() { sdk++; throw Error('PRIVATE SDK'); }, credential: { cert() { sdk++; } }, initializeApp() { sdk++; } } });
      assert.throws(() => admin.getAdminApp(), /Local QA/); assert.throws(() => admin.getAdminDb(), /Local QA/); assert.equal(sdk, 0);
    } finally { process.env = prior; }
  }
  for (const env of [{ ORDERFLY_LOCAL_QA_INTENT_PROOF: 'true' }, { ORDERFLY_LOCAL_QA_INTENT_PROOF: '' }]) assert.throws(() => runtime.localQaRuntimeEnvironment(env), /Local QA/);
}));
test('variant still requires real network preload marker', () => {
  assert.throws(() => runtime.localQaRuntimeEnvironment(intentEnvironment()), /network guard/);
});
test('sanitized child environment never inherits provider or proxy values', () => {
  const prior = process.env; process.env = { PATH: '/known/bin', HTTP_PROXY: 'PRIVATE', STRIPE_SECRET_KEY: 'PRIVATE', ORDERFLY_PRINT_OUTPUT_ENABLED: 'true' };
  try {
    const env = intentEnvironment(); assert.equal(env.PATH, '/known/bin');
    assert.equal(JSON.stringify(env).includes('PRIVATE'), false);
    for (const key of ['HTTP_PROXY', 'STRIPE_SECRET_KEY', 'ORDERFLY_PRINT_OUTPUT_ENABLED']) assert.equal(Object.hasOwn(env, key), false);
  } finally { process.env = prior; }
});
test('valid variant binds actual Admin access only to the fixed emulator without reading a certificate', () => guarded(() => {
  const previous = process.env; process.env = intentEnvironment(); let certificates = 0, initialized = 0, databases = 0;
  try {
    const sdk = { apps: [], credential: { cert() { certificates++; throw Error('PRIVATE cert'); } },
      initializeApp(options, name) { initialized++; return { options, name }; },
      firestore: { Firestore: class { constructor(options) { databases++; this.options = options; } } } };
    const service = loadTs('src/lib/firebase-admin.ts', { 'server-only': {}, './local-qa-runtime': runtime, 'firebase-admin': sdk });
    const app = service.getAdminApp(), db = service.getAdminDb();
    assert.equal(app.name, 'orderfly-local-qa0'); assert.equal(app.options.projectId, 'demo-orderfly-qa0');
    assert.equal(db.options.projectId, 'demo-orderfly-qa0'); assert.equal(db.options.host, '127.0.0.1:8088'); assert.equal(db.options.ssl, false);
    assert.equal(service.getAdminDb(), db); assert.equal(certificates, 0); assert.equal(initialized, 1); assert.equal(databases, 1);
    process.env = { ...intentEnvironment(), GCLOUD_PROJECT: 'orderfly-39325' };
    assert.throws(() => service.getAdminDb(), /Local QA/); assert.throws(() => service.getAdminApp(), /Local QA/);
    assert.equal(certificates, 0); assert.equal(initialized, 1); assert.equal(databases, 1);
  } finally { process.env = previous; }
}));
test('separate launcher offers explicit preflight evidence only and refuses a native run or arbitrary module', () => {
  const { spawnSync } = require('node:child_process');
  const runner = 'scripts/local-qa/run-intents.cjs';
  const run = spawnSync(process.execPath, [runner, '--preflight'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const evidence = JSON.parse(run.stdout); assert.equal(evidence.status, 'preflight-only');
  assert.equal(evidence.nativeExecution, false); assert.equal(evidence.runtimeBindingAvailable, false);
  assert.equal(evidence.productionAcceptance, false); assert.equal(evidence.physicalPrintVerified, false);
  for (const args of [[], ['--module', '/tmp/PRIVATE'], ['--preflight', '--run']]) {
    const rejected = spawnSync(process.execPath, [runner, ...args], { encoding: 'utf8' });
    assert.equal(rejected.status, 1); assert.equal(rejected.stdout, ''); assert.equal(rejected.stderr.includes('PRIVATE'), false);
  }
});
