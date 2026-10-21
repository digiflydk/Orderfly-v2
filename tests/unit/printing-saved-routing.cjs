const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { policy: companyPolicy, actorId, config, record } = require('../helpers/printing-fixture.cjs');
const authority = loadTs('src/lib/access/authority.ts', { 'server-only': {} });
const identity = { provider: 'firebase', subject: 'writer' };
const scope = { brandId: 'brand', locationId: 'location' };
const path = 'locations/location/printerRouting/original';
const rule = (patch = {}) => ({ id: 'rule1', ...scope, printerId: 'p1', match: { type: 'product', id: 'pizza' }, effect: 'include', ...patch });
const command = (patch = {}) => ({ ...scope, expectedRevision: 0, rules: [rule()], ...patch });
function fixture({ anonymous = false, merchant = false, enabled = true, retry, failAudit = false, failCommit = false } = {}) {
  const policy = companyPolicy(['orderfly.catalog:view', 'orderfly.catalog:edit']);
  policy.roles.push({ id: 'owner', name: 'Platform owner', companyId: null, kind: 'superuser', permissions: [], active: true });
  policy.memberships.push({ id: 'owner', principalId: actorId, companyId: null, locationIds: null, roleIds: ['owner'], active: true });
  const rows = new Map([['platformAdminControl/access-v1', policy], ['brands/brand', {}], ['locations/location', { brandId: 'brand' }],
    ['locations/location/printers/p1', record()], ['products/pizza', { brandId: 'brand', categoryId: 'food', productName: 'Pizza', isActive: true, locationIds: [] }],
    ['categories/food', { categoryName: 'Food', isActive: true, locationIds: ['location'], brandId: 'legacy-brand' }]]);
  const events = [], commits = [], failReads = new Set(); let dbCalls = 0, sessionCalls = 0, serial = Promise.resolve(), retried = false;
  const collection = name => ({ doc: key => ref(`${name}/${key}`) });
  const ref = key => ({ path: key, id: key.split('/').at(-1), collection: name => collection(`${key}/${name}`) });
  const db = { collection, runTransaction(run, options) {
    const job = serial.then(async () => { for (;;) {
      events.push(['attempt', 'transaction']);
      const staged = new Map(structuredClone([...rows])), writes = []; let writing = false;
      const tx = {
        async get(ref) { assert.equal(writing, false, 'all reads before writes'); events.push(['get', ref.path]);
          if (failReads.has(ref.path)) throw Error('SECRET_SENTINEL');
          return { id: ref.id, exists: staged.has(ref.path), data: () => structuredClone(staged.get(ref.path)) }; },
        create(ref, data) { assert.notEqual(options?.readOnly, true); writing = true;
          if (staged.has(ref.path) || failAudit && ref.path.includes('/audit/')) throw Error('SECRET_SENTINEL');
          writes.push(['create', ref.path]); staged.set(ref.path, structuredClone(data)); },
        set(ref, data) { assert.notEqual(options?.readOnly, true); writing = true; writes.push(['set', ref.path]); staged.set(ref.path, structuredClone(data)); },
      };
      const result = await run(tx);
      if (retry && !retried) { retried = true; retry(rows); continue; }
      if (failCommit) throw Error('SECRET_SENTINEL');
      if (!options?.readOnly) { rows.clear(); for (const entry of staged) rows.set(...entry); commits.push(writes); }
      return result;
    }}); serial = job.catch(() => {}); return job;
  } };
  const session = async () => { sessionCalls++;
    if (anonymous) throw new authority.AuthorityError('unauthorized', 401);
    if (merchant) throw new authority.AuthorityError('forbidden', 403);
    return { identity, actorId, superuser: true };
  };
  const mocks = { 'server-only': {}, '@/lib/access/authority': authority, './authority': authority,
    '@/lib/firebase-admin': { getAdminDb: () => { dbCalls++; return db; } },
    '@/lib/access/orderfly-session': { requirePlatformSuperuser: session },
    'firebase-admin/firestore': { FieldValue: { serverTimestamp: () => ({ serverTimestamp: true }) } },
    '@/lib/url': { getOrigin: async () => 'https://orderfly.dk' } };
  const service = loadTs('src/lib/printing/saved-routing.ts', mocks), route = loadTs('src/app/api/superadmin/printers/routing/route.ts', mocks);
  async function flag(run, override = enabled ? 'true' : undefined) {
    const before = process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED;
    if (override === undefined) delete process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED; else process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED = override;
    try { return await run(); } finally { if (before === undefined) delete process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED; else process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED = before; }
  }
  return { rows, events, commits, failReads, db, get dbCalls() { return dbCalls; }, get sessionCalls() { return sessionCalls; },
    read: input => service.readSavedPrinterRouting(input ?? scope),
    write: (input = command(), override) => flag(() => service.writeSavedPrinterRouting(input), override),
    prepare: input => service.prepareSavedPrinterRouting({ db, transaction: { get: async ref => ({ id: ref.id, exists: rows.has(ref.path), data: () => rows.get(ref.path) }) } }, input ?? scope),
    async request(method = 'PUT', body = command(), options = {}) { return flag(async () => {
      const request = new Request(`https://orderfly.dk/api/superadmin/printers/routing${options.query ?? (method === 'GET' ? '?brandId=brand&locationId=location' : '')}`, {
        method, headers: { origin: 'https://orderfly.dk', 'content-type': 'application/json', ...options.headers },
        ...(method === 'GET' ? {} : { body: options.raw ?? JSON.stringify(body) }),
      });
      const response = await route[method](request);
      return { status: response.status, body: await response.json(), cache: response.headers.get('cache-control'), vary: response.headers.get('vary') };
    }); },
  };
}
const rejects = (run, code) => assert.rejects(run, error => error.code === code);

