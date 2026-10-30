const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const authority = loadTs('src/lib/access/authority.ts', { 'server-only': {} });
const identity = { provider: 'firebase', subject: 'platform-owner' }, actor = authority.principalKey(identity);
const root = 'deliveryPlatformConfigs/geoapify';
const secretRef = 'projects/test-project/secrets/orderfly-geoapify-sandbox-' + 'a'.repeat(64) + '/versions/1';
class DeliverySecretError extends Error { constructor(code) { super(code); this.code = code; } }
const key = 'synthetic_geoapify_secret_1234';
function command(extra = {}) { return { expectedRevision: 0, enabled: true, retentionApproved: true,
  routingApprovalRef: 'PO-routing-approved', retentionApprovalRef: 'PO-retention-approved', quotaNamespace: 'fixed-platform-project', apiKey: key, ...extra }; }
function fixture(options = {}) {
  const policy = { principals: [{ id: actor, active: true }], companies: [],
    roles: [{ id: 'owner', name: 'Owner', companyId: null, kind: 'superuser', permissions: [], active: true }],
    memberships: [{ id: 'owner', principalId: actor, companyId: null, locationIds: null, roleIds: ['owner'], active: true }] };
  const records = new Map([['platformAdminControl/access-v1', policy]]), events = [], transactionOptions = [];
  const ref = path => ({ path, id: path.split('/').at(-1), collection: name => ({ doc: id => ref(path + '/' + name + '/' + id) }) });
  let queue = Promise.resolve();
  const db = { collection: name => ({ doc: id => ref(name + '/' + id) }), runTransaction(run, txOptions) {
    transactionOptions.push(txOptions);
    const result = queue.then(async () => {
      const copy = new Map(structuredClone([...records])); let writing = false;
      const tx = { get: async r => { assert.equal(writing, false); return { exists: copy.has(r.path), data: () => structuredClone(copy.get(r.path)) }; },
        set(r, v) { assert.notEqual(txOptions?.readOnly, true); writing = true; copy.set(r.path, v); }, create(r, v) { assert.notEqual(txOptions?.readOnly, true); writing = true; assert.equal(copy.has(r.path), false);
          if (options.failAudit && r.path.includes('/audit/')) throw Error('private-driver'); copy.set(r.path, v); } };
      const value = await run(tx); records.clear(); for (const row of copy) records.set(...row); return value;
    }); queue = result.catch(() => {}); return result;
  } };
  const mocks = { 'server-only': {}, '@/lib/access/authority': authority, '@/lib/firebase-admin': { getAdminDb: () => db },
    '@/lib/access/orderfly-session': { requirePlatformSuperuser: async () => {
      if (options.anonymous) throw new authority.AuthorityError('unauthorized', 401);
      if (options.merchant) throw new authority.AuthorityError('forbidden');
      return { identity, actorId: actor, superuser: true };
    } }, '@/lib/url': { getOrigin: async () => 'https://orderfly.dk' },
    './secrets': { DeliverySecretError, deliverySecretProjectId: () => 'test-project', createDeliverySecretStore: () => ({
      provision: async input => { events.push('provision'); if (options.provisionError) throw new DeliverySecretError(options.provisionError); assert.equal(input.value, key); if (options.onProvision) options.onProvision(records); return secretRef; },
      read: async () => { events.push('secret-read'); if (options.secretFailure) throw Error('private-key:' + key); if (options.onRead) options.onRead(records); return key; },
    }) }, '../routing/geoapify/budget': { createGeoapifyBudget: () => ({ reserveQuote: async () => { events.push('quote-budget'); return true; },
      reserveRequest: async () => { events.push('request-budget'); return { sendBeforeMs: Date.now() + 1000 }; } }) },
    '../routing/geoapify/adapter': { createGeoapifyRoutingAdapter: opts => ({ resolve: async address => {
      assert.equal(address.street, 'Rådhuspladsen 1'); assert.equal(opts.apiKey, key);
      await opts.reserveQuote(); await opts.reserveRequest(); events.push('provider');
      return { kind: options.providerFailure ? 'unavailable' : 'verified', address: { reference: 'hidden', latitude: 55, longitude: 12 } };
    } }) },
  };
  return { records, events, transactionOptions, service: loadTs('src/lib/delivery/management/platform.ts', mocks) };
}
const request = (method, value, extra = {}) => new Request('https://orderfly.dk/api/delivery/platform' + (method === 'POST' ? '/check' : ''), {
  method, headers: { origin: 'https://orderfly.dk', 'content-type': 'application/json', ...extra }, ...(method !== 'GET' ? { body: typeof value === 'string' ? value : JSON.stringify(value) } : {}),
});
test('runtime platform snapshots are read-only while settings and audit writes remain read-write',async()=>{
 const f=fixture();await f.service.writeGeoapifyPlatform(command());
 assert.ok(f.transactionOptions.every(options=>options===undefined));
 f.transactionOptions.length=0;
 assert.equal((await f.service.getPlatformGeoapifyReadiness()).enabled,true);
 assert.equal((await f.service.getPlatformGeoapifyRuntime()).apiKey,key);
 assert.equal(f.transactionOptions.length,3);
 for(const options of f.transactionOptions)assert.deepEqual(options,{readOnly:true});
});
test('superadmin save is revisioned and projections/audit never expose secret or reference', async () => {
  const f = fixture(); assert.equal((await f.service.readGeoapifyPlatform()).keyConfigured, false);
  const saved = await f.service.writeGeoapifyPlatform(command()); assert.equal(saved.revision, 1); assert.equal(saved.keyConfigured, true);
  assert.equal(f.records.get(root).secretRef, secretRef);
  for (const v of [saved, await f.service.readGeoapifyPlatform(), f.records.get(root + '/audit/1')]) {
    assert.equal(JSON.stringify(v).includes(key), false); assert.equal(JSON.stringify(v).includes(secretRef), false);
  }
  const update = command({ expectedRevision: 1, enabled: false }); delete update.apiKey;
  assert.equal((await f.service.writeGeoapifyPlatform(update)).revision, 2);
  assert.deepEqual(f.events, ['provision']); assert.equal(f.records.get(root).secretRef, secretRef);
});
test('anonymous/merchant HTTP access is denied for reads, writes and connection checks', async () => {
  for (const [options, status] of [[{ anonymous: true }, 401], [{ merchant: true }, 403]]) {
    const f = fixture(options);
    assert.equal((await f.service.getDeliveryPlatform(request('GET'))).status, status);
    assert.equal((await f.service.putDeliveryPlatform(request('PUT', command()))).status, status);
    assert.equal((await f.service.postDeliveryPlatformCheck(request('POST', { expectedRevision: 0 }))).status, status);
    assert.deepEqual(f.events, []);
  }
});
test('CSRF, oversized, malformed and unknown fields are rejected without secrets or provider work', async () => {
  const f = fixture();
  assert.equal((await f.service.putDeliveryPlatform(request('PUT', command(), { origin: 'https://evil.test' }))).status, 403);
  assert.equal((await f.service.postDeliveryPlatformCheck(request('POST', { expectedRevision: 0 }, { origin: 'https://evil.test' }))).status, 403);
  for (const body of [' '.repeat(8193), '{bad', command({ secretRef: 'injected' }), command({ apiKey: '' })]) {
    assert.equal((await f.service.putDeliveryPlatform(request('PUT', body))).status, 400);
  }
  assert.deepEqual(f.events, []);
});
test('stale revision fails and legacy namespace inputs cannot rotate server quota', async () => {
  const f = fixture(); await f.service.writeGeoapifyPlatform(command());
  await assert.rejects(f.service.writeGeoapifyPlatform(command()), /record_conflict/);
  const update = command({ expectedRevision: 1, quotaNamespace: 'reset-budget' }); delete update.apiKey;
  await f.service.writeGeoapifyPlatform(update);
  assert.deepEqual(f.events, ['provision']); assert.equal(f.records.get(root).revision, 2);
  assert.equal(f.records.get(root).quotaNamespace, 'orderfly-delivery-geoapify-platform-v1');
});
test('revoked authority during secret provisioning prevents config and audit commit', async () => {
  const f = fixture({ onProvision: records => { records.get('platformAdminControl/access-v1').principals[0].active = false; } });
  await assert.rejects(f.service.writeGeoapifyPlatform(command()), /forbidden/);
  assert.equal(f.records.has(root), false); assert.equal(f.records.has(root + '/audit/1'), false);
});
test('failed audit atomically prevents settings commit', async () => {
  const f = fixture({ failAudit: true });
  const result = await f.service.putDeliveryPlatform(request('PUT', command()));
  assert.equal(result.status, 503); assert.equal(f.records.has(root), false);
  assert.equal(JSON.stringify(await result.json()).includes(key), false);
});
test('connection check is explicit, quota bounded, audited, sanitized and revision bound', async () => {
  const f = fixture(); await f.service.writeGeoapifyPlatform(command());
  assert.deepEqual(f.events, ['provision']);
  const result = await f.service.checkGeoapifyPlatform({ expectedRevision: 1 });
  assert.equal(result.ok, true); assert.equal(result.code, 'connected');
  assert.deepEqual(f.events, ['provision', 'secret-read', 'quote-budget', 'request-budget', 'provider']);
  assert.equal([...f.records.keys()].filter(k => k.startsWith(root + '/checks/')).length, 1);
  await assert.rejects(f.service.checkGeoapifyPlatform({ expectedRevision: 0 }), /record_conflict/);
  assert.equal(JSON.stringify(result).includes('hidden'), false);
});
test('runtime reads require complete enabled approval and reject config changed during secret resolution', async () => {
  const f = fixture(); assert.equal(await f.service.getPlatformGeoapifyRuntime(), null);
  await f.service.writeGeoapifyPlatform(command());
  const ready = await f.service.getPlatformGeoapifyReadiness(); assert.equal(ready.keyConfigured, true); assert.deepEqual(f.events, ['provision']);
  assert.equal((await f.service.getPlatformGeoapifyRuntime()).apiKey, key);
  const changed = fixture({ onRead: records => { records.get(root).enabled = false; } }); await changed.service.writeGeoapifyPlatform(command());
  assert.equal(await changed.service.getPlatformGeoapifyRuntime(), null);
});
test('unconfigured and failed provider checks do not claim connected', async () => {
  const empty = fixture(); assert.equal((await empty.service.checkGeoapifyPlatform({ expectedRevision: 0 })).code, 'not_configured'); assert.deepEqual(empty.events, []);
  for (const options of [{ secretFailure: true }, { providerFailure: true }]) {
    const f = fixture(options); await f.service.writeGeoapifyPlatform(command());
    const result = await f.service.postDeliveryPlatformCheck(request('POST', { expectedRevision: 1 }));
    assert.equal(result.status, 200); const body = await result.json(); assert.equal(body.ok, false); assert.equal(body.code, 'connection_failed');
    assert.equal(JSON.stringify(body).includes(key), false);
  }
});

