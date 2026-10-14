const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');

const endpoint = 'https://bdemvarwpfcxyczunchx.supabase.co/functions/v1/orderfly-customer-sync-trigger';
const secret = 'synthetic-manual-customer-sync-secret-value';

function loadRoute(overrides = {}) {
  let calls = [];
  let bookingResponse = Response.json({ success: true, brandId: 'brand-a', enqueued: 12, processed: 5, succeededCount: 4, pending: 8 });
  const previousFetch = global.fetch;
  global.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return bookingResponse;
  };
  const route = loadTs('src/app/api/superadmin/customers/sync/route.ts', {
    '@/lib/firebase-admin': { getAdminDb: () => ({}) },
    '@/lib/url': { getOrigin: async () => 'https://orderfly.test' },
    '@/lib/marketing/auth': { marketingAdminAuthorized: async () => overrides.authorized !== false },
    '@/lib/marketing/config': {
      marketingConfigurationStatus: brandId => brandId === 'brand-a' ? { config: { brandId } } : { config: null },
    },
    '@/lib/marketing/import-worker': {
      runOmnisendContactImportWorker: async (...args) => {
        calls.push({ importerArgs: args });
        return { results: [{ brandId: 'brand-a', status: 'imported', imported: 25, hasMore: true, backfillComplete: false }] };
      },
    },
  });
  return {
    route,
    calls,
    setBookingResponse: value => { bookingResponse = value; },
    restore: () => { global.fetch = previousFetch; },
  };
}

function request(body, origin = 'https://orderfly.test') {
  return new Request('https://orderfly.test/api/superadmin/customers/sync', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('manual sync rejects missing admin session and cross-origin requests before data access', async () => {
  const f = loadRoute({ authorized: false });
  try {
    const unauthorized = await f.route.POST(request({ brandId: 'brand-a', source: 'omnisend' }));
    assert.equal(unauthorized.status, 403);
    assert.equal(f.calls.length, 0);
  } finally { f.restore(); }

  const g = loadRoute();
  try {
    const csrf = await g.route.POST(request({ brandId: 'brand-a', source: 'omnisend' }, 'https://attacker.test'));
    assert.equal(csrf.status, 403);
    assert.equal(g.calls.length, 0);
  } finally { g.restore(); }
});

test('manual Omnisend sync is brand-scoped, bypasses the schedule and reports another page without sending campaigns', async () => {
  const f = loadRoute();
  try {
    const response = await f.route.POST(request({ brandId: 'brand-a', source: 'omnisend' }));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.imported, 25);
    assert.equal(body.hasMore, true);
    assert.deepEqual(f.calls[0].importerArgs[4], { brandId: 'brand-a', allowEarly: true });
    assert.equal(f.calls.some(call => call.url), false);
  } finally { f.restore(); }
});

test('manual booking sync forwards only the selected brand through the private server bridge', async () => {
  const previous = {
    endpoint: process.env.ORDERFLY_ESMERALDA_CUSTOMER_SYNC_ENDPOINT,
    secret: process.env.ORDERFLY_ESMERALDA_INTEGRATION_SECRET,
  };
  process.env.ORDERFLY_ESMERALDA_CUSTOMER_SYNC_ENDPOINT = endpoint;
  process.env.ORDERFLY_ESMERALDA_INTEGRATION_SECRET = secret;
  const f = loadRoute();
  try {
    const response = await f.route.POST(request({ brandId: 'brand-a', source: 'bookings' }));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.enqueued, 12);
    assert.equal(body.succeededCount, 4);
    assert.equal(body.pending, 8);
    const call = f.calls.find(item => item.url === endpoint);
    assert.ok(call);
    assert.equal(call.init.headers['x-esmeralda-integration-secret'], secret);
    assert.deepEqual(JSON.parse(call.init.body), { brandId: 'brand-a' });
    assert.equal(JSON.stringify(body).includes(secret), false);
  } finally {
    f.restore();
    previous.endpoint === undefined ? delete process.env.ORDERFLY_ESMERALDA_CUSTOMER_SYNC_ENDPOINT : process.env.ORDERFLY_ESMERALDA_CUSTOMER_SYNC_ENDPOINT = previous.endpoint;
    previous.secret === undefined ? delete process.env.ORDERFLY_ESMERALDA_INTEGRATION_SECRET : process.env.ORDERFLY_ESMERALDA_INTEGRATION_SECRET = previous.secret;
  }
});

test('manual booking bridge timeout allows all five bounded worker requests to finish', async () => {
  const previous = {
    endpoint: process.env.ORDERFLY_ESMERALDA_CUSTOMER_SYNC_ENDPOINT,
    secret: process.env.ORDERFLY_ESMERALDA_INTEGRATION_SECRET,
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout,
  };
  process.env.ORDERFLY_ESMERALDA_CUSTOMER_SYNC_ENDPOINT = endpoint;
  process.env.ORDERFLY_ESMERALDA_INTEGRATION_SECRET = secret;
  const scheduled = [];
  global.setTimeout = (callback, delay, ...args) => {
    scheduled.push(delay);
    return previous.setTimeout(callback, delay, ...args);
  };
  global.clearTimeout = timer => previous.clearTimeout(timer);
  const f = loadRoute();
  try {
    const response = await f.route.POST(request({ brandId: 'brand-a', source: 'bookings' }));
    assert.equal(response.status, 200);
    assert.ok(scheduled.includes(45_000));
    assert.ok(scheduled.find(delay => delay >= 45_000) > 5 * 5_000);
  } finally {
    f.restore();
    global.setTimeout = previous.setTimeout;
    global.clearTimeout = previous.clearTimeout;
    previous.endpoint === undefined ? delete process.env.ORDERFLY_ESMERALDA_CUSTOMER_SYNC_ENDPOINT : process.env.ORDERFLY_ESMERALDA_CUSTOMER_SYNC_ENDPOINT = previous.endpoint;
    previous.secret === undefined ? delete process.env.ORDERFLY_ESMERALDA_INTEGRATION_SECRET : process.env.ORDERFLY_ESMERALDA_INTEGRATION_SECRET = previous.secret;
  }
});

test('manual sync rejects invalid brands and disabled Omnisend mappings', async () => {
  const f = loadRoute();
  try {
    const invalid = await f.route.POST(request({ brandId: '../foreign', source: 'bookings' }));
    assert.equal(invalid.status, 400);
    const disabled = await f.route.POST(request({ brandId: 'brand-b', source: 'omnisend' }));
    assert.equal(disabled.status, 409);
    assert.equal(f.calls.length, 0);
  } finally { f.restore(); }
});