test('missing routing is empty defaultOFF with no printer fallback or writes', async () => {
  const f = fixture(); const result = await f.read();
  assert.deepEqual(result, { scope, revision: null, rules: [], printers: [], referencesVerified: true, dispatchAuthorized: false });
  assert.deepEqual(f.commits, []); assert.equal(f.events.some(event => event[1].includes('/printers/')), false);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.rules) && Object.isFrozen(result.scope));
});
test('superadmin saves disabled-printer draft with atomic revision audit and native immutable readback', async () => {
  const f = fixture(); const result = await f.write();
  assert.equal(result.revision, 1); assert.equal(result.printers[0].configuration.state, 'disabled');
  assert.equal(result.dispatchAuthorized, false); assert.deepEqual(result.rules, [rule()]);
  const saved = f.rows.get(path), audit = f.rows.get(`${path}/audit/1`);
  assert.equal(saved.revision, 1); assert.deepEqual(saved.createdAt, { serverTimestamp: true });
  assert.deepEqual(audit, { schemaVersion: 1, actorId, action: 'printer.routing.save', revision: 1, before: null, after: [rule()], createdAt: { serverTimestamp: true } });
  assert.equal(f.commits.length, 1); assert.equal(f.commits[0].length, 2);
  const read = await f.read(); assert.deepEqual(read, result); assert.ok(Object.isFrozen(read.rules[0]) && Object.isFrozen(read.rules[0].match));
  assert.doesNotMatch(JSON.stringify(result), /actorId|createdAt|credential|secret|customer/);
  const cleared = await f.write(command({ expectedRevision: 1, rules: [] }));
  assert.equal(cleared.revision, 2); assert.deepEqual(cleared.rules, []); assert.deepEqual(f.rows.get(path).createdAt, saved.createdAt);
  assert.deepEqual(f.rows.get(`${path}/audit/2`).before, [rule()]);
});
test('HTTP and direct service require platform superuser before malformed input/storage', async () => {
  for (const options of [{ anonymous: true }, { merchant: true }]) {
    const f = fixture(options), status = options.anonymous ? 401 : 403;
    for (const method of ['GET', 'PUT']) assert.equal((await f.request(method, {}, { query: '?unknown=1', raw: '{' })).status, status);
    await rejects(f.write({}), options.anonymous ? 'unauthorized' : 'forbidden');
    await rejects(f.read({}), options.anonymous ? 'unauthorized' : 'forbidden');
    assert.equal(f.dbCalls, 0);
  }
});
test('existing exact write gate defaultsOFF and no other flag value enables storage', async () => {
  for (const value of [undefined, 'false', 'TRUE', '1', ' true ']) {
    const f = fixture({ enabled: false }); await rejects(f.write(command(), value), 'writes_unavailable'); assert.equal(f.dbCalls, 0);
  }
});
test('HTTP enforces CSRF, duplicate query, streamed bytes and strict JSON', async () => {
  for (const options of [{ headers: { origin: 'https://foreign.test' } }, { headers: { 'sec-fetch-site': 'cross-site' } }]) {
    const f = fixture(); assert.equal((await f.request('PUT', command(), options)).status, 403); assert.equal(f.dbCalls, 0);
  }
  for (const options of [{ headers: { 'content-type': 'text/plain' } }, { raw: '{' }, { raw: ' '.repeat(32769), headers: { 'content-length': '1' } }, { query: '?extra=true' }]) {
    const f = fixture(); const result = await f.request('PUT', command(), options); assert.equal(result.status, 400); assert.equal(result.cache, 'no-store'); assert.equal(result.vary, 'Cookie'); assert.equal(f.dbCalls, 0);
  }
  for (const query of ['?brandId=brand&brandId=brand&locationId=location', '?brandId=brand&locationId=location&extra=1']) {
    const f = fixture(); assert.equal((await f.request('GET', null, { query })).status, 400); assert.equal(f.dbCalls, 0);
  }
});
test('strict bounded payload rejects wrong scopes, duplicate IDs, malformed rules and secret/activation fields', async () => {
  for (const input of [null, {}, command({ expectedRevision: -1 }), command({ expectedRevision: '0' }), command({ credentials: 'SECRET' }), command({ enabled: true }),
    command({ rules: [rule(), rule()] }), command({ rules: [rule({ brandId: 'foreign' })] }), command({ rules: [rule({ match: { type: 'product', id: '../pizza' } })] }),
    command({ rules: [rule({ deliveryTypes: ['Pickup', 'Pickup'] })] }), command({ rules: new Array(1_000_000) }),
    command({ rules: [rule({ match: { type: 'product', id: 'x'.repeat(1_000_000) } })] }),
    command({ rules: Array.from({ length: 17 }, (_, i) => rule({ id: `r${i}`, printerId: `p${i}` })) })]) {
    const f = fixture(); await rejects(f.write(input), 'invalid_request'); assert.equal(f.commits.length, 0);
  }
  let invoked = false; const bad = command(); Object.defineProperty(bad, 'rules', { get() { invoked = true; throw Error('GETTER'); } });
  await assert.rejects(fixture().write(bad)); assert.equal(invoked, false);
});
test('native reference validation rejects missing/deleted/foreign/inactive printer/product/category and location membership', async () => {
  const changes = [
    ['brands/brand', undefined], ['locations/location', { brandId: 'foreign' }], ['brands/brand', { deletedAt: 1 }],
    ['locations/location/printers/p1', undefined], ['locations/location/printers/p1', record({ deletedAt: 1 })],
    ['locations/location/printers/p1', record({ configuration: config({ brandId: 'foreign' }) })],
    ['products/pizza', undefined], ['products/pizza', { brandId: 'other', isActive: true, locationIds: [] }],
    ['products/pizza', { brandId: 'brand', categoryId: 'food', productName: 'Pizza', isActive: true, locationIds: ['other'] }],
    ['products/pizza', { brandId: 'brand', categoryId: 'food', productName: 'QA-7-12 Product TEST', isActive: true, locationIds: [] }],
    ['categories/food', undefined], ['categories/food', { isActive: true, locationIds: [] }],
    ['categories/food', { isActive: true, locationIds: ['other'] }], ['categories/food', { isActive: false, locationIds: ['location'] }],
  ];
  for (const [key, value] of changes) {
    const f = fixture(); f.rows.set(key, value); const result = await f.request();
    assert.ok([403, 409].includes(result.status), `${key}: ${JSON.stringify(result)}`); assert.equal(f.commits.length, 0);
  }
  const f = fixture(); const result = await f.write(command({ rules: [rule({ match: { type: 'category', id: 'food' } })] })); assert.equal(result.rules.length, 1);
});
test('native superuser revocation is checked in same transaction despite earlier session and catalog permission', async () => {
  for (const mutate of [rows => rows.get('platformAdminControl/access-v1').memberships.find(m => m.id === 'owner').active = false,
    rows => rows.get('platformAdminControl/access-v1').roles.find(r => r.id === 'owner').active = false,
    rows => rows.get('platformAdminControl/access-v1').principals[0].active = false]) {
    const f = fixture(); mutate(f.rows); await rejects(f.write(), 'forbidden'); assert.equal(f.commits.length, 0);
    await rejects(f.read(), 'forbidden');
  }
});
test('competing creates/stale revisions cannot overwrite or duplicate audit history', async () => {
  const f = fixture(); const results = await Promise.all([f.request(), f.request()]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]); assert.equal(f.commits.length, 1);
  assert.equal(f.rows.get(path).revision, 1); await rejects(f.write(command()), 'record_conflict');
  await rejects(f.write(command({ expectedRevision: Number.MAX_SAFE_INTEGER })), 'record_conflict');
});
test('transaction retries recheck superuser, ownership, saved revision and catalog', async () => {
  for (const retry of [rows => rows.get('platformAdminControl/access-v1').memberships.find(m => m.id === 'owner').active = false,
    rows => rows.set('locations/location', { brandId: 'foreign' }), rows => rows.get('categories/food').locationIds = ['foreign'],
    rows => rows.set(path, { schemaVersion: 1, id: 'original', ...scope, revision: 1, rules: [], deletedAt: null })]) {
    const f = fixture({ retry }); const result = await f.request(); assert.ok([403, 409].includes(result.status)); assert.equal(f.commits.length, 0);
    assert.equal([...f.rows.keys()].some(key => key.includes('/audit/')), false);
  }
});
test('audit or commit failure rolls back all writes and returns generic unavailable without secrets', async () => {
  for (const options of [{ failAudit: true }, { failCommit: true }]) {
    const f = fixture(options), before = structuredClone([...f.rows]);
    const result = await f.request(); assert.equal(result.status, 503); assert.deepEqual(result.body, { error: 'routing_unavailable' });
    assert.deepEqual([...f.rows], before); assert.equal(f.commits.length, 0);
  }
});
test('saved corrupt/foreign routing fails closed while a missing reference retains only management state', async () => {
  for (const patch of [{ brandId: 'foreign' }, { revision: 0 }, { deletedAt: 1 }, { token: 'SECRET' }, { rules: [rule(), rule()] }, { rules: [rule({ brandId: 'foreign' })] }, { rules: [rule({ printerId: 'missing' })] }]) {
    const f = fixture(); f.rows.set(path, { schemaVersion: 1, id: 'original', ...scope, revision: 1, deletedAt: null, rules: [rule()], ...patch });
    const result = await f.request('GET'); assert.doesNotMatch(JSON.stringify(result), /SECRET/);
    if (patch.rules?.[0]?.printerId === 'missing') {
      // An owned, structurally valid stale rule is recoverable for management;
      // native preparation still rejects it and never becomes dispatch proof.
      assert.equal(result.status, 200); assert.equal(result.body.referencesVerified, false);
      assert.equal(result.body.revision, 1); assert.deepEqual(result.body.printers, []);
      await rejects(f.prepare(), 'reference_unverified');
    } else assert.equal(result.status, 409);
    assert.equal((await f.request('PUT', command({ expectedRevision: 1 }))).status, patch.rules?.[0]?.printerId === 'missing' ? 200 : 409);
  }
});
test('caller-owned preparation rereads references and never authorizes writes or output', async () => {
  const f = fixture(); await f.write(); const first = await f.prepare();
  assert.equal(first.rules.length, 1); assert.equal(first.dispatchAuthorized, false); assert.equal(first.referencesVerified, undefined, 'native preparation contract is unchanged');
  f.rows.get('categories/food').locationIds = ['foreign']; await rejects(f.prepare(), 'reference_unverified');
  assert.equal(first.rules[0].match.id, 'pizza'); assert.equal(f.commits.length, 1);
});

