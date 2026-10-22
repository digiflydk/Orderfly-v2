const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const credentialCrypto = loadTs('src/lib/printing/device-auth.ts', { 'server-only': {} });

const scope = { brandId: 'b1', locationId: 'l1', printerId: 'p1', secret: 'A'.repeat(43) };
const prefix = 'locations/l1/printers/p1';
const facts = { mac: '00:11:22:33:44:55', uid: 'server-issued-uid', clientFamily: 'cloudprnt', clientVersion: '3.2.1',
  serial: 'SN-123', protocols: ['http', 'mqtt'], encodings: ['utf-8', 'cp437'], mediaTypes: ['image/png'],
  page: { widthDots: 576, dpi: 203 } };

function fixture(options = {}) {
  const rows = new Map(), reads = [], writes = [], auth = [];
  let identity = { ...scope, printerRevision: 3, credentialRevision: 2, printerState: 'active',
    deviceVerifiedForAttempt: true, dispatchAuthorized: false, capabilityAuthorized: false, physicalCompatibilityVerified: false };
  const collection = path => ({ doc: id => ({ id, path: `${path}/${id}`, collection: name => collection(`${path}/${id}/${name}`) }) });
  const db = { collection };
  let requestScope = scope;
  if (options.realNative) {
    const draft = credentialCrypto.createPrinterDeviceCredentialDraft({ brandId: scope.brandId, locationId: scope.locationId,
      printerId: scope.printerId, printerRevision: 3, credentialRevision: 2 });
    requestScope = { ...scope, secret: draft.secret };
    rows.set('brands/b1', { status: 'active' }); rows.set('locations/l1', { brandId: 'b1' });
    rows.set(prefix, { schemaVersion: 1, revision: 3, deletedAt: null, createdAt: {}, updatedAt: {}, configuration: {
      id: 'p1', brandId: 'b1', locationId: 'l1', name: 'Printer ÆØÅ', manufacturer: 'star', model: 'mc-print3',
      transport: 'cloudprnt-http', paperWidthMm: 80, state: 'active' } });
    rows.set(`${prefix}/deviceCredentials/current`, draft.record);
  }
  const api = loadTs('src/lib/printing/protocol-observation-native.ts', {
    'server-only': {}, '@/lib/firebase-admin': { getAdminDb: () => db },
    ...(options.realNative ? {} : { './device-auth-native': { verifyNativePrinterDevice: async (_context, input) => {
      auth.push(structuredClone(input));
      if (input.secret !== scope.secret) throw Error('AUTH');
      return Object.freeze({ ...identity });
    } } }),
  });
  async function run(method, input, transactionOptions = {}) {
    const staged = [];
    const transaction = {
      get: async ref => { assert.equal(staged.length, 0, 'all reads precede writes'); reads.push(ref.path);
        const value = rows.get(ref.path); return { id: ref.id, exists: value !== undefined, data: () => value }; },
      set: (ref, value) => staged.push(['set', ref.path, structuredClone(value)]),
      update: (ref, value) => staged.push(['update', ref.path, structuredClone(value)]),
      create: (ref, value) => staged.push(['create', ref.path, structuredClone(value)]),
    };
    const result = await api[method]({ db, transaction }, input);
    if (transactionOptions.failCommit) throw Error('PRIVATE commit failure');
    if (transactionOptions.discard) return result;
    for (const [operation, path, value] of staged) {
      if (operation === 'create' && rows.has(path)) throw Error('ALREADY_EXISTS');
      if (operation === 'update') rows.set(path, { ...rows.get(path), ...value }); else rows.set(path, value);
      writes.push(path);
    }
    return result;
  }
  return { ...api, rows, reads, writes, auth, run, requestScope,
    setIdentity(value) { identity = { ...identity, ...value }; } };
}
function enabled(fn) { return async () => {
  const previous = process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED;
  process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED = 'true';
  try { await fn(); } finally { if (previous === undefined) delete process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED; else process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED = previous; }
}; }
const rejects = promise => assert.rejects(promise, error => error.code === 'invalid_protocol_observation' && error.message === error.code);

test('real native verifier and credential crypto accept the complete challenge, observation and read chain', enabled(async () => {
  const f = fixture({ realNative: true }), request = f.requestScope;
  const challenge = await f.run('issueNativeProtocolObservationChallenge', request);
  const result = await f.run('persistNativeProtocolObservation', { ...request, nonce: challenge.nonce, facts });
  assert.equal(result.observationRevision, 1); assert.equal(result.dispatchAuthorized, false);
  assert.equal(result.capabilityAuthorized, false); assert.equal(result.physicalCompatibilityVerified, false);
  assert.deepEqual(await f.run('readNativeProtocolObservation', request), result);
  assert.equal(f.reads.filter(path => path === `${prefix}/deviceCredentials/current`).length, 3);
  assert.equal(JSON.stringify([...f.rows]).includes(request.secret), false);
}));

