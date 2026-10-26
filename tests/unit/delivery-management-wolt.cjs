const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const mod = loadTs('src/lib/delivery/management/wolt.ts', { 'server-only': {}, './secrets': {} });
const { WOLT_REQUIRED_EVENTS } = loadTs('src/lib/delivery/providers/wolt/health.ts', { 'server-only': {} });
const input = { environment: 'sandbox', merchantId: 'merchant_a', venueId: 'venue_a', apiSecretRef: 'private-api-ref', signingSecretRef: 'private-signing-ref', callbackUrl: 'https://example.test/api/delivery/webhooks/wolt/' + 'a'.repeat(64), allowCreate: true };
const webhook = () => ({ id: 'webhook_a', callback_url: input.callbackUrl, disabled: false, subscribed_events: [...WOLT_REQUIRED_EVENTS], callback_config: { exponential_retry_backoff: { exponent_base: 2, max_retry_count: 5 } } });
function dependencies(fetchImpl) { return { fetchImpl, readSecret: async (_, scope) => scope.kind === 'api' ? 'synthetic_api_key' : 'synthetic_signing_key_separate_32_bytes' }; }
test('connection test is a single fixed-host merchant GET without a booking or callback write', async () => {
  const calls = [];
  assert.equal(await mod.verifyWoltMerchantConnection(input, dependencies(async (url, options) => { calls.push([url, options.method]); return Response.json([]); })), true);
  assert.deepEqual(calls, [['https://daas-public-api.development.dev.woltapi.com/v1/merchants/merchant_a/webhooks', 'GET']]);
});
test('registration persists intent before one POST then proves configuration through GET readback', async () => {
  let claimed = false, created = false; const calls = [];
  const result = await mod.ensureWoltMerchantCallback({ ...input, beforeCreate: async () => { claimed = true; } }, dependencies(async (_, options) => {
    calls.push(options.method);
    if (options.method === 'POST') { assert.equal(claimed, true); created = true; return Response.json(webhook(), { status: 201 }); }
    return Response.json(created ? [webhook()] : []);
  }));
  assert.deepEqual(result, { status: 'registered', webhookId: 'webhook_a' }); assert.deepEqual(calls, ['GET', 'POST', 'GET']);
});
test('lost create response is recovered by readback, never a second POST', async () => {
  let created = false, posts = 0;
  const result = await mod.ensureWoltMerchantCallback({ ...input, beforeCreate: async () => {} }, dependencies(async (_, options) => {
    if (options.method === 'POST') { posts++; created = true; throw Error('sensitive_network_exception'); }
    return Response.json(created ? [webhook()] : []);
  }));
  assert.equal(result.status, 'registered'); assert.equal(posts, 1);
});
test('unknown prior attempt with empty list is read-only and remains unknown', async () => {
  const calls = [];
  const result = await mod.ensureWoltMerchantCallback({ ...input, allowCreate: false, beforeCreate: async () => { throw Error('must_not_claim'); } }, dependencies(async (_, options) => { calls.push(options.method); return Response.json([]); }));
  assert.deepEqual(result, { status: 'unknown' }); assert.deepEqual(calls, ['GET']);
});
test('foreign, duplicate, wrong-owned, disabled, retry and event mismatches fail without any write', async () => {
  for (const [rows, ownedWebhookId] of [[[ { ...webhook(), callback_url: 'https://foreign.test' } ], undefined], [[webhook(), webhook()], undefined], [[webhook()], 'different_id'], [[{ ...webhook(), disabled: true }], undefined], [[{ ...webhook(), subscribed_events: [] }], undefined], [[{ ...webhook(), callback_config: { exponential_retry_backoff: { exponent_base: 5, max_retry_count: 3 } } }], undefined]]) {
    const calls = [];
    await assert.rejects(mod.ensureWoltMerchantCallback({ ...input, ownedWebhookId, beforeCreate: async () => {} }, dependencies(async (_, options) => { calls.push(options.method); return Response.json(rows); })), /wolt_webhook_(ownership_conflict|configuration_mismatch)/);
    assert.deepEqual(calls, ['GET']);
  }
});
test('credential failures and unsafe callback URLs do not expose upstream secrets', async () => {
  await assert.rejects(mod.verifyWoltMerchantConnection(input, dependencies(async () => Response.json({ detail: 'private_key_echo' }, { status: 401 }))), error => error.code === 'wolt_authentication_failed' && !String(error).includes('private_key'));
  let calls = 0;
  await assert.rejects(mod.ensureWoltMerchantCallback({ ...input, callbackUrl: 'http://example.test/api/delivery/webhooks/wolt/' + 'a'.repeat(64), beforeCreate: async () => {} }, dependencies(async () => { calls++; })), /invalid_wolt_configuration/);
  assert.equal(calls, 0);
});
