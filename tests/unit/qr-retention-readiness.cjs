const { test } = require('node:test');
const assert = require('node:assert/strict');
const integerValue = n => ({ integerValue: String(n) });
const now = 1800000000000;
function checkpoint() {
  return { fields: { schemaVersion: integerValue(1), lease: { nullValue: null }, leaseUntil: integerValue(0),
    lastError: { nullValue: null }, lastFinishedAt: integerValue(now - 1000),
    cursor: { stringValue: 'PRIVATE_CURSOR_NEVER_LOG' },
    lastResult: { mapValue: { fields: Object.fromEntries(['scanned', 'deleted', 'skipped', 'errors', 'deletedEvents', 'deletedRateLimits'].map(k => [k, integerValue(0)])) } } } };
}
const load = () => import('../../scripts/qr-retention-readiness.mjs');

test('checkpoint reports only projected safe evidence, never internal cursor', async () => {
  const { inspectCheckpoint } = await load();
  const result = inspectCheckpoint(checkpoint(), now);
  assert.equal(result.state, 'checkpoint_verified');
  assert.equal(result.productionScanAcceptance, false);
  assert.equal(result.ageSeconds, 1);
  assert.equal(JSON.stringify(result).includes('PRIVATE_CURSOR'), false);
});
test('running lease and worker error never become successful retention acceptance', async () => {
  const { inspectCheckpoint } = await load();
  const doc = checkpoint(); doc.fields.lease = { stringValue: 'PRIVATE_LEASE' };
  assert.equal(inspectCheckpoint(doc, now).reason, 'lease_not_released');
  assert.equal(JSON.stringify(inspectCheckpoint(doc, now)).includes('PRIVATE_LEASE'), false);
  doc.fields.lease = { nullValue: null }; doc.fields.lastError = { stringValue: 'retention_failed' };
  assert.equal(inspectCheckpoint(doc, now).state, 'blocked');
  doc.fields.lastError = { nullValue: null }; doc.fields.lastResult.mapValue.fields.errors = integerValue(1);
  assert.equal(inspectCheckpoint(doc, now).reason, 'worker_reported_errors');
});
test('missing, old, future and unsafe numeric checkpoints are rejected', async () => {
  const { inspectCheckpoint } = await load();
  assert.equal(inspectCheckpoint({}, now).state, 'blocked');
  for (const timestamp of [now - 3600001, now + 1, Number.MAX_SAFE_INTEGER + 1]) {
    const doc = checkpoint(); doc.fields.lastFinishedAt = integerValue(timestamp);
    assert.equal(inspectCheckpoint(doc, now).state, 'blocked');
  }
  const doc = checkpoint(); delete doc.fields.lastResult.mapValue.fields.deleted;
  assert.equal(inspectCheckpoint(doc, now).reason, 'worker_counters_invalid');
});
test('probe uses exactly one GET on fixed production checkpoint with field mask excluding cursor', async () => {
  const { probeCheckpoint } = await load(); const calls = [];
  const result = await probeCheckpoint({ accessToken: 'TEST_ONLY_TOKEN', now, fetchImpl: async (url, init) => {
    calls.push([url, init]); return { ok: true, json: async () => checkpoint() };
  } });
  assert.equal(result.state, 'checkpoint_verified'); assert.equal(calls.length, 1);
  const [url, init] = calls[0]; assert.equal(init.method, 'GET'); assert.equal(init.body, undefined);
  assert.equal(new URL(url).pathname, '/v1/projects/orderfly-39325/databases/(default)/documents/qrMaintenance/retention-v1');
  assert.deepEqual(new URL(url).searchParams.getAll('mask.fieldPaths'), ['schemaVersion', 'lease', 'leaseUntil', 'lastError', 'lastFinishedAt', 'lastResult']);
  assert.equal(JSON.stringify(result).includes('TEST_ONLY_TOKEN'), false);
});
test('provider denial, missing checkpoint and arbitrary errors return sanitized blockers only', async () => {
  const { probeCheckpoint } = await load();
  for (const status of [401, 403, 404, 503]) {
    const result = await probeCheckpoint({ accessToken: 'TEST', fetchImpl: async () => ({ ok: false, status,
      json: async () => { throw Error('must not read raw provider denial'); } }) });
    assert.equal(result.state, 'blocked');
    assert.equal(result.reason, status === 404 ? 'checkpoint_missing' : 'checkpoint_read_unavailable');
  }
  const result = await probeCheckpoint({ accessToken: 'TEST', fetchImpl: async () => { throw Error('SECRET_PROVIDER_DETAIL'); } });
  assert.equal(result.state, 'blocked'); assert.equal(JSON.stringify(result).includes('SECRET'), false);
});
