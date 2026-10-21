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

test('login diagnostics persist only fixed substage/category and allowlisted local numeric statuses', () => {
  const { diagnostics } = require('../../scripts/local-qa/browser-diagnostics.cjs');
  const d = diagnostics(); d.mark('admin', 'session-response');
  d.response('admin', 'http://127.0.0.1:3100/admin-login?next=PRIVATE', 200);
  d.response('admin', 'https://orderfly.dk/admin-login?PRIVATE', 503);
  d.response('admin', 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=PRIVATE', 400);
  d.response('admin', 'http://127.0.0.1:3100/api/admin/session?PRIVATE', 503);
  for (const url of ['https://orderfly.dk/api/admin/session?PRIVATE', 'http://127.0.0.1:3100/private', 'http://PRIVATE@127.0.0.1:3100/api/admin/session']) d.response('admin', url, 201);
  d.response('admin', 'http://127.0.0.1:3100/api/admin/session', 'PRIVATE');
  d.alert('admin', 'PRIVATE reflected error'); d.clientError('admin', 'PRIVATE Local QA client configuration rejected');
  const result = d.snapshot({ name: 'TimeoutError', message: 'PRIVATE password/token/cookie' });
  assert.deepEqual(result.admin, { loginPageStatus: 200, authSignInStatus: 400, sessionStatus: 503, uiError: 'other-ui-alert', clientError: 'client-configuration-rejected', fieldDom: null, preClickDom: null, pagePath: null, uncaughtError: null });
  assert.equal(result.loginSubstage, 'admin-session-response'); assert.equal(result.failureCategory, 'timeout');
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
  assert.throws(() => d.mark('PRIVATE', 'fields'), /rejected/); assert.throws(() => d.mark('admin', 'PRIVATE'), /rejected/);
});

test('Next global route announcer alone cannot become a login UI error', async () => {
  const { loginAlert } = require('../../scripts/local-qa/browser-diagnostics.cjs');
  let formError = null;
  const locator = scope => ({ isVisible: async () => scope === 'form' ? formError !== null : true, textContent: async () => scope === 'form' ? formError : '' });
  const page = { getByRole: role => { assert.equal(role, 'alert'); return locator('global-announcer'); },
    locator: selector => { assert.equal(selector, 'form'); return { getByRole: role => { assert.equal(role, 'alert'); return locator('form'); } }; } };
  assert.equal(await loginAlert(page).isVisible(), false, 'empty global Next route announcer must not win the UI error race');
  formError = 'Kunne ikke logge ind. Prøv igen.';
  assert.equal(await loginAlert(page).isVisible(), true); assert.equal(await loginAlert(page).textContent(), formError);
});

function cdpFixture(failure) {
  const { EventEmitter } = require('node:events');
  const session = new EventEmitter(); session.calls = []; session.mode = 'none'; let resume;
  session.send = async (method, parameters) => {
    session.calls.push([method, parameters]);
    if (failure === method) throw Error('PRIVATE protocol failure');
    if (method === 'Debugger.setPauseOnExceptions') session.mode = parameters.state;
    if (method === 'Debugger.resume' || method === 'Debugger.disable') { resume?.(); resume = undefined; }
  };
  session.detach = async () => { session.calls.push(['detach']); if (failure === 'detach') throw Error('PRIVATE detach'); };
  session.caught = async description => {
    if (session.mode !== 'all') return;
    const released = new Promise(resolve => { resume = resolve; });
    const payload = { reason: 'exception', data: { description } };
    Object.defineProperty(payload, 'callFrames', { get() { assert.fail('observer must never inspect frames/locals'); } });
    session.emit('Debugger.paused', payload); await released;
  };
  const page = Object.assign(new EventEmitter(), { context: () => ({ newCDPSession: async () => session }) });
  return { page, session };
}
test('caught client exception is categorized without pageerror, resumed and detached without reflecting private data', async () => {
  const { diagnostics } = require('../../scripts/local-qa/browser-diagnostics.cjs');
  const { withCaughtLoginExceptions } = require('../../scripts/local-qa/caught-login-exceptions.cjs');
  const { page, session } = cdpFixture(); const d = diagnostics(); let pageErrors = 0;
  page.on('pageerror', () => pageErrors++);
  const value = await withCaughtLoginExceptions(page, d, 'admin', async () => {
    await session.caught('Error: PRIVATE Local QA client configuration rejected');
    try { throw Error('PRIVATE Local QA client configuration rejected'); } catch { return 'form-handled'; }
  });
  assert.equal(value, 'form-handled'); assert.equal(pageErrors, 0);
  assert.equal(d.snapshot({}).admin.clientError, 'client-configuration-rejected');
  assert.equal(JSON.stringify(d.snapshot({})).includes('PRIVATE'), false);
  assert.ok(session.calls.some(([method]) => method === 'Debugger.resume'));
  assert.equal(session.calls.some(([method, args]) => method === 'Debugger.disable' || method === 'Debugger.setPauseOnExceptions' && args.state === 'none'), false, 'teardown is browser-side detach only');
  assert.equal(session.calls.at(-1)[0], 'detach'); assert.equal(session.listenerCount('Debugger.paused'), 0);
});

test('observer resumes even if categorization rejects and always detaches after action failure', async () => {
  const { withCaughtLoginExceptions } = require('../../scripts/local-qa/caught-login-exceptions.cjs');
  const first = cdpFixture();
  await assert.rejects(withCaughtLoginExceptions(first.page, { clientError() { throw Error('PRIVATE sanitizer'); } }, 'admin', () => first.session.caught('PRIVATE')), error => error.name === 'QaObserverError' && error.operation === 'categorize' && !error.message.includes('PRIVATE'));
  assert.ok(first.session.calls.some(([method]) => method === 'Debugger.resume')); assert.equal(first.session.calls.at(-1)[0], 'detach');
  const second = cdpFixture(), original = Object.assign(Error('original scenario failed'), { name: 'TimeoutError' });
  await assert.rejects(withCaughtLoginExceptions(second.page, { clientError() {} }, 'admin', async () => { throw original; }), error => error === original);
  assert.equal(second.session.calls.at(-1)[0], 'detach'); assert.equal(second.session.listenerCount('Debugger.paused'), 0);
});
test('protocol setup, resume and detach failures fail closed with fixed errors and attempt every teardown', async () => {
  const { withCaughtLoginExceptions } = require('../../scripts/local-qa/caught-login-exceptions.cjs');
  for (const failure of ['Debugger.enable', 'Debugger.setPauseOnExceptions', 'Debugger.resume', 'detach']) {
    const { page, session } = cdpFixture(failure);
    await assert.rejects(withCaughtLoginExceptions(page, { clientError() {} }, 'admin', () => session.caught('PRIVATE')), error => error.name === 'QaObserverError' && error.message === 'QA0 login observer failed' && error.operation === ({ 'Debugger.enable':'enable', 'Debugger.setPauseOnExceptions':'pauseMode', 'Debugger.resume':'resume', detach:'detach' })[failure]);
    assert.equal(session.calls.some(([method]) => method === 'Debugger.setPauseOnExceptions'), failure !== 'Debugger.enable');
    assert.equal(session.calls.some(([method]) => method === 'Debugger.disable'), false); assert.equal(session.calls.at(-1)[0], 'detach');
    assert.equal(session.listenerCount('Debugger.paused'), 0);
  }
});
test('observer bounds a stalled protocol operation and exception storm without changing scenario deadlines', async () => {
  const { withCaughtLoginExceptions } = require('../../scripts/local-qa/caught-login-exceptions.cjs');
  const stalled = cdpFixture(); const original = stalled.session.send;
  stalled.session.send = (method, args) => method === 'Debugger.enable' ? new Promise(() => {}) : original(method, args);
  await assert.rejects(withCaughtLoginExceptions(stalled.page, { clientError() {} }, 'admin', async () => assert.fail('setup never completed')), { name: 'QaObserverError', operation: 'enable' });
  assert.equal(stalled.session.calls.at(-1)[0], 'detach');
  const storm = cdpFixture();
  await assert.rejects(withCaughtLoginExceptions(storm.page, { clientError() {} }, 'admin', async () => {
    for (let i = 0; i < 17; i++) await storm.session.caught('PRIVATE');
  }), { name: 'QaObserverError', operation: 'pauseLimit' });
  assert.equal(storm.session.calls.at(-1)[0], 'detach');
});
test('field diagnostics read only fixed DOM counts/visibility, safe path enums and uncaught names', async () => {
  const { diagnostics, fieldDom } = require('../../scripts/local-qa/browser-diagnostics.cjs');
  const observed = [];
  const locator = key => ({ count: async () => key === 'E-mail' ? 1 : 0, first: () => ({ isVisible: async () => key === 'E-mail' }), inputValue() { assert.fail('no values'); }, textContent() { assert.fail('no text'); } });
  const fixedNames = ['Log ind med Opsfly', 'Log ind med en separat Orderfly-konto', 'ADMINISTRATION'];
  const page = { getByLabel: (label, options) => { assert.equal(options.exact, true); assert.ok(['E-mail','Adgangskode'].includes(label)); observed.push(label); return locator(label); },
    getByRole: (role, options) => { assert.ok(['button','heading'].includes(role)); assert.equal(options.exact, true); assert.ok(fixedNames.includes(options.name)); observed.push(options.name); return locator(options.name); },
    locator: selector => { assert.equal(selector, 'form'); observed.push(selector); return locator(selector); },
    getByText: (text, options) => { assert.equal(text, 'Indlæser login…'); assert.deepEqual(options, { exact: true }); observed.push(text); return locator(text); } };
  const d = diagnostics(), value = await fieldDom(page); value.PRIVATE = 'PRIVATE';
  d.fields('admin', value, 'preClickDom'); d.fields('admin', value); d.mark('admin', 'fields-password');
  d.path('admin', 'http://127.0.0.1:3100/admin-login?next=PRIVATE'); d.uncaught('admin', { name: 'TypeError', get message() { assert.fail('no error messages'); } });
  const result = d.snapshot({ name: 'TimeoutError' });
  assert.deepEqual(observed, ['E-mail', 'Adgangskode', 'Log ind med Opsfly', 'Log ind med en separat Orderfly-konto', 'form', 'ADMINISTRATION', 'Indlæser login…']);
  assert.deepEqual(result.admin.fieldDom.email, { count: 1, visible: true });
  assert.equal(Object.keys(result.admin.fieldDom).length, 7); assert.deepEqual(result.admin.preClickDom, result.admin.fieldDom);
  assert.equal(result.admin.pagePath, 'admin-login'); assert.equal(result.admin.uncaughtError, 'TypeError');
  assert.equal(result.loginSubstage, 'admin-fields-password'); assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
  for (const [pathname, expected] of [['/superadmin/printers?PRIVATE','superadmin'], ['/merchant/x?PRIVATE','merchant'], ['/private?PRIVATE','other-local']]) { d.path('admin', 'http://127.0.0.1:3100' + pathname); assert.equal(d.snapshot({}).admin.pagePath, expected); }
  d.path('admin', 'https://production.example/PRIVATE'); assert.equal(d.snapshot({}).admin.pagePath, 'other-local');
  for (const name of ['ReferenceError','SyntaxError','ChunkLoadError','PRIVATE']) { d.uncaught('admin', { name, get message() { assert.fail('no error messages'); } }); assert.equal(d.snapshot({}).admin.uncaughtError, name === 'PRIVATE' ? 'other' : name); }
  assert.equal(JSON.stringify(d.snapshot({})).includes('PRIVATE'), false);
  assert.throws(() => d.fields('admin', { ...value, email: { count: 'PRIVATE', visible: true } }), /rejected/);
  assert.throws(() => d.fields('admin', value, 'PRIVATE'), /rejected/);
  assert.equal(d.snapshot({ name: 'QaObserverError', message: 'PRIVATE' }).failureCategory, 'login-observer-failed');
});
test('teardown waits for an in-flight resume instead of issuing a second concurrent resume', async () => {
  const { withCaughtLoginExceptions } = require('../../scripts/local-qa/caught-login-exceptions.cjs');
  const { page, session } = cdpFixture(); const send = session.send; let resumes = 0;
  session.send = async (method, args) => { if (method === 'Debugger.resume') { resumes++; await new Promise(resolve => setTimeout(resolve, 10)); } return send(method, args); };
  const original = Error('scenario stopped');
  await assert.rejects(withCaughtLoginExceptions(page, { clientError() {} }, 'admin', async () => {
    void session.caught('PRIVATE'); throw original;
  }), error => error === original);
  assert.equal(resumes, 1); assert.equal(session.calls.at(-1)[0], 'detach');
});
test('observer exposes only its FIRST fixed failure operation even when later cleanup also fails', async () => {
  const { withCaughtLoginExceptions } = require('../../scripts/local-qa/caught-login-exceptions.cjs');
  const { diagnostics } = require('../../scripts/local-qa/browser-diagnostics.cjs');
  const { page, session } = cdpFixture('Debugger.enable');
  session.detach = async () => { session.calls.push(['detach']); throw Error('PRIVATE later cleanup detail'); };
  await assert.rejects(withCaughtLoginExceptions(page, { clientError() {} }, 'admin', async () => assert.fail('no action after setup failure')), error => {
    assert.equal(error.operation, 'enable');
    const result = diagnostics().snapshot(error);
    assert.equal(result.observerFailureOperation, 'enable'); assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
    return true;
  });
  assert.equal(session.calls.at(-1)[0], 'detach');
  await assert.rejects(withCaughtLoginExceptions({ context: () => ({ newCDPSession: async () => { throw Error('PRIVATE attach failure'); } }) }, { clientError() {} }, 'admin', async () => assert.fail('no action after attach failure')), error => error.operation === 'attach' && !error.message.includes('PRIVATE'));
  const d = diagnostics();
  assert.equal(d.snapshot({ name: 'QaObserverError', operation: 'PRIVATE' }).observerFailureOperation, null);
});

test('first-click gate delays ONLY same-origin Next scripts and falls back through the original HTTP frontier', async () => {
  const { isPageScript, installScriptGate } = require('../../scripts/local-qa/login-first-click-proof.cjs');
  const request = (url, type = 'script') => ({ url: () => url, resourceType: () => type });
  assert.equal(isPageScript(request('http://127.0.0.1:3100/_next/static/chunks/app/admin-login/page.js?PRIVATE')), true);
  for (const input of [request('https://production.example/_next/a.js'), request('http://PRIVATE@127.0.0.1:3100/_next/a.js'), request('http://127.0.0.1:9099/_next/a.js'), request('http://127.0.0.1:3100/private.js'), request('http://127.0.0.1:3100/_next/a.js', 'fetch')]) assert.equal(isPageScript(input), false);
  let handler, continued = 0, denied = 0;
  const gate = await installScriptGate({ route: async (pattern, callback) => { assert.equal(pattern, '**/*'); handler = callback; } });
  const route = input => ({ request: () => input, fallback: async () => { if (allowedRequest(input.url())) continued++; else denied++; }, continue() { assert.fail('must not bypass frontier'); } });
  const pending = handler(route(request('http://127.0.0.1:3100/_next/page.js')));
  assert.equal(gate.heldCount(), 1); assert.equal(continued, 0);
  await handler(route(request('https://production.example/_next/page.js'))); assert.equal(denied, 1);
  gate.release(); await pending; assert.equal(continued, 1); assert.equal(gate.failed(), false);
  gate.stop(); gate.release();
});
function firstClickLifecycleFixture({ enabled = true, missingSSR = false, noGate = false, closeFailure = false, stalledClose = false, fallbackFailure = false, stalledFallback = false, scriptFailure = false } = {}) {
  const routes = [], events = {}; let pending, released = false, changed = false, clicks = 0, closed = false, guarded = 0;
  const request = { url: () => 'http://127.0.0.1:3100/_next/static/chunks/app/admin-login/page.js?PRIVATE', resourceType: () => 'script' };
  const control = mode => ({ waitFor: async () => { if (missingSSR || (mode === 'firebase' && !changed)) throw Object.assign(Error('PRIVATE lifecycle fixture'), { name: 'TimeoutError' }); },
    isEnabled: async () => enabled, click: async () => { clicks++; if (released) changed = true; } });
  const page = { setDefaultTimeout: value => assert.equal(value, 20000), on(name, callback) { events[name] = callback; },
    goto: async (url, options) => { assert.equal(url, 'http://127.0.0.1:3100/admin-login'); assert.deepEqual(options, { waitUntil: 'commit' });
      if (!noGate) pending = routes[1]({ request: () => request, fallback: async () => { released = true; if (fallbackFailure) throw Error('PRIVATE fallback failure'); if (stalledFallback) await new Promise(() => {}); await routes[0]({ request: () => request, continue: () => { guarded++; }, abort: () => assert.fail('allowed script must remain allowed') }); } });
      return { status: () => 200 }; },
    waitForLoadState: async state => { assert.equal(state, 'load'); if (!stalledFallback) await pending; if (scriptFailure) events.requestfailed(request); },
    locator: selector => { assert.equal(selector, 'form'); return control('ssr'); },
    getByRole: (role, options) => control(role === 'button' && options.name === 'Log ind med Opsfly' ? 'firebase' : 'ssr'),
    getByLabel: (_label, options) => { assert.equal(options.exact, true); return control('firebase'); },
  };
  const context = { route: async (_pattern, fn) => routes.push(fn), unroute: async (pattern, fn) => { assert.equal(pattern, '**/*'); assert.equal(fn, routes[1]); }, routeWebSocket: async () => {}, newPage: async () => page,
    close: async () => { closed = true; if (stalledClose) await new Promise(() => {}); if (!stalledFallback) await pending; if (closeFailure) throw Error('PRIVATE close failure'); } };
  return { browser: { newContext: async options => { assert.equal(options.serviceWorkers, 'block'); return context; } }, state: () => ({ clicks, closed, guarded }) };
}
test('first-click lifecycle fixtures preserve ONE click, release gates on failure and never replace actual Next evidence', async () => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const { runLoginFirstClickProof } = require('../../scripts/local-qa/login-first-click-proof.cjs');
  for (const [options, outcome, clicks] of [[{ enabled: true }, 'lost-first-enabled-click', 1], [{ enabled: false }, 'passed', 1],
    [{ missingSSR: true }, 'missing-ssr-prerequisite', 0], [{ noGate: true }, 'missing-script-gate-prerequisite', 0], [{ enabled: false, closeFailure: true }, 'cleanup-failed', 1], [{ enabled: false, scriptFailure: true }, 'script-runtime-failed', 0]]) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa0-first-click-unit-')), fixture = firstClickLifecycleFixture(options);
    try {
      if (outcome === 'passed') await runLoginFirstClickProof(fixture.browser, dir);
      else await assert.rejects(runLoginFirstClickProof(fixture.browser, dir), /QA0 real first enabled login click proof failed/);
      const proof = JSON.parse(fs.readFileSync(path.join(dir, 'local-qa-first-click.json'), 'utf8'));
      assert.equal(proof.outcome, outcome); assert.equal(proof.clickCount, clicks); assert.equal(fixture.state().clicks, clicks);
      assert.equal(fixture.state().closed, true); assert.equal(proof.productionAcceptance, false); assert.equal(JSON.stringify(proof).includes('PRIVATE'), false);
      if (!options.noGate) { assert.equal(proof.scriptsReleased, true); assert.equal(fixture.state().guarded, 1); }
      assert.equal(proof.cleanupVerified, !options.closeFailure);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
});

test('first-click cleanup bounds stalled/throwing routes and context close, and attempts close after drain failure', async () => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const { runLoginFirstClickProof } = require('../../scripts/local-qa/login-first-click-proof.cjs');
  for (const options of [{ missingSSR: true, fallbackFailure: true }, { missingSSR: true, stalledFallback: true }, { missingSSR: true, stalledClose: true }]) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa0-first-click-cleanup-')), fixture = firstClickLifecycleFixture(options);
    try {
      await assert.rejects(runLoginFirstClickProof(fixture.browser, dir), /QA0 real first enabled login click proof failed/);
      const proof = JSON.parse(fs.readFileSync(path.join(dir, 'local-qa-first-click.json'), 'utf8'));
      assert.equal(proof.outcome, 'cleanup-failed'); assert.equal(proof.cleanupVerified, false);
      assert.equal(proof.scriptsReleased, true); assert.equal(fixture.state().closed, true); assert.equal(proof.clickCount, 0);
      assert.equal(JSON.stringify(proof).includes('PRIVATE'), false);
    } finally { fs.rmSync(dir, { recursive:true, force:true }); }
  }
});

