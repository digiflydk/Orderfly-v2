const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function load(path, mocks = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => name in mocks ? mocks[name] : require(name), mod, mod.exports);
  return mod.exports;
}
const model = load('src/lib/loyalty/model.ts');
const now = new Date('2026-09-07T12:00:00Z');
const order = (days, extra = {}) => ({
  brandId: 'b', customerDetails: { id: 'c' }, totalAmount: 300,
  paymentStatus: 'Paid', deliveryType: 'Pickup', createdAt: new Date(+now - days * 86400000), ...extra,
});
function fixture() {
  const rows = new Map(), writes = [], clone = value => structuredClone(value);
  const field = (data, path) => path.split('.').reduce((value, key) => value?.[key], data);
  const snapshot = (path, native = false) => ({
    id: path.split('/').at(-1), data: () => clone(rows.get(path)),
    exists: native ? rows.has(path) : () => rows.has(path), get: key => field(rows.get(path), key),
  });
  const matches = query => [...rows.keys()].filter(path => path.split('/').length === 2
    && path.startsWith(query.collection + '/')
    && query.filters.every(([key, op, value]) => { assert.equal(op, '=='); return field(rows.get(path), key) === value; }));
  let nextId = 0;
  const pathOf = ref => typeof ref === 'string' ? ref : ref.path;
  const client = {
    collection: (_, collection) => ({ collection, filters: [] }),
    doc: (db, collection, id) => {
      const path = id === undefined ? `${db.collection}/new-${++nextId}` : `${collection}/${id}`;
      return { path, id: path.split('/').at(-1) };
    },
    query: (query, ...filters) => ({ ...query, filters }), where: (...filter) => filter,
    getDoc: async ref => snapshot(pathOf(ref)), getDocs: async query => ({ docs: matches(query).map(path => snapshot(path)) }),
    setDoc: async (ref, data) => { const path = pathOf(ref); writes.push(path); rows.set(path, clone(data)); },
    updateDoc: async (ref, data) => {
      const path = pathOf(ref);
      if (!rows.has(path)) throw Error('Customer no longer exists');
      writes.push(path); rows.set(path, { ...rows.get(path), ...clone(data) });
    },
    Timestamp: { now: () => now },
  };
  const settings = load('src/app/superadmin/loyalty/actions.ts', {
    'next/cache': { revalidatePath() {} }, '@/lib/firebase': { db: {} }, 'firebase/firestore': client,
    '@/lib/loyalty/model': model,
  });
  const customers = load('src/app/superadmin/customers/actions.ts', {
    'next/cache': {}, '@/lib/firebase': { db: {} }, 'firebase/firestore': client,
    '@/lib/loyalty/model': model, '../loyalty/actions': settings,
  });
  function nativeCollection(collection, filters = []) {
    return {
      where: (...filter) => nativeCollection(collection, [...filters, filter]),
      doc: id => ({ get: async () => snapshot(`${collection}/${id}`, true) }),
      get: async () => ({ docs: matches({ collection, filters }).map(path => snapshot(path, true)) }),
    };
  }
  const integration = load('src/lib/integrations/esmeralda-feedback-integration.ts', {
    'server-only': {}, '@/lib/loyalty/model': model, '@/app/superadmin/loyalty/actions': settings,
    '@/lib/firebase-admin': { getAdminDb: () => ({ collection: nativeCollection }) },
    '@/lib/integrations/esmeralda-feedback-contract': load('src/lib/integrations/esmeralda-feedback-contract.ts'),
    '@/lib/integrations/esmeralda-consumer-customer': { IntegrationBoundaryError: class extends Error {} },
  });
  return { rows, writes, settings, customers, integration };
}
function formValues(value, prefix = '', form = new FormData()) {
  for (const [key, item] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (item != null && typeof item === 'object') formValues(item, path, form);
    else form.set(path, String(item));
  }
  return form;
}

test('paid order truth determines score; pending/cancelled/full refunds do not contribute', async () => {
  const settings = await fixture().settings.getLoyaltySettings();
  const loyal = Array.from({ length: 12 }, (_, index) => order(index));
  const result = model.customerMetrics(loyal, settings, now);
  assert.equal(result.loyaltyScore, 91); assert.equal(result.loyaltyClassification, 'Loyal');
  assert.deepEqual(model.customerMetrics([...loyal, order(0, { paymentStatus: 'Pending' }), order(0, { status: 'Canceled' }), order(0, { refundedAmountOre: 30000 })], settings, now), result);
  assert.equal(model.customerMetrics([order(0, { refundedAmountOre: 10000 })], settings, now).totalSpend, 200);
  assert.equal(model.customerMetrics([], settings, now).loyaltyClassification, 'New');
});

