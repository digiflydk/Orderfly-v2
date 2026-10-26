const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const modulePath = 'src/lib/delivery/management/secrets.ts';
const scope = { environment: 'sandbox', merchantId: 'merchant_a', kind: 'api' };
const value = 'synthetic_api_secret_not_real';
function fixture() {
  const calls = [], values = new Map();
  const client = {
    async createSecret(input) { calls.push({ op: 'create', name: input.secretId }); },
    async addSecretVersion(input) { const name = input.parent + '/versions/1'; values.set(name, input.payload.data); calls.push({ op: 'version', name }); return [{ name }]; },
    async accessSecretVersion(input) { calls.push({ op: 'read', name: input.name }); return [{ name: input.name, payload: { data: values.get(input.name) } }]; },
  };
  const mod = loadTs(modulePath, { 'server-only': {}, '@/lib/firebase-admin': { getAdminApp: () => ({ options: { projectId: 'orderfly-private-test' } }) }, '@google-cloud/secret-manager': { SecretManagerServiceClient: function () { return client; } } });
  return { ...mod, calls, client, store: mod.createDeliverySecretStore({ projectId: 'orderfly-private-test', client }) };
}
test('API/signing/platform secrets are separate pinned versions bound to merchant and environment', async () => {
  const f = fixture(); const api = await f.store.provision({ ...scope, value });
  const webhook = await f.store.provision({ ...scope, kind: 'webhook', value: 'synthetic_signing_secret_not_real_32' });
  const geo = await f.store.provision({ environment: 'sandbox', merchantId: 'platform', kind: 'geoapify', value });
  assert.match(api, /\/secrets\/orderfly-wolt-sandbox-[a-f0-9]{64}\/versions\/1$/);
  assert.match(webhook, /\/secrets\/orderfly-wolt-webhook-sandbox-/); assert.match(geo, /\/secrets\/orderfly-geoapify-sandbox-/);
  assert.equal(await f.store.read(api, scope), value);
  const reads = f.calls.filter(v => v.op === 'read').length;
  for (const changed of [{ merchantId: 'merchant_b' }, { environment: 'production' }, { kind: 'webhook' }]) await assert.rejects(f.store.read(api, { ...scope, ...changed }), /secret_reference_mismatch/);
  await assert.rejects(f.store.read(api.replace('/1', '/latest'), scope), /secret_reference_mismatch/);
  assert.equal(f.calls.filter(v => v.op === 'read').length, reads);
});
test('permission denial is actionable and never falls back or leaks provider errors', async () => {
  const f = fixture(); f.client.createSecret = async () => { throw Object.assign(Error('sensitive_provider_payload'), { code: 7 }); };
  await assert.rejects(f.store.provision({ ...scope, value }), error => error.code === 'secret_permission_denied' && !String(error).includes('sensitive'));
  assert.equal(f.calls.length, 0);
});
test('only ALREADY_EXISTS permits adding a version and returned scope is checked', async () => {
  const f = fixture(); f.client.createSecret = async () => { throw { code: 6 }; };
  assert.match(await f.store.provision({ ...scope, value }), /versions\/1$/);
  f.client.addSecretVersion = async () => [{ name: 'projects/another/secrets/foreign/versions/1' }];
  await assert.rejects(f.store.provision({ ...scope, value }), /secret_reference_mismatch/);
});
test('blank portal fields preserve pinned secrets and new merchant gets independent signing material', async () => {
  const f = fixture(); const result = await f.provisionDeliveryMerchantSecrets({ environment: 'sandbox', merchantId: 'merchant_a', apiKey: value, existing: { api: null, webhook: null } });
  assert.ok(result.api && result.webhook); assert.notEqual(result.api, result.webhook);
  const count = f.calls.length;
  assert.deepEqual(await f.provisionDeliveryMerchantSecrets({ environment: 'sandbox', merchantId: 'merchant_a', apiKey: '', webhookSigningSecret: '', existing: result }), result);
  assert.equal(f.calls.length, count);
  await assert.rejects(f.provisionDeliveryMerchantSecrets({ environment: 'sandbox', merchantId: 'merchant_a', apiKey: value, webhookSigningSecret: value, existing: result }), /invalid_secret_input/);
});
test('server project is derived internally; malformed override fails rather than falling back', () => {
  const f = fixture(); assert.equal(f.deliverySecretProjectId({}), 'orderfly-private-test');
  assert.throws(() => f.deliverySecretProjectId({ ORDERFLY_DELIVERY_SECRET_PROJECT: 'bad/value' }), /secret_configuration_missing/);
});
test('an empty draft does not generate signing material or call Secret Manager', async () => {
  const f = fixture();
  assert.deepEqual(await f.provisionDeliveryMerchantSecrets({ environment: 'sandbox', merchantId: 'merchant_a', existing: { api: null, webhook: null } }), { api: null, webhook: null });
  assert.equal(f.calls.length, 0);
});
test('Google numeric project aliases normalize only in scoped responses, not caller references', async () => {
  const f = fixture();
  f.client.addSecretVersion = async input => [{ name: input.parent.replace('orderfly-private-test', '123456789') + '/versions/7' }];
  const ref = await f.store.provision({ ...scope, value }); assert.match(ref, /^projects\/orderfly-private-test\/.*\/versions\/7$/);
  f.client.accessSecretVersion = async input => [{ name: input.name.replace('orderfly-private-test', '123456789'), payload: { data: Buffer.from(value) } }];
  assert.equal(await f.store.read(ref, scope), value);
  await assert.rejects(f.store.read(ref.replace('orderfly-private-test', '123456789'), scope), /secret_reference_mismatch/);
});
test('short signing secrets fail before any secret I/O, including API key provisioning', async () => {
  for (const length of [16, 31]) {
    const f = fixture();
    await assert.rejects(f.provisionDeliveryMerchantSecrets({ environment: 'sandbox', merchantId: 'merchant_a', apiKey: value, webhookSigningSecret: 's'.repeat(length), existing: { api: null, webhook: null } }), /invalid_secret_input/);
    await assert.rejects(f.store.provision({ ...scope, kind: 'webhook', value: 's'.repeat(length) }), /invalid_secret_input/);
    assert.equal(f.calls.length, 0);
  }
  const f = fixture();
  const saved = await f.provisionDeliveryMerchantSecrets({ environment: 'sandbox', merchantId: 'merchant_a', apiKey: value, webhookSigningSecret: 's'.repeat(32), existing: { api: null, webhook: null } });
  assert.ok(saved.api && saved.webhook);
});