function loadActualLoginForReadiness(react = require('react')) {
  const fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = { exports: {} }; cache.set(filename, mod);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    } }).outputText;
    new Function('require', 'module', 'exports', code)(name => {
      if (name === 'react') return react;
      if (name === 'next/navigation') return { useSearchParams: () => new URLSearchParams() };
      if (name.startsWith('@/')) {
        const base = path.resolve('src', name.slice(2));
        const target = [base + '.tsx', base + '.ts'].find(file => fs.existsSync(file));
        assert.ok(target, 'actual UI dependency must resolve'); return load(target);
      }
      return require(name);
    }, mod, mod.exports);
    return mod.exports;
  }
  return load('src/app/admin-login/page.tsx').default;
}
test('actual login SSR and actual UI primitives disable both fields, submit and mode switch before client readiness', () => {
  const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
  const Login = loadActualLoginForReadiness();
  const html = renderToStaticMarkup(React.createElement(Login));
  const controls = html.match(/<(?:input|button)\b[^>]*>/g);
  assert.equal(controls.length, 4);
  for (const control of controls) assert.match(control, /\bdisabled=""/, 'SSR interactive control must not accept premature input');
});
test('actual login submit guard rejects a not-ready programmatic submission before reading form data or native auth', async () => {
  const React = require('react');
  const Login = loadActualLoginForReadiness({ ...React, useState: initial => [initial, () => {}], useEffect() {} });
  const wrapper = Login(), tree = wrapper.props.children.type();
  const findForm = element => {
    if (!element || typeof element !== 'object') return null;
    if (element.type === 'form') return element;
    for (const child of React.Children.toArray(element.props?.children)) { const found = findForm(child); if (found) return found; }
    return null;
  };
  let prevented = 0;
  await findForm(tree).props.onSubmit({ preventDefault: () => { prevented++; }, get currentTarget() { assert.fail('not-ready submit must not read credentials or start auth'); } });
  assert.equal(prevented, 1);
});