test('saved routing feeds canonical planner without turning disabled drafts into targets', async () => {
  const { previewPrinterRouting } = loadTs('src/lib/printing/routing-preview.ts', { 'server-only': {} });
  const f = fixture(); await f.write(command({ rules: [rule({ match: { type: 'category', id: 'food' } })] }));
  const saved = await f.prepare();
  const result = previewPrinterRouting({ scope: saved.scope, deliveryType: 'Pickup', rules: saved.rules,
    printers: saved.printers.map(p => ({ configuration: p.configuration, deleted: false })),
    lines: [{ lineId: 'line-0', ...scope, itemType: 'product', productId: 'pizza', categoryId: 'food', name: 'Pizza', quantity: 1 }] });
  assert.deepEqual(result.targets, []); assert.equal(result.decisions[0].outcome, 'printer_disabled'); assert.equal(result.dispatchAuthorized, false);
});


test('management GET preserves exact revision for stale references and HTTP PUT can clear or replace them atomically', async () => {
  const stale = [
    rows => { rows.get('products/pizza').isActive = false; },
    rows => { rows.delete('products/pizza'); },
    rows => { rows.get('categories/food').isActive = false; },
    rows => { rows.delete('categories/food'); },
    rows => { rows.delete('locations/location/printers/p1'); },
    rows => { rows.set('locations/location/printers/p1', record({ deletedAt: 1 })); },
  ];
  for (const mutate of stale) for (const clear of [true, false]) {
    const f = fixture(); assert.equal((await f.request()).status, 200); mutate(f.rows);
    await rejects(f.prepare(), 'reference_unverified');
    const read = await f.request('GET');
    assert.equal(read.status, 200, 'management GET retains recoverable structural state');
    assert.deepEqual(read.body, { scope, revision: 1, rules: [rule()], printers: [], referencesVerified: false, dispatchAuthorized: false });
    assert.equal(read.cache, 'no-store'); assert.equal(read.vary, 'Cookie');
    assert.equal((await f.request('PUT', command({ expectedRevision: read.body.revision }))).status, 409, 'stale rules cannot be saved unchanged');
    assert.equal(f.commits.length, 1);
    f.rows.set('locations/location/printers/p2', record({ configuration: config({ id: 'p2' }) }));
    const replacement = clear ? [] : [rule({ printerId: 'p2', match: { type: 'all' } })];
    const repaired = await f.request('PUT', command({ expectedRevision: read.body.revision, rules: replacement }));
    assert.equal(repaired.status, 200); assert.equal(repaired.body.revision, 2); assert.equal(repaired.body.referencesVerified, true);
    assert.deepEqual(repaired.body.rules, replacement); assert.equal(repaired.body.dispatchAuthorized, false);
    assert.deepEqual(f.rows.get(`${path}/audit/2`).before, [rule()]); assert.deepEqual(f.rows.get(`${path}/audit/2`).after, replacement);
    assert.equal(f.commits.length, 2); assert.equal(f.commits[1].length, 2);
    const fresh = await f.request('GET'); assert.equal(fresh.status, 200); assert.equal(fresh.body.referencesVerified, true); assert.equal(fresh.body.revision, 2);
    assert.deepEqual(fresh.body.rules, replacement); assert.equal((await f.request('PUT', command({ expectedRevision: 1, rules: [] }))).status, 409);
  }
});
test('management stale reads do not downgrade native scope, current grants, corrupt saved data or duplicate identities', async () => {
  const changes = [
    rows => { rows.set('locations/location', { brandId: 'foreign' }); },
    rows => { rows.set('brands/brand', { deletedAt: 1 }); },
    rows => { rows.get('platformAdminControl/access-v1').memberships.find(m => m.id === 'owner').active = false; },
    rows => { rows.get(path).brandId = 'foreign'; },
    rows => { rows.get(path).rules = [rule(), rule()]; },
    rows => { rows.get(path).rules = [rule({ locationId: 'foreign' })]; },
    rows => { rows.get(path).token = 'PRIVATE_STORED_DETAIL'; },
    rows => { rows.get(path).revision = 0; },
  ];
  for (const mutate of changes) {
    const f = fixture(); await f.write(); f.rows.get('products/pizza').isActive = false; mutate(f.rows);
    const read = await f.request('GET'); assert.ok([403, 409].includes(read.status));
    assert.equal(read.body.referencesVerified, undefined); assert.equal(read.body.revision, undefined);
    assert.doesNotMatch(JSON.stringify(read), /PRIVATE_STORED_DETAIL/);
    assert.ok([403, 409].includes((await f.request('PUT', command({ expectedRevision: 1, rules: [] }))).status));
    assert.equal(f.commits.length, 1);
  }
});
test('management GET provider failure remains generic unavailable, without stored state or foreign native detail', async () => {
  const f = fixture(); await f.write(); f.failReads.add('products/pizza');
  const failed = await f.request('GET'); assert.equal(failed.status, 503); assert.deepEqual(failed.body, { error: 'routing_unavailable' });
  assert.equal(f.commits.length, 1);
  f.failReads.clear(); f.rows.set('products/pizza', { brandId: 'foreign', productName: 'PRIVATE_FOREIGN_NAME', isActive: true, locationIds: ['other'] });
  const read = await f.request('GET'); assert.equal(read.status, 200); assert.equal(read.body.referencesVerified, false);
  assert.equal(read.body.revision, 1); assert.deepEqual(read.body.rules, [rule()]); assert.deepEqual(read.body.printers, []);
  assert.doesNotMatch(JSON.stringify(read), /PRIVATE|FOREIGN_NAME|other/);
});
test('management recovery uses exact revision and cannot overwrite a concurrent save', async () => {
  const f = fixture(); await f.write(); f.rows.get('products/pizza').isActive = false;
  const read = await f.request('GET'); assert.equal(read.status, 200); assert.equal(read.body.revision, 1);
  f.rows.set(path, { ...f.rows.get(path), revision: 2, rules: [] });
  const repair = await f.request('PUT', command({ expectedRevision: read.body.revision, rules: [] }));
  assert.equal(repair.status, 409); assert.equal(f.rows.get(path).revision, 2); assert.equal(f.commits.length, 1);
  assert.equal(f.rows.has(`${path}/audit/2`), false);
});
test('management recovery audit failure rolls back and stale direct snapshots stay immutable', async () => {
  const f = fixture({ failAudit: true });
  f.rows.set(path, { schemaVersion: 1, id: 'original', ...scope, revision: 1, deletedAt: null, rules: [rule()] });
  f.rows.get('products/pizza').isActive = false;
  const read = await f.read(); assert.equal(read.referencesVerified, false); assert.equal(read.revision, 1);
  for (const value of [read, read.scope, read.rules, read.rules[0], read.rules[0].match, read.printers]) assert.ok(Object.isFrozen(value));
  assert.equal(Reflect.set(read.rules[0].match, 'id', 'foreign'), false);
  const before = structuredClone([...f.rows]);
  const repair = await f.request('PUT', command({ expectedRevision: read.revision, rules: [] }));
  assert.equal(repair.status, 503); assert.deepEqual(repair.body, { error: 'routing_unavailable' });
  assert.deepEqual([...f.rows], before); assert.equal(f.commits.length, 0);
});
test('management GET retry reauthorizes scope instead of reusing a stale snapshot', async () => {
  const f = fixture({ retry: rows => { rows.set('locations/location', { brandId: 'foreign' }); } });
  f.rows.set(path, { schemaVersion: 1, id: 'original', ...scope, revision: 1, deletedAt: null, rules: [rule()] });
  f.rows.get('products/pizza').isActive = false;
  const read = await f.request('GET'); assert.ok([403, 409].includes(read.status));
  assert.equal(read.body.revision, undefined); assert.equal(f.commits.length, 0);
  assert.equal(f.events.filter(event => event[0] === 'attempt').length, 2, 'management GET reruns its transaction after retry');
  assert.ok(f.events.filter(event => event[1] === 'locations/location').length >= 3, 'current native ownership is reread after retry');
});


