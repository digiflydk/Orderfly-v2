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
  const events = [], commits = []; let dbCalls = 0, sessionCalls = 0, serial = Promise.resolve(), retried = false;
  const collection = name => ({ doc: key => ref(`${name}/${key}`) });
  const ref = key => ({ path: key, id: key.split('/').at(-1), collection: name => collection(`${key}/${name}`) });
  const db = { collection, runTransaction(run, options) {
    const job = serial.then(async () => { for (;;) {
      const staged = new Map(structuredClone([...rows])), writes = []; let writing = false;
      const tx = {
        async get(ref) { assert.equal(writing, false, 'all reads before writes'); events.push(['get', ref.path]);
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
  return { rows, events, commits, db, get dbCalls() { return dbCalls; }, get sessionCalls() { return sessionCalls; },
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
  assert.deepEqual(result, { scope, revision: null, rules: [], printers: [], dispatchAuthorized: false });
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
test('saved corrupt/foreign routing fails whole read and cannot be overwritten as a missing record', async () => {
  for (const patch of [{ brandId: 'foreign' }, { revision: 0 }, { deletedAt: 1 }, { token: 'SECRET' }, { rules: [rule(), rule()] }, { rules: [rule({ brandId: 'foreign' })] }, { rules: [rule({ printerId: 'missing' })] }]) {
    const f = fixture(); f.rows.set(path, { schemaVersion: 1, id: 'original', ...scope, revision: 1, deletedAt: null, rules: [rule()], ...patch });
    const result = await f.request('GET'); assert.equal(result.status, 409); assert.doesNotMatch(JSON.stringify(result), /SECRET/);
    assert.equal((await f.request('PUT', command({ expectedRevision: 1 }))).status, patch.rules?.[0]?.printerId === 'missing' ? 200 : 409);
  }
});
test('caller-owned preparation rereads references and never authorizes writes or output', async () => {
  const f = fixture(); await f.write(); const first = await f.prepare();
  assert.equal(first.rules.length, 1); assert.equal(first.dispatchAuthorized, false);
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