test('recency lower bounds and actual frequency improve recent repeat customers', async () => {
  const settings = await fixture().settings.getLoyaltySettings();
  const only = key => ({ ...settings, weights: Object.fromEntries(Object.keys(settings.weights).map(name => [name, name === key ? 100 : 0])) });
  for (const [days, expected] of [[0,100],[7,100],[8,60],[30,60],[31,30],[90,30],[91,0]]) {
    assert.equal(model.customerMetrics([order(days)], only('recency'), now).loyaltyScore, expected);
  }
  assert.equal(model.customerMetrics([order(0)], only('frequency'), now).loyaltyScore, 0);
  assert.equal(model.customerMetrics([order(0),order(7)], only('frequency'), now).loyaltyScore, 100);
  assert.equal(model.customerMetrics([order(0),order(8)], only('frequency'), now).loyaltyScore, 60);
  assert.equal(model.customerMetrics([order(0),order(31)], only('frequency'), now).loyaltyScore, 10);
});

test('malformed amounts and missing dates cannot crash reads or create synthetic frequency', async () => {
  const settings = await fixture().settings.getLoyaltySettings();
  const bad = [-1, NaN, Infinity, '300'].map(totalAmount => order(0, { totalAmount }));
  assert.deepEqual(model.customerMetrics(bad, settings, now), model.customerMetrics([], settings, now));
  assert.equal(model.customerMetrics([order(0, { refundedAmountOre: -1 })], settings, now).totalOrders, 0);
  const weighted = { ...settings, weights: { totalOrders: 0, averageOrderValue: 0, recency: 50, frequency: 50, deliveryMethodBonus: 0 } };
  const result = model.customerMetrics([order(0, { createdAt: 'bad' }), order(0, { createdAt: null })], weighted, now);
  assert.equal(result.totalOrders, 2); assert.equal(result.lastOrderDate, undefined); assert.equal(result.loyaltyScore, 0);
  assert.equal(model.asDate({ seconds: 0 }).getTime(), 0); assert.equal(model.asDate({ toDate: () => now }), now);
});

test('classification boundaries cover every integer score without gaps or overlap', async () => {
  const settings = await fixture().settings.getLoyaltySettings();
  for (const [points, classification] of [[0,'At Risk'],[49,'At Risk'],[50,'Occasional'],[79,'Occasional'],[80,'Loyal'],[100,'Loyal']]) {
    const custom = { ...settings, weights: { totalOrders: 100, averageOrderValue: 0, recency: 0, frequency: 0, deliveryMethodBonus: 0 }, thresholds: { ...settings.thresholds, totalOrders: [{ points, value: 1 }] } };
    assert.equal(model.customerMetrics([order(0)], custom, now).loyaltyClassification, classification);
  }
});

test('settings save/reopen validates weights, thresholds, blanks and classification ranges before writes', async () => {
  const f = fixture(), settings = await f.settings.getLoyaltySettings(), initial = { error: false, message: '' };
  const form = formValues(settings);
  assert.equal((await f.settings.updateLoyaltySettings(initial, form)).error, false);
  assert.deepEqual(await f.settings.getLoyaltySettings(), settings);
  assert.equal((await f.settings.getLoyaltySettingsState()).warning, null);
  const invalid = [['weights.totalOrders','31'],['thresholds.recency.1.value','0'],['thresholds.frequency.0.value',''],['classifications.occasional.max','80'],['classifications.occasional.max','78'],['deliveryMethodBonus','-1']];
  for (const [key, value] of invalid) {
    const bad = formValues(settings); bad.set(key, value);
    const response = await f.settings.updateLoyaltySettings(initial, bad);
    assert.equal(response.error, true, key); assert.match(response.message, /Validation failed/);
  }
  const missing = formValues(settings); missing.delete('thresholds.recency.0.value');
  assert.equal((await f.settings.updateLoyaltySettings(initial, missing)).error, true);
  assert.equal(f.writes.length, 1); assert.deepEqual(await f.settings.getLoyaltySettings(), settings);
});

