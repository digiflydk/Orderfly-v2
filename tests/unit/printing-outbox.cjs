const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { config, record, path } = require('../helpers/printing-fixture.cjs');
const command = { brandId: 'brand', locationId: 'location', printerId: 'p1', orderId: 'o1', kind: 'kitchen' };
const order = { brandId: 'brand', locationId: 'location', status: 'Received', paymentStatus: 'Paid', paymentMethod: 'Stripe', deliveryType: 'Pickup' };
const queuePath = `${path}/queue/state`;
function fixture({ printer = record({ configuration: config({ state: 'active' }) }), savedOrder = order, extra = [], fail, retry } = {}) {
  const records = new Map([['brands/brand', {}], ['locations/location', { brandId: 'brand' }], [path, printer], ['orders/o1', savedOrder], ...extra]);
  const service = loadTs('src/lib/printing/outbox.ts', { 'server-only': {}, 'firebase-admin/firestore': { FieldValue: { serverTimestamp: () => ({ serverTimestamp: true }) } } });
  let serial = Promise.resolve(), retried = false;
  function ref(path) { return { path, id: path.split('/').at(-1), collection: n => collection(`${path}/${n}`) }; }
  function collection(path) { return { doc: n => ref(`${path}/${n}`), limit: n => ({ query: path, limit: n }) }; }
  const db = { collection, runTransaction(run) {
    const job = serial.then(async () => {
      for (;;) {
        const staged = new Map(structuredClone([...records])); let writing = false;
        const tx = {
          async get(ref) {
            assert.equal(writing, false, 'all reads precede any writes');
            if (ref.query) {
              const rows = [...staged].filter(([key]) => key.startsWith(`${ref.query}/`) && !key.slice(ref.query.length + 1).includes('/')).slice(0, ref.limit);
              return { empty: !rows.length, size: rows.length, docs: rows.map(([key, value]) => ({ id: key.split('/').at(-1), data: () => value })) };
            }
            return { id: ref.id, exists: staged.has(ref.path), data: () => structuredClone(staged.get(ref.path)) };
          },
          create(ref, value) { writing = true; if (staged.has(ref.path) || fail === ref.path) throw Error('fixture conflict'); staged.set(ref.path, structuredClone(value)); },
          set(ref, value) { writing = true; if (fail === ref.path) throw Error('fixture write failed'); staged.set(ref.path, structuredClone(value)); },
        };
        const result = await run(tx);
        if (retry && !retried) { retried = true; retry(records); continue; }
        if (fail === 'commit') throw Error('fixture commit failed');
        records.clear(); for (const row of staged) records.set(...row); return result;
      }
    }); serial = job.catch(() => {}); return job;
  } };
  async function insert(input = command, afterPrepare) {
    return db.runTransaction(async tx => {
      const plan = await service.prepareOriginalPrintIntent(db, tx, input);
      await tx.get(db.collection('orders').doc('o1')); // caller may finish other reads
      plan.apply();
      if (afterPrepare) afterPrepare(tx, plan);
      return { jobId: plan.jobId, created: plan.created };
    });
  }
  return { records, db, insert, service };
}

