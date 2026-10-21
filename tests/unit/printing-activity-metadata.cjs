const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { initialPrinterActivity, readStoredPrinterActivity, projectPrinterActivity } = loadTs('src/lib/printing/activity-metadata.ts', { 'server-only': {} });
const { fixture, config, path, record } = require('../helpers/printing-fixture.cjs');
const scope = { brandId: 'brand', locationId: 'location', printerId: 'p1' };

test('legacy unknown history differs from proven new never-used identity; no arbitrary fields are copied', () => {
  assert.deepEqual(projectPrinterActivity(undefined, scope, 1), { activatedAt: null, lastConfirmedPrintAt: null, printHistory: 'unknown' });
  const fresh = initialPrinterActivity({ ...scope, receipt: 'PRIVATE_SENTINEL', actorId: 'private' }, true);
  assert.deepEqual(projectPrinterActivity(fresh, scope, 1), { activatedAt: null, lastConfirmedPrintAt: null, printHistory: 'never' });
  assert.doesNotMatch(JSON.stringify(fresh), /receipt|actorId|PRIVATE_SENTINEL/);
});

test('strict activity projection binds scope/revision/time and strips private confirmation identity', () => {
  const good = { ...initialPrinterActivity(scope, false), activatedAt: 1000, activationRevision: 2,
    printHistory: 'confirmed', lastConfirmedPrintAt: 2000, lastConfirmedJobId: 'a'.repeat(64) };
  assert.deepEqual(projectPrinterActivity(good, scope, 2), { activatedAt: 1000, lastConfirmedPrintAt: 2000, printHistory: 'confirmed' });
  for (const patch of [{ brandId: 'foreign' }, { locationId: 'foreign' }, { printerId: 'foreign' },
    { activationRevision: 3 }, { activatedAt: Date.now() + 60000 }, { lastConfirmedPrintAt: Date.now() + 60000 },
    { activatedAt: '1000' }, { lastConfirmedPrintAt: -1 }, { printHistory: 'never' },
    { lastConfirmedJobId: null }, { activationRevision: null }, { credentials: 'PRIVATE_SENTINEL' }]) {
    assert.throws(() => readStoredPrinterActivity({ ...good, ...patch }, scope, 2), /^Error: printer_activity_unavailable$/);
  }
});

test('native create atomically records never-used, edits preserve it and metadata collision rolls back', async () => {
  const f = fixture();
  assert.equal((await f.request()).status, 201);
  assert.deepEqual(f.records.get(`${path}/statusMetadata/current`), initialPrinterActivity(scope, true));
  assert.equal((await f.request('PATCH', { configuration: config({ name: 'Changed' }), revision: 1 })).status, 200);
  assert.deepEqual(f.records.get(`${path}/statusMetadata/current`), initialPrinterActivity(scope, true));
  const old = { unrelated: true };
  const collision = fixture({ extra: [[`${path}/statusMetadata/current`, old]] });
  assert.equal((await collision.request()).status, 503);
  assert.equal(collision.records.has(path), false);
  assert.deepEqual(collision.records.get(`${path}/statusMetadata/current`), old);
  assert.equal(collision.commits.length, 0);
});

test('config edits never fabricate legacy activation from createdAt or populate unknown usage', async () => {
  const f = fixture({ existing: record() });
  assert.equal((await f.request('PATCH', { configuration: config({ name: 'Legacy edit' }), revision: 1 })).status, 200);
  assert.equal(f.records.has(`${path}/statusMetadata/current`), false);
});
