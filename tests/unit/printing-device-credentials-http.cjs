const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const authority = loadTs('src/lib/access/authority.ts', { 'server-only': {} });
const { PrinterDeviceCredentialWriteError } = loadTs('src/lib/printing/device-credentials-service.ts', { 'server-only': {} });
const secret = Buffer.alloc(32, 7).toString('base64url');
const command = (operation = 'issue', credentialRevision = 0, patch = {}) => ({ operation, brandId: 'brand', locationId: 'location', printerId: 'p1', printerRevision: 1, credentialRevision, ...patch });
function result(c = command(), patch = {}) { const row = { brandId: c.brandId, locationId: c.locationId, printerId: c.printerId,
  printerRevision: c.printerRevision, credentialRevision: c.credentialRevision + 1, revoked: c.operation === 'revoke', dispatchAuthorized: false, activationAuthorized: false, ...patch };
  if (c.operation !== 'revoke') Object.defineProperty(row, 'secret', { value: secret }); return Object.freeze(row); }
function request(body = command(), options = {}) {
  return new Request(`https://orderfly.dk/api/superadmin/printers/device-credentials${options.query || ''}`, {
    method: options.method || 'POST', headers: { origin: 'https://orderfly.dk', 'content-type': 'application/json', ...options.headers },
    body: options.raw === undefined ? JSON.stringify(body) : options.raw, ...(options.raw instanceof ReadableStream ? { duplex: 'half' } : {}),
  });
}
function fixture(options = {}) {
  const calls = [], events = [];
  const route = loadTs('src/app/api/superadmin/printers/device-credentials/route.ts', {
    'server-only': {}, '@/lib/access/authority': authority,
    '@/lib/access/orderfly-session': { requirePlatformSuperuser: async () => { events.push('session'); if (options.denied) throw new authority.AuthorityError('PRIVATE session', options.denied); return { superuser: true }; } },
    '@/lib/url': { getOrigin: async () => { events.push('origin'); return 'https://orderfly.dk'; } },
    './device-credentials-service': { PrinterDeviceCredentialWriteError, writePrinterDeviceCredential: async c => { events.push('service'); calls.push(c); if (options.service) return await options.service(c); return result(c); } },
  });
  return { calls, events, route, async run(req = request()) { const response = await route.POST(req); return { status: response.status, body: await response.json(), cache: response.headers.get('cache-control'), vary: response.headers.get('vary') }; } };
}
const safe = value => { assert.equal(value.cache, 'no-store'); assert.equal(value.vary, 'Cookie'); };