test('invalid stored configuration shows a warning/defaults without rewriting it', async () => {
  const f = fixture(); f.rows.set('platform_settings/loyalty', { weights: { totalOrders: 999 } });
  const state = await f.settings.getLoyaltySettingsState();
  assert.match(state.warning, /ugyldige/); assert.equal(model.scoreSettingsSchema.safeParse(state.settings).success, true);
  assert.equal(f.writes.length, 0);
});

test('list/details/integration agree across all orders, retain new customers and enforce brand scope', async () => {
  const f = fixture();
  f.rows.set('customers/c', { id: 'stale-id', brandId: 'b', fullName: 'Customer', totalOrders: 999, totalSpend: 999999 });
  f.rows.set('customers/new', { brandId: 'b' });
  f.rows.set('customers/recent', { brandId: 'b' });
  f.rows.set('orders/a', order(10)); f.rows.set('orders/b', order(12, { refundedAmountOre: 10000 }));
  f.rows.set('orders/c', order(0, { brandId: 'other', totalAmount: 9999 }));
  f.rows.set('orders/d', order(0, { paymentStatus: 'Pending', deliveryType: 'Delivery' }));
  f.rows.set('orders/e', order(1, { customerDetails: { id: 'recent' } }));
  f.rows.set('orders/f', order(0, { createdAt: 'malformed' }));
  f.rows.set('orders/no-customer', order(0, { customerDetails: undefined }));
  const list = await f.customers.getCustomers(), detail = await f.customers.getCustomerDetails('c');
  const history = await f.integration.getEsmeraldaConsumerCustomerHistory({ customer_id: 'c', organization_id: 'b', limit: 1 });
  assert.deepEqual(list.map(customer => customer.id), ['recent','c','new']);
  const customer = list.find(customer => customer.id === 'c');
  assert.equal(customer.totalSpend, 800); assert.equal(customer.totalOrders, 3);
  for (const key of ['totalOrders','totalSpend','loyaltyScore','loyaltyClassification','lastOrderDate']) assert.deepEqual(detail.customer[key], customer[key], key);
  assert.equal(detail.pickupOrdersCount, 3); assert.equal(detail.deliveryOrdersCount, 0);
  assert.equal(history.customer.total_spend, customer.totalSpend); assert.equal(history.customer.total_orders, customer.totalOrders);
  assert.equal(history.customer.loyalty_score, customer.loyaltyScore); assert.equal(history.customer.loyalty_classification, customer.loyaltyClassification);
  assert.equal(history.commerce_orders.length, 1, 'response limit must not truncate score inputs');
  await assert.rejects(f.integration.getEsmeraldaConsumerCustomerHistory({ customer_id: 'c', organization_id: 'other' }));
  assert.equal(await f.customers.getCustomerDetails('missing'), null); assert.equal(f.writes.length, 0);
});

test('new customers need a native brand; updates retain counters and cannot recreate deleted customers', async () => {
  const f = fixture(); f.rows.set('brands/b', { name: 'Brand' });
  const data = { fullName: 'Example Customer', email: 'customer@example.test', phone: '12345678', status: 'inactive' };
  for (const brandId of ['', 'missing', 'b/path']) {
    assert.equal((await f.customers.createOrUpdateCustomer(null, formValues({ ...data, brandId }))).error, true);
  }
  assert.equal(f.writes.length, 0);
  assert.equal((await f.customers.createOrUpdateCustomer(null, formValues({ ...data, brandId: 'b' }))).error, false);
  const path = f.writes[0], saved = f.rows.get(path);
  assert.equal(saved.brandId, 'b'); assert.equal(saved.status, 'inactive'); assert.equal(saved.totalOrders, 0);
  f.rows.set(path, { ...saved, totalOrders: 12, totalSpend: 1500 });
  assert.equal((await f.customers.createOrUpdateCustomer(null, formValues({ ...data, id: saved.id }))).error, false);
  assert.equal(f.rows.get(path).totalOrders, 12); assert.equal(f.rows.get(path).totalSpend, 1500);
  f.rows.delete(path);
  assert.equal((await f.customers.createOrUpdateCustomer(null, formValues({ ...data, id: saved.id }))).error, true);
  assert.equal(f.rows.has(path), false);
});
