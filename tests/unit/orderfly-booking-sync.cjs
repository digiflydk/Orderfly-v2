const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { loadTs } = require('../helpers/load-ts.cjs');

const sync = loadTs('supabase/functions/_shared/orderfly-customer-identity.ts', {});

test('booking customer sync accepts either a valid email or a phone with digits', () => {
  assert.equal(sync.hasBookingCustomerIdentity('guest@example.test', ''), true);
  assert.equal(sync.hasBookingCustomerIdentity('', '+45 12 34 56 78'), true);
  assert.equal(sync.hasBookingCustomerIdentity('not-an-email', '0045 12345678'), true);
  assert.equal(sync.hasBookingCustomerIdentity('', '---'), false);
  assert.equal(sync.hasBookingCustomerIdentity('not-an-email', '---'), false);
});

test('booking backfill is scoped to active mappings and does not retry terminal identity conflicts', () => {
  const migration = fs.readFileSync('supabase/migrations/20261014004726_orderfly_customer_manual_sync.sql', 'utf8');
  assert.match(migration, /orderfly_organization_mappings[\s\S]+om\.is_active = true/);
  assert.match(migration, /orderfly_location_mappings[\s\S]+lm\.is_active = true/);
  assert.match(migration, /booking_consumer_customer_links[\s\S]+l\.booking_id is null/);
  assert.match(migration, /btrim\(coalesce\(b\.guest_email, ''\)\) ~/);
  assert.match(migration, /guest_phone/);
  const candidateFilter = migration.slice(migration.indexOf('where b.organization_id'), migration.indexOf('on conflict (booking_id)'));
  assert.ok(candidateFilter.indexOf("existing_job.status = 'skipped'") < candidateFilter.indexOf('limit greatest'));
  assert.match(migration, /on conflict \(booking_id\) do update[\s\S]+current_job\.status = 'skipped'/);
  assert.match(migration, /current_job\.last_error in \([\s\S]+no valid guest email[\s\S]+no valid email or phone/);
  assert.match(migration, /current_job\.organization_id = excluded\.organization_id[\s\S]+current_job\.location_id = excluded\.location_id/);
  assert.match(migration, /revoke all[\s\S]+from public, anon, authenticated/);
});

test('booking request timeout stays active until the provider response body is consumed', async () => {
  const identity = loadTs('supabase/functions/_shared/orderfly-customer-identity.ts', {});
  const { processOrderflyCustomerSyncJobs } = loadTs('supabase/functions/_shared/orderfly-customer-sync.ts', {
    './orderfly-customer-identity.ts': identity,
  });
  const original = {
    Deno: global.Deno,
    fetch: global.fetch,
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout,
  };
  const organizationId = '11111111-1111-4111-8111-111111111111';
  const job = {
    id: 'sync-job', booking_id: 'booking-1', organization_id: organizationId,
    location_id: 'location-1', status: 'pending', attempt_count: 0,
  };
  let timeoutHandle, timeoutCleared = false;
  const rowFor = table => {
    if (table === 'bookings') return { id: job.booking_id, organization_id: organizationId, location_id: 'location-1', guest_name: 'Guest', guest_email: 'guest@example.test', guest_phone: '' };
    if (table === 'orderfly_organization_mappings') return { orderfly_brand_id: 'brand-1', is_active: true };
    if (table === 'orderfly_location_mappings') return { orderfly_location_id: 'location-1', organization_id: organizationId, is_active: true };
    return null;
  };
  const db = {
    from(table) {
      const state = { patch: null, selected: false };
      const chain = {
        select() { state.selected = true; return chain; },
        update(patch) { state.patch = patch; return chain; },
        insert() { return chain; },
        eq() { return chain; }, lt() { return chain; }, lte() { return chain; },
        order() { return chain; }, limit() { return chain; },
        async maybeSingle() {
          if (table === 'orderfly_customer_sync_jobs' && state.patch?.status === 'processing') return { data: { id: job.id }, error: null };
          return { data: rowFor(table), error: null };
        },
        then(resolve, reject) {
          const result = table === 'orderfly_customer_sync_jobs' && state.selected && !state.patch
            ? { data: [job], error: null }
            : { data: null, error: null };
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return chain;
    },
  };

  global.Deno = { env: { get: key => ({
    ORDERFLY_INTEGRATION_BASE_URL: 'https://orderfly.test',
    ORDERFLY_ESMERALDA_INTEGRATION_SECRET: 'synthetic-booking-sync-secret-value',
  })[key] } };
  global.setTimeout = (callback, delay, ...args) => {
    if (delay === 5000) {
      timeoutHandle = { callback, args };
      return timeoutHandle;
    }
    return original.setTimeout(callback, delay, ...args);
  };
  global.clearTimeout = handle => {
    if (handle === timeoutHandle) timeoutCleared = true;
    else original.clearTimeout(handle);
  };
  global.fetch = async (_url, init) => ({
    ok: true,
    status: 200,
    text: async () => {
      assert.equal(init.signal.aborted, false);
      assert.equal(timeoutCleared, false, 'provider timeout must remain armed while response.text() is pending');
      return JSON.stringify({ customer_id: 'customer-1' });
    },
  });

  try {
    const result = await processOrderflyCustomerSyncJobs(db, organizationId, 5);
    assert.equal(result.processed, 1);
    assert.equal(result.results[0].status, 'succeeded');
    assert.equal(timeoutCleared, true, 'provider timeout is cleared after reading the complete body');
  } finally {
    global.Deno = original.Deno;
    global.fetch = original.fetch;
    global.setTimeout = original.setTimeout;
    global.clearTimeout = original.clearTimeout;
  }
});

test('Supabase customer sync function sources transpile without TypeScript syntax errors', () => {
  for (const path of [
    'supabase/functions/orderfly-customer-sync-trigger/index.ts',
    'supabase/functions/_shared/orderfly-customer-sync.ts',
    'supabase/functions/_shared/orderfly-customer-identity.ts',
  ]) {
    const result = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
      reportDiagnostics: true,
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    });
    const errors = (result.diagnostics || []).filter(item => item.category === ts.DiagnosticCategory.Error);
    assert.deepEqual(errors, [], path);
  }
});
