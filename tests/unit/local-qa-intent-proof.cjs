'use strict';
// Contract tests: native SDK resource identity, isolated read/settlement callbacks.
// These do not launch emulators or prove actual native settlement execution.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Firestore } = require('@google-cloud/firestore');
const { environment, PROJECT } = require('../../scripts/local-qa/environment.cjs');
const { describeIntentProof, runIntentProof } = require('../../scripts/local-qa/intent-proof.cjs');
const marker = Symbol.for('orderfly.qa0.loopback-guard');
async function guarded(run) {
  const prior = process.env, priorMarker = Object.getOwnPropertyDescriptor(globalThis, marker);
  process.env = { ...environment(), ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED: 'false', ORDERFLY_LOCAL_QA_INTENT_PROOF: 'true', ORDERFLY_PRINT_INTENTS_ENABLED: 'true' };
  Object.defineProperty(globalThis, marker, { value: true, configurable: true });
  try { return await run(); } finally { process.env = prior; if (priorMarker) Object.defineProperty(globalThis, marker, priorMarker); else delete globalThis[marker]; }
}
function fixture() {
  const db = new Firestore({ projectId: PROJECT, host: '127.0.0.1:8088', ssl: false });
  const paths = new Set(), recursiveRoots = new Set(), records = new Map(); let reads = 0, settles = 0, registrations = 0;
  const scope = { brandId: 'qa0-intent-brand', locationId: 'qa0-intent-location', orderId: 'qa0-intent-order', printerIds: ['qa0-intent-pizza', 'qa0-intent-packing'] };
  const resource = { projectId: PROJECT, sourceCommit: 'a'.repeat(40), db, scope,
    registry: { has: (path, recursive) => recursive ? recursiveRoots.has(path) : paths.has(path), register: async plan => { registrations++; plan.documents.forEach(path => paths.add(path)); } },
    settle: async () => {
      settles++;
      if (settles !== 1) return false;
      const paid = { ...records.get(plan.order).data, paymentStatus: 'Paid', status: 'Received', invoice: { number: 'QA0-000001' } };
      const store = (path, data) => records.set(path, { data, seconds: 100, nanoseconds: 456 });
      store(plan.order, paid);
      store(plan.manifest, { id: 'original', ...scope, orderId: scope.orderId, originalRevision: 0,
        targets: plan.targets.map(t => ({ printerId: t.printerId, printerRevision: 1, kinds: ['kitchen'] })) });
      for (const t of plan.targets) {
        store(t.job, { ...scope, printerId: t.printerId, id: t.jobId, orderId: scope.orderId, revision: 0, kind: 'kitchen', printerRevision: 1, state: 'queued', attempts: 0, createdAt: 100 });
        store(t.ledger, { ...scope, printerId: t.printerId, revision: 2, pendingCount: 1, oldestPendingAt: 100 });
      }
      return true;
    } };
  // Existing fixture paths are registered by the authoritative owner before module use.
  paths.add(`brands/${scope.brandId}`); paths.add(`locations/${scope.locationId}`); paths.add(`orders/${scope.orderId}`);
  recursiveRoots.add(`orders/${scope.orderId}`);
  for (const printer of scope.printerIds) { const path = `locations/${scope.locationId}/printers/${printer}`; paths.add(path); paths.add(path + '/queue/state'); recursiveRoots.add(path); }
  const plan = describeIntentProof(resource);
  for (const path of plan.existingDocuments) records.set(path, { data: {}, seconds: 99, nanoseconds: 1 });
  records.get(`brands/${scope.brandId}`).data = { status: 'active' };
  records.get(`locations/${scope.locationId}`).data = { brandId: scope.brandId, isActive: true };
  records.get(plan.order).data = { ...scope, paymentStatus: 'Pending', status: 'Pending', paymentMethod: 'Stripe' };
  for (const t of plan.targets) {
    records.get(t.printer).data = { configuration: { ...scope, id: t.printerId, state: 'paused' }, revision: 1, deletedAt: null };
    records.get(t.ledger).data = { ...scope, printerId: t.printerId, revision: 1, pendingCount: 0, oldestPendingAt: null };
  }
  db.runTransaction = async (operation, options) => {
    reads++; assert.deepEqual(options, { readOnly: true });
    return operation({ get: async query => {
      const parent = query._queryOptions.parentPath.relativeName + '/' + query._queryOptions.collectionId;
      return { docs: [...records].filter(([path]) => path.startsWith(parent + '/') && path.split('/').length === parent.split('/').length + 1).slice(0, 2).map(([path]) => ({ ref: db.doc(path) })) };
    }, getAll: async (...refs) => refs.map(ref => {
      const row = records.get(ref.path);
      return { ref, exists: !!row, updateTime: row && { seconds: row.seconds, nanoseconds: row.nanoseconds }, data: () => row?.data };
    }) });
  };
  return { resource, plan, records, paths, recursiveRoots, reads: () => reads, settles: () => settles, registrations: () => registrations };
}
const rejects = (operation, code) => assert.rejects(operation, error => error.name === 'IntentProofError' && error.code === code && !error.message.includes('PRIVATE'));

