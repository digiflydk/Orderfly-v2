'use strict';
// No bootstrap, loader, seed or cleanup ownership. The reviewed QA owner supplies
// native resources and its fixed actual-settlement adapter. Never an HTTP API.
const { Firestore } = require('@google-cloud/firestore');
const { createHash } = require('node:crypto');
const { environment, PROJECT } = require('./environment.cjs');
const MARKER = Symbol.for('orderfly.qa0.loopback-guard');
const codes = new Set(['runtime_invalid', 'resources_invalid', 'scope_unregistered', 'registration_failed', 'seed_invalid', 'atomicity_failed', 'replay_failed', 'operation_failed']);
const known = new WeakSet();
class IntentProofError extends Error {
  constructor(code) { super(codes.has(code) ? code : 'operation_failed'); this.name = 'IntentProofError'; this.code = this.message; known.add(this); Object.freeze(this); }
}
const fail = code => { throw new IntentProofError(code); };
function record(value, keys) {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('resources_invalid');
  const names = Reflect.ownKeys(value);
  if (names.length !== keys.length || names.some(key => typeof key !== 'string' || !keys.includes(key))) fail('resources_invalid');
  const row = Object.create(null);
  for (const key of keys) { const d = Object.getOwnPropertyDescriptor(value, key); if (!d || !Object.hasOwn(d, 'value')) fail('resources_invalid'); row[key] = d.value; }
  return row;
}
function runtime() {
  const expected = { ...environment(), ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED: 'false', ORDERFLY_LOCAL_QA_INTENT_PROOF: 'true', ORDERFLY_PRINT_INTENTS_ENABLED: 'true' };
  for (const [key, value] of Object.entries(expected)) if (!['PATH', 'LANG', 'TZ'].includes(key) && process.env[key] !== value) fail('runtime_invalid');
  for (const key of Object.keys(process.env)) {
    if (Object.hasOwn(expected, key)) continue;
    if (/SERVICE_ACCOUNT|GOOGLE_APPLICATION_CREDENTIALS|CLOUDSDK|GCE_METADATA|GOOGLE_METADATA|GOOGLE_OAUTH|GCLOUD_ACCESS_TOKEN|FIREBASE_TOKEN|FIREBASE_CONFIG|STRIPE|SMTP|RESEND|SENDGRID|OMNISEND|MPANEL|WOLT|UBER|GOOGLE_AUTH|PROXY|proxy|PRINT_(?:INTENTS|OUTPUT|DISPATCH)_ENABLED/.test(key)) fail('runtime_invalid');
  }
  if (Reflect.get(globalThis, MARKER) !== true) fail('runtime_invalid');
}
function inspect(input) {
  runtime();
  const r = record(input, ['projectId', 'sourceCommit', 'db', 'scope', 'registry', 'settle']);
  const scope = record(r.scope, ['brandId', 'locationId', 'orderId', 'printerIds']);
  const registry = record(r.registry, ['has', 'register']);
  if (r.projectId !== PROJECT || typeof r.sourceCommit !== 'string' || !/^[a-f0-9]{40}$/.test(r.sourceCommit)
    || typeof r.settle !== 'function' || typeof registry.has !== 'function' || typeof registry.register !== 'function') fail('resources_invalid');
  for (const key of ['brandId', 'locationId', 'orderId']) if (typeof scope[key] !== 'string' || !/^qa0-intent-[A-Za-z0-9_-]{1,64}$/.test(scope[key])) fail('resources_invalid');
  if (!Array.isArray(scope.printerIds) || scope.printerIds.length !== 2 || Reflect.ownKeys(scope.printerIds).length !== 3) fail('resources_invalid');
  const printerIds = [0, 1].map(index => {
    const d = Object.getOwnPropertyDescriptor(scope.printerIds, String(index));
    if (!d || !Object.hasOwn(d, 'value') || typeof d.value !== 'string' || !/^qa0-intent-[A-Za-z0-9_-]{1,64}$/.test(d.value)) fail('resources_invalid');
    return d.value;
  });
  if (new Set(printerIds).size !== 2) fail('resources_invalid');
  if (!(r.db instanceof Firestore) || r.db.projectId !== PROJECT || r.db.databaseId !== '(default)'
    || r.db._settings?.servicePath !== '127.0.0.1' || r.db._settings?.port !== 8088 || r.db._settings?.ssl !== false) fail('resources_invalid');
  const order = `orders/${scope.orderId}`, manifest = order + '/printIntents/original';
  const targets = printerIds.map(printerId => {
    const printer = `locations/${scope.locationId}/printers/${printerId}`;
    const jobId = createHash('sha256').update(JSON.stringify(['orderfly-print-v1', scope.brandId, scope.locationId, scope.orderId, printerId, 'kitchen', 0])).digest('hex');
    return Object.freeze({ printerId, printer, ledger: printer + '/queue/state', job: printer + '/jobs/' + jobId, jobId });
  });
  const existing = [`brands/${scope.brandId}`, `locations/${scope.locationId}`, order, ...targets.flatMap(t => [t.printer, t.ledger])];
  for (const path of existing) if (registry.has.call(r.registry, path, false) !== true) fail('scope_unregistered');
  const recursive = [order, ...targets.map(t => t.printer)];
  for (const path of recursive) if (registry.has.call(r.registry, path, true) !== true) fail('scope_unregistered');
  const created = [manifest, ...targets.map(t => t.job)];
  const plan = Object.freeze({ contractVersion: 1, projectId: PROJECT, sourceCommit: r.sourceCommit, order, manifest,
    scope: Object.freeze({ brandId: scope.brandId, locationId: scope.locationId, orderId: scope.orderId, printerIds: Object.freeze(printerIds) }),
    targets: Object.freeze(targets), createdDocuments: Object.freeze(created), existingDocuments: Object.freeze(existing), existingRecursiveRoots: Object.freeze(recursive) });
  return { r, registry, plan };
}
function safeInspect(input) { try { return inspect(input); } catch (error) { if (known.has(error)) throw error; fail('resources_invalid'); } }
function describeIntentProof(input) { return safeInspect(input).plan; }
const stamp = snapshot => {
  const t = snapshot.updateTime;
  if (!snapshot.exists || !t || !Number.isSafeInteger(t.seconds) || t.seconds <= 0 || !Number.isInteger(t.nanoseconds) || t.nanoseconds < 0 || t.nanoseconds >= 1e9) fail('atomicity_failed');
  return `${t.seconds}:${t.nanoseconds}`;
};
async function snapshots(r, paths) {
  const result = await r.db.runTransaction(tx => tx.getAll(...paths.map(path => r.db.doc(path))), { readOnly: true });
  if (!Array.isArray(result) || result.length !== paths.length || result.some((s, i) => s?.ref?.path !== paths[i])) fail('operation_failed');
  return result;
}
async function jobCounts(r, plan) {
  const result = await r.db.runTransaction(async tx => Promise.all(plan.targets.map(async t => {
    const jobs = await tx.get(r.db.collection(t.printer + '/jobs').limit(2));
    if (!Array.isArray(jobs.docs) || jobs.docs.length > 1 || jobs.docs.some(s => s.ref.path !== t.job)) fail('atomicity_failed');
    return jobs.docs.length;
  })), { readOnly: true });
  return result;
}
function scoped(data, scope, printerId) { return data?.brandId === scope.brandId && data?.locationId === scope.locationId && (!printerId || data?.printerId === printerId); }
async function runIntentProof(input) {
  const before = safeInspect(input), { r, registry, plan } = before;
  const stable = () => {
    const current = safeInspect(input);
    if (current.r.db !== r.db || current.r.settle !== r.settle || current.registry.has !== registry.has
      || current.registry.register !== registry.register || JSON.stringify(current.plan) !== JSON.stringify(plan)) fail('registration_failed');
  };
  try {
    await registry.register.call(r.registry, Object.freeze({ documents: plan.createdDocuments, recursiveRoots: Object.freeze([]) }));
    stable();
    for (const path of plan.createdDocuments) if (registry.has.call(r.registry, path, false) !== true) fail('registration_failed');
    const initialPaths = [...plan.existingDocuments, ...plan.createdDocuments];
    const initial = await snapshots(r, initialPaths);
    const byPath = new Map(initialPaths.map((path, i) => [path, initial[i]]));
    const order = byPath.get(plan.order)?.data(), brand = byPath.get(`brands/${plan.scope.brandId}`)?.data(), location = byPath.get(`locations/${plan.scope.locationId}`)?.data();
    if (!scoped(order, plan.scope) || order.paymentStatus !== 'Pending' || order.status !== 'Pending' || order.paymentMethod !== 'Stripe'
      || !['active', 'trialing'].includes(brand?.status) || location?.brandId !== plan.scope.brandId || location?.isActive !== true
      || plan.createdDocuments.some(path => byPath.get(path)?.exists !== false)) fail('seed_invalid');
    for (const t of plan.targets) {
      const p = byPath.get(t.printer)?.data(), q = byPath.get(t.ledger)?.data();
      if (!scoped(p?.configuration, plan.scope) || p.configuration.id !== t.printerId || p.configuration.state !== 'paused' || p.revision !== 1 || p.deletedAt !== null
        || !scoped(q, plan.scope, t.printerId) || q.revision !== 0 || q.pendingCount !== 0 || q.oldestPendingAt !== null) fail('seed_invalid');
    }
    stable();
    if ((await jobCounts(r, plan)).some(count => count !== 0)) fail('seed_invalid');
    stable();
    if (await r.settle() !== true) fail('atomicity_failed');
    stable();
    const atomicPaths = [plan.order, plan.manifest, ...plan.targets.flatMap(t => [t.job, t.ledger])];
    const committed = await snapshots(r, atomicPaths);
    const commit = stamp(committed[0]);
    if (committed.some(s => stamp(s) !== commit)) fail('atomicity_failed');
    const paid = committed[0].data(), manifest = committed[1].data();
    if (!scoped(paid, plan.scope) || paid.paymentStatus !== 'Paid' || paid.status !== 'Received' || typeof paid.invoice?.number !== 'string' || !paid.invoice.number.length
      || !scoped(manifest, plan.scope) || manifest.orderId !== plan.scope.orderId || manifest.originalRevision !== 0 || manifest.id !== 'original'
      || !Array.isArray(manifest.targets) || manifest.targets.length !== 2 || new Set(manifest.targets.map(t => t.printerId)).size !== 2) fail('atomicity_failed');
    for (const [i, t] of plan.targets.entries()) {
      const job = committed[2 + i * 2].data(), queue = committed[3 + i * 2].data(), target = manifest.targets.find(v => v.printerId === t.printerId);
      if (!target || target.printerRevision !== 1 || JSON.stringify(target.kinds) !== '["kitchen"]'
        || !scoped(job, plan.scope, t.printerId) || job.orderId !== plan.scope.orderId || job.id !== t.jobId || job.revision !== 0 || job.kind !== 'kitchen'
        || job.printerRevision !== 1 || job.state !== 'queued' || job.attempts !== 0 || !Number.isSafeInteger(job.createdAt) || job.createdAt <= 0
        || !scoped(queue, plan.scope, t.printerId) || queue.revision !== 1 || queue.pendingCount !== 1 || queue.oldestPendingAt !== job.createdAt) fail('atomicity_failed');
    }
    stable();
    if ((await jobCounts(r, plan)).some(count => count !== 1)) fail('atomicity_failed');
    stable();
    if (await r.settle() !== false) fail('replay_failed');
    stable();
    const replay = await snapshots(r, atomicPaths);
    if (replay.some(s => stamp(s) !== commit)) fail('replay_failed');
    stable();
    if ((await jobCounts(r, plan)).some(count => count !== 1)) fail('replay_failed');
    stable();
    return Object.freeze({ contractVersion: 1, status: 'ATOMIC_COMMIT_AND_REPLAY_OBSERVED', sourceCommit: plan.sourceCommit,
      nativeRecordsCompared: atomicPaths.length, originalJobs: 2, sameCommitTime: true, replayUnchanged: true,
      cleanupOwnedByCaller: true, cleanupVerified: false, productionAcceptance: false, physicalPrintVerified: false });
  } catch (error) { if (known.has(error)) throw error; fail('operation_failed'); }
}
module.exports = { IntentProofError, describeIntentProof, runIntentProof };