test('canonical global products with omitted or empty locationIds save, read back and prepare through exported paths', async () => {
  for (const omitted of [true, false]) {
    const f = fixture();
    if (omitted) delete f.rows.get('products/pizza').locationIds; else f.rows.get('products/pizza').locationIds = [];
    const saved = await f.request('PUT');
    assert.equal(saved.status, 200, 'canonical global product membership must be accepted');
    assert.equal(saved.body.referencesVerified, true); assert.equal(saved.body.revision, 1);
    const read = await f.request('GET'); assert.equal(read.status, 200); assert.deepEqual(read.body, saved.body);
    const prepared = await f.prepare(); assert.deepEqual(prepared.rules, [rule()]); assert.equal(prepared.printers.length, 1);
    assert.equal(prepared.dispatchAuthorized, false); assert.equal(prepared.referencesVerified, undefined);
    assert.deepEqual(f.rows.get(`${path}/audit/1`).after, [rule()]); assert.equal(f.commits.length, 1);
  }
});
test('omitted-global compatibility never accepts malformed product membership or relaxes native product guards', async () => {
  const changes = [
    product => { product.locationIds = null; }, product => { product.locationIds = {}; }, product => { product.locationIds = 'location'; },
    product => { product.locationIds = ['other']; }, product => { product.locationIds = ['location', 'location']; },
    product => { product.locationIds = Array.from({ length: 101 }, (_, i) => 'l' + i); },
    product => { product.locationIds = ['../location']; }, product => { product.locationIds = ['location', null]; },
    product => { product.brandId = 'foreign'; }, product => { product.isActive = false; },
    product => { product.productName = 'QA-7-12 Product TEST'; }, product => { product.categoryId = 'missing'; },
  ];
  for (const mutate of changes) {
    const f = fixture(); delete f.rows.get('products/pizza').locationIds; mutate(f.rows.get('products/pizza'));
    const saved = await f.request('PUT'); assert.equal(saved.status, 409); assert.equal(f.commits.length, 0);
    f.rows.set(path, { schemaVersion: 1, id: 'original', ...scope, revision: 1, deletedAt: null, rules: [rule()] });
    await rejects(f.prepare(), 'reference_unverified');
  }
});
test('global product compatibility keeps category location membership explicitly scoped and strict', async () => {
  for (const value of [undefined, null, {}, 'location', [], ['other'], ['location', 'location'], ['../location'], ['location', null], Array.from({ length: 101 }, (_, i) => 'l' + i)]) {
    const f = fixture(); delete f.rows.get('products/pizza').locationIds;
    if (value === undefined) delete f.rows.get('categories/food').locationIds; else f.rows.get('categories/food').locationIds = value;
    const saved = await f.request('PUT'); assert.equal(saved.status, 409); assert.equal(f.commits.length, 0);
    f.rows.set(path, { schemaVersion: 1, id: 'original', ...scope, revision: 1, deletedAt: null, rules: [rule()] });
    await rejects(f.prepare(), 'reference_unverified');
    const read = await f.request('GET'); assert.equal(read.status, 200); assert.equal(read.body.referencesVerified, false);
    assert.equal(read.body.revision, 1); assert.deepEqual(read.body.printers, []);
  }
});
