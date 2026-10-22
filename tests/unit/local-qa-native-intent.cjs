'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { intentEnvironment } = require('../../scripts/local-qa/intent-environment.cjs');
const fixture = require('../../scripts/local-qa/native-intent-fixture.cjs');
function env(values, run) {
  const previous = process.env; process.env = { ...values };
  const symbol = Symbol.for('orderfly.qa0.loopback-guard'), descriptor = Object.getOwnPropertyDescriptor(globalThis, symbol);
  if (!descriptor) Object.defineProperty(globalThis, symbol, { value: true, configurable: true });
  try { return run(); } finally { process.env = previous; if (!descriptor) delete globalThis[symbol]; }
}
function hook() { return loadTs('src/lib/printing/local-qa-stripe-options.ts', { 'server-only': {} }); }
test('ordinary provider path remains unconfigured by local helper', () => env({}, () => {
  assert.equal(hook().localQaStripeOptions(), null);
}));
test('complete isolated intent runtime gets only fixed synthetic SDK options', () => env(intentEnvironment(), () => {
  const config = hook().localQaStripeOptions();
  assert.deepEqual(config, { key: 'sk_test_orderfly_qa0_synthetic_only', options: { host: '127.0.0.1', port: 3100, protocol: 'http', timeout: 5000, maxNetworkRetries: 0 } });
  assert.ok(Object.isFrozen(config) && Object.isFrozen(config.options));
  fixture.assertRuntime();
}));
test('partial, production, credentials, foreign hosts and output declarations reject the local provider', () => {
  for (const patch of [{ ORDERFLY_LOCAL_QA_INTENT_PROOF: '' }, { NODE_ENV: 'production' }, { GCLOUD_PROJECT: 'orderfly-39325' },
    { FIRESTORE_EMULATOR_HOST: 'remote:8088' }, { FIREBASE_AUTH_EMULATOR_HOST: 'remote:9099' },
    { ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED: 'true' }, { ORDERFLY_PRINT_INTENTS_ENABLED: 'false' },
    { STRIPE_SECRET_KEY: 'forbidden' }, { GOOGLE_APPLICATION_CREDENTIALS: 'forbidden' }, { HTTPS_PROXY: '' },
    { ORDERFLY_PRINT_OUTPUT_ENABLED: 'false' }, { ORDERFLY_PRINT_DISPATCH_ENABLED: '' }]) env({ ...intentEnvironment(), ...patch }, () => {
      assert.throws(() => hook().localQaStripeOptions()); assert.throws(() => fixture.assertRuntime());
    });
});
test('fixture defines only one finite paused two-printer order and vacant queue', () => {
  const rows = fixture.fixtureRows();
  assert.equal([...rows.keys()].filter(p => p.startsWith('orders/')).length, 1);
  const printers = [...rows].filter(([p]) => /\/printers\/[^/]+$/.test(p));
  assert.equal(printers.length, 2); for (const [, p] of printers) assert.equal(p.configuration.state, 'paused');
  const queues = [...rows].filter(([p]) => p.endsWith('/queue/state'));
  assert.equal(queues.length, 2); for (const [, q] of queues) { assert.equal(q.pendingCount, 0); assert.equal(q.revision, 1); }
  assert.equal([...rows.keys()].some(p => /deviceCredentials|delivery|claim|capability/.test(p)), false);
});
test('native source loader refuses use without explicit isolated runtime before loading any source', () => env({}, () => {
  assert.throws(() => require('../../scripts/local-qa/native-intent-source.cjs').loadNativeIntentSource(), /source boundary rejected/);
}));
test('year rollover counter is owned, cleaned and collision-checked before seeding', async () => {
  const { Firestore } = require('@google-cloud/firestore');
  const previousEnv = process.env, OriginalDate = Date;
  const symbol = Symbol.for('orderfly.qa0.loopback-guard'), descriptor = Object.getOwnPropertyDescriptor(globalThis, symbol);
  process.env = intentEnvironment();
  if (!descriptor) Object.defineProperty(globalThis, symbol, { value: true, configurable: true });
  globalThis.Date = class extends OriginalDate { constructor(...args) { super(...(args.length ? args : ['2026-12-31T23:59:59.999Z'])); } };
  const db = new Firestore({ projectId: 'demo-orderfly-qa0', host: '127.0.0.1:8088', ssl: false });
  const records = new Map(), reads = [], deleted = [];
  db.doc = path => ({ path, get: async () => { reads.push(path); return { exists: records.has(path), data: () => records.get(path) }; },
    listCollections: async () => [], delete: async () => { deleted.push(path); records.delete(path); } });
  db.batch = () => { const writes = []; return { create(ref, data) { writes.push([ref.path, data]); }, async commit() {
    for (const [path] of writes) assert.equal(records.has(path), false);
    for (const [path, data] of writes) records.set(path, data);
  } }; };
  db.recursiveDelete = async ref => { for (const path of records.keys()) if (path === ref.path || path.startsWith(ref.path + '/')) records.delete(path); };
  const counter = 'invoiceCounters/qa0-intent-brand-2027';
  try {
    const instance = await fixture.createFixture(db);
    assert.ok(reads.includes(counter), 'next-year collision read must precede seed');
    records.set(counter, { next: 1 }); // Actual settlement begins after UTC rollover.
    await instance.cleanup();
    assert.ok(deleted.includes(counter)); assert.equal(records.size, 0);
    records.set(counter, { unrelated: true });
    await assert.rejects(fixture.createFixture(db), /fixture collision/);
    assert.deepEqual([...records], [[counter, { unrelated: true }]], 'collision never grants cleanup ownership');
  } finally {
    globalThis.Date = OriginalDate; process.env = previousEnv;
    if (!descriptor) delete globalThis[symbol];
    await db.terminate();
  }
});
test('installed Stripe SDK reaches only the fixed synthetic HTTP provider and provider rejects other paths', () => {
  const { spawnSync } = require('node:child_process');
  const code = `(async()=>{const f=require('./scripts/local-qa/native-intent-fixture.cjs');const p=await f.startProvider();try{const Stripe=require('stripe');const s=new Stripe('sk_test_orderfly_qa0_synthetic_only',{host:'127.0.0.1',port:3100,protocol:'http',maxNetworkRetries:0});const r=await s.checkout.sessions.retrieve('cs_test_qa0_native_intent_reference');if(r.payment_status!=='paid')throw Error('bad');const rejected=await fetch('http://127.0.0.1:3100/not-allowed');if(rejected.status!==400)throw Error('bad');console.log(JSON.stringify(p.counts()));}finally{await p.close();}})().catch(()=>{process.exitCode=1})`;
  const result = spawnSync(process.execPath, ['-e', code], { cwd: require('node:path').resolve(__dirname, '../..'), env: intentEnvironment(), encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 0); assert.deepEqual(JSON.parse(result.stdout), { requests: 1, rejected: 1 });
});