test('malformed persisted platform config is unavailable, never absent', async () => {
  const f = fixture();
  assert.equal(await f.service.getPlatformGeoapifyReadiness(), null);
  f.records.set(root, { enabled: false });
  await assert.rejects(f.service.getPlatformGeoapifyReadiness(), /platform_unavailable/);
  assert.deepEqual(f.events, []);
});

test('simple portal payload generates audited approvals and preserves migrated namespace', async () => {
  const f = fixture();
  const simple = { expectedRevision: 0, enabled: true, retentionApproved: true, apiKey: key };
  await f.service.writeGeoapifyPlatform(simple);
  assert.equal(f.records.get(root).routingApprovalRef, root + '/audit/1');
  assert.equal(f.records.get(root).retentionApprovalRef, root + '/audit/1');
  f.records.get(root).quotaNamespace = 'migrated-existing-budget';
  await f.service.writeGeoapifyPlatform({ expectedRevision: 1, enabled: true, retentionApproved: true });
  assert.equal(f.records.get(root).quotaNamespace, 'migrated-existing-budget');
  assert.equal(f.records.get(root).routingApprovalRef, root + '/audit/2');
});
test('secret store errors are actionable without private diagnostics', async () => {
  for (const code of ['secret_permission_denied', 'secret_configuration_missing', 'secret_store_unavailable']) {
    const f = fixture({ provisionError: code });
    const result = await f.service.putDeliveryPlatform(request('PUT', command()));
    assert.equal(result.status, 503); assert.deepEqual(await result.json(), { error: code });
    assert.equal(f.records.has(root), false);
  }
});
