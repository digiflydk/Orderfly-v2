const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const crypto = loadTs('src/lib/printing/device-auth.ts', { 'server-only': {} });
const scope = { brandId: 'b1', locationId: 'l1', printerId: 'p1' };
const binding = { ...scope, printerRevision: 3, credentialRevision: 1 };
const printerPath = 'locations/l1/printers/p1', credentialPath = `${printerPath}/deviceCredentials/current`;
const basic = secret => 'Basic ' + Buffer.from('orderfly:' + secret).toString('base64');
const gate = () => { let release; const promise = new Promise(resolve => { release = resolve; }); return { promise, release }; };
function fixture() {
  const draft = crypto.createPrinterDeviceCredentialDraft(binding);
  const printer = { schemaVersion: 1, revision: 3, deletedAt: null, configuration: { id: 'p1', brandId: 'b1', locationId: 'l1',
    name: 'Pizza ÆØÅ', manufacturer: 'star', model: 'mc-print3', transport: 'cloudprnt-http', state: 'disabled', paperWidthMm: 80 } };
  const rows = new Map([['brands/b1', { status: 'active' }], ['locations/l1', { brandId: 'b1' }], [printerPath, printer], [credentialPath, draft.record]]);
  const reads = [], writes = [], options = []; let adminCalls = 0, attempts = 0, failure, afterAttempt, finish;
  const collection = path => ({ doc: id => ({ id, path: `${path}/${id}`, collection: name => collection(`${path}/${id}/${name}`) }) });
  const transaction = { get: async ref => { reads.push(ref.path); if (failure) throw failure;
    const value = rows.get(ref.path); return { exists: value !== undefined, id: ref.id, data: () => value }; },
    create: () => writes.push('create'), set: () => writes.push('set'), update: () => writes.push('update'), delete: () => writes.push('delete') };
  const db = { collection, runTransaction: async (callback, opts) => {
    options.push(opts); attempts++; await callback(transaction);
    if (afterAttempt) { await afterAttempt(); attempts++; await callback(transaction); }
    if (finish) await finish();
  } };
  // Actual handler, parser, Basic verifier, native verifier and real digest crypto;
  // only native Admin I/O is replaced. No endpoint/browser/emulator proof is claimed.
  const api = loadTs('src/lib/printing/cloudprnt-poll-http.ts', { 'server-only': {},
    '@/lib/firebase-admin': { getAdminDb: () => { adminCalls++; return db; } } });
  const authorization = basic(draft.secret);
  function request(body = JSON.stringify({ statusCode: '200%20OK' }), headers = {}, url = 'https://orderfly.test/internal-poll') {
    return new Request(url, { method: 'POST', body, duplex: 'half', headers: { authorization, 'content-type': 'application/json', ...headers } });
  }
  return { api, draft, printer, rows, reads, writes, options, authorization, transaction,
    request, get adminCalls() { return adminCalls; }, get attempts() { return attempts; },
    fail(error) { failure = error; }, retry(callback) { afterAttempt = callback; }, finish(callback) { finish = callback; },
    run(req = request(), target = scope) { return api.handleCloudPrntPollHttp(req, target); } };
}
async function result(f, request, status, expected = status === 200 ? { jobReady: false } : undefined, target) {
  const response = await f.run(request, target); assert.equal(response.status, status);
  const body = await response.json(); if (expected) assert.deepEqual(body, expected);
  assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(response.headers.get('vary'), 'Authorization');
  if (status === 401) assert.match(response.headers.get('www-authenticate'), /^Basic realm=/);
  for (const secret of [f.authorization, f.draft.secret, f.draft.record.secretDigest, 'PRIVATE_SENTINEL']) assert.equal(JSON.stringify(body).includes(secret), false);
  assert.deepEqual(f.writes, []); return body;
}

