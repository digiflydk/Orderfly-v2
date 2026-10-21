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

// Exercise the actual runner with child-process I/O isolated. This is a lifecycle
// regression, not the real Auth/Firestore proof (which the runner also executes).
async function runnerFixture(leakAfterFirstSmoke, stall = false) {
  const fs = require('node:fs'), path = require('node:path'), { EventEmitter } = require('node:events');
  const children = [], events = [], output = [];
  let smokeCount = 0, seedPresent = false;
  const fakeProcess = { env: { QA0_FIREBASE_BIN: '/qa0-tools/firebase', QA0_JAVA_BIN: '/qa0-tools/java' }, execPath: process.execPath,
    kill(pid) { const child = children.find(c => c.pid === -pid); child.exitCode = 0; events.push('teardown'); } };
  const io = {
    spawn(_command, args) {
      const child = Object.assign(new EventEmitter(), { pid: children.length + 1, exitCode: null, stdout: new EventEmitter(), stderr: new EventEmitter() });
      children.push(child);
      child.kill = () => { child.exitCode = 1; events.push('kill-stalled'); };
      if (args.some(arg => arg.endsWith('backend-smoke.cjs'))) {
        smokeCount++; events.push('smoke');
        const rejected = seedPresent; seedPresent = leakAfterFirstSmoke;
        if (!stall) queueMicrotask(() => { if (!rejected) child.stdout.emit('data', JSON.stringify({ environment: 'QA0a-local-backend' })); child.exitCode = rejected ? 1 : 0; child.emit('exit', child.exitCode); });
      }
      return child;
    },
    spawnSync(_command, args) { return { status: 0, stdout: args[0] === '--version' ? '15.30.0' : '', stderr: 'openjdk version "21.0.12"' }; },
  };
  const mocks = {
    'node:child_process': io, 'node:path': path,
    'node:fs': { mkdtempSync: () => '/tmp/qa0-fixture', chmodSync() {}, openSync: () => 1, closeSync() {}, existsSync: p => p.startsWith('/qa0-tools/') },
    'node:net': { createServer: () => ({ once() { return this; }, listen(_port, _host, callback) { callback(); }, close(callback) { callback(); } }) },
    './environment.cjs': { environment },
  };
  const code = fs.readFileSync('scripts/local-qa/run-backend.cjs', 'utf8').replace('(async () => {', 'return (async () => {');
  const timers = (fn) => { const timer = { active: true }; queueMicrotask(() => { if (timer.active) fn(); }); return timer; };
  const run = new Function('require', 'process', 'console', '__dirname', 'fetch', 'setTimeout', 'clearTimeout', code)(name => mocks[name], fakeProcess,
    { log: value => output.push(value), error() {} }, path.resolve('scripts/local-qa'), async () => ({ status: 200 }), timers, timer => { timer.active = false; });
  const settled = await Promise.race([run.then(() => true), new Promise(resolve => setTimeout(() => resolve(false), 100))]);
  return { exitCode: fakeProcess.exitCode ?? 0, events, smokeCount, output, settled };
}
test('runner detects leftover seed in the same persistent lifetime before teardown', async () => {
  const result = await runnerFixture(true);
  assert.equal(result.exitCode, 1, 'a first success followed by persistent contamination must fail the harness');
  assert.equal(result.smokeCount, 2); assert.equal(result.events.indexOf('teardown'), 2);
  assert.equal(result.output.length, 0, 'no success summary when the cleanup check fails');
});
test('runner reports success only after two clean smokes precede emulator teardown', async () => {
  const result = await runnerFixture(false);
  assert.equal(result.exitCode, 0); assert.equal(result.smokeCount, 2);
  assert.equal(result.events.indexOf('teardown'), 2); assert.ok(result.output.length > 0);
});

test('runner bounds a stalled smoke and kills it before reporting failure', async () => {
  const result = await runnerFixture(false, true);
  assert.equal(result.settled, true, 'a stalled native smoke must not hang the harness');
  assert.equal(result.exitCode, 1); assert.equal(result.smokeCount, 1);
  assert.ok(result.events.includes('kill-stalled')); assert.equal(result.output.length, 0);
});

test('native smoke terminates its Firestore client even when cleanup verification rejects', async () => {
  const fs = require('node:fs'); let terminated = false;
  const db = { doc: () => ({ get: async () => { throw Error('PRIVATE read failure'); } }), terminate: async () => { terminated = true; } };
  const fakeProcess = { env: environment() }, errors = [];
  const code = fs.readFileSync('scripts/local-qa/backend-smoke.cjs', 'utf8').replace('(async () => {', 'return (async () => {');
  await new Function('require', 'process', 'console', 'globalThis', 'fetch', code)(name => {
    if (name === '@google-cloud/firestore') return { Firestore: class { constructor() { return db; } } };
    if (name === './environment.cjs') return { PROJECT: 'demo-orderfly-qa0' };
    return require(name);
  }, fakeProcess, { log() { assert.fail('failed smoke must not report success'); }, error: value => errors.push(value) },
  { [marker]: true }, async () => ({ ok: false }));
  assert.equal(terminated, true, 'failed cleanup must still close native gRPC resources');
  assert.equal(fakeProcess.exitCode, 1); assert.ok(errors.length > 0); assert.ok(errors.every(value => !value.includes('PRIVATE')));
});
