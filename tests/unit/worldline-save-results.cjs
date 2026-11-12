const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const schema = loadTs('src/lib/payments/worldline-settings.ts');
const parser = loadTs('src/lib/payments/worldline-api-key.ts', { 'server-only': {} });
const blank = { merchantNumber: '', accessToken: '', secretToken: '', md5Key: '' };
const keys = { merchantNumber: 'T123', accessToken: 'synthetic-access', secretToken: 'synthetic-secret', md5Key: 'synthetic-md5' };
const apiKey = (merchant = 'T123', access = keys.accessToken, secret = keys.secretToken) => Buffer.from(`${access}@${merchant}:${secret}`).toString('base64');
const input = extra => ({ source: 'own', provider: 'worldline', mode: 'test', revision: 0, test: blank, live: blank, ...extra });
const rawFailure = code => Object.assign(new Error('PRIVATE provider credentials and projects/private/versions/999'), { code });
function fixture(options = {}) {
  const rows = new Map([['brands/b', {}], ['locations/l', { brandId: 'b' }]]);
  const secrets = new Map(), reads = [], writes = [], dbReads = [];
  let committed = false;
  const ref = path => ({ path, get: async () => {
    dbReads.push(path);
    if (options.settingsReadError && path.startsWith('settings/')) throw options.settingsReadError;
    if (committed && options.refreshError) throw options.refreshError;
    return { exists: rows.has(path), data: () => rows.get(path) };
  } });
  const db = { collection: name => ({ doc: id => ref(`${name}/${id}`) }), runTransaction: async run => {
    if (options.commitError) throw options.commitError;
    if (options.race) rows.set('settings/b/', { source: 'own', provider: 'worldline', mode: 'test', test: 'private-original', revision: 1 });
    const result = await run({ get: r => r.get(), set: (r, value) => rows.set(r.path, value) });
    committed = true;
    return result;
  } };
  const read = async (scope, mode, reference) => { reads.push({ scope, mode, reference }); if (options.readError) throw options.readError; return secrets.get(reference); };
  const write = async (scope, mode, value) => { writes.push({ scope, mode, value }); if (options.writeError) throw options.writeError; const reference = `private-version-${writes.length}`; secrets.set(reference, value); return reference; };
  const api = loadTs('src/app/superadmin/payments/worldline-actions.ts', {
    '@/lib/access/orderfly-session': { requirePlatformSuperuser: async () => { if (options.authError) throw options.authError; } },
    '@/lib/firebase-admin': { getAdminDb: () => db },
    '@/lib/payments/worldline-settings': schema,
    '@/lib/payments/worldline-api-key': parser,
    '@/lib/payments/worldline-store': { worldlineSettingsRef: s => ref(`settings/${s.brandId}/${s.locationId || ''}`), readWorldlineSecret: read, writeWorldlineSecret: write, readStripeSecret: read, writeStripeSecret: write },
  });
  const existing = (value = keys) => { rows.set('settings/b/', { source: 'own', provider: 'worldline', mode: 'test', test: 'private-original', revision: 1 }); secrets.set('private-original', value); };
  return { api, rows, secrets, reads, writes, dbReads, existing };
}
function rejected(result, code, field) {
  assert.equal(result.ok, false);
  assert.equal(result.code, code);
  if (field) assert.equal(result.field, field);
  assert.equal(typeof result.message, 'string');
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|private-original|private-version|synthetic-secret|synthetic-md5|projects\//);
}
test('unauthorized saves return safe results before reading scope or any credential', async () => {
  const f = fixture({ authError: Object.assign(rawFailure('forbidden'), { status: 403 }) });
  rejected(await f.api.saveWorldlineSettings({ brandId: 'b' }, input({ test: keys })), 'FORBIDDEN');
  assert.equal(f.dbReads.length, 0); assert.equal(f.reads.length, 0); assert.equal(f.writes.length, 0);
  const unavailable = fixture({ authError: rawFailure(14) });
  rejected(await unavailable.api.saveWorldlineSettings({ brandId: 'b' }, input()), 'AUTH_UNAVAILABLE');
  assert.equal(unavailable.dbReads.length, 0);
});
test('invalid scope and foreign locations never access credentials', async () => {
  for (const scope of [{ brandId: 'a/b' }, { brandId: 'missing' }, { brandId: 'other', locationId: 'l' }]) {
    const f = fixture(); f.rows.set('brands/other', {});
    rejected(await f.api.saveWorldlineSettings(scope, input({ test: keys })), 'INVALID_SCOPE');
    assert.equal(f.reads.length, 0); assert.equal(f.writes.length, 0);
  }
});
test('combined API code never substitutes for required MD5 callback key', async () => {
  const f = fixture();
  rejected(await f.api.saveWorldlineSettings({ brandId: 'b' }, input({ testApiKey: apiKey() })), 'WORLDLINE_MD5_REQUIRED', 'test.md5Key');
  assert.equal(f.writes.length, 0); assert.equal(f.rows.has('settings/b/'), false);
});
test('complete API code plus MD5 writes one atomic authentication tuple and returns flags only', async () => {
  const f = fixture();
  const result = await f.api.saveWorldlineSettings({ brandId: 'b' }, input({ testApiKey: `Basic ${apiKey()}`, test: { ...blank, md5Key: keys.md5Key } }));
  assert.equal(result.ok, true); assert.equal(result.settings.testSet, true); assert.equal(result.settings.revision, 1);
  assert.deepEqual(f.writes[0].value, keys); assert.equal(f.writes[0].mode, 'test'); assert.equal(f.writes.length, 1);
  assert.doesNotMatch(JSON.stringify(result), /synthetic-|private-version|Basic/);
  assert.doesNotMatch(JSON.stringify([...f.rows]), /synthetic-|Basic/);
});
test('API code conflicts, malformed values and wrong environment fail before key I/O', async () => {
  for (const [extra, code] of [
    [{ testApiKey: apiKey(), test: { ...blank, accessToken: 'separate-access' } }, 'INVALID_API_KEY'],
    [{ testApiKey: 'PRIVATE-invalid-api-code' }, 'INVALID_API_KEY'],
    [{ testApiKey: apiKey('P123') }, 'WORLDLINE_ENVIRONMENT_MISMATCH'],
  ]) {
    const f = fixture();
    rejected(await f.api.saveWorldlineSettings({ brandId: 'b' }, input(extra)), code, 'testApiKey');
    assert.equal(f.reads.length, 0); assert.equal(f.writes.length, 0);
  }
});
test('same merchant API rotation preserves saved MD5 without mixing authentication fields', async () => {
  const f = fixture(); f.existing();
  const result = await f.api.saveWorldlineSettings({ brandId: 'b' }, input({ revision: 1, testApiKey: apiKey('T123', 'new-access', 'new-secret') }));
  assert.equal(result.ok, true);
  assert.deepEqual(f.writes[0].value, { merchantNumber: 'T123', accessToken: 'new-access', secretToken: 'new-secret', md5Key: keys.md5Key });
});
test('new merchant API cannot reuse old MD5 and manual replacement requires all credentials', async () => {
  const f = fixture(); f.existing();
  rejected(await f.api.saveWorldlineSettings({ brandId: 'b' }, input({ revision: 1, testApiKey: apiKey('T456') })), 'WORLDLINE_MD5_REQUIRED', 'test.md5Key');
  rejected(await f.api.saveWorldlineSettings({ brandId: 'b' }, input({ revision: 1, test: { ...blank, merchantNumber: 'T456', md5Key: 'new-md5' } })), 'MERCHANT_REPLACEMENT_REQUIRED', 'test.merchantNumber');
  assert.equal(f.writes.length, 0); assert.equal(f.rows.get('settings/b/').test, 'private-original');
  const saved = await f.api.saveWorldlineSettings({ brandId: 'b' }, input({ revision: 1, testApiKey: apiKey('T456', 'fresh-access', 'fresh-secret'), test: { ...blank, md5Key: 'fresh-md5' } }));
  assert.equal(saved.ok, true);
  assert.deepEqual(f.writes[0].value, { merchantNumber: 'T456', accessToken: 'fresh-access', secretToken: 'fresh-secret', md5Key: 'fresh-md5' });
});
test('missing auth fields and mismatched manual environment return field errors', async () => {
  const f = fixture();
  rejected(await f.api.saveWorldlineSettings({ brandId: 'b' }, input({ test: { ...blank, md5Key: 'provided-md5' } })), 'WORLDLINE_CREDENTIALS_REQUIRED', 'test.merchantNumber');
  rejected(await f.api.saveWorldlineSettings({ brandId: 'b' }, input({ test: { ...keys, merchantNumber: 'P123' } })), 'WORLDLINE_ENVIRONMENT_MISMATCH', 'test.merchantNumber');
  assert.equal(f.writes.length, 0);
});
test('Secret Manager read and write errors return fixed safe categories and retain active reference', async () => {
  for (const [code, expected] of [[7, 'KEY_STORAGE_PERMISSION_DENIED'], ['PERMISSION_DENIED', 'KEY_STORAGE_PERMISSION_DENIED'], [16, 'KEY_STORAGE_AUTH_FAILED'], [14, 'KEY_STORAGE_UNAVAILABLE'], [4, 'KEY_STORAGE_UNAVAILABLE'], [5, 'KEY_STORAGE_UNAVAILABLE']]) {
    for (const operation of ['readError', 'writeError']) {
      const f = fixture({ [operation]: rawFailure(code) }); f.existing();
      rejected(await f.api.saveWorldlineSettings({ brandId: 'b' }, input({ revision: 1, test: keys })), expected);
      assert.equal(f.rows.get('settings/b/').test, 'private-original'); assert.equal(f.rows.get('settings/b/').revision, 1);
    }
  }
});
test('Stripe key-store failures use the same safe error boundary', async () => {
  const f = fixture({ writeError: rawFailure(7) });
  rejected(await f.api.saveWorldlineSettings({ brandId: 'b' }, input({ provider: 'stripe', stripeTest: { secretKey: 'sk_test_synthetic', publishableKey: 'pk_test_synthetic', webhookSecret: 'whsec_synthetic' } })), 'KEY_STORAGE_PERMISSION_DENIED');
  assert.equal(f.rows.has('settings/b/'), false);
});
test('stale and raced saves preserve revision protection and never publish a competing reference', async () => {
  const stale = fixture(); stale.existing();
  rejected(await stale.api.saveWorldlineSettings({ brandId: 'b' }, input({ test: keys })), 'REVISION_CONFLICT');
  assert.equal(stale.reads.length, 0); assert.equal(stale.writes.length, 0);
  const race = fixture({ race: true });
  rejected(await race.api.saveWorldlineSettings({ brandId: 'b' }, input({ test: keys })), 'REVISION_CONFLICT');
  assert.equal(race.writes.length, 1); assert.equal(race.rows.get('settings/b/').test, 'private-original'); assert.equal(race.rows.get('settings/b/').revision, 1);
});
test('settings read and persistence errors never expose SDK error text', async () => {
  const read = fixture({ settingsReadError: rawFailure(7) });
  rejected(await read.api.saveWorldlineSettings({ brandId: 'b' }, input({ test: keys })), 'SETTINGS_UNAVAILABLE');
  for (const [code, expected] of [[7, 'SETTINGS_WRITE_DENIED'], [10, 'REVISION_CONFLICT'], [4, 'SAVE_STATUS_UNKNOWN']]) {
    const f = fixture({ commitError: rawFailure(code) });
    rejected(await f.api.saveWorldlineSettings({ brandId: 'b' }, input({ test: keys })), expected);
    assert.equal(f.rows.has('settings/b/'), false);
  }
});
test('a successful commit followed by failed refresh says saved and asks for reload', async () => {
  const f = fixture({ refreshError: rawFailure(14) });
  const result = await f.api.saveWorldlineSettings({ brandId: 'b' }, input({ test: keys }));
  rejected(result, 'SAVED_RELOAD_REQUIRED'); assert.match(result.message, /blev gemt/);
  assert.equal(f.rows.get('settings/b/').revision, 1); assert.equal(f.rows.get('settings/b/').test, 'private-version-1');
});