test('actual POST route explicitly projects nonenumerable secret for issue/rotate and omits it for revoke', async () => {
  for (const c of [command(), command('rotate', 1), command('revoke', 2)]) {
    const f = fixture(); assert.equal(f.route.runtime, 'nodejs'); assert.equal(f.route.dynamic, 'force-dynamic'); assert.equal(f.route.GET, undefined);
    const output = await f.run(request(c)); safe(output); assert.equal(output.status, c.operation === 'issue' ? 201 : 200);
    assert.equal(output.body.secret, c.operation === 'revoke' ? undefined : secret); assert.equal(output.body.credentialRevision, c.credentialRevision + 1);
    assert.equal(output.body.dispatchAuthorized, false); assert.equal(output.body.activationAuthorized, false);
    assert.doesNotMatch(JSON.stringify(output.body), /Digest|record|actor|audit/); assert.deepEqual(f.calls, [c]);
    assert.deepEqual(f.events, ['session', 'origin', 'service']);
  }
});
test('session authorization precedes any request inspection and service access', async () => {
  for (const status of [401, 403, 503]) {
    const f = fixture({ denied: status }); const poison = new Proxy({}, { get() { throw Error('PRIVATE inspected request'); } });
    const output = await f.run(poison); safe(output); assert.equal(output.status, status); assert.deepEqual(f.events, ['session']); assert.equal(f.calls.length, 0);
    assert.doesNotMatch(JSON.stringify(output), /PRIVATE/);
  }
});
test('CSRF, origin and strict JSON/query boundaries reject before service', async () => {
  for (const options of [{ headers: { origin: 'https://foreign.test' } }, { headers: { origin: '' } }, { headers: { 'sec-fetch-site': 'cross-site' } }]) {
    const f = fixture(); const output = await f.run(request(command(), options)); safe(output); assert.equal(output.status, 403); assert.equal(f.calls.length, 0);
  }
  for (const options of [{ query: '?secret=PRIVATE' }, { headers: { 'content-type': 'text/plain' } }, { headers: { 'content-type': 'application/json; charset=latin1' } },
    { raw: '{' }, { raw: '' }, { raw: null }, { method: 'PATCH' }, { raw: Buffer.from([0xff]) }]) {
    const f = fixture(); const output = await f.run(request(command(), options)); safe(output); assert.equal(output.status, 400); assert.equal(f.calls.length, 0); assert.doesNotMatch(JSON.stringify(output), /PRIVATE/);
  }
  const good = fixture(); assert.equal((await good.run(request(command(), { headers: { 'content-type': 'application/json; charset=utf-8' } }))).status, 201);
});
test('streamed byte bound covers missing/false Content-Length and cancels oversized streams', async () => {
  for (const headers of [{}, { 'content-length': '1' }]) {
    let canceled = false;
    const stream = new ReadableStream({ start(controller) { controller.enqueue(Buffer.from(' '.repeat(8193))); }, cancel() { canceled = true; } });
    const f = fixture(); const output = await f.run(request(command(), { raw: stream, headers })); safe(output); assert.equal(output.status, 400); assert.equal(f.calls.length, 0); assert.equal(canceled, true);
  }
  const c = command(), bytes = Buffer.from(JSON.stringify(c));
  const stream = new ReadableStream({ start(controller) { controller.enqueue(bytes.subarray(0, 20)); controller.enqueue(bytes.subarray(20)); controller.close(); } });
  const f = fixture(); assert.equal((await f.run(request(c, { raw: stream }))).status, 201); assert.equal(f.calls.length, 1);
});
test('strict commands reject supplied secrets/identity/records, unsafe IDs/revisions and operation mismatches', async () => {
  for (const input of [null, [], {}, { ...command(), secret: 'PRIVATE' }, { ...command(), actorId: 'PRIVATE' }, { ...command(), record: {} },
    command('issue', 1), command('rotate', 0), command('revoke', Number.MAX_SAFE_INTEGER), command('issue', 0, { printerRevision: 0 }), command('issue', 0, { printerId: '../x' }), command('issue', 0, { brandId: 'x'.repeat(129) })]) {
    const f = fixture(); const output = await f.run(request(input)); safe(output); assert.equal(output.status, 400); assert.equal(f.calls.length, 0); assert.doesNotMatch(JSON.stringify(output), /PRIVATE/);
  }
});
test('service native/CAS/gate errors are mapped safely; unknown commit errors return no plaintext', async () => {
  for (const [code, status] of [['invalid_request', 400], ['writes_unavailable', 503], ['not_found', 404], ['record_conflict', 409], ['credentials_unavailable', 503]]) {
    const f = fixture({ service: () => { throw new PrinterDeviceCredentialWriteError(code, status); } });
    const output = await f.run(); safe(output); assert.equal(output.status, status); assert.deepEqual(output.body, { error: code }); assert.equal(f.calls.length, 1);
  }
  const revoked = Proxy.revocable({}, {}); revoked.revoke();
  const accessor = Object.defineProperty(new PrinterDeviceCredentialWriteError('record_conflict', 409), 'code', { get() { throw Error('PRIVATE error getter'); } });
  for (const error of [revoked.proxy, accessor, Error(`PRIVATE ${secret}`), Object.assign(new PrinterDeviceCredentialWriteError('record_conflict', 409), { code: `PRIVATE ${secret}` }), new PrinterDeviceCredentialWriteError('record_conflict', 500)]) {
    const f = fixture({ service: () => { throw error; } }); const output = await f.run(); safe(output); assert.deepEqual(output.body, { error: 'credentials_unavailable' }); assert.equal(output.status, 503); assert.doesNotMatch(JSON.stringify(output), /PRIVATE|BwcHB/);
  }
});
test('unexpected service metadata, foreign scope, digest, secret or reflective result fails closed', async () => {
  for (const output of [null, {}, result(command(), { brandId: 'foreign' }), result(command(), { printerRevision: 2 }), result(command(), { credentialRevision: 2 }),
    result(command(), { revoked: true }), result(command(), { dispatchAuthorized: true }), result(command(), { secretDigest: 'PRIVATE' }),
    { ...result(), secret: 'bad' }, { ...result() }, Object.defineProperty({ ...result() }, 'secret', { get() { throw Error('PRIVATE accessor'); } }), new Proxy({}, { ownKeys() { throw Error('PRIVATE proxy'); } })]) {
    const f = fixture({ service: () => output }); const response = await f.run(); safe(response); assert.equal(response.status, 503); assert.deepEqual(response.body, { error: 'credentials_unavailable' }); assert.equal(f.calls.length, 1);
  }
  const f = fixture({ service: c => ({ ...result(c), secret }) }); const response = await f.run(request(command('revoke', 1))); assert.equal(response.status, 503); assert.deepEqual(response.body, { error: 'credentials_unavailable' });
});
test('actual native service and HTTP boundary deliver secret only after confirmed atomic commit', async () => {
  const { config, record, path, actorId, policy } = require('../helpers/printing-fixture.cjs');
  const p = policy(); p.roles.push({ id: 'owner', name: 'Owner', companyId: null, kind: 'superuser', permissions: [], active: true });
  p.memberships.push({ id: 'owner', principalId: actorId, companyId: null, locationIds: null, roleIds: ['owner'], active: true });
  const rows = new Map([['platformAdminControl/access-v1', p], ['brands/brand', { status: 'active' }], ['locations/location', { brandId: 'brand' }], [path, record()]]);
  let confirm, reached, committed = false; const reachedCommit = new Promise(resolve => reached = resolve), commitGate = new Promise(resolve => confirm = resolve);
  const ref = path => ({ path, id: path.split('/').at(-1), collection: name => ({ doc: id => ref(`${path}/${name}/${id}`) }) });
  const db = { collection: name => ({ doc: id => ref(`${name}/${id}`) }), async runTransaction(run) { const staged = new Map(structuredClone([...rows])); let writing = false;
    const tx = { async get(ref) { assert.equal(writing, false); return { id: ref.id, exists: staged.has(ref.path), data: () => structuredClone(staged.get(ref.path)) }; },
      create(ref, value) { writing = true; assert.equal(staged.has(ref.path), false); staged.set(ref.path, structuredClone(value)); }, set(ref, value) { writing = true; staged.set(ref.path, structuredClone(value)); } };
    const metadata = await run(tx); assert.equal(metadata.secret, undefined); reached(); await commitGate;
    rows.clear(); for (const row of staged) rows.set(...row); committed = true; return metadata;
  }};
  const service = loadTs('src/lib/printing/device-credentials-service.ts', { 'server-only': {}, '@/lib/firebase-admin': { getAdminDb: () => db },
    '@/lib/access/authority': authority, './authority': authority,
    '@/lib/access/orderfly-session': { requirePlatformSuperuser: async () => ({ superuser: true, identity: { provider: 'firebase', subject: 'writer' } }) },
    'firebase-admin/firestore': { FieldValue: { serverTimestamp: () => ({ serverTimestamp: true }) } },
  });
  const f = fixture({ service: c => service.writePrinterDeviceCredential(c) }); const old = process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED; process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED = 'true';
  try { let delivered = false; const response = f.run().then(value => { delivered = true; return value; }); await reachedCommit;
    assert.equal(delivered, false); assert.equal(committed, false); assert.equal(rows.has(`${path}/deviceCredentials/current`), false);
    confirm(); const output = await response; safe(output); assert.equal(output.status, 201); assert.equal(committed, true); assert.equal(output.body.secret.length, 43);
    const crypto = loadTs('src/lib/printing/device-auth.ts', { 'server-only': {} }), saved = rows.get(`${path}/deviceCredentials/current`);
    assert.equal(crypto.comparePrinterDeviceCredentialCandidates(saved, { brandId: 'brand', locationId: 'location', printerId: 'p1', printerRevision: 1, credentialRevision: 1 }, output.body.secret).credentialMatches, true);
    assert.equal(JSON.stringify([...rows]).includes(output.body.secret), false); assert.deepEqual(rows.get(path).configuration, config());
  } finally { if (old === undefined) delete process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED; else process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED = old; }
});