test('actual authenticated valid polls return only no-job for all states, status/progress/token combinations', async () => {
  const f = fixture(); assert.deepEqual(Object.keys(f.api), ['handleCloudPrntPollHttp']);
  for (const state of ['disabled', 'paused', 'active']) for (const statusCode of ['200%20OK', '220%20Busy', '500%20Error']) {
    f.printer.configuration.state = state;
    const body = JSON.stringify({ statusCode, printingInProgress: false, jobToken: 'PRIVATE_SENTINEL', printerMAC: '00:11:22:33:44:55', uniqueID: 'PRIVATE_SENTINEL', extension: { ignored: true } });
    await result(f, f.request(body), 200);
  }
  assert.equal(f.attempts, 9); assert.deepEqual(f.options, Array(9).fill({ readOnly: true }));
  assert.deepEqual(f.reads, Array(9).fill(['brands/b1', 'locations/l1', printerPath, credentialPath]).flat());
});

test('exact byte limit and split UTF8 use real streaming parser without trusting Content-Length', async () => {
  const f = fixture(); const raw = JSON.stringify({ statusCode: '200', extension: 'æøå' });
  const bytes = new TextEncoder().encode(raw); let offset = 0;
  const stream = new ReadableStream({ pull(controller) { if (offset === bytes.length) return controller.close(); controller.enqueue(bytes.slice(offset, ++offset)); } });
  await result(f, f.request(stream, { 'content-length': String(bytes.length) }), 200);
  const prefix = '{"statusCode":"200","ignored":"', suffix = '"}';
  const exact = prefix + 'x'.repeat(8192 - prefix.length - suffix.length) + suffix;
  assert.equal(Buffer.byteLength(exact), 8192); await result(f, f.request(exact), 200);
  const g = fixture(); let cancelled = false;
  const oversized = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(8193)); }, cancel() { cancelled = true; return new Promise(() => {}); } });
  await result(g, g.request(oversized), 400); assert.equal(cancelled, true); assert.equal(g.adminCalls, 0);
  await result(g, g.request(exact + ' '), 400); await result(g, g.request(raw, { 'content-length': '1' }), 400); assert.equal(g.adminCalls, 0);
});

test('invalid media, compressed/combined headers, declared lengths and URLs reject before native I/O', async () => {
  const f = fixture();
  for (const headers of [{ 'content-type': 'text/plain' }, { 'content-type': 'application/json, application/json' },
    { 'content-type': 'application/json; charset=latin1' }, { 'content-encoding': 'gzip' }, { 'content-encoding': 'identity, identity' },
    ...['8193', '10000', '-1', '01', '1, 1', 'x'.repeat(100)].map(x => ({ 'content-length': x }))]) await result(f, f.request('{}', headers), 400);
  for (const url of ['http://orderfly.test/poll', 'https://orderfly.test/poll?printerId=foreign', 'https://orderfly.test/poll#x']) await result(f, f.request('{}', {}, url), 400);
  await result(f, new Request('https://orderfly.test/poll', { method: 'GET' }), 405);
  assert.equal(f.adminCalls, 0); assert.deepEqual(f.reads, []);
});

test('missing/combined/oversized authorization fails with fixed challenge before consuming body or native I/O', async () => {
  const f = fixture();
  for (const authorization of ['', 'Bearer secret', f.authorization + ', ' + f.authorization, 'Basic ' + 'x'.repeat(100000)]) {
    let consumed = false;
    const req = { method: 'POST', url: 'https://orderfly.test/poll', headers: new Headers({ authorization }), get body() { consumed = true; throw Error('PRIVATE_SENTINEL'); } };
    await result(f, req, 401, { error: 'device_unverified' }); assert.equal(consumed, false);
  }
  assert.equal(f.adminCalls, 0); assert.deepEqual(f.reads, []);
});

test('malformed JSON/status/progress, truncated UTF8, stream errors and absent/used body reject without native calls', async () => {
  const f = fixture();
  for (const body of ['', 'null', '[]', '{}', '{"statusCode":"%GG"}', '{"statusCode":"200","printingInProgress":"false"}', '{bad']) await result(f, f.request(body), 400);
  for (const bytes of [new Uint8Array([0xff]), new Uint8Array([0xe2, 0x82])]) await result(f, f.request(bytes), 400);
  const errorStream = new ReadableStream({ start(c) { c.error(Error('PRIVATE_SENTINEL')); } }); await result(f, f.request(errorStream), 400);
  const used = f.request(); await used.text(); await result(f, used, 400);
  await result(f, new Request('https://orderfly.test/poll', { method: 'POST', headers: { authorization: f.authorization, 'content-type': 'application/json' } }), 400);
  assert.equal(f.adminCalls, 0);
});

