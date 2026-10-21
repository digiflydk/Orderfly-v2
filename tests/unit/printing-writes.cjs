const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture, config, record, path, actorId } = require('../helpers/printing-fixture.cjs');

test('authorized create atomically stores disabled v1 config, server timestamps, actor audit and safe DTO', async () => {
  const f = fixture({ extra: [['locations/location/printerCapabilityVerifications/p1', { trusted: true }]] });
  const result = await f.request();
  assert.deepEqual(result, { status: 201, body: { item: { configuration: config(), revision: 1 } }, cache: 'no-store', vary: 'Cookie' });
  assert.deepEqual(f.records.get(path), record({ createdAt: { serverTimestamp: true }, updatedAt: { serverTimestamp: true } }));
  const audit = f.records.get(`${path}/audit/1`);
  assert.deepEqual(audit, { schemaVersion: 1, actorId, action: 'printer.create', revision: 1, before: null,
    after: config(), capabilityInvalidated: true, createdAt: { serverTimestamp: true } });
  assert.equal(f.records.has('locations/location/printerCapabilityVerifications/p1'), false);
  assert.equal(f.commits.length, 1);
  assert.deepEqual(f.events.slice(0, 3).map(x => x[1]), ['platformAdminControl/access-v1', 'brands/brand', 'locations/location']);
  assert.doesNotMatch(JSON.stringify(result.body), /actor|audit|createdAt|schemaVersion|serverTimestamp/);
});

test('edit preserves createdAt, advances revision, audits before/after and invalidates trusted evidence', async () => {
  const f = fixture({ existing: record(), extra: [['locations/location/printerCapabilityVerifications/p1', { firmware: '5.1' }]] });
  const updated = config({ name: 'Varmt køkken', model: 'mc-print2', paperWidthMm: 58 });
  const result = await f.request('PATCH', { configuration: updated, revision: 1 });
  assert.equal(result.status, 200); assert.deepEqual(result.body, { item: { configuration: updated, revision: 2 } });
  assert.deepEqual(f.records.get(path), record({ configuration: updated, revision: 2, updatedAt: { serverTimestamp: true } }));
  assert.deepEqual(f.records.get(`${path}/audit/2`).before, config());
  assert.deepEqual(f.records.get(`${path}/audit/2`).after, updated);
  assert.equal(f.records.has('locations/location/printerCapabilityVerifications/p1'), false);
});

test('missing and non-exact write flags fail closed before storage; service itself enforces gate and identity', async () => {
  for (const flag of [undefined, 'false', 'TRUE', '1', ' true ']) {
    const f = fixture({ enabled: false });
    await assert.rejects(f.direct('create', { configuration: config() }, flag), /writes_unavailable/);
    assert.equal(f.dbCalls, 0); assert.equal(f.commits.length, 0);
  }
  const f = fixture({ enabled: false });
  assert.equal((await f.request()).status, 503); assert.equal(f.dbCalls, 0);
  const anonymous = fixture({ anonymous: true });
  await assert.rejects(anonymous.direct('create', { configuration: config() }), /unauthorized/);
  assert.equal(anonymous.dbCalls, 0);
});

test('sessions, CSRF, JSON and query boundaries reject before any transaction', async () => {
  for (const method of ['POST', 'PATCH']) {
    const anonymous = fixture({ anonymous: true });
    assert.equal((await anonymous.request(method, {}, { headers: { origin: 'https://foreign.test' }, raw: '{' })).status, 401);
    assert.equal(anonymous.dbCalls, 0);
    for (const headers of [{ origin: 'https://foreign.test' }, { origin: '' }, { 'sec-fetch-site': 'cross-site' }]) {
      const f = fixture(); const result = await f.request(method, {}, { headers });
      assert.equal(result.status, 403); assert.equal(f.dbCalls, 0); assert.equal(result.cache, 'no-store');
    }
    for (const options of [{ headers: { 'content-type': 'text/plain' } }, { raw: '{' }, { raw: '' },
      { raw: ' '.repeat(8193), headers: { 'content-length': '1' } }, { query: '?brandId=foreign' }]) {
      const f = fixture(); assert.equal((await f.request(method, {}, options)).status, 400); assert.equal(f.dbCalls, 0);
    }
  }
});

