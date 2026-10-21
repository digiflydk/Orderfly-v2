const { test } = require('node:test');
const assert = require('node:assert/strict');
const { allowedRequest, allowedSocket, guardedContext } = require('../../scripts/local-qa/browser-boundary.cjs');
test('browser HTTP frontier allows only fixed demo app/Auth/Firestore and never credential URLs', () => {
  for (const url of ['http://127.0.0.1:3100/admin-login', 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword', 'http://127.0.0.1:8088/google.firestore.v1.Firestore/Listen/channel']) assert.equal(allowedRequest(url), true);
  for (const url of ['https://identitytoolkit.googleapis.com', 'http://localhost:3100', 'http://127.0.0.1:8080', 'http://127.0.0.1.evil:3100', 'http://169.254.169.254', 'http://secret@127.0.0.1:9099', 'file:///tmp/private', 'data:text/html,private', 'bad-url']) assert.equal(allowedRequest(url), false);
});
test('browser WebSocket frontier allows exact local HMR only', () => {
  assert.equal(allowedSocket('ws://127.0.0.1:3100/_next/webpack-hmr'), true);
  for (const url of ['wss://orderfly.dk/_next/webpack-hmr', 'ws://127.0.0.1:9099/', 'ws://127.0.0.1:3100/private', 'ws://secret@127.0.0.1:3100/_next/webpack-hmr']) assert.equal(allowedSocket(url), false);
});
test('context blocks serviceworkers and installs BOTH aborting frontiers before pages or credentials', async () => {
  const events = [], routes = {};
  const context = { route: async (_pattern, fn) => { events.push('http'); routes.http = fn; }, routeWebSocket: async (_pattern, fn) => { events.push('websocket'); routes.socket = fn; } };
  const scope = await guardedContext({ newContext: async options => { assert.equal(options.serviceWorkers, 'block'); assert.equal(options.acceptDownloads, false); events.push('context'); return context; } }, { width: 375, height: 812 });
  assert.deepEqual(events, ['context', 'http', 'websocket']);
  let continued = 0, aborted = 0, connected = 0, closed = 0;
  routes.http({ request: () => ({ url: () => 'https://identitytoolkit.googleapis.com/token?PRIVATE' }), continue: () => continued++, abort: () => aborted++ });
  routes.http({ request: () => ({ url: () => 'http://127.0.0.1:9099/token' }), continue: () => continued++, abort: () => aborted++ });
  routes.socket({ url: () => 'wss://production.example/PRIVATE', connectToServer: () => connected++, close: () => closed++ });
  routes.socket({ url: () => 'ws://127.0.0.1:3100/_next/webpack-hmr', connectToServer: () => connected++, close: () => closed++ });
  assert.deepEqual([continued, aborted, connected, closed, scope.blockedRequests()], [1, 1, 1, 1, 2]);
});
test('a browser callback failure still removes only created seed/users and terminates native persistence without leaking credentials', async () => {
  const fs = require('node:fs'), { environment } = require('../../scripts/local-qa/environment.cjs');
  const documents = new Map([['unrelated/keep', { untouched: true }]]), accounts = new Set(['unrelated-user']), errors = [];
  let callback = false, terminated = false;
  const db = {
    doc(key) { return { key, get: async () => ({ exists: documents.has(key), data: () => documents.get(key) }), delete: async () => documents.delete(key) }; },
    batch() { const pending = []; return { create: (ref, data) => pending.push([ref.key, data]), commit: async () => { for (const [key, data] of pending) documents.set(key, data); } }; },
    recursiveDelete: async ref => { for (const key of documents.keys()) if (key === ref.key || key.startsWith(ref.key + '/')) documents.delete(key); },
    terminate: async () => { terminated = true; },
  };
  const response = (status, body, headers) => new Response(JSON.stringify(body), { status, headers });
  const fetch = async (input, options = {}) => {
    const url = new URL(input), payload = options.body ? JSON.parse(options.body) : null;
    if (url.pathname.endsWith('accounts:signUp')) {
      const uid = payload.email.startsWith('superadmin') ? 'admin' : 'merchant'; accounts.add(uid);
      return response(200, { localId: uid, idToken: uid });
    }
    if (url.pathname.endsWith('accounts:delete')) { accounts.delete(payload.localId); return response(200, {}); }
    if (url.pathname.endsWith('accounts:lookup')) return response(200, { users: payload.localId.filter(id => accounts.has(id)) });
    if (url.pathname === '/api/admin/session') return response(200, {}, { 'set-cookie': '__session=' + payload.idToken + '; Path=/' });
    if (url.pathname.endsWith('/queue')) return response(200, { resumeAuthorized: false });
    if (options.headers.cookie === '__session=merchant') return response(403, {});
    if (!options.headers.cookie) return response(401, {});
    if (url.searchParams.get('locationId') === 'qa0-foreign-location') return response(403, {});
    return response(200, { items: [documents.get('locations/qa0-location/printers/qa0-printer')], totalPrinters: 1 });
  };
  const fakeProcess = { env: { ...environment(), ORDERFLY_LOCAL_QA_BROWSER: 'true' } };
  const code = fs.readFileSync('scripts/local-qa/backend-smoke.cjs', 'utf8').replace('(async () => {', 'return (async () => {');
  await new Function('require', 'process', 'console', 'globalThis', 'fetch', code)(name => {
    if (name === '@google-cloud/firestore') return { Firestore: class { constructor() { return db; } } };
    if (name === './environment.cjs') return { PROJECT: 'demo-orderfly-qa0' };
    if (name === './browser-smoke.cjs') return { runBrowserSmoke: async ({ admin, merchant }) => {
      callback = true; assert.ok(admin.password.length >= 32); assert.ok(merchant.password.length >= 32);
      assert.equal(Object.keys(admin).includes('password'), false); assert.equal(Object.keys(admin).includes('email'), false);
      throw Error('PRIVATE browser credential details');
    } };
    return require(name);
  }, fakeProcess, { log() { assert.fail('failed callback must not emit success'); }, error: value => errors.push(value) },
  { [Symbol.for('orderfly.qa0.loopback-guard')]: true }, fetch);
  assert.equal(callback, true); assert.equal(fakeProcess.exitCode, 1); assert.equal(terminated, true);
  assert.equal(documents.size, 1); assert.deepEqual(documents.get('unrelated/keep'), { untouched: true });
  assert.deepEqual([...accounts], ['unrelated-user']);
  assert.ok(errors.length > 0); assert.ok(errors.every(value => !value.includes('PRIVATE')));
});