test('finite atomic/replay case registers before reads and returns only safe evidence', () => guarded(async () => {
  const f = fixture(); const result = await runIntentProof(f.resource);
  assert.deepEqual(result, { contractVersion: 1, status: 'ATOMIC_COMMIT_AND_REPLAY_OBSERVED', sourceCommit: 'a'.repeat(40), nativeRecordsCompared: 6,
    originalJobs: 2, sameCommitTime: true, replayUnchanged: true, cleanupOwnedByCaller: true, cleanupVerified: false, productionAcceptance: false, physicalPrintVerified: false });
  assert.equal(f.reads(), 6); assert.equal(f.settles(), 2); assert.equal(f.registrations(), 1);
  assert.ok(f.plan.createdDocuments.every(path => f.paths.has(path))); assert.equal(Object.isFrozen(f.plan.scope.printerIds), true);
  assert.doesNotMatch(JSON.stringify(result), /brand|location|orderId|invoice|cookie|secret|digest|updateTime/);
}));
test('runtime rejects partial/prod/remote/provider/output modes before registration, reads or settle', () => guarded(async () => {
  const f = fixture(); const valid = process.env;
  for (const patch of [{ NODE_ENV: 'production' }, { ORDERFLY_LOCAL_QA_INTENT_PROOF: undefined }, { ORDERFLY_PRINT_INTENTS_ENABLED: 'TRUE' },
    { GOOGLE_CLOUD_PROJECT: 'orderfly-39325' }, { NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'production' }, { SITE_URL: 'https://orderfly.dk' },
    { FIRESTORE_EMULATOR_HOST: 'remote.example:8088' }, { FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099' },
    { ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED: 'true' }, { ORDERFLY_PRINT_OUTPUT_ENABLED: 'false' }, { ORDERFLY_PRINT_DISPATCH_ENABLED: 'true' },
    { GOOGLE_APPLICATION_CREDENTIALS: '' }, { FB_SERVICE_ACCOUNT_JSON: 'PRIVATE' }, { STRIPE_SECRET_KEY: 'PRIVATE' }, { HTTPS_PROXY: 'http://remote.invalid' }]) {
    process.env = { ...valid, ...patch };
    await rejects(() => runIntentProof(f.resource), 'runtime_invalid');
  }
  process.env = valid; Object.defineProperty(globalThis, marker, { value: false, configurable: true });
  await rejects(() => runIntentProof(f.resource), 'runtime_invalid');
  assert.equal(f.reads(), 0); assert.equal(f.settles(), 0); assert.equal(f.registrations(), 0);
}));
test('strict resource/scope/SDK/project registration boundaries fail before I/O', () => guarded(async () => {
  const f = fixture();
  for (const patch of [{ projectId: 'production' }, { sourceCommit: 'HEAD' }, { db: {} }, { settle: null }, { unknown: 'PRIVATE' },
    { scope: { ...f.resource.scope, orderId: 'live-order' } }, { scope: { ...f.resource.scope, printerIds: ['qa0-intent-one', 'qa0-intent-one'] } },
    { scope: { ...f.resource.scope, printerIds: ['qa0-intent-one'] } }]) await rejects(() => runIntentProof({ ...f.resource, ...patch }), 'resources_invalid');
  const remote = new Firestore({ projectId: 'other-demo', host: '127.0.0.1:8088', ssl: false });
  await rejects(() => runIntentProof({ ...f.resource, db: remote }), 'resources_invalid');
  f.paths.delete(f.plan.order); await rejects(() => runIntentProof(f.resource), 'scope_unregistered');
  assert.equal(f.reads(), 0); assert.equal(f.settles(), 0); assert.equal(f.registrations(), 0);
}));
test('owner must already own recursive fixture cleanup before any callback or read', () => guarded(async () => {
  const f = fixture(); f.recursiveRoots.delete(f.plan.order);
  await rejects(() => runIntentProof(f.resource), 'scope_unregistered'); assert.equal(f.registrations(), 0); assert.equal(f.reads(), 0);
}));
test('accessor/proxy/private reflection failures remain fixed and arrays are read as descriptors', () => guarded(async () => {
  const f = fixture(); let invoked = 0;
  const p = [...f.resource.scope.printerIds]; Object.defineProperty(p, '0', { get() { invoked++; throw Error('PRIVATE'); }, enumerable: true });
  await rejects(() => runIntentProof({ ...f.resource, scope: { ...f.resource.scope, printerIds: p } }), 'resources_invalid');
  const poisoned = { ...f.resource }; Object.defineProperty(poisoned, 'settle', { get() { invoked++; throw Error('PRIVATE'); } });
  await rejects(() => runIntentProof(poisoned), 'resources_invalid');
  await rejects(() => runIntentProof(new Proxy({}, { getPrototypeOf() { throw Error('PRIVATE'); } })), 'resources_invalid');
  assert.equal(invoked, 0); assert.equal(f.reads(), 0);
}));
test('registration must finish and remain stable before native reads; caller keeps cleanup ownership', () => guarded(async () => {
  for (const kind of ['no-registration', 'reject', 'mutate-settler', 'mutate-scope']) {
    const f = fixture(); f.resource.registry.register = async () => {
      if (kind === 'reject') throw Error('PRIVATE registration');
      if (kind === 'mutate-settler') f.resource.settle = async () => true;
      if (kind === 'mutate-scope') f.resource.scope.orderId = 'qa0-intent-changed';
    };
    await assert.rejects(() => runIntentProof(f.resource), error => error.name === 'IntentProofError' && !error.message.includes('PRIVATE'));
    assert.equal(f.reads(), 0); assert.equal(f.settles(), 0);
  }
}));
test('invalid pending seed, active-output printer or nonempty queue never invokes settlement', () => guarded(async () => {
  for (const mutate of [f => f.records.get(f.plan.order).data.paymentStatus = 'Paid',
    f => f.records.get(f.plan.targets[0].printer).data.configuration.state = 'active',
    f => f.records.get(f.plan.targets[0].ledger).data.pendingCount = 1,
    f => f.records.get(f.plan.targets[0].ledger).data.revision = 0,
    f => f.records.set(f.plan.manifest, { data: {}, seconds: 99, nanoseconds: 1 }),
    f => f.records.get(`locations/${f.plan.scope.locationId}`).data.brandId = 'foreign']) {
    const f = fixture(); mutate(f); await rejects(() => runIntentProof(f.resource), 'seed_invalid'); assert.equal(f.settles(), 0);
  }
}));
test('atomicity rejects different native commit nanoseconds, missing job, scope/kind/revision/count and invoice errors', () => guarded(async () => {
  for (const mutate of [f => f.records.get(f.plan.targets[0].job).nanoseconds++, f => f.records.delete(f.plan.targets[0].job),
    f => f.records.get(f.plan.targets[0].job).data.brandId = 'foreign', f => f.records.get(f.plan.targets[0].job).data.kind = 'packing',
    f => f.records.get(f.plan.targets[0].job).data.printerRevision = 2, f => f.records.get(f.plan.targets[0].ledger).data.pendingCount = 2,
    f => delete f.records.get(f.plan.order).data.invoice, f => f.records.get(f.plan.manifest).data.targets[1].printerId = f.plan.targets[0].printerId]) {
    const f = fixture(), settle = f.resource.settle; f.resource.settle = async () => { const result = await settle(); mutate(f); return result; };
    await rejects(() => runIntentProof(f.resource), 'atomicity_failed'); assert.equal(f.settles(), 1);
  }
}));
test('replay requires no paid/order/manifest/job/ledger writes and false settlement result', () => guarded(async () => {
  for (const mode of ['true', 'order', 'manifest', 'job', 'ledger']) {
    const f = fixture(), settle = f.resource.settle; f.resource.settle = async () => {
      const result = await settle(); if (f.settles() === 2) {
        if (mode === 'true') return true;
        const path = mode === 'order' ? f.plan.order : mode === 'manifest' ? f.plan.manifest : mode === 'job' ? f.plan.targets[0].job : f.plan.targets[0].ledger;
        f.records.get(path).nanoseconds++;
      } return result;
    };
    await rejects(() => runIntentProof(f.resource), 'replay_failed'); assert.equal(f.settles(), 2);
  }
}));
test('callback/storage errors are sanitized; module never runs its own cleanup or accepts mocked commit as QA', () => guarded(async () => {
  for (const stage of ['read', 'settle']) {
    const f = fixture(); if (stage === 'read') f.resource.db.runTransaction = async () => { throw Error('PRIVATE DB credentials'); };
    else f.resource.settle = async () => { throw Error('PRIVATE provider'); };
    await rejects(() => runIntentProof(f.resource), 'operation_failed');
    assert.ok(f.plan.createdDocuments.every(path => f.paths.has(path))); assert.ok(f.records.has(f.plan.order));
  }
}));
test('extra native printer jobs and changed runtime after settlement cannot become successful evidence', () => guarded(async () => {
  for (const mode of ['extra-job', 'changed-runtime', 'changed-scope']) {
    const f = fixture(), settle = f.resource.settle;
    f.resource.settle = async () => {
      const result = await settle();
      if (mode === 'extra-job') f.records.set(f.plan.targets[0].printer + '/jobs/unexpected', { data: {}, seconds: 100, nanoseconds: 456 });
      if (mode === 'changed-runtime') process.env.GOOGLE_CLOUD_PROJECT = 'orderfly-39325';
      if (mode === 'changed-scope') f.resource.scope.orderId = 'qa0-intent-foreign';
      return result;
    };
    const prior = process.env.GOOGLE_CLOUD_PROJECT;
    try { await assert.rejects(() => runIntentProof(f.resource), error => error.name === 'IntentProofError' && !error.message.includes('PRIVATE')); }
    finally { process.env.GOOGLE_CLOUD_PROJECT = prior; }
    assert.equal(f.settles(), 1);
  }
}));