test('atomic original intent has credential-free deterministic identity and authoritative queue metadata', async () => {
  const f = fixture(); const result = await f.insert(command, tx => tx.set(f.db.collection('orders').doc('o1'), { ...order, acceptedAt: 'server fixture' }));
  const job = f.records.get(`${path}/jobs/${result.jobId}`), q = f.records.get(queuePath);
  assert.equal(result.created, true); assert.equal(job.revision, 0); assert.equal(job.printerRevision, 1);
  assert.equal(job.state, 'queued'); assert.equal(job.attempts, 0); assert.equal(q.revision, 1); assert.equal(q.pendingCount, 1); assert.equal(q.oldestPendingAt, job.createdAt);
  assert.deepEqual(job.updatedAt, { serverTimestamp: true }); assert.equal(f.records.get('orders/o1').acceptedAt, 'server fixture');
  assert.equal(JSON.stringify(job).includes('customer'), false);
});
test('repeat and competing events insert once and never double count', async () => {
  const f = fixture(); const results = await Promise.all([f.insert(), f.insert(), f.insert()]);
  assert.equal(results.filter(r => r.created).length, 1); assert.equal(new Set(results.map(r => r.jobId)).size, 1);
  assert.equal(f.records.get(queuePath).pendingCount, 1); assert.equal(f.records.get(queuePath).revision, 1);
});
test('accepted unpaid pickup and its later payment share one original job', async () => {
  const pickup = { ...order, paymentMethod: 'PayAtPickup', paymentStatus: 'Pending', discountReservation: 'held' };
  const f = fixture({ savedOrder: pickup }); const first = await f.insert();
  f.records.set('orders/o1', { ...pickup, paymentStatus: 'Paid', discountReservation: 'consumed' });
  assert.deepEqual(await f.insert(), { jobId: first.jobId, created: false });
});
test('pause accepts durable intents while dispatch eligibility stays false', async () => {
  const f = fixture({ printer: record({ configuration: config({ state: 'paused' }) }) });
  assert.equal((await f.insert()).created, true);
  const domain = loadTs('src/lib/printing/domain.ts');
  assert.equal(domain.kitchenPrintEligibility({ ...order, id: 'o1' }, config({ state: 'paused' })).eligible, false);
});
test('native ownership, scope, disabled/deleted/corrupt printer and persisted payment fail closed', async () => {
  for (const printer of [record(), record({ deletedAt: 100 }), record({ revision: 0 }), record({ configuration: config({ state: 'active', brandId: 'other' }) })]) {
    const f = fixture({ printer }); await assert.rejects(f.insert(), /ineligible_intent/); assert.equal(f.records.has(queuePath), false);
  }
  for (const patch of [{ status: 'Pending' }, { status: 'Canceled' }, { paymentStatus: 'Pending' }, { brandId: 'other' }, { locationId: 'other' }]) {
    await assert.rejects(fixture({ savedOrder: { ...order, ...patch } }).insert(), /ineligible_intent/);
  }
  for (const key of ['brands/brand', 'locations/location', 'orders/o1', path]) {
    const f = fixture(); f.records.delete(key); await assert.rejects(f.insert(), /ineligible_intent/);
  }
  const f = fixture(); f.records.set('locations/location', { brandId: 'other' }); await assert.rejects(f.insert(), /ineligible_intent/);
});
test('untrusted payment overrides, malformed identity, credential and revision injection are rejected', async () => {
  for (const patch of [{ paymentStatus: 'Paid' }, { revision: 1 }, { credential: 'sentinel' }, { orderId: '../x' }, { kind: 'unknown' }]) {
    await assert.rejects(fixture().insert({ ...command, ...patch }), /invalid_intent/);
  }
});
test('missing or invalid metadata with legacy jobs never means empty', async () => {
  const legacy = [`${path}/jobs/legacy`, { state: 'queued' }];
  for (const extra of [[legacy], [[queuePath, { schemaVersion: 0 }]], [legacy, [queuePath, { schemaVersion: 1, ...command, revision: 1, pendingCount: 0, oldestPendingAt: null, updatedAt: 0 }]]]) {
    const f = fixture({ extra }); const before = structuredClone([...f.records]); await assert.rejects(f.insert(), /queue_unverified/); assert.deepEqual([...f.records], before);
  }
});
test('each new original advances queue revision, count and preserves oldest age', async () => {
  const f = fixture(); const first = await f.insert(); const oldest = f.records.get(queuePath).oldestPendingAt;
  f.records.set('orders/o2', order);
  const second = await f.insert({ ...command, orderId: 'o2' }); assert.notEqual(first.jobId, second.jobId);
  assert.equal(f.records.get(queuePath).revision, 2); assert.equal(f.records.get(queuePath).pendingCount, 2); assert.equal(f.records.get(queuePath).oldestPendingAt, oldest);
});
test('job or queue write and final transaction failures roll back caller order, job and ledger', async () => {
  const id = loadTs('src/lib/printing/domain.ts').printJobId({ ...command, revision: 0 });
  for (const fail of [`${path}/jobs/${id}`, queuePath, 'commit']) {
    const f = fixture({ fail }); const before = structuredClone([...f.records]);
    await assert.rejects(f.insert(command, tx => tx.set(f.db.collection('orders').doc('o1'), { ...order, status: 'Ready' })));
    assert.deepEqual([...f.records], before);
  }
});
test('retry re-reads concurrent order cancellation or printer disable before commit', async () => {
  for (const retry of [records => records.set('orders/o1', { ...order, status: 'Canceled' }), records => records.set(path, record())]) {
    const f = fixture({ retry }); await assert.rejects(f.insert(), /ineligible_intent/); assert.equal(f.records.has(queuePath), false);
  }
});
test('corrupt duplicate or exhausted queue metadata is rejected without repairing history', async () => {
  const f = fixture(); const first = await f.insert();
  f.records.get(`${path}/jobs/${first.jobId}`).orderId = 'foreign'; await assert.rejects(f.insert(), /queue_unverified/);
  const g = fixture(); await g.insert(); g.records.get(queuePath).revision = Number.MAX_SAFE_INTEGER;
  g.records.set('orders/o2', order); await assert.rejects(g.insert({ ...command, orderId: 'o2' }), /queue_unverified/);
});

