const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture, config, record, path, actorId } = require('../helpers/printing-fixture.cjs');
const { loadTs } = require('../helpers/load-ts.cjs');
const { storedPrinterSchema } = loadTs('src/lib/printing/storage.ts', { 'server-only': {} });
const command = (patch = {}) => ({ brandId: 'brand', locationId: 'location', printerId: 'p1', revision: 1, action: 'pause', ...patch });
const setup = (options = {}) => fixture({ target: 'lifecycle', existing: record({ configuration: config({ state: 'active' }) }), ...options });

test('pause is an authorized atomic stop with server audit and no job or credential mutations', async () => {
  const history = { revision: 1, action: 'earlier' }, job = { state: 'queued', attempts: 0, printerId: 'p1' };
  const f = setup({ extra: [[`${path}/audit/1`, history], ['printJobs/job', job],
    ['privateCredentials/p1', { token: 'PRIVATE_SENTINEL' }], ['locations/location/printerCapabilityVerifications/p1', { trusted: true }]] });
  const result = await f.request('POST', command());
  assert.deepEqual(result, { status: 200, body: { item: { configuration: config({ state: 'paused' }), revision: 2 } }, cache: 'no-store', vary: 'Cookie' });
  assert.deepEqual(f.records.get(path), record({ configuration: config({ state: 'paused' }), revision: 2, updatedAt: { serverTimestamp: true } }));
  assert.deepEqual(f.records.get(`${path}/audit/2`), { schemaVersion: 1, actorId, action: 'printer.pause', revision: 2,
    before: config({ state: 'active' }), after: config({ state: 'paused' }), deleted: false,
    capabilityInvalidated: true, createdAt: { serverTimestamp: true } });
  assert.deepEqual(f.records.get(`${path}/audit/1`), history); assert.deepEqual(f.records.get('printJobs/job'), job);
  assert.deepEqual(f.records.get('privateCredentials/p1'), { token: 'PRIVATE_SENTINEL' });
  assert.equal(f.records.has('locations/location/printerCapabilityVerifications/p1'), false);
  assert.deepEqual(f.commits, [[['delete', 'locations/location/printerCapabilityVerifications/p1'], ['create', `${path}/audit/2`], ['set', path]]]);
  assert.deepEqual(f.events.slice(0, 3).map(x => x[1]), ['platformAdminControl/access-v1', 'brands/brand', 'locations/location']);
  assert.doesNotMatch(JSON.stringify(result.body), /actor|audit|timestamp|deleted|PRIVATE_SENTINEL/);
});

test('deactivate accepts active or paused, and delete tombstones every valid state while preserving identity/history', async () => {
  for (const state of ['active', 'paused']) {
    const f = setup({ existing: record({ configuration: config({ state }) }) });
    const result = await f.request('POST', command({ action: 'deactivate' }));
    assert.equal(result.status, 200); assert.equal(f.records.get(path).configuration.state, 'disabled');
    assert.equal(f.records.get(path).deletedAt, null); assert.equal(f.records.get(`${path}/audit/2`).action, 'printer.deactivate');
  }
  for (const state of ['active', 'paused', 'disabled']) {
    const f = setup({ permissions: ['orderfly.catalog:delete'], existing: record({ configuration: config({ state }) }), extra: [[`${path}/audit/1`, { historical: true }]] });
    const result = await f.request('POST', command({ action: 'delete' }));
    assert.deepEqual(result.body, { deleted: true, printerId: 'p1', revision: 2 }); assert.equal(result.status, 200);
    const saved = f.records.get(path);
    assert.deepEqual(saved.deletedAt, { serverTimestamp: true }); assert.equal(saved.configuration.state, 'disabled');
    assert.equal(saved.configuration.id, 'p1'); assert.deepEqual(saved.createdAt, { seconds: 1 });
    assert.equal(storedPrinterSchema.safeParse(saved).success, false, 'active read projection must reject the tombstone');
    assert.deepEqual(f.records.get(`${path}/audit/1`), { historical: true }); assert.equal(f.records.get(`${path}/audit/2`).deleted, true);
  }
});

