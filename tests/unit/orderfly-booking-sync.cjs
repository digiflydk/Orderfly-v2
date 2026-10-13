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
  const migration = fs.readFileSync('supabase/migrations/20261013000000_orderfly_customer_manual_sync.sql', 'utf8');
  assert.match(migration, /orderfly_organization_mappings[\s\S]+om\.is_active = true/);
  assert.match(migration, /orderfly_location_mappings[\s\S]+lm\.is_active = true/);
  assert.match(migration, /booking_consumer_customer_links[\s\S]+l\.booking_id is null/);
  assert.match(migration, /guest_email[\s\S]+guest_phone/);
  assert.match(migration, /on conflict \(booking_id\) do update[\s\S]+status = 'skipped'[\s\S]+no valid guest email/);
  assert.match(migration, /revoke all[\s\S]+from public, anon, authenticated/);
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