test('real native revocation and foreign scope reject before private observation reads or writes', enabled(async () => {
  for (const mutate of [f => { f.rows.get('locations/l1').brandId = 'foreign'; },
    f => { f.rows.set(`${prefix}/deviceCredentials/current`, { ...f.rows.get(`${prefix}/deviceCredentials/current`), revokedAt: Date.now() }); }]) {
    const f = fixture({ realNative: true }), request = f.requestScope;
    const challenge = await f.run('issueNativeProtocolObservationChallenge', request);
    mutate(f); f.reads.length = 0; const before = structuredClone([...f.rows]), count = f.writes.length;
    await assert.rejects(f.run('persistNativeProtocolObservation', { ...request, nonce: challenge.nonce, facts }),
      error => error.code === 'protocol_observation_unavailable');
    assert.equal(f.reads.some(path => /protocolObservation/.test(path)), false);
    assert.deepEqual([...f.rows], before); assert.equal(f.writes.length, count);
  }
}));

test('future current observations stay unknown and cannot be overwritten by an older server clock', enabled(async () => {
  const f = fixture(), first = await f.run('issueNativeProtocolObservationChallenge', scope);
  await f.run('persistNativeProtocolObservation', { ...scope, nonce: first.nonce, facts });
  f.rows.get(`${prefix}/protocolObservations/current`).recordedAt = Date.now() + 60_000;
  assert.equal(await f.run('readNativeProtocolObservation', scope), null);
  const challenge = await f.run('issueNativeProtocolObservationChallenge', scope);
  const before = structuredClone([...f.rows]), count = f.writes.length;
  await rejects(f.run('persistNativeProtocolObservation', { ...scope, nonce: challenge.nonce, facts }));
  assert.deepEqual([...f.rows], before); assert.equal(f.writes.length, count);
}));

test('oversized records reject before traversing their descriptors', enabled(async () => {
  for (const target of ['scope', 'command', 'facts', 'page']) {
    let visited = false;
    const huge = new Proxy(Object.fromEntries(Array.from({ length: 100 }, (_, n) => ['extra' + n, n])), {
      getOwnPropertyDescriptor() { visited = true; throw Error('PRIVATE unexpected traversal'); },
    });
    const f = fixture();
    const request = { ...scope, nonce: 'B'.repeat(43), facts };
    const input = target === 'scope' ? huge : target === 'command' ? huge
      : { ...request, facts: target === 'facts' ? huge : { ...facts, page: huge } };
    await rejects(f.run(target === 'scope' ? 'issueNativeProtocolObservationChallenge' : 'persistNativeProtocolObservation', input));
    assert.equal(visited, false); assert.equal(f.auth.length, 0); assert.equal(f.writes.length, 0);
  }
}));

test('oversized raw fact strings reject before regex scanning or object reflection', enabled(async () => {
  const originalExec = RegExp.prototype.exec;
  const oversized = {
    mac: 'm'.repeat(18), uid: 'u'.repeat(129), clientFamily: 'f'.repeat(15), clientVersion: 'v'.repeat(33),
    serial: 's'.repeat(65), protocols: 'p'.repeat(6), encodings: 'e'.repeat(33), mediaTypes: 't'.repeat(11),
  };
  const privateText = 'PRIVATE_OVERSIZED_REGEX_SCAN';
  RegExp.prototype.exec = function(value) {
    if (Object.values(oversized).includes(value)) throw Error(privateText);
    return Reflect.apply(originalExec, this, [value]);
  };
  try {
    const variants = [
      { ...facts, mac: oversized.mac }, { ...facts, uid: oversized.uid },
      { ...facts, clientFamily: oversized.clientFamily }, { ...facts, clientVersion: oversized.clientVersion },
      { ...facts, serial: oversized.serial }, { ...facts, protocols: [oversized.protocols] },
      { ...facts, encodings: [oversized.encodings] }, { ...facts, mediaTypes: [oversized.mediaTypes] },
    ];
    for (const invalidFacts of variants) {
      const f = fixture(); const challenge = await f.run('issueNativeProtocolObservationChallenge', scope);
      await assert.rejects(f.run('persistNativeProtocolObservation', { ...scope, nonce: challenge.nonce, facts: invalidFacts }), error => {
        const rendered = String(error) + (error.stack || '') + JSON.stringify(error);
        assert.equal(error.code, 'invalid_protocol_observation');
        assert.equal(rendered.includes(privateText), false);
        return true;
      });
      assert.equal(f.rows.has(`${prefix}/protocolObservations/current`), false);
    }
    const reflection = new Proxy({}, { getPrototypeOf() { throw Error('PRIVATE_FACT_VALUE_REFLECTION'); } });
    const f = fixture(); const challenge = await f.run('issueNativeProtocolObservationChallenge', scope);
    await rejects(f.run('persistNativeProtocolObservation', { ...scope, nonce: challenge.nonce,
      facts: { ...facts, uid: reflection } }));
  } finally {
    RegExp.prototype.exec = originalExec;
  }
}));

