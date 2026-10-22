const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const crypto = loadTs('src/lib/printing/device-auth.ts', { 'server-only': {} });
const scope = { brandId: 'b1', locationId: 'l1', printerId: 'p1' };
const binding = { ...scope, printerRevision: 3, credentialRevision: 1 };
const printerPath = 'locations/l1/printers/p1', credentialPath = printerPath + '/deviceCredentials/current';
const basic = (secret, username = 'orderfly', scheme = 'Basic', spaces = ' ') => scheme + spaces + Buffer.from(username + ':' + secret, 'utf8').toString('base64');
function fixture() {
  const draft = crypto.createPrinterDeviceCredentialDraft(binding);
  const printer = { schemaVersion: 1, revision: 3, deletedAt: null, configuration: { id: 'p1', brandId: 'b1', locationId: 'l1',
    name: 'Pizza ÆØÅ', manufacturer: 'star', model: 'mc-print3', transport: 'cloudprnt-http', state: 'disabled', paperWidthMm: 80 } };
  const rows = new Map([['brands/b1', { status: 'active' }], ['locations/l1', { brandId: 'b1' }], [printerPath, printer], [credentialPath, draft.record]]);
  const reads = [], writes = [];
  let adminCalls = 0, failure; const failures = new Map();
  const collection = path => ({ doc: id => ({ id, path: `${path}/${id}`, collection: name => collection(`${path}/${id}/${name}`) }) });
  const db = { collection }, transaction = { get: async ref => {
    reads.push(ref.path); if (failure) throw failure;
    if (failures.has(ref.path)) throw failures.get(ref.path);
    const value = rows.get(ref.path); return { exists: value !== undefined, id: ref.id, data: () => value };
  }, create: () => writes.push('create'), set: () => writes.push('set'), update: () => writes.push('update'), delete: () => writes.push('delete') };
  // Only Admin I/O is isolated. loadTs recursively executes the actual adapter,
  // actual native verifier and real credential digest/timingSafeEqual implementation.
  const api = loadTs('src/lib/printing/cloudprnt-http-auth.ts', { 'server-only': {},
    '@/lib/firebase-admin': { getAdminDb: () => { adminCalls++; return db; } } });
  const authorization = basic(draft.secret), context = { db, transaction };
  return { rows, reads, writes, draft, printer, db, transaction, context, api, authorization,
    get adminCalls() { return adminCalls; }, fail(error) { failure = error; }, failOn(path, error) { failures.set(path, error); },
    verify(input = { ...scope, authorization }, caller = context) { return api.verifyCloudPrntHttpDevice(caller, input); } };
}
async function reject(f, input, code = 'invalid_cloudprnt_authorization', context = f.context) {
  await assert.rejects(f.api.verifyCloudPrntHttpDevice(context, input), error => {
    assert.equal(error.code, code); assert.equal(error.message, code);
    const serialized = String(error) + JSON.stringify(error) + error.stack;
    for (const secret of [f.authorization, f.draft.secret, f.draft.record.secretDigest, 'PRIVATE_SENTINEL']) assert.equal(serialized.includes(secret), false);
    return true;
  });
}

test('actual Basic adapter verifies fresh native identity, exact paths and false authority flags without plaintext', async () => {
  const f = fixture();
  assert.deepEqual(Object.keys(f.api).sort(), ['CloudPrntHttpAuthenticationError', 'verifyCloudPrntHttpDevice']);
  for (const state of ['disabled', 'paused', 'active']) {
    f.printer.configuration.state = state;
    const result = await f.verify();
    assert.deepEqual(result, { ...binding, printerState: state, deviceVerifiedForAttempt: true,
      dispatchAuthorized: false, capabilityAuthorized: false, physicalCompatibilityVerified: false });
    assert.equal(Object.isFrozen(result), true);
    for (const secret of [f.authorization, f.draft.secret, f.draft.record.secretDigest]) assert.equal(JSON.stringify(result).includes(secret), false);
  }
  assert.deepEqual(f.reads, Array(3).fill(['brands/b1', 'locations/l1', printerPath, credentialPath]).flat());
  assert.deepEqual(f.writes, []);
});

test('scheme is case-insensitive and one-or-more legal ASCII spaces are accepted within raw bound', async () => {
  const f = fixture();
  for (const scheme of ['Basic', 'basic', 'BASIC', 'bAsIc']) {
    for (const count of [1, 2, 64, 179]) {
      const authorization = basic(f.draft.secret, 'orderfly', scheme, ' '.repeat(count));
      assert.ok(authorization.length <= 256); assert.equal((await f.verify({ ...scope, authorization })).deviceVerifiedForAttempt, true);
    }
  }
  await reject(f, { ...scope, authorization: basic(f.draft.secret, 'orderfly', 'Basic', ' '.repeat(180)) });
  assert.deepEqual(f.writes, []);
});

