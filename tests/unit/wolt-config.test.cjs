const test = require('node:test');
const assert = require('node:assert/strict');
const { inspect } = require('node:util');
const { loadTs } = require('../helpers/load-ts.cjs');
const config = loadTs('src/lib/delivery/providers/wolt/config.ts', { 'server-only': {} });
const { resolveWoltBinding } = loadTs('src/lib/delivery/providers/wolt/binding.ts', { 'server-only': {} });
const key = 'synthetic_test_key_not_a_real_credential';
const binding = () => ({ provider: 'wolt', active: true, revision: 'r1', brandId: 'brand-A', locationId: 'location-A',
  environment: 'sandbox', merchantId: 'merchant-A', venueId: 'venue-A', secretRef: 'wolt/sandbox/merchant-A' });
const scope = { brandId: 'brand-A', locationId: 'location-A' };

test('sandbox and production use fixed hosts; secret is not serialized or inspected', async () => {
  for (const environment of ['sandbox', 'production']) {
    const resolved = await config.resolveWoltConfig({ ...binding(), environment }, environment, async () => key);
    assert.equal(resolved.baseUrl, environment === 'sandbox' ? 'https://daas-public-api.development.dev.woltapi.com' : 'https://daas-public-api.wolt.com');
    assert.equal(resolved.merchantKey, key);
    for (const output of [JSON.stringify(resolved), JSON.stringify({ ...resolved }), inspect(resolved)]) assert.equal(output.includes(key), false);
  }
});

test('environment mismatch, malformed references and missing secrets fail before I/O', async () => {
  let calls = 0;
  const resolver = async () => { calls++; return key; };
  await assert.rejects(config.resolveWoltConfig(binding(), 'production', resolver), { code: 'ENVIRONMENT_MISMATCH' });
  await assert.rejects(config.resolveWoltConfig({ ...binding(), environment: 'evil' }, 'sandbox', resolver), { code: 'INVALID_CONFIG' });
  await assert.rejects(config.resolveWoltConfig({ ...binding(), merchantId: '../merchant' }, 'sandbox', resolver), { code: 'INVALID_CONFIG' });
  assert.equal(calls, 0);
  for (const secret of [undefined, '', 'bad\r\nAuthorization', ' '.repeat(30)]) {
    await assert.rejects(config.resolveWoltConfig(binding(), 'sandbox', async () => secret), { code: 'SECRET_UNAVAILABLE' });
  }
});

test('secret resolver exceptions are redacted and asynchronous mutation cannot switch account', async () => {
  await assert.rejects(config.resolveWoltConfig(binding(), 'sandbox', async () => { throw new Error(key); }), error => !inspect(error).includes(key));
  const original = binding();
  const resolved = await config.resolveWoltConfig(original, 'sandbox', async () => {
    original.environment = 'production'; original.merchantId = 'merchant-B'; return key;
  });
  assert.equal(resolved.environment, 'sandbox'); assert.equal(resolved.merchantId, 'merchant-A');
});

test('authorization denial and malformed scope never read binding storage', async () => {
  let reads = 0;
  const dependencies = { authorizeScope: async () => false, resolveBinding: async () => { reads++; return binding(); } };
  await assert.rejects(resolveWoltBinding(scope, dependencies, 'sandbox'), { code: 'FORBIDDEN' });
  await assert.rejects(resolveWoltBinding({ ...scope, brandId: '../B' }, dependencies, 'sandbox'), { code: 'INVALID_SCOPE' });
  assert.equal(reads, 0);
});

test('foreign, revoked, wrong-environment and incomplete mappings fail closed', async () => {
  for (const patch of [{ brandId: 'brand-B' }, { locationId: 'location-B' }, { active: false }, { environment: 'production' }, { revision: '' }, { provider: 'other' }, { secretRef: '' }]) {
    await assert.rejects(resolveWoltBinding(scope, { authorizeScope: async () => true, resolveBinding: async () => ({ ...binding(), ...patch }) }, 'sandbox'), { code: 'BINDING_UNAVAILABLE' });
  }
});

test('validated binding is a frozen allowlisted snapshot; multi-merchant resolution remains scoped', async () => {
  const result = await resolveWoltBinding(scope, {
    authorizeScope: async checked => { assert.deepEqual(checked, scope); return true; },
    resolveBinding: async (checked, provider) => { assert.deepEqual(checked, scope); assert.equal(provider, 'wolt'); return { ...binding(), merchantKey: key, extra: 'discard' }; },
  }, 'sandbox');
  assert.equal(Object.isFrozen(result), true); assert.equal(result.merchantId, 'merchant-A');
  assert.equal('merchantKey' in result, false); assert.equal('extra' in result, false);
  const other = { brandId: 'brand-B', locationId: 'location-B' };
  const b = await resolveWoltBinding(other, { authorizeScope: async () => true, resolveBinding: async () => ({ ...binding(), ...other, merchantId: 'merchant-B' }) }, 'sandbox');
  assert.equal(b.merchantId, 'merchant-B');
});

test('storage and authorization exceptions never expose underlying message', async () => {
  await assert.rejects(resolveWoltBinding(scope, { authorizeScope: async () => { throw new Error(key); }, resolveBinding: async () => binding() }, 'sandbox'), error => error.code === 'FORBIDDEN' && !inspect(error).includes(key));
  await assert.rejects(resolveWoltBinding(scope, { authorizeScope: async () => true, resolveBinding: async () => { throw new Error(key); } }, 'sandbox'), error => error.code === 'BINDING_UNAVAILABLE' && !inspect(error).includes(key));
});
