const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
class AuthorityError extends Error { constructor(code, status = 403) { super(code); this.status = status; } }
const { createSyntheticTestBonContent } = loadTs('src/lib/printing/job-content.ts', { 'server-only': {} });
const base = 'https://orderfly.test/api/superadmin/receipts/testbon';
function fixture({ rejection, renderer = createSyntheticTestBonContent } = {}) {
  const calls = [];
  const { getTestBonPreview } = loadTs('src/lib/receipts/testbon-http.ts', {
    'server-only': {},
    '@/lib/access/authority': { AuthorityError },
    '@/lib/access/orderfly-session': { requirePlatformSuperuser: async () => { calls.push('auth'); if (rejection) throw rejection; } },
    '@/lib/printing/job-content': { createSyntheticTestBonContent: input => { calls.push(input); return renderer(input); } },
  });
  return { get: getTestBonPreview, calls };
}
function privateResponse(response) {
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('vary'), 'Cookie');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
}

test('testbon preview authenticates before reading even malformed requests and hides denial details', async () => {
  for (const status of [401, 403]) {
    const { get, calls } = fixture({ rejection: new AuthorityError('sensitive authority detail', status) });
    const response = await get({ get url() { throw Error('URL must not be inspected'); } });
    assert.equal(response.status, status); privateResponse(response);
    assert.deepEqual(await response.json(), { error: status === 401 ? 'unauthorized' : 'forbidden' });
    assert.deepEqual(calls, ['auth']);
  }
});

test('all supported profiles return exact canonical synthetic PNG without order or printer authority', async () => {
  for (const [model, paperWidthMm] of [['mc-print2', 58], ['mc-print3', 58], ['mc-print3', 80]]) {
    const { get, calls } = fixture();
    const response = await get(new Request(`${base}?model=${model}&paperWidthMm=${paperWidthMm}`));
    assert.equal(response.status, 200); privateResponse(response);
    assert.equal(response.headers.get('content-type'), 'image/png');
    const binding = { brandId: 'preview', locationId: 'preview', printerId: 'preview', printerRevision: 1, model, paperWidthMm };
    assert.deepEqual(calls, ['auth', binding]);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from(createSyntheticTestBonContent(binding).payloadBase64, 'base64'));
  }
});

test('strict query and method rejection cannot render or enqueue any payload', async () => {
  const queries = ['', '?model=mc-print3', '?paperWidthMm=80', '?model=mc-print2&paperWidthMm=80',
    '?model=mc-print3&paperWidthMm=080', '?model=mc-print3&paperWidthMm=59', '?model=epson&paperWidthMm=80',
    '?model=mc-print3&model=mc-print3&paperWidthMm=80', '?model=mc-print3&paperWidthMm=80&paperWidthMm=80',
    '?model=mc-print3&paperWidthMm=80&orderId=secret', '?model=mc-print3&paperWidthMm=80&brandId=another',
    '?model=mc-print3&paperWidthMm=80&payloadBase64=AAAA'];
  for (const query of queries) {
    const { get, calls } = fixture(); const response = await get(new Request(base + query));
    assert.equal(response.status, 400, query); privateResponse(response);
    assert.deepEqual(await response.json(), { error: 'invalid_request' }); assert.deepEqual(calls, ['auth']);
  }
  for (const method of ['POST', 'PUT', 'DELETE', 'HEAD']) {
    const { get, calls } = fixture();
    assert.equal((await get(new Request(base + '?model=mc-print3&paperWidthMm=80', { method }))).status, 400);
    assert.deepEqual(calls, ['auth']);
  }
});

test('unknown auth or renderer failures are generic noncacheable failures', async () => {
  for (const options of [{ rejection: Error('credential secret') }, { renderer: () => { throw Error('internal payload'); } }]) {
    const { get } = fixture(options);
    const response = await get(new Request(base + '?model=mc-print3&paperWidthMm=80'));
    assert.equal(response.status, 503); privateResponse(response);
    assert.deepEqual(await response.json(), { error: 'preview_unavailable' });
  }
});
