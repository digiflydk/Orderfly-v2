const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { loadTs } = require('../helpers/load-ts.cjs');
const { AuthorityError } = loadTs('src/lib/access/authority.ts', { 'server-only': {} });
const opsfly = loadTs('src/lib/access/opsfly-login.ts', { 'server-only': {}, './authority': { AuthorityError } });

function identityFixture({ cookie = 'synthetic-cookie', verify = async () => ({ uid: 'fixture-user' }), initError } = {}) {
  const session = loadTs('src/lib/access/orderfly-session.ts', {
    'server-only': {}, './authority': { AuthorityError }, './opsfly-login': opsfly,
    'next/headers': { cookies: async () => ({ get: () => cookie ? { value: cookie } : undefined }) },
    '@/lib/firebase-admin': { getAdminApp: () => {
      if (initError) throw initError;
      return { auth: () => ({ verifySessionCookie: async (value, revocation) => {
        assert.equal(revocation, true); return verify(value);
      } }) };
    } },
  });
  return session.verifiedOrderflyIdentity;
}

test('real identity helper keeps absent, expired, revoked, disabled and malformed Firebase cookies at 401', async () => {
  await assert.rejects(identityFixture({ cookie: null })(), error => error.status === 401);
  for (const code of ['auth/session-cookie-expired', 'auth/session-cookie-revoked', 'auth/user-disabled', 'auth/user-not-found']) {
    await assert.rejects(identityFixture({ verify: async () => { throw Object.assign(Error('PRIVATE_SENTINEL'), { code }); } })(),
      error => error.status === 401 && error.code === 'unauthorized' && !error.message.includes('PRIVATE_SENTINEL'));
  }
  for (const message of ['Decoding Firebase session cookie failed. PRIVATE_SENTINEL',
    'Firebase session cookie has invalid signature. PRIVATE_SENTINEL', 'verifySessionCookie() expects a session cookie']) {
    await assert.rejects(identityFixture({ verify: async () => { throw Object.assign(Error(message), { code: 'auth/argument-error' }); } })(), error => error.status === 401);
  }
  assert.deepEqual(await identityFixture()(), { provider: 'firebase', subject: 'fixture-user' });
});

test('real installed Firebase SDK rejects malformed cookies without requiring a network call', async () => {
  const { initializeApp, deleteApp } = require('firebase-admin/app');
  const { getAuth } = require('firebase-admin/auth');
  const app = initializeApp({ projectId: 'demo-orderfly-printing' }, randomUUID());
  try {
    await assert.rejects(identityFixture({ cookie: 'not-a-jwt', verify: value => getAuth(app).verifySessionCookie(value, true) })(),
      error => error.status === 401 && error.code === 'unauthorized');
  } finally { await deleteApp(app); }
});

test('Firebase initialization, network and certificate-fetch errors stay unavailable through the real helper', async () => {
  await assert.rejects(identityFixture({ initError: Error('PRIVATE_SENTINEL') })(), error => error.status === 503 && error.code === 'identity_unavailable');
  for (const failure of [Error('PRIVATE_SENTINEL'),
    Object.assign(Error('PRIVATE_SENTINEL'), { code: 'app/network-error' }),
    Object.assign(Error('PRIVATE_SENTINEL'), { code: 'auth/internal-error' }),
    Object.assign(Error('Error fetching public keys for Google certs: PRIVATE_SENTINEL'), { code: 'auth/argument-error' }),
    Object.assign(Error('Error while making request: PRIVATE_SENTINEL'), { code: 'auth/argument-error' })]) {
    await assert.rejects(identityFixture({ verify: async () => { throw failure; } })(),
      error => error.status === 503 && error.code === 'identity_unavailable' && !error.message.includes('PRIVATE_SENTINEL'));
  }
});

test('real Opsfly cookie/HTTP verification distinguishes rejected sessions from infrastructure outages', async () => {
  const originalFetch = global.fetch, previousSecret = process.env.MPANEL_PLATFORM_ADMIN_SECRET;
  process.env.MPANEL_PLATFORM_ADMIN_SECRET = 'synthetic-printing-identity-test-secret-only';
  const cookie = opsfly.createOpsflyCookie('a'.repeat(64), new Date(Date.now() + 3600000).toISOString()).value;
  const identity = { provider: 'opsfly', organizationId: '11111111-1111-4111-8111-111111111111', subject: '22222222-2222-4222-8222-222222222222' };
  try {
    for (const status of [400, 401, 403, 404, 405, 408, 429, 500, 503]) {
      global.fetch = async () => Response.json({ error: 'PRIVATE_SENTINEL' }, { status });
      await assert.rejects(identityFixture({ cookie })(), error => error.status === ([401, 403].includes(status) ? 401 : 503)
        && !error.message.includes('PRIVATE_SENTINEL'));
    }
    global.fetch = async () => { throw Error('PRIVATE_SENTINEL'); };
    await assert.rejects(identityFixture({ cookie })(), error => error.status === 503);
    global.fetch = async () => Response.json({ identity, expires_at: new Date(Date.now() + 3600000).toISOString() });
    assert.deepEqual(await identityFixture({ cookie })(), identity);
    await assert.rejects(identityFixture({ cookie: cookie + '.tampered' })(), error => error.status === 401);
    delete process.env.MPANEL_PLATFORM_ADMIN_SECRET;
    await assert.rejects(identityFixture({ cookie })(), error => error.status === 503);
  } finally {
    global.fetch = originalFetch;
    if (previousSecret === undefined) delete process.env.MPANEL_PLATFORM_ADMIN_SECRET;
    else process.env.MPANEL_PLATFORM_ADMIN_SECRET = previousSecret;
  }
});

test('actual identity-service outage reaches the printer route as a generic 503', async () => {
  const verifyIdentity = identityFixture({ initError: Error('PRIVATE_SENTINEL') });
  const { GET } = loadTs('src/app/api/merchant/printers/route.ts', {
    'server-only': {}, '@/lib/access/authority': { AuthorityError },
    '@/lib/access/orderfly-session': { verifiedOrderflyIdentity: verifyIdentity },
    '@/lib/printing/reads': { PrinterReadError: class extends Error {}, readPrinterConfigurations: async () => { throw Error('Must not read'); } },
  });
  const response = await GET(new Request('https://orderfly.dk/api/merchant/printers?brandId=b&locationId=l'));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { error: 'printers_unavailable' });
});