test('trusted native scope alone supplies identity; unknown/hostile scope never reaches native paths', async () => {
  const f = fixture(); let invoked = false;
  const getter = { ...scope }; Object.defineProperty(getter, 'brandId', { get() { invoked = true; throw Error('PRIVATE_SENTINEL'); } });
  for (const target of [null, {}, [], { ...scope, secret: f.draft.secret }, { ...scope, printerId: '../p1' }, { ...scope, printerId: 'x'.repeat(100000) }, getter,
    new Proxy({}, { getPrototypeOf() { throw Error('PRIVATE_SENTINEL'); } })]) await result(f, f.request(), 400, { error: 'invalid_poll_request' }, target);
  assert.equal(invoked, false); assert.equal(f.adminCalls, 0);
});

test('foreign/suspended scope, revoked/stale credentials and wrong secret preserve actual private read frontier', async () => {
  for (const [mutate, count] of [[f => f.rows.get('locations/l1').brandId = 'other', 2], [f => f.rows.get('brands/b1').status = 'suspended', 2],
    [f => f.rows.set(credentialPath, { ...f.draft.record, revokedAt: Date.now() }), 4], [f => f.printer.revision++, 4], [f => f.rows.delete(credentialPath), 4]]) {
    const f = fixture(); mutate(f); await result(f, f.request(), 401, { error: 'device_unverified' }); assert.equal(f.reads.length, count);
  }
  const f = fixture(), wrong = crypto.createPrinterDeviceCredentialDraft(binding);
  await result(f, f.request(undefined, { authorization: basic(wrong.secret) }), 401);
});

test('canonical Basic checks remain in actual auth module and malformed bytes cannot read private records', async () => {
  for (const transform of [value => {
    const bytes = Buffer.from('orderfly:' + value); bytes[0] |= 0x80; return 'Basic ' + bytes.toString('base64');
  }, value => 'Basic ' + Buffer.from('Orderfly:' + value).toString('base64'), value => {
    const token = basic(value).slice(6), alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    return 'Basic ' + token.slice(0, 69) + alphabet[alphabet.indexOf(token[69]) + 1] + '==';
  }]) {
    const f = fixture(); await result(f, f.request(undefined, { authorization: transform(f.draft.secret) }), 401);
    assert.deepEqual(f.reads, []); assert.deepEqual(f.options, [{ readOnly: true }]);
  }
});

test('SDK retry authenticates again with actual current credential and scope, including reused tx object', async () => {
  const f = fixture(); f.retry(() => f.rows.set(credentialPath, { ...f.draft.record, revokedAt: Date.now() }));
  await result(f, f.request(), 401); assert.equal(f.attempts, 2); assert.equal(f.reads.length, 8);
  const g = fixture(); g.retry(() => g.rows.get('locations/l1').brandId = 'reassigned'); await result(g, g.request(), 401); assert.equal(g.reads.length, 6);
  const h = fixture(); h.retry(() => {}); await result(h, h.request(), 200); assert.equal(h.reads.length, 8); assert.equal(h.attempts, 2);
});

test('response waits for completed native transaction; late failure and provider errors never become success', async () => {
  const f = fixture(), entered = gate(), finish = gate();
  f.finish(async () => { entered.release(); await finish.promise; });
  let returned = false; const pending = f.run().then(r => { returned = true; return r; });
  await entered.promise; assert.equal(returned, false); finish.release(); assert.equal((await pending).status, 200);
  const g = fixture(); g.finish(() => { throw Error('PRIVATE_SENTINEL ' + g.draft.secret); }); await result(g, g.request(), 503, { error: 'poll_unavailable' });
  const h = fixture(); h.fail(new TypeError('PRIVATE_SENTINEL ' + h.authorization)); await result(h, h.request(), 503, { error: 'poll_unavailable' });
});