test('oversized raw scope strings reject before regex scanning in every exported operation', enabled(async () => {
  const originalExec = RegExp.prototype.exec;
  const oversized = { brandId: 'b'.repeat(129), locationId: 'l'.repeat(129), printerId: 'p'.repeat(129), secret: 'S'.repeat(44) };
  const privateText = 'PRIVATE_OVERSIZED_SCOPE_REGEX_SCAN';
  RegExp.prototype.exec = function(value) {
    if (Object.values(oversized).includes(value)) throw Error(privateText);
    return Reflect.apply(originalExec, this, [value]);
  };
  try {
    for (const [field, value] of Object.entries(oversized)) {
      const invalidScope = { ...scope, [field]: value };
      for (const [method, input] of [
        ['issueNativeProtocolObservationChallenge', invalidScope],
        ['persistNativeProtocolObservation', { ...invalidScope, nonce: 'B'.repeat(43), facts }],
        ['readNativeProtocolObservation', invalidScope],
      ]) {
        const f = fixture();
        await assert.rejects(f.run(method, input), error => {
          const rendered = String(error) + (error.stack || '') + JSON.stringify(error);
          assert.equal(error.code, 'invalid_protocol_observation');
          assert.equal(error.message, error.code);
          assert.equal(rendered.includes(privateText), false);
          return true;
        });
        assert.deepEqual(f.auth, []); assert.deepEqual(f.writes, []);
      }
    }
  } finally {
    RegExp.prototype.exec = originalExec;
  }
}));

test('malformed foreign and clock-invalid prior challenges cannot be replaced', enabled(async () => {
  for (const mutate of [row => { row.brandId = 'foreign'; }, row => { row.printerRevision = 4; },
    row => { row.credentialRevision = 3; }, row => { row.consumedAt = row.expiresAt; },
    row => { row.issuedAt += 60_000; row.expiresAt += 60_000; row.consumedAt = null; }]) {
    const f = fixture(), challenge = await f.run('issueNativeProtocolObservationChallenge', scope);
    await f.run('persistNativeProtocolObservation', { ...scope, nonce: challenge.nonce, facts });
    mutate(f.rows.get(`${prefix}/protocolObservationChallenges/current`));
    const before = structuredClone([...f.rows]), count = f.writes.length;
    await rejects(f.run('issueNativeProtocolObservationChallenge', scope));
    assert.deepEqual([...f.rows], before); assert.equal(f.writes.length, count);
  }
}));

test('duplicate stored facts are unknown and cannot be carried into a later observation revision', enabled(async () => {
  const f = fixture(), first = await f.run('issueNativeProtocolObservationChallenge', scope);
  await f.run('persistNativeProtocolObservation', { ...scope, nonce: first.nonce, facts });
  f.rows.get(`${prefix}/protocolObservations/current`).facts.protocols = ['http', 'http'];
  assert.equal(await f.run('readNativeProtocolObservation', scope), null);
  const challenge = await f.run('issueNativeProtocolObservationChallenge', scope);
  const before = structuredClone([...f.rows]), count = f.writes.length;
  await rejects(f.run('persistNativeProtocolObservation', { ...scope, nonce: challenge.nonce, facts }));
  assert.deepEqual([...f.rows], before); assert.equal(f.writes.length, count);
}));

test('discarded native attempts and commit failures publish no state; retry rereads real revocation', enabled(async () => {
  const f = fixture({ realNative: true }), request = f.requestScope;
  const challenge = await f.run('issueNativeProtocolObservationChallenge', request);
  const input = { ...request, nonce: challenge.nonce, facts }, before = structuredClone([...f.rows]), count = f.writes.length;
  await assert.rejects(f.run('persistNativeProtocolObservation', input, { failCommit: true }), /PRIVATE commit failure/);
  assert.deepEqual([...f.rows], before); assert.equal(f.writes.length, count);
  await f.run('persistNativeProtocolObservation', input, { discard: true });
  assert.deepEqual([...f.rows], before); assert.equal(f.writes.length, count);
  f.rows.set(`${prefix}/deviceCredentials/current`, { ...f.rows.get(`${prefix}/deviceCredentials/current`), revokedAt: Date.now() });
  f.reads.length = 0;
  await assert.rejects(f.run('persistNativeProtocolObservation', input), error => error.code === 'protocol_observation_unavailable');
  assert.equal(f.reads.some(path => /protocolObservation/.test(path)), false);
  assert.equal(f.rows.has(`${prefix}/protocolObservations/current`), false); assert.equal(f.writes.length, count);
}));