test('missing, duplicate, combined, malformed and oversized raw headers reject before Admin/native work', async () => {
  const f = fixture(), valid = f.authorization;
  for (const authorization of [undefined, null, [], [valid, valid], { toString() { throw Error('PRIVATE_SENTINEL'); } }, '',
    'x'.repeat(1000000), valid + ', ' + valid, valid + '\n', '\r\n' + valid, valid.replace('Basic ', 'Bearer '),
    valid.replace('Basic ', 'Basic\t'), valid.replace('Basic ', 'Basic\u00a0'), ' ' + valid, valid + ' ', valid.replace('==', '='),
    valid.slice(0, -2), valid + '=', valid.replace('==', '!!'), 'Basic ' + 'A'.repeat(72), 'Basic ' + '*'.repeat(70) + '==',
    valid.replace('Basic', 'Básic'), valid + '\u0000']) {
    await reject(f, { ...scope, authorization });
  }
  assert.equal(f.adminCalls, 0); assert.deepEqual(f.reads, []); assert.deepEqual(f.writes, []);
});

test('canonical Base64 padding, ASCII bytes, fixed case-sensitive username and canonical secret shape are required before native I/O', async () => {
  const f = fixture(), token = f.authorization.slice(6), alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  // Non-zero unused pad bits decode to the same bytes but are not canonical Base64.
  const last = alphabet.indexOf(token[69]);
  await reject(f, { ...scope, authorization: 'Basic ' + token.slice(0, 69) + alphabet[last + 1] + '==' });
  const highBits = Buffer.from('orderfly:' + f.draft.secret); highBits[0] |= 0x80;
  const nul = Buffer.from('orderfly:' + f.draft.secret); nul[12] = 0;
  const del = Buffer.from('orderfly:' + f.draft.secret); del[12] = 0x7f;
  for (const bytes of [highBits, nul, del]) await reject(f, { ...scope, authorization: 'Basic ' + bytes.toString('base64') });
  for (const username of ['Orderfly', 'ORDERFLY', 'printer1', 'orderfly:', '', 'orde\u007ffly']) await reject(f, { ...scope, authorization: basic(f.draft.secret, username) });
  for (const secret of ['', 'x'.repeat(42), 'x'.repeat(44), 'A'.repeat(42) + 'B', ':'.repeat(43), ' '.repeat(43), 'æ'.repeat(43)]) {
    await reject(f, { ...scope, authorization: basic(secret) });
  }
  assert.equal(f.adminCalls, 0); assert.deepEqual(f.reads, []); assert.deepEqual(f.writes, []);
});

test('scope bounds, strict fields and hostile descriptors are rejected before parsing/storage without invoking accessors', async () => {
  const f = fixture();
  for (const input of [null, undefined, [], {}, { ...scope }, { ...scope, authorization: f.authorization, secret: f.draft.secret },
    ...['brandId', 'locationId', 'printerId'].flatMap(key => ['', '../foreign', 'x'.repeat(1000000), null, 1, 'æ'].map(value => ({ ...scope, [key]: value, authorization: f.authorization })))]) await reject(f, input);
  let invoked = false;
  const getter = { ...scope }; Object.defineProperty(getter, 'authorization', { get() { invoked = true; throw Error('PRIVATE_SENTINEL'); }, enumerable: true });
  await reject(f, getter); assert.equal(invoked, false);
  const proxy = new Proxy({}, { ownKeys() { throw Error('PRIVATE_SENTINEL'); } }); await reject(f, proxy);
  assert.equal(f.adminCalls, 0); assert.deepEqual(f.reads, []);
});

test('valid syntax never substitutes for native ownership, current credential, revision or canonical tenant status', async () => {
  for (const [mutate, expectedReads] of [
    [f => f.rows.get('locations/l1').brandId = 'foreign', 2], [f => f.rows.get('brands/b1').status = 'suspended', 2],
    [f => f.rows.delete(credentialPath), 4], [f => f.rows.set(credentialPath, { ...f.draft.record, revokedAt: Date.now() }), 4],
    [f => f.rows.set(credentialPath, { ...f.draft.record, credentialRevision: 2 }), 4],
    [f => f.printer.revision++, 4], [f => f.printer.deletedAt = 1, 4], [f => f.printer.configuration.brandId = 'other', 4],
  ]) {
    const f = fixture(); mutate(f); await reject(f, { ...scope, authorization: f.authorization }, 'device_unverified');
    assert.equal(f.reads.length, expectedReads); if (expectedReads === 2) assert.deepEqual(f.reads, ['brands/b1', 'locations/l1']); assert.deepEqual(f.writes, []);
  }
  const f = fixture(), wrong = crypto.createPrinterDeviceCredentialDraft(binding);
  await reject(f, { ...scope, authorization: basic(wrong.secret) }, 'device_unverified');
  await reject(f, { ...scope, printerId: 'foreign', authorization: f.authorization }, 'device_unverified');
  assert.deepEqual(f.writes, []);
});

