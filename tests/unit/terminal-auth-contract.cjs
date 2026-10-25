const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTerminalAuthFixture, seedTerminalAdmin } = require('../helpers/terminal-auth-fixture.cjs');
const password = 'test-only-password-1234';
function fixture() {
  const f = createTerminalAuthFixture(); seedTerminalAdmin(f);
  return { f, core: f.load('src/lib/terminal-auth/core.ts'), http: f.load('src/lib/terminal-auth/http.ts') };
}
const request = (path, method, value, options = {}) => new Request(`https://orderfly.dk${path}`, {
  method, headers: { origin: 'https://orderfly.dk', 'content-type': 'application/json', ...options.headers },
  ...(value === undefined ? {} : { body: typeof value === 'string' ? value : JSON.stringify(value) }),
});
async function configure(core) {
  return core.updateTerminalLoginConfig('location', { username: 'location-test', password, enabled: true, expectedRevision: 0 });
}
test('username rename releases only own previous claim and preserves password when omitted', async () => {
  const { f, core } = fixture(); await f.withClock(async () => {
    await configure(core); const originalHash = f.rows.get('terminalCredentials/location').passwordHash;
    const updated = await core.updateTerminalLoginConfig('location', { username: '  Renamed.Test  ', enabled: true, expectedRevision: 1 });
    assert.equal(updated.username, 'renamed.test'); assert.equal(updated.revision, 2);
    assert.equal(f.rows.has('terminalUsernames/' + f.hash('location-test')), false);
    assert.equal(f.rows.get('terminalUsernames/' + f.hash('renamed.test')).locationId, 'location');
    assert.equal(f.rows.get('terminalCredentials/location').passwordHash, originalHash);
    await assert.rejects(core.loginTerminal({ username: 'location-test', password }), e => e.status === 401);
    assert.equal((await core.loginTerminal({ username: 'RENAMED.TEST', password })).session.locationId, 'location');
  });
});
test('credential write failure rolls back username claim, credential revision and audit together', async () => {
  const { f, core } = fixture(); await f.withClock(async () => {
    await configure(core); const before = JSON.stringify([...f.rows]);
    f.options.failCommit = true;
    await assert.rejects(core.updateTerminalLoginConfig('location', { username: 'new-name', password: 'other-test-password-2345', enabled: false, expectedRevision: 1 }));
    assert.equal(JSON.stringify([...f.rows]), before);
  });
});
test('successful login replaces the browser prior durable session rather than orphaning it', async () => {
  const { f, core } = fixture(); await f.withClock(async () => {
    await configure(core); const first = await core.loginTerminal({ username: 'location-test', password });
    f.cookies.set(core.TERMINAL_COOKIE, first.token);
    const second = await core.loginTerminal({ username: 'location-test', password });
    assert.notEqual(first.token, second.token);
    await assert.rejects(core.getTerminalSession(), e => e.status === 401);
    f.cookies.set(core.TERMINAL_COOKIE, second.token);
    assert.equal((await core.getTerminalSession()).locationId, 'location');
    assert.equal(f.rows.get('terminalSessions/' + f.hash(first.token)).revokedAt, f.now);
  });
});
test('session GET is read-only; POST renews400day host-only cookie without exposing token JSON', async () => {
  const { f, core, http } = fixture(); await f.withClock(async () => {
    await configure(core); const login = await http.handleTerminalLogin(request('/api/terminal/auth/login', 'POST', { username: 'location-test', password }));
    assert.equal(login.status, 200); const cookie = login.headers.get('set-cookie');
    assert.match(cookie, /^__Host-orderfly_terminal=[a-f0-9]{64};/);
    assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/); assert.match(cookie, /SameSite=Lax/); assert.match(cookie, /Max-Age=34560000/); assert.equal(cookie.includes('Domain='), false);
    const token = cookie.split(';')[0].split('=')[1]; f.cookies.set(core.TERMINAL_COOKIE, token);
    const json = await login.json(); assert.deepEqual(Object.keys(json).sort(), ['authenticated', 'brandId', 'brandName', 'locationId', 'locationName']);
    const before = JSON.stringify([...f.rows]);
    const read = await http.handleTerminalSession(request('/api/terminal/auth/session', 'GET'));
    assert.equal(read.status, 200); assert.equal(read.headers.get('set-cookie'), null); assert.equal(JSON.stringify([...f.rows]), before);
    const renew = await http.handleTerminalSession(request('/api/terminal/auth/session', 'POST', {}));
    assert.equal(renew.status, 200); assert.equal(renew.headers.get('set-cookie'), cookie); assert.equal(JSON.stringify([...f.rows]), before);
  });
});
test('HTTP rejects cross-site writes, oversized/unknown payloads, query additions and unexpected methods without writes', async () => {
  const { f, http } = fixture(); const before = JSON.stringify([...f.rows]);
  const cases = [
    [request('/api/terminal/auth/login', 'POST', { username: 'location-test', password }, { headers: { origin: 'https://evil.test' } }), 403],
    [request('/api/terminal/auth/login', 'POST', { username: 'location-test', password }, { headers: { 'sec-fetch-site': 'cross-site' } }), 403],
    [request('/api/terminal/auth/login', 'POST', 'x'.repeat(4097)), 400],
    [request('/api/terminal/auth/login', 'POST', { username: 'location-test', password, admin: true }), 400],
    [request('/api/terminal/auth/login?extra=1', 'POST', { username: 'location-test', password }), 400],
    [request('/api/terminal/auth/login', 'GET'), 405],
  ];
  for (const [req, status] of cases) assert.equal((await http.handleTerminalLogin(req)).status, status);
  assert.equal(JSON.stringify([...f.rows]), before);
});
test('logout retry succeeds after missing/revoked cookie and never clears an uncertain durable revoke', async () => {
  const { f, core, http } = fixture(); await f.withClock(async () => {
    const post = () => request('/api/terminal/auth/logout', 'POST', {});
    assert.equal((await http.handleTerminalLogout(post())).status, 200);
    await configure(core); const login = await core.loginTerminal({ username: 'location-test', password }); f.cookies.set(core.TERMINAL_COOKIE, login.token);
    f.options.failCommit = true; const failed = await http.handleTerminalLogout(post()); assert.equal(failed.status, 503); assert.equal(failed.headers.get('set-cookie'), null);
    f.options.failCommit = false; const done = await http.handleTerminalLogout(post()); assert.equal(done.status, 200); assert.match(done.headers.get('set-cookie'), /Max-Age=0/);
    assert.equal((await http.handleTerminalLogout(post())).status, 200);
  });
});
