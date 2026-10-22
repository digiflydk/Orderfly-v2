const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const authority = loadTs('src/lib/access/authority.ts', { 'server-only': {} });
const schema = loadTs('src/lib/receipts/settings-server.ts', { 'server-only': {} });
const { DEFAULT_RECEIPT_SETTINGS: settings } = loadTs('src/lib/receipts/settings.ts');
const command = { brandId: 'brand', expectedRevision: 0, settings };
const result = { brandId: 'brand', revision: 1, settings };
function req(method = 'PUT', options = {}) {
  return new Request(`https://orderfly.dk/api/superadmin/receipts${options.query ?? (method === 'GET' ? '?brandId=brand' : '')}`, {
    method, headers: { origin: 'https://orderfly.dk', 'content-type': 'application/json', ...options.headers },
    ...(method === 'GET' ? {} : { body: options.raw ?? JSON.stringify(options.body ?? command) }),
    ...(options.raw instanceof ReadableStream ? { duplex: 'half' } : {}),
  });
}
function fixture(options = {}) {
  const calls = [], events = [];
  const route = loadTs('src/app/api/superadmin/receipts/route.ts', {
    'server-only': {}, '@/lib/access/authority': authority,
    '@/lib/access/orderfly-session': { async requirePlatformSuperuser() { events.push('auth'); if (options.denied) throw new authority.AuthorityError('PRIVATE auth', options.denied); } },
    '@/lib/url': { getOrigin: async () => 'https://orderfly.dk' },
    './settings-server': { ...schema,
      async readReceiptSettings(brandId) { calls.push(brandId); if (options.error) throw options.error; return options.result ?? result; },
      async writeReceiptSettings(input) { calls.push(input); if (options.error) throw options.error; return options.result ?? result; },
    },
  });
  return { calls, events, async run(request = req(), method = 'PUT') {
    const response = await route[method](request);
    assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(response.headers.get('vary'), 'Cookie');
    return { status: response.status, body: await response.json() };
  }};
}
test('actual route returns strict settings shape for GET and committed PUT', async () => {
  for (const method of ['GET', 'PUT']) { const f = fixture(); assert.deepEqual(await f.run(req(method), method), { status: 200, body: result }); assert.equal(f.calls.length, 1); }
});
test('authentication precedes all request inspection and protects every response', async () => {
  for (const denied of [401, 403]) for (const method of ['GET', 'PUT']) {
    const f = fixture({ denied }); const response = await f.run(new Proxy({}, { get() { throw Error('PRIVATE request'); } }), method);
    assert.equal(response.status, denied); assert.deepEqual(f.events, ['auth']); assert.equal(f.calls.length, 0); assert.doesNotMatch(JSON.stringify(response), /PRIVATE/);
  }
});
test('CSRF and strict URL/JSON validation reject before service', async () => {
  for (const headers of [{ origin: '' }, { origin: 'https://foreign.test' }, { 'sec-fetch-site': 'cross-site' }]) {
    const f = fixture(); assert.equal((await f.run(req('PUT', { headers }))).status, 403); assert.equal(f.calls.length, 0);
  }
  const crossSite = fixture(); assert.equal((await crossSite.run(req('GET', { headers: { 'sec-fetch-site': 'cross-site' } }), 'GET')).status, 403);
  for (const query of ['', '?brandId=brand&brandId=foreign', '?brandId=brand&extra=x', '?brandId=../other']) {
    const f = fixture(); assert.equal((await f.run(req('GET', { query }), 'GET')).status, 400); assert.equal(f.calls.length, 0);
  }
  for (const options of [{ query: '?brandId=brand' }, { raw: '{' }, { raw: Buffer.from([0xff]) }, { headers: { 'content-type': 'text/plain' } }, { body: { ...command, actorId: 'other' } }, { body: { ...command, settings: { ...settings, total: 0 } } }]) {
    const f = fixture(); assert.equal((await f.run(req('PUT', options))).status, 400); assert.equal(f.calls.length, 0);
  }
});
test('streamed body byte bound rejects forged content length and cancels reader', async () => {
  let canceled = false;
  const raw = new ReadableStream({ start(controller) { controller.enqueue(Buffer.from(' '.repeat(8193))); }, cancel() { canceled = true; } });
  const f = fixture(); assert.equal((await f.run(req('PUT', { raw, headers: { 'content-length': '1' } }))).status, 400); assert.equal(canceled, true); assert.equal(f.calls.length, 0);
});
test('conflicts and auth map safely; unknown errors and corrupt/foreign responses fail closed', async () => {
  const conflict = fixture({ error: new schema.ReceiptSettingsError('record_conflict', 409) });
  assert.deepEqual(await conflict.run(), { status: 409, body: { error: 'record_conflict' } });
  for (const method of ['GET', 'PUT']) {
    for (const options of [{ error: Error('PRIVATE driver') }, { result: { ...result, brandId: 'foreign' } }, { result: { ...result, private: 'PRIVATE' } }, { result: { ...result, settings: { ...settings, tax: 0 } } }]) {
      const f = fixture(options); assert.deepEqual(await f.run(req(method), method), { status: 503, body: { error: 'settings_unavailable' } });
    }
  }
  assert.equal((await fixture({ result: { ...result, revision: 4 } }).run()).status, 503);
});