test('observer drains an in-flight explicit resume acknowledgement before detaching', async () => {
  const { withCaughtLoginExceptions } = require('../../scripts/local-qa/caught-login-exceptions.cjs');
  const { page, session } = cdpFixture(), send = session.send, order = [];
  let vmStopped = true;
  session.send = async (method, args) => {
    if (method === 'Debugger.resume') {
      // Model an asynchronous native protocol acknowledgement, not a timing sleep.
      await new Promise(resolve => setImmediate(resolve));
      const value = await send(method, args); vmStopped = false; order.push('resume-ack'); return value;
    }
    return send(method, args);
  };
  const detach = session.detach;
  session.detach = async () => { order.push('detach-attempt'); assert.equal(vmStopped, false, 'cleanup must not detach a VM still awaiting explicit resume'); return detach(); };
  const result = await withCaughtLoginExceptions(page, { clientError() {} }, 'admin', async () => {
    void session.caught('PRIVATE handled exception'); return 200;
  });
  assert.equal(result, 200); assert.deepEqual(order, ['resume-ack', 'detach-attempt']);
  assert.equal(session.calls.at(-1)[0], 'detach'); assert.equal(session.listenerCount('Debugger.paused'), 0);
});

test('teardown after a successful submit never waits on renderer-bound Debugger commands during app navigation', async () => {
  const { withCaughtLoginExceptions } = require('../../scripts/local-qa/caught-login-exceptions.cjs');
  const { page, session } = cdpFixture(), send = session.send; let navigating = false;
  // Model actual Next DEV behaviour: after session200 the app navigates and the renderer
  // answers Debugger commands only after the route compiles (observed 5.3s locally).
  session.send = (method, args) => navigating && method !== 'Debugger.resume' ? new Promise(() => {}) : send(method, args);
  const result = await withCaughtLoginExceptions(page, { clientError() {} }, 'admin', async () => { navigating = true; return 200; });
  assert.equal(result, 200);
  assert.equal(session.calls.at(-1)[0], 'detach'); assert.equal(session.listenerCount('Debugger.paused'), 0);
});