test('reused SDK transaction rereads rotation/revoke/printer revision and cannot reuse prior identity', async () => {
  const f = fixture(), tx = f.transaction, first = await f.verify();
  const rotated = crypto.createPrinterDeviceCredentialDraft({ ...binding, credentialRevision: 2 }); f.rows.set(credentialPath, rotated.record);
  await reject(f, { ...scope, authorization: f.authorization }, 'device_unverified');
  const nextInput = { ...scope, authorization: basic(rotated.secret) };
  const next = await f.verify(nextInput); assert.equal(next.credentialRevision, 2); assert.equal(first.credentialRevision, 1); assert.notEqual(first, next);
  f.rows.set(credentialPath, { ...rotated.record, revokedAt: Date.now() }); await reject(f, nextInput, 'device_unverified');
  const revised = crypto.createPrinterDeviceCredentialDraft({ ...binding, printerRevision: 4, credentialRevision: 3 });
  f.rows.set(credentialPath, revised.record); await reject(f, { ...scope, authorization: basic(revised.secret) }, 'device_unverified');
  f.printer.revision = 4; assert.equal((await f.verify({ ...scope, authorization: basic(revised.secret) })).printerRevision, 4);
  f.rows.get('locations/l1').brandId = 'reassigned'; await reject(f, { ...scope, authorization: basic(revised.secret) }, 'device_unverified');
  assert.equal(f.transaction, tx); assert.equal(f.reads.length, 26); assert.deepEqual(f.reads.slice(-2), ['brands/b1', 'locations/l1']); assert.deepEqual(f.writes, []);
});

test('untrusted context and Admin/reflection errors return fixed bounded errors without credential or provider leakage', async () => {
  const f = fixture();
  for (const context of [null, {}, { db: {}, transaction: f.transaction }, { db: f.db, transaction: {} }]) await reject(f, { ...scope, authorization: f.authorization }, 'device_unverified', context);
  assert.deepEqual(f.reads, []);
  f.fail(Error('PRIVATE_SENTINEL ' + f.authorization + f.draft.secret)); await reject(f, { ...scope, authorization: f.authorization }, 'device_unavailable');
  const g = fixture(); g.rows.set('brands/b1', new Proxy({}, { getPrototypeOf() { throw Error('PRIVATE_SENTINEL'); } }));
  await reject(g, { ...scope, authorization: g.authorization }, 'device_unavailable');
  assert.deepEqual(f.writes, []); assert.deepEqual(g.writes, []);
});


test('actual adapter rejects foreign native tenant before all printer/private credential reads', async () => {
  const f = fixture();
  f.rows.get('locations/l1').brandId = 'brand_B';
  f.printer.configuration.brandId = 'brand_B';
  const foreign = crypto.createPrinterDeviceCredentialDraft({ ...binding, brandId: 'brand_B' });
  f.rows.set(credentialPath, foreign.record);
  await reject(f, { ...scope, authorization: f.authorization }, 'device_unverified');
  assert.deepEqual(f.reads, ['brands/b1', 'locations/l1']); assert.deepEqual(f.writes, []);
});

test('actual adapter foreign-private provider failure cannot change rejection or expose metadata', async () => {
  const f = fixture(), foreign = crypto.createPrinterDeviceCredentialDraft({ ...binding, brandId: 'brand_B' });
  f.rows.get('locations/l1').brandId = 'brand_B';
  f.printer.configuration.brandId = 'brand_B'; f.printer.configuration.name = 'PRIVATE_FOREIGN_PRINTER';
  f.rows.set(credentialPath, foreign.record);
  f.failOn(printerPath, Error('PRIVATE_FOREIGN_PRINTER ' + foreign.secret));
  f.failOn(credentialPath, Error('PRIVATE_FOREIGN_CREDENTIAL ' + foreign.secret));
  await assert.rejects(f.verify(), error => {
    assert.equal(error.code, 'device_unverified'); assert.equal(error.message, 'device_unverified');
    for (const value of ['PRIVATE_FOREIGN', foreign.secret, foreign.record.secretDigest, f.authorization]) assert.equal((String(error) + JSON.stringify(error) + error.stack).includes(value), false);
    return true;
  });
  assert.deepEqual(f.reads, ['brands/b1', 'locations/l1']); assert.deepEqual(f.writes, []);
});