test('authenticated nonce is consumed into current projection and immutable audit without authority', enabled(async () => {
  const f = fixture();
  const challenge = await f.run('issueNativeProtocolObservationChallenge', scope);
  assert.match(challenge.nonce, /^[A-Za-z0-9_-]{43}$/); assert.equal(challenge.dispatchAuthorized, false);
  const result = await f.run('persistNativeProtocolObservation', { ...scope, nonce: challenge.nonce, facts });
  assert.equal(result.observationRevision, 1); assert.equal(result.dispatchAuthorized, false);
  assert.equal(result.capabilityAuthorized, false); assert.equal(result.physicalCompatibilityVerified, false);
  assert.equal('nonce' in result, false); assert.equal('nonceDigest' in result, false);
  assert.equal(JSON.stringify(result).includes(scope.secret), false);
  assert.equal(f.storedNativeProtocolObservationSchema.safeParse(f.rows.get(`${prefix}/protocolObservations/current`)).success, true);
  assert.deepEqual(f.rows.get(`${prefix}/protocolObservationAudit/000000000001`), f.rows.get(`${prefix}/protocolObservations/current`));
  const read = await f.run('readNativeProtocolObservation', scope);
  assert.deepEqual(read, result); assert.equal(f.auth.length, 3);
}));

test('new server challenge supersedes current projection by revision without rewriting history', enabled(async () => {
  const f = fixture();
  const first = await f.run('issueNativeProtocolObservationChallenge', scope);
  await f.run('persistNativeProtocolObservation', { ...scope, nonce: first.nonce, facts });
  const audit = structuredClone(f.rows.get(`${prefix}/protocolObservationAudit/000000000001`));
  const second = await f.run('issueNativeProtocolObservationChallenge', scope);
  const result = await f.run('persistNativeProtocolObservation', { ...scope, nonce: second.nonce,
    facts: { ...facts, clientVersion: '3.2.2' } });
  assert.equal(result.observationRevision, 2);
  assert.deepEqual(f.rows.get(`${prefix}/protocolObservationAudit/000000000001`), audit);
  assert.equal(f.rows.get(`${prefix}/protocolObservationAudit/000000000002`).facts.clientVersion, '3.2.2');
}));

test('strict bounded parser rejects unknown, duplicate, placeholder, malformed and oversized data before writes', enabled(async () => {
  const variants = [
    { ...facts, extra: true }, { ...facts, protocols: ['http', 'http'] }, { ...facts, encodings: ['x', 'x'] },
    { ...facts, serial: 'n/a' }, { ...facts, mac: '00:11:22:33:44' }, { ...facts, clientVersion: 'v3' },
    { ...facts, uid: 'x'.repeat(129) }, { ...facts, protocols: ['http', 'mqtt', 'smtp'] },
    { ...facts, page: { widthDots: 999999, dpi: 203 } },
  ];
  for (const invalidFacts of variants) {
    const f = fixture(); const challenge = await f.run('issueNativeProtocolObservationChallenge', scope);
    await rejects(f.run('persistNativeProtocolObservation', { ...scope, nonce: challenge.nonce, facts: invalidFacts }));
    assert.equal(f.rows.has(`${prefix}/protocolObservations/current`), false);
  }
}));

test('request rejects caller time/revisions/private extras and never invokes accessors', async () => {
  const f = fixture();
  for (const input of [{ ...scope, time: 1 }, { ...scope, printerRevision: 3 }, { ...scope, secret: 'x'.repeat(1000000) }])
    await assert.rejects(f.run('issueNativeProtocolObservationChallenge', input));
  let invoked = false; const poison = { ...scope };
  Object.defineProperty(poison, 'secret', { enumerable: true, get() { invoked = true; throw Error('PRIVATE'); } });
  await assert.rejects(f.run('issueNativeProtocolObservationChallenge', poison)); assert.equal(invoked, false);
});

