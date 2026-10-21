const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { loadTs } = require('../helpers/load-ts.cjs');
const { environment } = require('../../scripts/local-qa/environment.cjs');
const { localQaEnvironment } = loadTs('src/lib/local-qa-environment.ts');
const marker = Symbol.for('orderfly.qa0.loopback-guard');
function guarded(run) { const previous = Object.getOwnPropertyDescriptor(globalThis, marker); Object.defineProperty(globalThis, marker, { value: true, configurable: true });
  try { return run(); } finally { if (previous) Object.defineProperty(globalThis, marker, previous); else delete globalThis[marker]; } }

test('ordinary production mode remains separate; declared partial/remote/non-demo emulator config always rejects', () => {
  assert.equal(localQaEnvironment({}), null);
  for (const env of [{ FIRESTORE_EMULATOR_HOST: '' }, { FIREBASE_AUTH_EMULATOR_HOST: '' }, { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8088' }, { FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' },
    { ORDERFLY_LOCAL_QA: 'false' }, { ORDERFLY_LOCAL_QA: 'true' }]) assert.throws(() => localQaEnvironment(env), /Local QA/);
  guarded(() => {
    const valid = environment(); assert.equal(localQaEnvironment(valid).projectId, 'demo-orderfly-qa0');
    for (const patch of [{ NODE_ENV: 'production' }, { GCLOUD_PROJECT: 'orderfly-39325' }, { GOOGLE_CLOUD_PROJECT: 'orderfly-v21-10334086-b3076' },
      { NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'production' }, { FIRESTORE_EMULATOR_HOST: 'remote.example:8088' }, { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' },
      { FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099' }, { SITE_URL: 'https://orderfly.dk' }, { NEXT_PUBLIC_FIREBASE_API_KEY: 'PRIVATE' },
      { MPANEL_PLATFORM_ADMIN_EMPLOYEE_ID: 'foreign' }]) assert.throws(() => localQaEnvironment({ ...valid, ...patch }), /Local QA/);
    for (const key of ['GOOGLE_APPLICATION_CREDENTIALS', 'CLOUDSDK_CONFIG', 'GCE_METADATA_HOST', 'FIREBASE_SERVICE_ACCOUNT_JSON', 'FB_SERVICE_ACCOUNT_JSON', 'FIREBASE_TOKEN', 'STRIPE_SECRET_KEY', 'SMTP_PASSWORD', 'MPANEL_PLATFORM_ADMIN_SECRET', 'ORDERFLY_PRINT_INTENTS_ENABLED']) {
      for (const value of ['PRIVATE', '']) assert.throws(() => localQaEnvironment({ ...valid, [key]: value }), /rejected/);
    }
  });
  assert.throws(() => localQaEnvironment(environment()), /network guard/);
});
test('actual Admin initializer fails before SDK credential access for malformed/local production-mix config', () => {
  for (const patch of [{ ORDERFLY_LOCAL_QA: 'true' }, { ...environment(), FB_SERVICE_ACCOUNT_JSON: 'PRIVATE malformed cert' }, { ...environment(), FIRESTORE_EMULATOR_HOST: 'production.example:443' }]) {
    const previous = process.env; process.env = patch; let calls = 0;
    try {
      const sdk = { apps: [], credential: { cert() { calls++; throw Error('PRIVATE accessed'); } }, initializeApp() { calls++; throw Error('PRIVATE initialized'); } };
      const service = loadTs('src/lib/firebase-admin.ts', { 'server-only': {}, 'firebase-admin': sdk });
      assert.throws(() => service.getAdminApp(), error => /Local QA/.test(error.message) && !error.message.includes('PRIVATE')); assert.equal(calls, 0);
      assert.throws(() => service.getAdminDb(), /Local QA/); assert.equal(calls, 0);
    } finally { process.env = previous; }
  }
});
test('network preload rejects provider fetch/Socket/TLS/HTTP2/DNS before any remote connection', () => {
  const program = `const assert=require('node:assert/strict');
    for(const fn of [()=>fetch('https://orderfly.dk/api/health'),()=>require('node:net').connect({host:'169.254.169.254',port:80}),()=>require('node:tls').connect({host:'googleapis.com',port:443}),()=>require('node:http2').connect('https://firestore.googleapis.com'),()=>require('node:dns').lookup('metadata.google.internal'),()=>require('node:dns').resolveTxt('localhost'),()=>require('node:dns').promises.resolve4('localhost'),()=>require('node:net').createServer().listen(0,'0.0.0.0'),()=>require('node:net').createServer().listen('/tmp/qa0.sock')]) assert.throws(fn,/blocked non-loopback/);
    console.log('guarded-negative-frontiers-pass');`;
  const child = spawnSync(process.execPath, ['-e', program], { env: environment(), encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr); assert.match(child.stdout, /frontiers-pass/);
});

test('cached Admin app cannot cross local/project boundaries, and valid emulator setup never asks for a cert', () => guarded(() => {
  const previous = process.env; process.env = environment();
  try {
    let certs = 0, inits = 0;
    const foreign = { name: 'orderfly-local-qa0', options: { projectId: 'production' } };
    const sdk = { apps: [foreign], credential: { cert() { certs++; throw Error('must not read cert'); } }, initializeApp(options, name) { inits++; return { options, name }; } };
    const invalid = loadTs('src/lib/firebase-admin.ts', { 'server-only': {}, 'firebase-admin': sdk });
    assert.throws(() => invalid.getAdminApp(), /scope changed/); assert.equal(certs, 0); assert.equal(inits, 0);
    sdk.apps = [];
    const valid = loadTs('src/lib/firebase-admin.ts', { 'server-only': {}, 'firebase-admin': sdk });
    assert.equal(valid.getAdminApp().options.projectId, 'demo-orderfly-qa0'); assert.equal(certs, 0); assert.equal(inits, 1);
    process.env = {}; assert.throws(() => valid.getAdminApp(), /scope changed/); assert.equal(certs, 0); assert.equal(inits, 1);
  } finally { process.env = previous; }
}));