test('well-shaped but inconsistent queue count/oldest and legacy missing age fail closed', async () => {
  for (const mutate of [f => f.records.get(queuePath).pendingCount++, f => f.records.get(queuePath).oldestPendingAt++, f => f.records.get(queuePath).pendingCount = 0, f => f.records.set(`${path}/jobs/legacy`, { state: 'queued' })]) {
    const f = fixture(); await f.insert(); mutate(f); const before = structuredClone([...f.records]);
    await assert.rejects(f.insert(), /queue_unverified/); assert.deepEqual([...f.records], before);
  }
});

test('every later counted job is canonical: missing age, foreign scope, malformed fields and bad ID fail closed', async () => {
  for (const patch of [{ createdAt: undefined }, { brandId: 'foreign' }, { state: 'confirmed' }, { id: 'a'.repeat(64) }, { attempts: -1 }]) {
    const f = fixture(); const first = await f.insert(); f.records.set('orders/o2', order);
    const second = await f.insert({ ...command, orderId: 'o2' });
    // Make the corrupt row strictly later than the valid oldest job, preserving
    // a plausible ledger count/oldest to reproduce the independent review finding.
    const oldest = f.records.get(`${path}/jobs/${first.jobId}`).createdAt;
    Object.assign(f.records.get(`${path}/jobs/${second.jobId}`), { createdAt: oldest + 100, ...patch });
    f.records.get(queuePath).oldestPendingAt = oldest;
    const before = structuredClone([...f.records]); await assert.rejects(f.insert(), /queue_unverified/);
    assert.deepEqual([...f.records], before);
  }
});
test('bounded queue rejects overflow without writes and never calls a truncated page complete', async () => {
  const f = fixture(); const first = await f.insert();
  const template = f.records.get(`${path}/jobs/${first.jobId}`);
  const { printJobId } = loadTs('src/lib/printing/domain.ts');
  for (let n = 2; n <= 501; n++) {
    const identity = { ...command, orderId: `o${n}`, revision: 0 };
    const key = printJobId(identity); f.records.set(`${path}/jobs/${key}`, { ...template, ...identity, id: key });
  }
  Object.assign(f.records.get(queuePath), { pendingCount: 501, revision: 501 });
  const before = structuredClone([...f.records]); await assert.rejects(f.insert(), /queue_unverified/);
  assert.deepEqual([...f.records], before);
  const lastKey = printJobId({ ...command, orderId: 'o501', revision: 0 });
  f.records.delete(`${path}/jobs/${lastKey}`);
  Object.assign(f.records.get(queuePath), { pendingCount: 500, revision: 500 });
  assert.deepEqual(await f.insert(), { jobId: first.jobId, created: false });
  f.records.set('orders/o502', order);
  const atCapacity = structuredClone([...f.records]);
  await assert.rejects(f.insert({ ...command, orderId: 'o502' }), /queue_unverified/);
  assert.deepEqual([...f.records], atCapacity);
});
test('transaction retry after another winning original insert becomes a no-op', async () => {
  const winner = fixture(); const committed = await winner.insert();
  const f = fixture({ retry: records => { for (const [key, value] of winner.records) records.set(key, structuredClone(value)); } });
  assert.deepEqual(await f.insert(), { jobId: committed.jobId, created: false });
  assert.equal(f.records.get(queuePath).pendingCount, 1); assert.equal(f.records.get(queuePath).revision, 1);
});