test('soft-deleted identity cannot be recreated, edited, deleted again or resumed', async () => {
  const f = setup({ permissions: ['orderfly.catalog:delete', 'orderfly.catalog:edit', 'orderfly.catalog:create'] });
  assert.equal((await f.request('POST', command({ action: 'delete' }))).status, 200);
  await assert.rejects(f.direct('create', { configuration: config() }), /record_conflict/);
  await assert.rejects(f.direct('edit', { configuration: config(), revision: 2 }), /not_found/);
  for (const action of ['pause', 'deactivate', 'delete', 'resume']) {
    const result = await f.request('POST', command({ action, revision: 2 }));
    assert.deepEqual(result.body, { error: 'not_found' }); assert.equal(result.status, 404);
  }
  assert.equal(f.commits.length, 1);
});

test('resume always requires authoritative review and cannot be bypassed with state, booleans or fake evidence', async () => {
  for (const state of ['active', 'paused', 'disabled']) {
    const f = setup({ existing: record({ configuration: config({ state }) }) });
    const result = await f.request('POST', command({ action: 'resume' }));
    assert.deepEqual(result.body, { error: 'queue_review_required' }); assert.equal(result.status, 409); assert.equal(f.commits.length, 0);
    for (const patch of [{ queueReviewed: true }, { queueCount: 0 }, { reviewedAt: 1 }, { receipt: 'fake' }, { state: 'active' }]) {
      assert.equal((await f.request('POST', command({ action: 'resume', ...patch }))).status, 400);
      assert.equal(f.commits.length, 0);
    }
  }
});

test('current transaction grants distinguish stop edits from delete, reject foreign scopes and recheck native ownership', async () => {
  for (const action of ['pause', 'deactivate', 'delete', 'resume']) {
    for (const permissions of [[], ['orderfly.catalog:view'], ['orderfly.catalog:create'], [action === 'delete' ? 'orderfly.catalog:edit' : 'orderfly.catalog:delete']]) {
      const f = setup({ permissions }); assert.equal((await f.request('POST', command({ action }))).status, 403); assert.equal(f.commits.length, 0);
    }
    for (const patch of [{ brandId: 'foreign' }, { locationId: 'other' }, { locationId: 'missing' }]) {
      const f = setup({ permissions: ['orderfly.catalog:edit', 'orderfly.catalog:delete'] });
      assert.equal((await f.request('POST', command({ action, ...patch }))).status, 403); assert.equal(f.commits.length, 0);
    }
    for (const mutate of [r => r.delete('brands/brand'), r => r.delete('locations/location'), r => r.set('locations/location', { brandId: 'foreign' }),
      r => r.get('platformAdminControl/access-v1').memberships[0].active = false]) {
      const f = setup({ permissions: ['orderfly.catalog:edit', 'orderfly.catalog:delete'] }); mutate(f.records);
      assert.equal((await f.request('POST', command({ action }))).status, 403); assert.equal(f.commits.length, 0);
    }
  }
});

test('missing/deleted/malformed/foreign records share 404 without leaking metadata', async () => {
  for (const existing of [undefined, record({ deletedAt: { seconds: 2 } }), record({ token: 'PRIVATE_SENTINEL' }),
    record({ schemaVersion: 2 }), record({ revision: 0 }), record({ configuration: config({ id: 'different' }) }),
    record({ configuration: config({ brandId: 'foreign' }) }), record({ configuration: config({ locationId: 'other' }) })]) {
    const f = setup({ existing }); const result = await f.request('POST', command());
    assert.deepEqual(result, { status: 404, body: { error: 'not_found' }, cache: 'no-store', vary: 'Cookie' }); assert.equal(f.commits.length, 0);
  }
});

test('strict command schema rejects invalid IDs/revisions/actions and all unknown/secret fields before storage', async () => {
  for (const input of [null, [], {}, command({ brandId: '' }), command({ locationId: 'a/b' }), command({ printerId: '../x' }),
    command({ action: 'activate' }), command({ action: 'hard-delete' }), command({ actorId: 'PRIVATE_SENTINEL' }),
    command({ configuration: config() }), command({ token: 'PRIVATE_SENTINEL' }),
    ...[undefined, 0, -1, 1.5, '1', Number.MAX_SAFE_INTEGER + 1].map(revision => command({ revision }))]) {
    const f = setup(); const result = await f.request('POST', input);
    assert.equal(result.status, 400); assert.deepEqual(result.body, { error: 'invalid_request' }); assert.equal(f.dbCalls, 0);
  }
});

