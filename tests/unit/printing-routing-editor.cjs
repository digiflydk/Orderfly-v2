const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { loadTs } = require('../helpers/load-ts.cjs');
const { policy: companyPolicy, actorId, record, config } = require('../helpers/printing-fixture.cjs');
const authority = loadTs('src/lib/access/authority.ts', { 'server-only': {} });
const scope = { brandId: 'brand', locationId: 'location' }, identity = { provider: 'firebase', subject: 'writer' };
const rule = (patch = {}) => ({ id: 'rule1', ...scope, printerId: 'p1', match: { type: 'category', id: 'food' }, effect: 'include', ...patch });
const sample = (patch = {}) => ({ ...scope, rules: [rule()], deliveryType: 'Pickup', items: [{ productId: 'pizza', quantity: 2 }], ...patch });
function fixture({ anonymous = false, merchant = false, fail = false } = {}) {
  const policy = companyPolicy(['orderfly.catalog:view']);
  policy.roles.push({ id: 'owner', name: 'Platform owner', companyId: null, kind: 'superuser', permissions: [], active: true });
  policy.memberships.push({ id: 'owner', principalId: actorId, companyId: null, locationIds: null, roleIds: ['owner'], active: true });
  const product = (patch = {}) => ({ brandId: 'brand', categoryId: 'food', productName: 'Pizza ÆØÅ', isActive: true, locationIds: [], ...patch });
  const rows = new Map([['platformAdminControl/access-v1', policy], ['brands/brand', {}], ['locations/location', { brandId: 'brand' }],
    ['locations/location/printers/p1', record({ configuration: config({ state: 'active' }) })],
    ['products/pizza', product()], ['categories/food', { categoryName: 'Pizza', locationIds: ['location'], isActive: true, brandId: 'stale-legacy-brand' }]]);
  const events = []; let dbCalls = 0;
  const collection = path => ({ doc: id => ref(`${path}/${id}`), where: (...filter) => query(path, filter) });
  const ref = path => ({ path, id: path.split('/').at(-1), collection: key => collection(`${path}/${key}`) });
  const query = (path, filter, cursor, maximum) => ({ path, filter, cursor, maximum, isQuery: true,
    orderBy(field) { assert.equal(field, '__name__'); return this; }, startAfter(next) { return query(path, filter, next, maximum); }, limit(next) { return query(path, filter, cursor, next); } });
  const snapshot = (path, value) => ({ id: path.split('/').at(-1), exists: value !== undefined, data: () => structuredClone(value) });
  const db = { collection, runTransaction: async (run, options) => {
    assert.deepEqual(options, { readOnly: true });
    return run({ get: async ref => { events.push(ref); if (fail) throw Error('SECRET_SENTINEL');
      if (!ref.isQuery) return snapshot(ref.path, rows.get(ref.path));
      assert.equal(ref.maximum, 51, 'bounded native query with overflow detection');
      const [field, operator, value] = ref.filter;
      const docs = [...rows].filter(([path, row]) => path.startsWith(ref.path + '/') && !path.slice(ref.path.length + 1).includes('/')
        && row && (operator === '==' ? row[field] === value : row[field]?.includes(value)) && (!ref.cursor || path.split('/').at(-1) > ref.cursor))
        .sort(([a], [b]) => a.localeCompare(b)).slice(0, ref.maximum).map(([path, value]) => snapshot(path, value));
      return { docs, size: docs.length };
    }, set() { throw Error('WRITE'); }, create() { throw Error('WRITE'); }, delete() { throw Error('WRITE'); } });
  } };
  const mocks = { 'server-only': {}, '@/lib/access/authority': authority, './authority': authority,
    '@/lib/firebase-admin': { getAdminDb: () => { dbCalls++; return db; } },
    '@/lib/access/orderfly-session': { requirePlatformSuperuser: async () => { if (anonymous) throw new authority.AuthorityError('unauthorized', 401); if (merchant) throw new authority.AuthorityError('forbidden', 403); return { identity, superuser: true }; } },
    'firebase-admin/firestore': { FieldValue: { serverTimestamp() { throw Error('WRITE'); } } }, '@/lib/url': { getOrigin: async () => 'https://orderfly.dk' } };
  const service = loadTs('src/lib/printing/saved-routing.ts', mocks);
  const routes = { catalog: loadTs('src/app/api/superadmin/printers/routing/catalog/route.ts', mocks), preview: loadTs('src/app/api/superadmin/printers/routing/preview/route.ts', mocks) };
  return { rows, events, product, get dbCalls() { return dbCalls; }, catalog: input => service.readPrinterRoutingCatalog(input ?? { ...scope, kind: 'product' }), preview: input => service.previewPrinterRoutingSample(input ?? sample()),
    async request(target = 'preview', body = sample(), options = {}) {
      const method = target === 'preview' ? 'POST' : 'GET';
      const response = await routes[target][method](new Request(`https://orderfly.dk/api/superadmin/printers/routing/${target}${options.query ?? (target === 'catalog' ? '?brandId=brand&locationId=location&kind=product' : '')}`, {
        method, headers: { origin: 'https://orderfly.dk', 'content-type': 'application/json', ...options.headers }, ...(method === 'POST' ? { body: options.raw ?? JSON.stringify(body) } : {}),
      }));
      return { status: response.status, body: await response.json(), cache: response.headers.get('cache-control'), vary: response.headers.get('vary') };
    } };
}
test('named native pickers exclude inactive/synthetic/foreign-location products and preserve real category location ownership', async () => {
  const f = fixture();
  f.rows.set('products/inactive', f.product({ isActive: false })); f.rows.set('products/otherLocation', f.product({ locationIds: ['other'] }));
  f.rows.set('products/synthetic', f.product({ description: 'DO NOT PREPARE' })); f.rows.set('products/foreign', f.product({ brandId: 'foreign' }));
  const result = await f.catalog(); assert.deepEqual(result, { scope, kind: 'product', items: [{ id: 'pizza', name: 'Pizza ÆØÅ', categoryId: 'food' }], nextCursor: null });
  assert.deepEqual((await f.catalog({ ...scope, kind: 'category' })).items, [{ id: 'food', name: 'Pizza' }]);
  assert.equal(f.events.filter(event => event.isQuery).length, 2);
});
test('native picker pagination is bounded at50 plus overflow, even when applicable rows are absent', async () => {
  const f = fixture(); f.rows.delete('products/pizza');
  for (let i = 0; i < 51; i++) f.rows.set(`products/p${String(i).padStart(2, '0')}`, f.product({ locationIds: ['other'] }));
  const first = await f.catalog(); assert.equal(first.items.length, 0); assert.equal(first.nextCursor, 'p49');
  const second = await f.catalog({ ...scope, kind: 'product', after: first.nextCursor }); assert.equal(second.nextCursor, null); assert.equal(second.items.length, 0);
});
test('candidate sample preview uses native names/category, pure canonical precedence and zero writes', async () => {
  const f = fixture(), result = await f.preview();
  assert.equal(result.sampleOnly, true); assert.equal(result.dispatchAuthorized, false); assert.equal(result.targets.length, 1);
  assert.deepEqual(result.targets[0].lines[0], { lineId: 'sample-0', ...scope, itemType: 'product', productId: 'pizza', categoryId: 'food', name: 'Pizza ÆØÅ', quantity: 2 });
  const excluded = await f.preview(sample({ rules: [rule(), rule({ id: 'rule2', match: { type: 'product', id: 'pizza' }, effect: 'exclude' })] }));
  assert.deepEqual(excluded.targets, []); assert.equal(excluded.decisions[0].outcome, 'excluded');
  assert.doesNotMatch(JSON.stringify(result), /employee|customer|payment|credential|SECRET/);
});
test('disabled drafts are explicitly unrouted, paused targets are preview-only and duplicate products keep line identity', async () => {
  const f = fixture(); f.rows.set('locations/location/printers/p1', record());
  assert.equal((await f.preview()).decisions[0].outcome, 'printer_disabled');
  f.rows.set('locations/location/printers/p1', record({ configuration: config({ state: 'paused' }) }));
  const result = await f.preview(sample({ items: [{ productId: 'pizza', quantity: 1 }, { productId: 'pizza', quantity: 2 }] }));
  assert.equal(result.targets[0].state, 'paused'); assert.deepEqual(result.targets[0].lines.map(line => line.lineId), ['sample-0', 'sample-1']);
});
test('anonymous/merchant metadata and previews reject before body/query/storage work', async () => {
  for (const options of [{ anonymous: true }, { merchant: true }]) {
    const f = fixture(options); for (const target of ['catalog', 'preview']) {
      const result = await f.request(target, {}, { raw: '{', query: '?invalid=1' }); assert.equal(result.status, options.anonymous ? 401 : 403); assert.equal(f.dbCalls, 0);
    }
  }
});
test('current native platform revocation and product/category/scope changes reject complete metadata/preview', async () => {
  for (const mutate of [f => f.rows.get('platformAdminControl/access-v1').memberships.find(m => m.id === 'owner').active = false,
    f => f.rows.get('locations/location').brandId = 'foreign', f => f.rows.get('categories/food').locationIds = ['foreign'],
    f => f.rows.get('products/pizza').brandId = 'foreign', f => f.rows.get('products/pizza').isActive = false]) {
    const f = fixture(); mutate(f); const result = await f.request(); assert.ok([403, 409].includes(result.status)); assert.notEqual(result.body.sampleOnly, true);
  }
  const f = fixture(); f.rows.get('products/pizza').locationIds = new Array(1_000_000); assert.equal((await f.request('catalog')).status, 409);
});
test('sample API accepts no client labels/category/order/payment claims and bounds collections/bytes before native work', async () => {
  for (const body of [sample({ orderId: 'o1' }), sample({ items: [{ productId: 'pizza', quantity: 1, name: 'CLIENT' }] }), sample({ items: new Array(21).fill({ productId: 'pizza', quantity: 1 }) }),
    sample({ items: [{ productId: '../pizza', quantity: 1 }] }), sample({ items: [{ productId: 'pizza', quantity: 0 }] }), sample({ paymentStatus: 'Paid' })]) {
    const f = fixture(); assert.equal((await f.request('preview', body)).status, 400); assert.equal(f.dbCalls, 0);
  }
  for (const options of [{ raw: ' '.repeat(32769), headers: { 'content-length': '1' } }, { raw: '{' }, { query: '?extra=1' }]) {
    const f = fixture(); assert.equal((await f.request('preview', sample(), options)).status, 400); assert.equal(f.dbCalls, 0);
  }
  for (const headers of [{ origin: 'https://foreign.test' }, { 'sec-fetch-site': 'cross-site' }]) assert.equal((await fixture().request('preview', sample(), { headers })).status, 403);
  assert.equal((await fixture().request('catalog', null, { query: '?brandId=brand&locationId=location&kind=product&kind=category' })).status, 400);
});
test('metadata text bounds and infrastructure failures return safe non-cacheable failures', async () => {
  const f = fixture(); f.rows.get('products/pizza').productName = 'x'.repeat(1_000_000);
  assert.equal((await f.request('catalog')).status, 409);
  const result = await fixture({ fail: true }).request(); assert.deepEqual(result, { status: 503, body: { error: 'routing_unavailable' }, cache: 'no-store', vary: 'Cookie' });
});
test('large valid sample decision fanout fails whole response budget without truncation or writes', async () => {
  const f = fixture();
  const rules = Array.from({ length: 120 }, (_, index) => rule({ id: `r${index}` + 'x'.repeat(80), match: { type: 'all' } }));
  const result = await f.request('preview', sample({ rules, items: Array.from({ length: 20 }, () => ({ productId: 'pizza', quantity: 1 })) }));
  assert.equal(result.status, 400); assert.deepEqual(result.body, { error: 'invalid_request' });
});
test('routing page denies merchant before catalog and projects only native named scopes for superadmin', async () => {
  for (const superuser of [false, true]) {
    const calls = [], props = [];
    const mocks = { '@/lib/access/orderfly-session': { orderflySession: async () => ({ superuser, actorId }) },
      '@/lib/access/native-catalog': { nativeCatalog: async permission => { calls.push(permission); return { brands: [{ id: 'brand', name: 'Brand', PRIVATE: 'secret' }], locations: [{ id: 'location', name: 'Køkken', brandId: 'brand', PRIVATE: 'secret' }] }; } },
      '@/components/superadmin/access-denied-page': { AccessDeniedPage: () => React.createElement('p', null, 'Denied') },
      './routing-editor': { PrinterRoutingEditor: value => { props.push(value); return React.createElement('p', null, 'Routing'); } } };
    const code = ts.transpileModule(fs.readFileSync('src/app/superadmin/printers/routing/page.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const module = { exports: {} }; new Function('require', 'module', 'exports', code)(name => mocks[name] || require(name), module, module.exports);
    const html = renderToStaticMarkup(await module.exports.default());
    if (!superuser) { assert.match(html, /Denied/); assert.deepEqual(calls, []); assert.deepEqual(props, []); }
    else { assert.match(html, /Routing/); assert.deepEqual(calls, ['orderfly.catalog:view', 'orderfly.catalog:edit']); assert.doesNotMatch(JSON.stringify(props), /PRIVATE|secret/); }
  }
});


test('catalog and native sample preview preserve canonical omitted global product membership', async () => {
  const f = fixture(); delete f.rows.get('products/pizza').locationIds;
  const catalog = await f.catalog(); assert.deepEqual(catalog.items, [{ id: 'pizza', name: 'Pizza ÆØÅ', categoryId: 'food' }]);
  assert.equal((await f.preview()).targets.length, 1);
  f.rows.get('products/pizza').locationIds = null; assert.equal((await f.request('catalog')).status, 409);
  delete f.rows.get('products/pizza').locationIds; delete f.rows.get('categories/food').locationIds;
  assert.equal((await f.request('preview')).status, 409);
});


test('actual client saved parser recanonicalizes server rule keys and still distinguishes changed values', () => {
  const source = fs.readFileSync('src/app/superadmin/printers/routing/routing-editor.tsx', 'utf8') + '\nexport { validatedSaved };';
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(name => name.startsWith('@/components/') ? {} : require(name), mod, mod.exports);
  const { printerRoutingRuleSchema } = loadTs('src/lib/printing/routing-preview.ts', { 'server-only': {} });
  const submitted = { id: 'rule1', ...scope, printerId: 'p1', effect: 'include', match: { type: 'category', id: 'food' } };
  const server = printerRoutingRuleSchema.parse(submitted);
  assert.notEqual(JSON.stringify(server), JSON.stringify(submitted), 'real server emits match before effect');
  const dto = { scope, revision: 1, rules: [server], printers: [{ configuration: config({ state: 'active' }), revision: 3 }], referencesVerified: true, dispatchAuthorized: false };
  const parsed = mod.exports.validatedSaved(dto, scope);
  assert.equal(JSON.stringify(parsed.rules), JSON.stringify([submitted]), 'actual client parser emits effect before match before save comparison');
  const changed = mod.exports.validatedSaved({ ...dto, rules: [printerRoutingRuleSchema.parse({ ...submitted, effect: 'exclude' })] }, scope);
  assert.notEqual(JSON.stringify(changed.rules), JSON.stringify([submitted]), 'real changed values still reject');
});
