const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { actorId, policy } = require('../helpers/printing-fixture.cjs');
const identity = { provider: 'firebase', subject: 'writer' };
const authority = loadTs('src/lib/access/authority.ts', { 'server-only': {} });
const { DEFAULT_KITCHEN_SETTINGS: defaults, kitchenSettingsSchema } = loadTs('src/lib/receipts/kitchen-settings.ts');
const command = (patch = {}) => ({ brandId: 'brand', expectedRevision: 0, settings: { ...defaults }, ...patch });
function fixture(options = {}) {
  const p = policy(['orderfly.orders:view']);
  if (!options.staff) {
    p.roles.push({ id: 'owner', name: 'Owner', companyId: null, kind: 'superuser', permissions: [], active: true });
    p.memberships.push({ id: 'owner', principalId: actorId, companyId: null, locationIds: null, roleIds: ['owner'], active: true });
  }
  const records = new Map([['platformAdminControl/access-v1', p], ['brands/brand', { status: 'active' }], ['locations/location', { brandId: 'brand' }]]);
  let calls = 0, retried = false, queue = Promise.resolve(); const writes = [];
  const ref = path => ({ path, id: path.split('/').at(-1), collection: name => ({ doc: id => ref(`${path}/${name}/${id}`) }) });
  const db = { collection: name => ({ doc: id => ref(`${name}/${id}`) }), runTransaction(run) {
    const pending = queue.then(async () => {
      for (;;) {
        const staged = new Map(structuredClone([...records])), changes = []; let writing = false;
        const tx = { async get(ref) { assert.equal(writing, false); return { id: ref.id, exists: staged.has(ref.path), data: () => staged.get(ref.path) }; },
          create(ref, value) { writing = true; if (options.failAudit && ref.path.includes('/audit/')) throw Error('PRIVATE audit'); assert.equal(staged.has(ref.path), false); changes.push(ref.path); staged.set(ref.path, value); },
          set(ref, value) { writing = true; changes.push(ref.path); staged.set(ref.path, value); } };
        const result = await run(tx);
        if (options.retry && !retried) { retried = true; options.retry(records); continue; }
        if (options.unknown) throw Error('PRIVATE unknown commit');
        records.clear(); for (const row of staged) records.set(...row); writes.push(...changes); return result;
      }
    }); queue = pending.catch(() => {}); return pending;
  }};
  const service = loadTs('src/lib/receipts/kitchen-settings-server.ts', {
    'server-only': {}, '@/lib/access/authority': authority, './authority': authority,
    '@/lib/firebase-admin': { getAdminDb() { calls++; return db; } },
    '@/lib/access/orderfly-session': {
      async requirePlatformSuperuser() { if (options.denied || options.staff) throw new authority.AuthorityError('forbidden'); return { identity }; },
      async verifiedOrderflyIdentity() { if (options.denied) throw new authority.AuthorityError('unauthorized', 401); return identity; },
    }, 'firebase-admin/firestore': { FieldValue: { serverTimestamp: () => ({ serverTimestamp: true }) } },
  });
  return { service, records, writes, get calls() { return calls; } };
}
test('defaults are frozen, safe, strictly bounded and reject controls and unknown fields', () => {
  assert.equal(Object.isFrozen(defaults), true); assert.deepEqual(kitchenSettingsSchema.parse(defaults), defaults);
  for (const patch of [{ heading: 'x'.repeat(81) }, { textSize: 'tiny' }, { showNotes: false }, { showModifiers: false }, { groupByCategory: 'true' }, { heading: '\u001bprint' }, { paperWidthMm: 72 }, { showCustomer: 'true' }, { total: 0 }]) assert.equal(kitchenSettingsSchema.safeParse({ ...defaults, ...patch }).success, false);
});
test('missing settings read without writes; create and edit atomically include audit and increment CAS', async () => {
  const f = fixture(); assert.deepEqual(await f.service.readKitchenSettings('brand'), { brandId: 'brand', revision: 0, settings: defaults }); assert.equal(f.writes.length, 0);
  const saved = await f.service.writeKitchenSettings(command()); assert.equal(saved.revision, 1);
  assert.equal(f.records.get('kitchenReceiptSettings/brand/audit/1').actorId, actorId);
  const settings = { ...defaults, heading: 'Min bon', paperWidthMm: 58 };
  assert.deepEqual(await f.service.writeKitchenSettings(command({ expectedRevision: 1, settings })), { brandId: 'brand', revision: 2, settings });
  assert.equal(f.records.get('kitchenReceiptSettings/brand/audit/2').previousRevision, 1); assert.equal(f.writes.length, 4);
  await assert.rejects(f.service.writeKitchenSettings(command()), /record_conflict/); assert.equal(f.writes.length, 4);
});
test('parallel writers cannot overwrite the same revision', async () => {
  const f = fixture(); const results = await Promise.allSettled([f.service.writeKitchenSettings(command()), f.service.writeKitchenSettings(command())]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(f.writes.length, 2);
});
test('authentication precedes invalid inputs and database access', async () => {
  const f = fixture({ denied: true }); await assert.rejects(f.service.writeKitchenSettings(null), /forbidden/); await assert.rejects(f.service.readKitchenSettings('../x'), /forbidden/); assert.equal(f.calls, 0);
  for (const input of [null, {}, command({ actorId: 'foreign' }), command({ brandId: '../foreign' }), command({ expectedRevision: Number.MAX_SAFE_INTEGER }), command({ settings: { ...defaults, tax: 0 } })]) {
    const valid = fixture(); await assert.rejects(valid.service.writeKitchenSettings(input), /invalid_request/); assert.equal(valid.calls, 0);
  }
});
test('fresh policy and native brand scope reject revoked, inactive, foreign or deleted records', async () => {
  for (const mutate of [r => r.get('platformAdminControl/access-v1').principals[0].active = false,
    r => r.get('platformAdminControl/access-v1').companies[0].active = false,
    r => r.get('platformAdminControl/access-v1').companies[0].orderflyBrandIds = ['foreign'],
    r => r.get('platformAdminControl/access-v1').roles.find(x => x.id === 'owner').active = false,
    r => r.delete('brands/brand'), r => r.set('brands/brand', { status: 'active', id: 'foreign' }), r => r.set('brands/brand', { status: 'active', deleted: true })]) {
    const f = fixture(); mutate(f.records); await assert.rejects(f.service.writeKitchenSettings(command()), /forbidden/); assert.equal(f.writes.length, 0);
  }
  const retry = fixture({ retry: r => r.get('platformAdminControl/access-v1').principals[0].active = false });
  await assert.rejects(retry.service.writeKitchenSettings(command()), /forbidden/); assert.equal(retry.writes.length, 0);
});
test('authorized location staff read settings; wrong or missing scope and editor operations denied', async () => {
  const f = fixture({ staff: true }); assert.equal((await f.service.readKitchenSettingsForOrder('brand', 'location')).revision, 0);
  await assert.rejects(f.service.readKitchenSettingsForOrder('brand'), /forbidden/);
  await assert.rejects(f.service.readKitchenSettingsForOrder('brand', 'other'), /forbidden/);
  f.records.set('locations/location', { brandId: 'foreign' }); await assert.rejects(f.service.readKitchenSettingsForOrder('brand', 'location'), /forbidden/);
  await assert.rejects(f.service.writeKitchenSettings(command()), /forbidden/);
});
test('historical inactive brand receipts preserve order access while current permission and native ownership remain required', async () => {
  for (const brand of [{ isActive: false }, { deleted: true }, { isDeleted: true, deletedAt: 123 }, { isTestData: true }]) {
    const f = fixture({ staff: true }); f.records.set('brands/brand', brand);
    assert.deepEqual(await f.service.readKitchenSettingsForOrder('brand', 'location'), { brandId: 'brand', revision: 0, settings: defaults });
    f.records.set('locations/location', { brandId: 'foreign' });
    await assert.rejects(f.service.readKitchenSettingsForOrder('brand', 'location'), /forbidden/);
    const editor = fixture(); editor.records.set('brands/brand', { status: 'active', ...brand });
    await assert.rejects(editor.service.readKitchenSettings('brand'), /forbidden/);
    await assert.rejects(editor.service.writeKitchenSettings(command()), /forbidden/);
    assert.equal(editor.writes.length, 0);
  }
  for (const mutate of [r => r.get('platformAdminControl/access-v1').roles[0].permissions = [],
    r => r.get('platformAdminControl/access-v1').companies[0].active = false,
    r => r.get('platformAdminControl/access-v1').companies[0].orderflyBrandIds = ['foreign'],
    r => r.delete('brands/brand')]) {
    const f = fixture({ staff: true }); f.records.set('brands/brand', { isActive: false }); mutate(f.records);
    await assert.rejects(f.service.readKitchenSettingsForOrder('brand', 'location'), /forbidden/);
  }
});
test('editor honors canonical brand status on reads, writes and transaction retries while historical reads remain available', async () => {
  for (const status of ['active', 'pending', 'trialing']) {
    const f = fixture(); f.records.set('brands/brand', { status });
    assert.equal((await f.service.readKitchenSettings('brand')).revision, 0);
    assert.equal((await f.service.writeKitchenSettings(command())).revision, 1);
  }
  for (const status of ['suspended', 'unknown', undefined, null, false]) {
    const f = fixture(); f.records.set('brands/brand', { status, isActive: true });
    await assert.rejects(f.service.readKitchenSettings('brand'), /forbidden/);
    await assert.rejects(f.service.writeKitchenSettings(command()), /forbidden/);
    assert.equal(f.writes.length, 0);
    assert.equal((await f.service.readKitchenSettingsForOrder('brand', 'location')).revision, 0);
  }
  const retry = fixture({ retry: rows => rows.set('brands/brand', { status: 'suspended' }) });
  await assert.rejects(retry.service.writeKitchenSettings(command()), /forbidden/);
  assert.equal(retry.writes.length, 0);
});
test('audit failure is atomic; unknown and corrupt settings fail closed without data leakage', async () => {
  for (const options of [{ failAudit: true }, { unknown: true }]) {
    const f = fixture(options); await assert.rejects(f.service.writeKitchenSettings(command()), e => e.message === 'settings_unavailable' && e.status === 503);
    assert.equal(f.writes.length, 0); assert.equal(f.records.has('kitchenReceiptSettings/brand'), false);
  }
  for (const row of [{}, { schemaVersion: 1, brandId: 'foreign', revision: 1, settings: defaults }, { schemaVersion: 1, brandId: 'brand', revision: 0, settings: defaults }]) {
    const f = fixture(); f.records.set('kitchenReceiptSettings/brand', row); await assert.rejects(f.service.readKitchenSettings('brand'), /settings_unavailable/); await assert.rejects(f.service.writeKitchenSettings(command()), /settings_unavailable/); assert.equal(f.writes.length, 0);
  }
});

test('kitchen records and revisions stay independent from customer receipts', async () => {
  const f = fixture();
  const customer = { brandId: 'brand', revision: 7, settings: { heading: 'Customer receipt' } };
  f.records.set('receiptSettings/brand', customer);
  assert.equal((await f.service.readKitchenSettings('brand')).revision, 0);
  await f.service.writeKitchenSettings(command());
  assert.deepEqual(f.records.get('receiptSettings/brand'), customer);
  assert.equal(f.records.get('kitchenReceiptSettings/brand').revision, 1);
  assert.equal(f.records.get('kitchenReceiptSettings/brand/audit/1').action, 'kitchen-receipt.settings.update');
  assert.ok(f.writes.every(path => path.startsWith('kitchenReceiptSettings/brand')));
});

(() => {
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const authority = loadTs('src/lib/access/authority.ts', { 'server-only': {} });
const schema = loadTs('src/lib/receipts/kitchen-settings-server.ts', { 'server-only': {} });
const { DEFAULT_KITCHEN_SETTINGS: settings } = loadTs('src/lib/receipts/kitchen-settings.ts');
const command = { brandId: 'brand', expectedRevision: 0, settings };
const result = { brandId: 'brand', revision: 1, settings };
function req(method = 'PUT', options = {}) {
  return new Request(`https://orderfly.dk/api/superadmin/receipts/kitchen${options.query ?? (method === 'GET' ? '?brandId=brand' : '')}`, {
    method, headers: { origin: 'https://orderfly.dk', 'content-type': 'application/json', ...options.headers },
    ...(method === 'GET' ? {} : { body: options.raw ?? JSON.stringify(options.body ?? command) }),
    ...(options.raw instanceof ReadableStream ? { duplex: 'half' } : {}),
  });
}
function fixture(options = {}) {
  const calls = [], events = [];
  const route = loadTs('src/app/api/superadmin/receipts/kitchen/route.ts', {
    'server-only': {}, '@/lib/access/authority': authority,
    '@/lib/access/orderfly-session': { async requirePlatformSuperuser() { events.push('auth'); if (options.denied) throw new authority.AuthorityError('PRIVATE auth', options.denied); } },
    '@/lib/url': { getOrigin: async () => 'https://orderfly.dk' },
    './kitchen-settings-server': { ...schema,
      async readKitchenSettings(brandId) { calls.push(brandId); if (options.error) throw options.error; return options.result ?? result; },
      async writeKitchenSettings(input) { calls.push(input); if (options.error) throw options.error; return options.result ?? result; },
    },
  });
  return { calls, events, async run(request = req(), method = 'PUT') {
    const response = await route[method](request);
    assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(response.headers.get('vary'), 'Cookie');
    return { status: response.status, body: await response.json() };
  }};
}
test('actual route returns strict settings shape for GET and committed PUT', async () => {
  for (const method of ['GET', 'PUT']) { const f = fixture(); assert.deepEqual(await f.run(req(method), method), { status: 200, body: result }); assert.equal(f.calls.length, 1); }
});
test('authentication precedes all request inspection and protects every response', async () => {
  for (const denied of [401, 403]) for (const method of ['GET', 'PUT']) {
    const f = fixture({ denied }); const response = await f.run(new Proxy({}, { get() { throw Error('PRIVATE request'); } }), method);
    assert.equal(response.status, denied); assert.deepEqual(f.events, ['auth']); assert.equal(f.calls.length, 0); assert.doesNotMatch(JSON.stringify(response), /PRIVATE/);
  }
});
test('CSRF and strict URL/JSON validation reject before service', async () => {
  for (const headers of [{ origin: '' }, { origin: 'https://foreign.test' }, { 'sec-fetch-site': 'cross-site' }]) {
    const f = fixture(); assert.equal((await f.run(req('PUT', { headers }))).status, 403); assert.equal(f.calls.length, 0);
  }
  const crossSite = fixture(); assert.equal((await crossSite.run(req('GET', { headers: { 'sec-fetch-site': 'cross-site' } }), 'GET')).status, 403);
  for (const query of ['', '?brandId=brand&brandId=foreign', '?brandId=brand&extra=x', '?brandId=../other']) {
    const f = fixture(); assert.equal((await f.run(req('GET', { query }), 'GET')).status, 400); assert.equal(f.calls.length, 0);
  }
  for (const options of [{ query: '?brandId=brand' }, { raw: '{' }, { raw: Buffer.from([0xff]) }, { headers: { 'content-type': 'text/plain' } }, { body: { ...command, actorId: 'other' } }, { body: { ...command, settings: { ...settings, total: 0 } } }]) {
    const f = fixture(); assert.equal((await f.run(req('PUT', options))).status, 400); assert.equal(f.calls.length, 0);
  }
});
test('streamed body byte bound rejects forged content length and cancels reader', async () => {
  let canceled = false;
  const raw = new ReadableStream({ start(controller) { controller.enqueue(Buffer.from(' '.repeat(8193))); }, cancel() { canceled = true; } });
  const f = fixture(); assert.equal((await f.run(req('PUT', { raw, headers: { 'content-length': '1' } }))).status, 400); assert.equal(canceled, true); assert.equal(f.calls.length, 0);
});
test('conflicts and auth map safely; unknown errors and corrupt/foreign responses fail closed', async () => {
  const conflict = fixture({ error: new schema.KitchenSettingsError('record_conflict', 409) });
  assert.deepEqual(await conflict.run(), { status: 409, body: { error: 'record_conflict' } });
  for (const method of ['GET', 'PUT']) {
    for (const options of [{ error: Error('PRIVATE driver') }, { result: { ...result, brandId: 'foreign' } }, { result: { ...result, private: 'PRIVATE' } }, { result: { ...result, settings: { ...settings, tax: 0 } } }]) {
      const f = fixture(options); assert.deepEqual(await f.run(req(method), method), { status: 503, body: { error: 'settings_unavailable' } });
    }
  }
  assert.equal((await fixture({ result: { ...result, revision: 4 } }).run()).status, 503);
});

})();