test('default-off gate is enforced by the service itself and unverified identity never reaches storage', async () => {
  for (const flag of [undefined, 'false', 'TRUE', '1', ' true ']) {
    const f = setup({ enabled: false }); await assert.rejects(f.transition(command(), flag), /writes_unavailable/); assert.equal(f.dbCalls, 0);
  }
  const disabled = setup({ enabled: false }); assert.equal((await disabled.request('POST', command())).status, 503); assert.equal(disabled.dbCalls, 0);
  for (const options of [{ anonymous: true }, { identityStatus: 503 }]) {
    const f = setup(options); const result = await f.request('POST', command());
    assert.equal(result.status, options.anonymous ? 401 : 503); assert.equal(f.dbCalls, 0);
    await assert.rejects(f.transition(command())); assert.equal(f.dbCalls, 0);
  }
});

test('HTTP authentication precedes CSRF/body parsing; same-origin JSON and byte bounds precede storage', async () => {
  const anonymous = setup({ anonymous: true });
  assert.equal((await anonymous.request('POST', {}, { headers: { origin: 'https://foreign.test' }, raw: '{' })).status, 401); assert.equal(anonymous.dbCalls, 0);
  for (const headers of [{ origin: '' }, { origin: 'https://foreign.test' }, { 'sec-fetch-site': 'cross-site' }]) {
    const f = setup(); assert.equal((await f.request('POST', command(), { headers })).status, 403); assert.equal(f.dbCalls, 0);
  }
  for (const options of [{ raw: '{' }, { raw: '' }, { query: '?action=resume' }, { headers: { 'content-type': 'text/plain' } },
    { raw: ' '.repeat(8193), headers: { 'content-length': '1' } }]) {
    const f = setup(); const result = await f.request('POST', command(), options);
    assert.equal(result.status, 400); assert.equal(result.cache, 'no-store'); assert.equal(result.vary, 'Cookie'); assert.equal(f.dbCalls, 0);
  }
});

test('invalid no-op transitions, stale and exhausted revisions cannot create audit entries', async () => {
  for (const [existing, input] of [[record({ configuration: config({ state: 'paused' }) }), command()],
    [record(), command()], [record(), command({ action: 'deactivate' })],
    [record({ configuration: config({ state: 'active' }), revision: 2 }), command()],
    [record({ configuration: config({ state: 'active' }), revision: Number.MAX_SAFE_INTEGER }), command({ revision: Number.MAX_SAFE_INTEGER })]]) {
    const f = setup({ existing }); assert.equal((await f.request('POST', input)).status, 409); assert.equal(f.commits.length, 0);
  }
});

test('concurrent stop actions have one winner; audit/commit failure rolls back all effects', async () => {
  const concurrent = setup();
  const results = await Promise.all(['pause', 'deactivate'].map(action => concurrent.request('POST', command({ action }))));
  assert.deepEqual(results.map(x => x.status).sort(), [200, 409]); assert.equal(concurrent.commits.length, 1);
  assert.equal([...concurrent.records.keys()].filter(x => x.includes('/audit/')).length, 1);
  for (const options of [{ failAudit: true }, { beforeCommit: () => { throw Error('PRIVATE_SENTINEL commit failed'); } }]) {
    const f = setup({ permissions: ['orderfly.catalog:delete'], extra: [['locations/location/printerCapabilityVerifications/p1', { trusted: true }]], ...options });
    const before = structuredClone([...f.records]); const result = await f.request('POST', command({ action: 'delete' }));
    assert.deepEqual(result, { status: 503, body: { error: 'printers_unavailable' }, cache: 'no-store', vary: 'Cookie' });
    assert.deepEqual([...f.records], before); assert.equal(f.commits.length, 0);
  }
});

test('transaction retries re-authorize revocation/reassignment and detect competing revisions', async () => {
  for (const retry of [r => r.get('platformAdminControl/access-v1').memberships[0].active = false,
    r => r.set('locations/location', { brandId: 'foreign' }), r => r.set(path, record({ revision: 2, configuration: config({ state: 'active' }) }))]) {
    const f = setup({ retry }); const result = await f.request('POST', command());
    assert.ok([403, 409].includes(result.status)); assert.equal(f.commits.length, 0);
    assert.equal(f.events.filter(x => x[1] === 'platformAdminControl/access-v1').length, 2);
  }
});
