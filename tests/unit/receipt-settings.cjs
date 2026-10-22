const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { actorId, policy } = require('../helpers/printing-fixture.cjs');
const identity = { provider: 'firebase', subject: 'writer' };
const authority = loadTs('src/lib/access/authority.ts', { 'server-only': {} });
const { DEFAULT_RECEIPT_SETTINGS: defaults, receiptSettingsSchema } = loadTs('src/lib/receipts/settings.ts');
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
  const service = loadTs('src/lib/receipts/settings-server.ts', {
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
  assert.equal(Object.isFrozen(defaults), true); assert.deepEqual(receiptSettingsSchema.parse(defaults), defaults);
  for (const patch of [{ heading: 'x'.repeat(81) }, { footer: 'x'.repeat(241) }, { address: 'x'.repeat(161) }, { phone: 'x'.repeat(41) }, { website: 'x'.repeat(121) }, { heading: '\u001bprint' }, { paperWidthMm: 72 }, { showCustomer: 'true' }, { total: 0 }]) assert.equal(receiptSettingsSchema.safeParse({ ...defaults, ...patch }).success, false);
});
test('missing settings read without writes; create and edit atomically include audit and increment CAS', async () => {
  const f = fixture(); assert.deepEqual(await f.service.readReceiptSettings('brand'), { brandId: 'brand', revision: 0, settings: defaults }); assert.equal(f.writes.length, 0);
  const saved = await f.service.writeReceiptSettings(command()); assert.equal(saved.revision, 1);
  assert.equal(f.records.get('receiptSettings/brand/audit/1').actorId, actorId);
  const settings = { ...defaults, heading: 'Min bon', paperWidthMm: 58 };
  assert.deepEqual(await f.service.writeReceiptSettings(command({ expectedRevision: 1, settings })), { brandId: 'brand', revision: 2, settings });
  assert.equal(f.records.get('receiptSettings/brand/audit/2').previousRevision, 1); assert.equal(f.writes.length, 4);
  await assert.rejects(f.service.writeReceiptSettings(command()), /record_conflict/); assert.equal(f.writes.length, 4);
});
test('parallel writers cannot overwrite the same revision', async () => {
  const f = fixture(); const results = await Promise.allSettled([f.service.writeReceiptSettings(command()), f.service.writeReceiptSettings(command())]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(f.writes.length, 2);
});
test('authentication precedes invalid inputs and database access', async () => {
  const f = fixture({ denied: true }); await assert.rejects(f.service.writeReceiptSettings(null), /forbidden/); await assert.rejects(f.service.readReceiptSettings('../x'), /forbidden/); assert.equal(f.calls, 0);
  for (const input of [null, {}, command({ actorId: 'foreign' }), command({ brandId: '../foreign' }), command({ expectedRevision: Number.MAX_SAFE_INTEGER }), command({ settings: { ...defaults, tax: 0 } })]) {
    const valid = fixture(); await assert.rejects(valid.service.writeReceiptSettings(input), /invalid_request/); assert.equal(valid.calls, 0);
  }
});
test('fresh policy and native brand scope reject revoked, inactive, foreign or deleted records', async () => {
  for (const mutate of [r => r.get('platformAdminControl/access-v1').principals[0].active = false,
    r => r.get('platformAdminControl/access-v1').companies[0].active = false,
    r => r.get('platformAdminControl/access-v1').companies[0].orderflyBrandIds = ['foreign'],
    r => r.get('platformAdminControl/access-v1').roles.find(x => x.id === 'owner').active = false,
    r => r.delete('brands/brand'), r => r.set('brands/brand', { status: 'active', id: 'foreign' }), r => r.set('brands/brand', { status: 'active', deleted: true })]) {
    const f = fixture(); mutate(f.records); await assert.rejects(f.service.writeReceiptSettings(command()), /forbidden/); assert.equal(f.writes.length, 0);
  }
  const retry = fixture({ retry: r => r.get('platformAdminControl/access-v1').principals[0].active = false });
  await assert.rejects(retry.service.writeReceiptSettings(command()), /forbidden/); assert.equal(retry.writes.length, 0);
});
test('authorized location staff read settings; wrong or missing scope and editor operations denied', async () => {
  const f = fixture({ staff: true }); assert.equal((await f.service.readReceiptSettingsForOrder('brand', 'location')).revision, 0);
  await assert.rejects(f.service.readReceiptSettingsForOrder('brand'), /forbidden/);
  await assert.rejects(f.service.readReceiptSettingsForOrder('brand', 'other'), /forbidden/);
  f.records.set('locations/location', { brandId: 'foreign' }); await assert.rejects(f.service.readReceiptSettingsForOrder('brand', 'location'), /forbidden/);
  await assert.rejects(f.service.writeReceiptSettings(command()), /forbidden/);
});
test('historical inactive brand receipts preserve order access while current permission and native ownership remain required', async () => {
  for (const brand of [{ isActive: false }, { deleted: true }, { isDeleted: true, deletedAt: 123 }, { isTestData: true }]) {
    const f = fixture({ staff: true }); f.records.set('brands/brand', brand);
    assert.deepEqual(await f.service.readReceiptSettingsForOrder('brand', 'location'), { brandId: 'brand', revision: 0, settings: defaults });
    f.records.set('locations/location', { brandId: 'foreign' });
    await assert.rejects(f.service.readReceiptSettingsForOrder('brand', 'location'), /forbidden/);
    const editor = fixture(); editor.records.set('brands/brand', { status: 'active', ...brand });
    await assert.rejects(editor.service.readReceiptSettings('brand'), /forbidden/);
    await assert.rejects(editor.service.writeReceiptSettings(command()), /forbidden/);
    assert.equal(editor.writes.length, 0);
  }
  for (const mutate of [r => r.get('platformAdminControl/access-v1').roles[0].permissions = [],
    r => r.get('platformAdminControl/access-v1').companies[0].active = false,
    r => r.get('platformAdminControl/access-v1').companies[0].orderflyBrandIds = ['foreign'],
    r => r.delete('brands/brand')]) {
    const f = fixture({ staff: true }); f.records.set('brands/brand', { isActive: false }); mutate(f.records);
    await assert.rejects(f.service.readReceiptSettingsForOrder('brand', 'location'), /forbidden/);
  }
});
test('editor honors canonical brand status on reads, writes and transaction retries while historical reads remain available', async () => {
  for (const status of ['active', 'pending', 'trialing']) {
    const f = fixture(); f.records.set('brands/brand', { status });
    assert.equal((await f.service.readReceiptSettings('brand')).revision, 0);
    assert.equal((await f.service.writeReceiptSettings(command())).revision, 1);
  }
  for (const status of ['suspended', 'unknown', undefined, null, false]) {
    const f = fixture(); f.records.set('brands/brand', { status, isActive: true });
    await assert.rejects(f.service.readReceiptSettings('brand'), /forbidden/);
    await assert.rejects(f.service.writeReceiptSettings(command()), /forbidden/);
    assert.equal(f.writes.length, 0);
    assert.equal((await f.service.readReceiptSettingsForOrder('brand', 'location')).revision, 0);
  }
  const retry = fixture({ retry: rows => rows.set('brands/brand', { status: 'suspended' }) });
  await assert.rejects(retry.service.writeReceiptSettings(command()), /forbidden/);
  assert.equal(retry.writes.length, 0);
});
test('audit failure is atomic; unknown and corrupt settings fail closed without data leakage', async () => {
  for (const options of [{ failAudit: true }, { unknown: true }]) {
    const f = fixture(options); await assert.rejects(f.service.writeReceiptSettings(command()), e => e.message === 'settings_unavailable' && e.status === 503);
    assert.equal(f.writes.length, 0); assert.equal(f.records.has('receiptSettings/brand'), false);
  }
  for (const row of [{}, { schemaVersion: 1, brandId: 'foreign', revision: 1, settings: defaults }, { schemaVersion: 1, brandId: 'brand', revision: 0, settings: defaults }]) {
    const f = fixture(); f.records.set('receiptSettings/brand', row); await assert.rejects(f.service.readReceiptSettings('brand'), /settings_unavailable/); await assert.rejects(f.service.writeReceiptSettings(command()), /settings_unavailable/); assert.equal(f.writes.length, 0);
  }
});
