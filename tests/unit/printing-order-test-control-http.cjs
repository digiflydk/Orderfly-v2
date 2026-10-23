const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const authority = loadTs('src/lib/access/authority.ts', { 'server-only': {} });
const { orderTestScopeSchema } = loadTs('src/lib/printing/order-test-schema.ts');
const scope = { brandId: 'b', locationId: 'l', printerId: 'p', printerRevision: 1, credentialRevision: 1 };
function fixture() {
  const calls = [], options = {};
  class OrdinaryOutputPolicyError extends Error { constructor(code) { super(code); this.code = code; } }
  const api = loadTs('src/lib/printing/order-test-control-http.ts', { 'server-only': {},
    '@/lib/access/authority': authority,
    '@/lib/access/orderfly-session': { requirePlatformSuperuser: async () => { if (options.denied) throw new authority.AuthorityError('unauthorized', 401); } },
    '@/lib/url': { getOrigin: async () => 'https://orderfly.dk' },
    './ordinary-output-policy': { orderTestScopeSchema, OrdinaryOutputPolicyError, controlOrderTestWindow: async input => {
      calls.push(input); if (options.failure) throw new Error('PRIVATE'); return { ...scope, state: 'active', expiresAt: 100, enabled: true, unattendedAuthorized: false };
    } },
  });
  const request = async (method, { query = '', origin = 'https://orderfly.dk', body, headers = {} } = {}) => {
    const res = await api.handleOrderTestControl(new Request(`https://orderfly.dk/api/superadmin/printers/order-test${query}`, {
      method, headers: { origin, 'content-type': 'application/json', ...headers },
      ...(method !== 'GET' ? { body: typeof body === 'string' ? body : JSON.stringify(body ?? { ...scope, operation: 'stop' }) } : {}),
    }));
    return { status: res.status, body: await res.json(), cache: res.headers.get('cache-control') };
  };
  return { calls, options, request };
}
const query = '?brandId=b&locationId=l&printerId=p&printerRevision=1&credentialRevision=1';
test('admin read maps exact query to scope and never dispatches mutation; POST same-origin control is no-store', async () => {
  const f = fixture(); const read = await f.request('GET', { query }); assert.equal(read.status, 200); assert.equal(read.cache, 'no-store');
  assert.deepEqual(f.calls[0], { ...scope, operation: 'read' });
  assert.equal((await f.request('POST')).status, 200); assert.deepEqual(f.calls[1], { ...scope, operation: 'stop' });
});
test('auth, origin, duplicate/unknown query, invalid revisions and bounded JSON are enforced before service', async () => {
  const f = fixture(); f.options.denied = true; assert.equal((await f.request('GET', { query })).status, 401); f.options.denied = false;
  assert.equal((await f.request('POST', { origin: 'https://evil.example' })).status, 403);
  assert.equal((await f.request('POST', { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
  for (const invalid of [query + '&printerId=p', query.replace('printerRevision=1', 'printerRevision=1e0'), query.replace('printerId=p', 'unknown=p')]) {
    assert.equal((await f.request('GET', { query: invalid })).status, 400);
  }
  assert.equal((await f.request('POST', { body: 'x'.repeat(4097) })).status, 400);
  assert.equal((await f.request('POST', { body: { ...scope, operation: 'read' } })).status, 400);
  assert.equal(f.calls.length, 0);
});
test('provider failures never expose arbitrary exception text', async () => {
  const f = fixture(); f.options.failure = true; const result = await f.request('GET', { query });
  assert.equal(result.status, 503); assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
});