test('strict payload rejects unknown/secret/actor/evidence fields, unsafe IDs, invalid device combinations and activation', async () => {
  for (const body of [null, [], {}, { configuration: config(), revision: 1 }, { configuration: config(), actorId: 'PRIVATE_SENTINEL' },
    ...[{ credentials: 'PRIVATE_SENTINEL' }, { verified: true }, { id: '../foreign' }, { locationId: 'l/x' },
      { brandId: '' }, { name: 'Pizza\u202e' }, { model: 'mc-print2', transport: 'cloudprnt-mqtt' },
      { model: 'mc-print2', paperWidthMm: 80 }, { state: 'active' }, { state: 'paused' }].map(patch => ({ configuration: config(patch) }))]) {
    const f = fixture(); const result = await f.request('POST', body);
    assert.deepEqual(result.body, { error: 'invalid_request' }); assert.equal(result.status, 400);
    assert.equal(f.dbCalls, 0); assert.doesNotMatch(JSON.stringify(result), /PRIVATE_SENTINEL|credentials/);
  }
  for (const revision of [undefined, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1']) {
    const f = fixture({ existing: record() });
    assert.equal((await f.request('PATCH', { configuration: config(), revision })).status, 400); assert.equal(f.dbCalls, 0);
  }
});

test('current transaction grants separate create/edit from view and reject foreign company/location and missing ownership', async () => {
  for (const method of ['POST', 'PATCH']) {
    const body = { configuration: config(), ...(method === 'PATCH' ? { revision: 1 } : {}) };
    for (const permissions of [[], ['orderfly.catalog:view'], [method === 'POST' ? 'orderfly.catalog:edit' : 'orderfly.catalog:create']]) {
      const f = fixture({ permissions, existing: method === 'PATCH' ? record() : undefined });
      assert.equal((await f.request(method, body)).status, 403); assert.equal(f.commits.length, 0);
    }
    for (const patch of [{ brandId: 'foreign' }, { locationId: 'other' }, { locationId: 'missing' }]) {
      const f = fixture(); const result = await f.request(method, { ...body, configuration: config(patch) });
      assert.equal(result.status, 403); assert.equal(f.commits.length, 0);
    }
    for (const mutate of [r => r.delete('brands/brand'), r => r.delete('locations/location'),
      r => r.set('locations/location', { brandId: 'foreign' }), r => r.get('platformAdminControl/access-v1').principals[0].active = false,
      r => r.get('platformAdminControl/access-v1').memberships[0].active = false,
      r => r.get('platformAdminControl/access-v1').companies[0].active = false]) {
      const f = fixture(); mutate(f.records);
      assert.equal((await f.request(method, body)).status, 403); assert.equal(f.commits.length, 0);
    }
  }
});

test('concurrent/stale edits cannot overwrite a revision or double-create audit history', async () => {
  const f = fixture({ existing: record() });
  const results = await Promise.all(['Pizza', 'Pasta'].map(name => f.request('PATCH', { configuration: config({ name }), revision: 1 })));
  assert.deepEqual(results.map(x => x.status).sort(), [200, 409]);
  assert.equal(f.records.get(path).revision, 2); assert.equal(f.commits.length, 1);
  assert.equal([...f.records.keys()].filter(x => x.includes('/audit/')).length, 1);
  const create = fixture();
  assert.deepEqual((await Promise.all([create.request(), create.request()])).map(x => x.status).sort(), [201, 409]);
  assert.equal(create.commits.length, 1);
});

test('create cannot reuse any existing ID; edit hides deleted/corrupt/foreign records and forbids lifecycle bypass', async () => {
  for (const existing of [record(), record({ deletedAt: { seconds: 2 } }), { legacy: true }]) {
    const f = fixture({ existing }); assert.equal((await f.request()).status, 409); assert.equal(f.commits.length, 0);
  }
  for (const existing of [undefined, record({ deletedAt: { seconds: 2 } }), record({ token: 'PRIVATE_SENTINEL' }),
    record({ configuration: config({ brandId: 'foreign' }) }), record({ configuration: config({ locationId: 'other' }) }),
    record({ configuration: config({ id: 'different' }) }), record({ schemaVersion: 2 }), record({ revision: 0 })]) {
    const f = fixture({ existing }); const result = await f.request('PATCH', { configuration: config(), revision: 1 });
    assert.deepEqual(result.body, { error: 'not_found' }); assert.equal(result.status, 404); assert.equal(f.commits.length, 0);
  }
  for (const existing of [record({ configuration: config({ state: 'active' }) }), record({ configuration: config({ state: 'paused' }) }), record({ revision: Number.MAX_SAFE_INTEGER })]) {
    const f = fixture({ existing }); assert.equal((await f.request('PATCH', { configuration: config(), revision: existing.revision })).status, 409);
    assert.equal(f.commits.length, 0);
  }
});

test('audit or commit failure rolls back configuration and evidence invalidation with generic safe error', async () => {
  for (const options of [{ failAudit: true }, { beforeCommit: () => { throw Error('PRIVATE_SENTINEL commit'); } }]) {
    const f = fixture({ existing: record(), extra: [['locations/location/printerCapabilityVerifications/p1', { trusted: true }]], ...options });
    const before = structuredClone([...f.records]);
    const result = await f.request('PATCH', { configuration: config({ name: 'Pasta' }), revision: 1 });
    assert.deepEqual(result, { status: 503, body: { error: 'printers_unavailable' }, cache: 'no-store', vary: 'Cookie' });
    assert.deepEqual([...f.records], before); assert.equal(f.commits.length, 0);
  }
});

test('transaction retry rechecks revocation, reassigned location and competing revision before any commit', async () => {
  for (const retry of [r => r.get('platformAdminControl/access-v1').memberships[0].active = false,
    r => r.set('locations/location', { brandId: 'foreign' }), r => r.set(path, record({ revision: 2 }))]) {
    const f = fixture({ existing: record(), retry });
    const result = await f.request('PATCH', { configuration: config({ name: 'Pasta' }), revision: 1 });
    assert.ok([403, 409].includes(result.status)); assert.equal(f.commits.length, 0);
    assert.equal(f.records.get(path).configuration.name, config().name);
    assert.equal([...f.records.keys()].some(key => key.includes('/audit/')), false);
    assert.equal(f.events.filter(x => x[1] === 'platformAdminControl/access-v1').length, 2);
  }
});

test('identity infrastructure outage stays 503 and never touches storage', async () => {
  const f = fixture({ identityStatus: 503 });
  const result = await f.request(); assert.equal(result.status, 503); assert.deepEqual(result.body, { error: 'printers_unavailable' }); assert.equal(f.dbCalls, 0);
});
