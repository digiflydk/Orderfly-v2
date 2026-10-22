const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
function fixture(patch = {}, existing, options = {}) {
  const values = { NODE_ENV: 'development', NEXT_PUBLIC_ORDERFLY_LOCAL_QA: 'true', NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'demo-orderfly-qa0', NEXT_PUBLIC_FIREBASE_API_KEY: 'qa0-public-only', NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: '127.0.0.1', NEXT_PUBLIC_FIREBASE_APP_ID: 'qa0-local', SITE_URL: 'http://127.0.0.1:3100', NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: undefined, NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: undefined, ...patch };
  const saved = new Map(Object.keys(values).map(k => [k, process.env[k]]));
  for (const [k,v] of Object.entries(values)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  const calls = [], app = existing || { options: { projectId: values.NEXT_PUBLIC_FIREBASE_PROJECT_ID, apiKey: values.NEXT_PUBLIC_FIREBASE_API_KEY, authDomain: values.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, appId: values.NEXT_PUBLIC_FIREBASE_APP_ID } }, db = {}, auth = {};
  let initialized = !!existing;
  const mocks = { 'firebase/app': { getApps: () => { calls.push('getApps'); return initialized ? [app] : []; }, getApp: () => { calls.push('getApp'); return app; }, initializeApp: () => { calls.push('initializeApp'); initialized = true; return app; } },
    'firebase/firestore': { getFirestore: a => { assert.equal(a, app); calls.push('getFirestore'); if(options.getFirestoreFailure) throw Error('SDK unavailable'); return db; }, connectFirestoreEmulator: (d,h,p) => { assert.equal(d,db); calls.push(['firestore',h,p]); if(options.firestoreFailure) throw Error('Firestore emulator rejected'); } },
    'firebase/auth': { getAuth: a => { assert.equal(a,app); calls.push('getAuth'); return auth; }, connectAuthEmulator: (a,u,o) => { assert.equal(a,auth); calls.push(['auth',u,o]); if(options.authFailure) throw Error('Auth emulator rejected'); } } };
  return { calls, app, db, auth, load: () => loadTs('src/lib/firebase.ts', mocks), cleanup() { for (const [k,v] of saved) if(v === undefined) delete process.env[k]; else process.env[k] = v; } };
}
test('explicit malformed local browser mode rejects before any Firebase SDK initialization', () => {
  const f = fixture({ NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'orderfly-production' });
  try { assert.throws(() => f.load(), /Local QA/); assert.deepEqual(f.calls, []); } finally { f.cleanup(); }
});


test('ordinary production configuration preserves existing Firebase path and never connects emulators', () => {
  const f = fixture({ NODE_ENV: 'production', NEXT_PUBLIC_ORDERFLY_LOCAL_QA: undefined, NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'ordinary-project', NEXT_PUBLIC_FIREBASE_API_KEY: 'ordinary-public', NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'ordinary.firebaseapp.com', NEXT_PUBLIC_FIREBASE_APP_ID: 'ordinary-app' });
  try { assert.equal(f.load().db, f.db); assert.deepEqual(f.calls, ['getApps', 'initializeApp', 'getFirestore']); } finally { f.cleanup(); }
});
test('partial, malformed, remote and production QA settings reject before any SDK call', () => {
  for (const patch of [{ NEXT_PUBLIC_ORDERFLY_LOCAL_QA: undefined }, { NEXT_PUBLIC_ORDERFLY_LOCAL_QA: 'false' }, { NEXT_PUBLIC_ORDERFLY_LOCAL_QA: '' }, { NODE_ENV: 'production' }, { NODE_ENV: undefined },
    { NEXT_PUBLIC_FIREBASE_PROJECT_ID: undefined }, { NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'other-demo' }, { NEXT_PUBLIC_FIREBASE_API_KEY: 'real-key' }, { NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'production.example' }, { NEXT_PUBLIC_FIREBASE_APP_ID: 'real-app' },
    { NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'real-bucket' }, { NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: 'real-sender' }, { SITE_URL: 'https://127.0.0.1:3100' }, { SITE_URL: 'http://localhost:3100' }, { SITE_URL: 'http://127.0.0.1:3000' }, { SITE_URL: undefined }]) {
    const f = fixture(patch); try { assert.throws(() => f.load(), /Local QA/); assert.deepEqual(f.calls, [], JSON.stringify(patch)); } finally { f.cleanup(); }
  }
});
test('actual browser origin is mandatory even when server SITE_URL claims the demo origin', () => {
  const old = global.window;
  for (const origin of ['https://production.example', 'http://localhost:3100', 'http://127.0.0.1:3000']) {
    global.window = { location: { origin } }; const f = fixture();
    try { assert.throws(() => f.load(), /Local QA/); assert.deepEqual(f.calls, []); } finally { f.cleanup(); }
  }
  if(old === undefined) delete global.window; else global.window = old;
});
test('valid actual browser import binds Auth and Firestore exactly once before exposing the client, including HMR', () => {
  const old = global.window; global.window = { location: { origin: 'http://127.0.0.1:3100' } }; const f = fixture();
  try {
    assert.equal(f.load().db, f.db); assert.equal(f.load().db, f.db);
    assert.deepEqual(f.calls, ['getApps', 'initializeApp', 'getFirestore', 'getAuth', ['auth', 'http://127.0.0.1:9099', { disableWarnings: true }], ['firestore', '127.0.0.1', 8088], 'getApps', 'getApp', 'getFirestore']);
  } finally { f.cleanup(); if(old === undefined) delete global.window; else global.window = old; }
});
test('cached native app with different project or public config rejects before Auth or Firestore initialization', () => {
  for(const options of [{ projectId: 'production' }, { projectId: 'demo-orderfly-qa0', apiKey: 'wrong' }, { projectId: 'demo-orderfly-qa0', apiKey: 'qa0-public-only', authDomain: 'remote', appId: 'qa0-local' }]) {
    const f = fixture({}, { options }); try { assert.throws(() => f.load(), /Local QA/); assert.deepEqual(f.calls, ['getApps', 'getApp']); } finally { f.cleanup(); }
  }
});
test('a cached QA app cannot become a production client after opt-in is removed', () => {
  const f = fixture({ NODE_ENV: 'production', NEXT_PUBLIC_ORDERFLY_LOCAL_QA: undefined, NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'ordinary', NEXT_PUBLIC_FIREBASE_API_KEY: 'ordinary', NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'ordinary.example', NEXT_PUBLIC_FIREBASE_APP_ID: 'ordinary' }, { options: { projectId: 'demo-orderfly-qa0' } });
  try { assert.throws(() => f.load(), /Local QA/); assert.deepEqual(f.calls, ['getApps', 'getApp']); } finally { f.cleanup(); }
});
test('SDK connection errors fail closed and never expose an unbound local database or swallow failures', () => {
  for(const failure of ['getFirestoreFailure', 'authFailure', 'firestoreFailure']) {
    const f = fixture({}, undefined, { [failure]: true });
    try { assert.throws(() => f.load(), /SDK unavailable|emulator rejected/); assert.throws(() => f.load(), /SDK unavailable|emulator rejected/); if(failure !== 'firestoreFailure') assert.equal(f.calls.filter(x=>Array.isArray(x)&&x[0]==='firestore').length, 0); } finally { f.cleanup(); }
  }
});


test('HMR refuses a different Firestore instance for an already bound Firebase app', () => {
  const first = fixture(); try { first.load(); } finally { first.cleanup(); }
  const second = fixture({}, first.app);
  try { assert.throws(() => second.load(), /instance changed/); assert.deepEqual(second.calls, ['getApps', 'getApp', 'getFirestore']); } finally { second.cleanup(); }
});
test('public opt-in and backend explicit demo mode must be aligned before Admin initialization', () => {
  const { localQaEnvironment } = loadTs('src/lib/local-qa-environment.ts');
  const { environment } = require('../../scripts/local-qa/environment.cjs');
  const valid = environment(); assert.equal(valid.NEXT_PUBLIC_ORDERFLY_LOCAL_QA, 'true');
  for(const env of [{ NEXT_PUBLIC_ORDERFLY_LOCAL_QA: 'true' }, { ...valid, NEXT_PUBLIC_ORDERFLY_LOCAL_QA: undefined }, { ...valid, NEXT_PUBLIC_ORDERFLY_LOCAL_QA: 'false' }]) {
    const previous = process.env; process.env = env; let accesses = 0;
    try {
      const service = loadTs('src/lib/firebase-admin.ts', { 'server-only': {}, 'firebase-admin': { apps: [], credential: { cert() { accesses++; } }, initializeApp() { accesses++; } } });
      assert.throws(() => localQaEnvironment(env), /Local QA/); assert.throws(() => service.getAdminApp(), /Local QA/); assert.equal(accesses, 0);
    } finally { process.env = previous; }
  }
});