test('throwing reflection traps and revoked proxies stay behind the fixed error boundary', enabled(async () => {
  const privateText = 'PRIVATE_REFLECTION_DETAIL';
  const traps = [
    value => new Proxy(value, { getPrototypeOf() { throw Error(privateText); } }),
    value => new Proxy(value, { ownKeys() { throw Error(privateText); } }),
    value => new Proxy(value, { getOwnPropertyDescriptor() { throw Error(privateText); } }),
    value => { const pair = Proxy.revocable(value, {}); pair.revoke(); return pair.proxy; },
  ];
  const fixed = async promise => assert.rejects(promise, error => {
    const rendered = String(error) + (error.stack || '') + JSON.stringify(error);
    assert.equal(error.code, 'invalid_protocol_observation');
    assert.equal(error.message, error.code);
    assert.equal(rendered.includes(privateText), false);
    return true;
  });
  for (const trap of traps) {
    let f = fixture(); await fixed(f.run('issueNativeProtocolObservationChallenge', trap({ ...scope })));
    f = fixture(); await fixed(f.run('persistNativeProtocolObservation', trap({ ...scope, nonce: 'B'.repeat(43), facts })));
    f = fixture(); await fixed(f.run('persistNativeProtocolObservation', { ...scope, nonce: 'B'.repeat(43), facts: trap({ ...facts }) }));
  }
}));

test('default-off gate performs no authentication or persistence', async () => {
  const previous = process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED;
  try { for (const value of [undefined, 'false', 'TRUE', '1']) {
    if (value === undefined) delete process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED; else process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED = value;
    const f = fixture(); await assert.rejects(f.run('issueNativeProtocolObservationChallenge', scope), error => error.code === 'protocol_observation_unavailable');
    assert.deepEqual(f.auth, []); assert.deepEqual(f.writes, []);
  } } finally { if (previous === undefined) delete process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED; else process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED = previous; }
});

test('nonce replay, foreign nonce, expiry, changed revisions and paused state fail closed', enabled(async () => {
  const f = fixture(), challenge = await f.run('issueNativeProtocolObservationChallenge', scope);
  const request = { ...scope, nonce: challenge.nonce, facts };
  await f.run('persistNativeProtocolObservation', request);
  await rejects(f.run('persistNativeProtocolObservation', request));
  await rejects(f.run('persistNativeProtocolObservation', { ...request, nonce: 'B'.repeat(43) }));

  for (const change of [{ printerRevision: 4 }, { credentialRevision: 3 }, { printerState: 'paused' }]) {
    const g = fixture(), issued = await g.run('issueNativeProtocolObservationChallenge', scope); g.setIdentity(change);
    await rejects(g.run('persistNativeProtocolObservation', { ...scope, nonce: issued.nonce, facts }));
    assert.equal(g.rows.has(`${prefix}/protocolObservations/current`), false);
  }
  const originalNow = Date.now;
  try {
    const g = fixture(), issued = await g.run('issueNativeProtocolObservationChallenge', scope);
    Date.now = () => issued.expiresAt;
    await rejects(g.run('persistNativeProtocolObservation', { ...scope, nonce: issued.nonce, facts }));
  } finally { Date.now = originalNow; }
}));

test('invalid server clocks and malformed legacy/current evidence remain unknown or fail closed', enabled(async () => {
  const originalNow = Date.now;
  try { for (const value of [NaN, Infinity, -1, 0, 8.64e15 + 1]) {
    Date.now = () => value; const f = fixture(); await rejects(f.run('issueNativeProtocolObservationChallenge', scope));
    assert.deepEqual(f.writes, []);
  } } finally { Date.now = originalNow; }
  const f = fixture();
  assert.equal(await f.run('readNativeProtocolObservation', scope), null);
  f.rows.set(`${prefix}/protocolObservations/current`, { schemaVersion: 0, compatible: true });
  assert.equal(await f.run('readNativeProtocolObservation', scope), null);
}));

test('transaction retry reauthenticates and rollback leaves no observation or audit', enabled(async () => {
  const f = fixture(), challenge = await f.run('issueNativeProtocolObservationChallenge', scope);
  const request = { ...scope, nonce: challenge.nonce, facts };
  // First attempt is deliberately discarded, as the SDK does on contention.
  const original = f.rows;
  const snapshot = new Map([...original].map(([key, value]) => [key, structuredClone(value)]));
  await f.run('persistNativeProtocolObservation', request);
  original.clear(); for (const [key, value] of snapshot) original.set(key, value);
  const before = f.auth.length;
  await f.run('persistNativeProtocolObservation', request);
  assert.equal(f.auth.length, before + 1);
  assert.equal(f.rows.has(`${prefix}/protocolObservationAudit/000000000001`), true);
}));
