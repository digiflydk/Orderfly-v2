const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { createPrinterDeviceCredentialDraft: create, comparePrinterDeviceCredentialCandidates: compare } = loadTs('src/lib/printing/device-auth.ts', { 'server-only': {} });
const scope = Object.freeze({ brandId: 'brand_A', locationId: 'location_A', printerId: 'printer_A', printerRevision: 3, credentialRevision: 1 });
const denied = { credentialMatches: false, authenticationAuthorized: false, dispatchAuthorized: false };

test('private credential drafts use independent random 256-bit secrets, bound digest-only records and no output authority', () => {
  const a = create(scope), b = create(scope);
  assert.notEqual(a.secret, b.secret); assert.match(a.secret, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(Buffer.from(a.secret, 'base64url').length, 32);
  assert.match(a.record.secretDigest, /^[a-f0-9]{64}$/); assert.notEqual(a.record.secretDigest, b.record.secretDigest);
  assert.deepEqual(compare(a.record, scope, a.secret), { credentialMatches: true, authenticationAuthorized: false, dispatchAuthorized: false });
  assert.deepEqual(compare(a.record, scope, b.secret), denied);
  assert.equal(Object.isFrozen(a), true); assert.equal(Object.isFrozen(a.record), true);
  assert.equal(Object.getOwnPropertyDescriptor(a, 'secret').enumerable, false);
  assert.equal(JSON.stringify(a).includes(a.secret), false); assert.equal(JSON.stringify(a.record).includes(a.secret), false);
  assert.equal(Object.hasOwn(a.record, 'secret'), false);
  assert.deepEqual(compare(JSON.parse(JSON.stringify(a.record)), { ...scope }, a.secret),
    { credentialMatches: true, authenticationAuthorized: false, dispatchAuthorized: false });
});

test('scope and current printer/credential revisions must match exactly; digest cannot be transplanted', () => {
  const a = create(scope);
  for (const key of ['brandId', 'locationId', 'printerId', 'printerRevision', 'credentialRevision']) {
    const value = typeof scope[key] === 'string' ? `${scope[key]}_other` : scope[key] + 1;
    assert.deepEqual(compare(a.record, { ...scope, [key]: value }, a.secret), denied, key);
    assert.deepEqual(compare({ ...a.record, [key]: value }, scope, a.secret), denied, key);
    assert.deepEqual(compare({ ...a.record, [key]: value }, { ...scope, [key]: value }, a.secret), denied, `transplant ${key}`);
  }
});

test('rotation rejects previous revision and old secret; revoked records never match or regain authority', () => {
  const old = create(scope), currentScope = { ...scope, credentialRevision: 2 }, current = create(currentScope);
  assert.deepEqual(compare(old.record, currentScope, old.secret), denied);
  assert.deepEqual(compare(current.record, currentScope, old.secret), denied);
  assert.deepEqual(compare(current.record, scope, current.secret), denied);
  assert.equal(compare(current.record, currentScope, current.secret).credentialMatches, true);
  for (const revokedAt of [Date.now(), current.record.issuedAt, 0, -1, 'now', undefined]) {
    assert.deepEqual(compare({ ...current.record, revokedAt }, currentScope, current.secret), denied);
  }
  // A caller can fabricate a matching DTO. Even that never mints trusted identity.
  assert.equal(compare(create(scope).record, scope, old.secret).authenticationAuthorized, false);
});

test('malformed, missing, unknown and oversized private input fails closed without leaking secrets', () => {
  const a = create(scope);
  for (const input of [null, undefined, [], 1, 'x', {}, { ...a.record, unknown: 'x' },
    { ...a.record, schemaVersion: 2 }, { ...a.record, issuedAt: Date.now() + 60000 },
    { ...a.record, secretDigest: 'a'.repeat(1000000) }, { ...a.record, secretDigest: 'G'.repeat(64) },
    { ...a.record, issuedAt: NaN }, { ...a.record, issuedAt: 0 }, { ...a.record, issuedAt: '1' }]) {
    assert.deepEqual(compare(input, scope, a.secret), denied);
  }
  for (const key of Object.keys(a.record)) {
    const omitted = { ...a.record }; delete omitted[key]; assert.deepEqual(compare(omitted, scope, a.secret), denied, key);
  }
  for (const secret of [null, undefined, [], {}, '', a.secret + '=', ` ${a.secret}`, 'a'.repeat(1000000), 'a'.repeat(42), '!'.repeat(43)]) {
    assert.deepEqual(compare(a.record, scope, secret), denied);
  }
  for (const revision of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, '1', null]) {
    assert.throws(() => create({ ...scope, credentialRevision: revision }), /Invalid private device credential binding/);
    assert.deepEqual(compare({ ...a.record, printerRevision: revision }, scope, a.secret), denied);
  }
  for (const id of ['', '../printer', 'x'.repeat(1000000), 'æ', {}, null]) {
    assert.throws(() => create({ ...scope, printerId: id }), /Invalid private device credential binding/);
    assert.deepEqual(compare(a.record, { ...scope, printerId: id }, a.secret), denied);
  }
});

test('candidate validation does not invoke accessors or coerce unknown values', () => {
  const a = create(scope); let invoked = false;
  const getter = { ...a.record }; Object.defineProperty(getter, 'secretDigest', { get() { invoked = true; throw Error(a.secret); } });
  assert.deepEqual(compare(getter, scope, a.secret), denied); assert.equal(invoked, false);
  const proxy = new Proxy({}, { ownKeys() { throw Error(a.secret); } });
  assert.deepEqual(compare(proxy, scope, a.secret), denied);
  assert.throws(() => create(proxy), error => error.message === 'Invalid private device credential binding');
  const symbol = { ...a.record, [Symbol('unknown')]: 1 }; assert.deepEqual(compare(symbol, scope, a.secret), denied);
  assert.deepEqual(compare(Object.create(a.record), scope, a.secret), denied);
  assert.deepEqual(compare(a.record, { ...scope, mac: '00:00:00:00:00:00' }, a.secret), denied);
});

test('every secret mutation fails comparison while canonical input still matches', () => {
  const a = create(scope);
  for (let index = 0; index < a.secret.length; index++) {
    const secret = a.secret.slice(0, index) + (a.secret[index] === 'A' ? 'B' : 'A') + a.secret.slice(index + 1);
    assert.deepEqual(compare(a.record, scope, secret), denied);
  }
  assert.equal(compare(a.record, scope, a.secret).credentialMatches, true);
});

test('valid-shape positive and wrong-secret comparisons use the actual fixed-length constant-time primitive', () => {
  const crypto = require('node:crypto'); let comparisons = 0;
  const instrumented = loadTs('src/lib/printing/device-auth.ts', { 'server-only': {}, 'node:crypto': {
    ...crypto, timingSafeEqual(left, right) {
      comparisons++; assert.equal(left.length, 32); assert.equal(right.length, 32);
      return crypto.timingSafeEqual(left, right);
    },
  } });
  const a = instrumented.createPrinterDeviceCredentialDraft(scope), b = create(scope);
  assert.equal(instrumented.comparePrinterDeviceCredentialCandidates(a.record, scope, a.secret).credentialMatches, true);
  assert.deepEqual(instrumented.comparePrinterDeviceCredentialCandidates(a.record, scope, b.secret), denied);
  assert.equal(comparisons, 2);
});
