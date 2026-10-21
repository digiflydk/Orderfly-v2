const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { config, record } = require('../helpers/printing-fixture.cjs');
const { printJobId } = loadTs('src/lib/printing/domain.ts');
const command = { brandId: 'brand', locationId: 'location', printerId: 'p1', orderId: 'o1', kind: 'kitchen' };
const order = { brandId: 'brand', locationId: 'location', status: 'Received', paymentStatus: 'Paid', paymentMethod: 'Stripe', deliveryType: 'Pickup' };
const printerPath = id => `locations/location/printers/${id}`;
const queuePath = id => `${printerPath(id)}/queue/state`;
const jobPath = c => `${printerPath(c.printerId)}/jobs/${printJobId({ ...c, revision: 0 })}`;
function fixture({ fail, retry } = {}) {
  const records = new Map([['brands/brand', {}], ['locations/location', { brandId: 'brand' }], ['orders/o1', order], ['orders/o2', order]]);
  for (let n = 1; n <= 17; n++) records.set(printerPath(`p${n}`), record({ configuration: config({ id: `p${n}`, state: 'active' }) }));
  const service = loadTs('src/lib/printing/outbox.ts', { 'server-only': {}, 'firebase-admin/firestore': { FieldValue: { serverTimestamp: () => ({ serverTimestamp: true }) } } });
  const commits = [], reads = [];
  let serial = Promise.resolve(), retried = false;
  function ref(path) { return { path, id: path.split('/').at(-1), collection: n => collection(`${path}/${n}`) }; }
  function collection(path) { return { doc: n => ref(`${path}/${n}`), limit: n => ({ query: path, limit: n }) }; }
  const db = { collection, runTransaction(run) {
    const pending = serial.then(async () => {
      for (;;) {
        const staged = new Map(structuredClone([...records])), writes = []; let writing = false;
        const tx = {
          async get(r) {
            assert.equal(writing, false, 'all caller and outbox reads must precede writes');
            reads.push(r.path || r.query);
            if (r.query) {
              assert.equal(r.limit, 501, 'scan must detect overcapacity, including malformed rows');
              const rows = [...staged].filter(([key]) => key.startsWith(`${r.query}/`) && !key.slice(r.query.length + 1).includes('/')).slice(0, r.limit);
              return { size: rows.length, docs: rows.map(([key, value]) => ({ id: key.split('/').at(-1), data: () => structuredClone(value) })) };
            }
            return { id: r.id, exists: staged.has(r.path), data: () => structuredClone(staged.get(r.path)) };
          },
          create(r, value) { writing = true; if (staged.has(r.path) || fail === r.path) throw Error('fixture create failed'); writes.push(r.path); staged.set(r.path, structuredClone(value)); },
          set(r, value) { writing = true; if (fail === r.path) throw Error('fixture set failed'); writes.push(r.path); staged.set(r.path, structuredClone(value)); },
        };
        const result = await run(tx);
        if (retry && !retried) { retried = true; retry(records); continue; }
        if (fail === 'commit') throw Error('fixture commit failed');
        records.clear(); for (const row of staged) records.set(...row); commits.push(writes); return result;
      }
    }); serial = pending.catch(() => {}); return pending;
  } };
  async function batch(intents = [command], reservedWriteCount = 1, after) {
    return db.runTransaction(async tx => {
      const plan = await service.prepareOriginalPrintIntents(db, tx, { intents, reservedWriteCount });
      await tx.get(db.collection('orders').doc('o1')); // caller can finish unrelated reads
      plan.apply();
      if (after) after(tx, plan);
      return { jobs: plan.jobs, createdCount: plan.createdCount, writeCount: plan.writeCount };
    });
  }
  function seed(count, printerId = 'p1') {
    const createdAt = Date.now() - 1000;
    for (let n = 1; n <= count; n++) {
      const c = { ...command, printerId, orderId: `seed${n}` }, identity = { ...c, revision: 0 };
      records.set(`orders/seed${n}`, order);
      records.set(jobPath(c), { schemaVersion: 1, ...identity, id: printJobId(identity), printerRevision: 1, state: 'queued', attempts: 0, createdAt, updatedAt: 1 });
    }
    records.set(queuePath(printerId), { schemaVersion: 1, brandId: 'brand', locationId: 'location', printerId,
      revision: 12, pendingCount: count, oldestPendingAt: count ? createdAt : null, updatedAt: 1 });
  }
  return { records, reads, commits, db, service, batch, seed };
}
const packing = { ...command, kind: 'packing' };

test('kitchen and packing aggregate once, deduplicate identities, preserve credential-free original jobs and caller atomic mutation', async () => {
  const f = fixture();
  const result = await f.batch([command, packing, command], 1, tx => tx.set(f.db.collection('orders').doc('o1'), { ...order, acceptedAt: 'fixture' }));
  assert.deepEqual(result, { jobs: [{ jobId: printJobId({ ...command, revision: 0 }), created: true }, { jobId: printJobId({ ...packing, revision: 0 }), created: true }], createdCount: 2, writeCount: 3 });
  assert.equal(f.records.get(queuePath('p1')).pendingCount, 2);
  assert.equal(f.records.get(queuePath('p1')).revision, 1);
  assert.equal(f.commits[0].filter(p => p === queuePath('p1')).length, 1);
  for (const c of [command, packing]) {
    const job = f.records.get(jobPath(c));
    assert.deepEqual(Object.keys(job).sort(), ['schemaVersion', ...Object.keys(c), 'revision', 'id', 'printerRevision', 'state', 'attempts', 'createdAt', 'updatedAt'].sort());
    assert.equal(job.revision, 0); assert.equal(job.state, 'queued'); assert.equal(job.attempts, 0);
  }
  assert.equal(f.records.get('orders/o1').acceptedAt, 'fixture');
  const before = structuredClone([...f.records]);
  assert.deepEqual((await f.batch([packing, command, packing])).jobs.map(j => j.created), [false, false]);
  assert.deepEqual([...f.records], before); assert.deepEqual(f.commits[1], []);
});

test('mixed existing and new intent across orders preserves oldest and advances one ledger revision', async () => {
  const f = fixture(); f.seed(1); const oldest = f.records.get(queuePath('p1')).oldestPendingAt;
  const result = await f.batch([{ ...command, orderId: 'seed1' }, command, packing, { ...command, orderId: 'o2' }]);
  assert.deepEqual(result.jobs.map(j => j.created), [false, true, true, true]);
  assert.equal(result.writeCount, 4); assert.equal(f.records.get(queuePath('p1')).revision, 13);
  assert.equal(f.records.get(queuePath('p1')).pendingCount, 4); assert.equal(f.records.get(queuePath('p1')).oldestPendingAt, oldest);
});

test('combined capacity at499 rejects two new kinds before apply, accepts duplicate plus one, full500 permits duplicate-only no-op', async () => {
  const f = fixture(); f.seed(499); const before = structuredClone([...f.records]);
  await assert.rejects(f.batch([command, packing]), /queue_unverified/); assert.deepEqual([...f.records], before); assert.equal(f.commits.length, 0);
  const result = await f.batch([{ ...command, orderId: 'seed1' }, packing]);
  assert.deepEqual(result.jobs.map(j => j.created), [false, true]); assert.equal(f.records.get(queuePath('p1')).pendingCount, 500);
  const full = structuredClone([...f.records]);
  assert.equal((await f.batch([packing, { ...command, orderId: 'seed1' }], 500)).writeCount, 0);
  assert.deepEqual([...f.records], full);
  await assert.rejects(f.batch([command]), /queue_unverified/); assert.deepEqual([...f.records], full);
});

test('per-printer independent aggregates include paused intent acceptance and combined write budget', async () => {
  const f = fixture(); f.records.set(printerPath('p2'), record({ configuration: config({ id: 'p2', state: 'paused' }) }));
  const intents = [command, packing, { ...command, printerId: 'p2' }];
  const before = structuredClone([...f.records]);
  await assert.rejects(f.batch(intents, 496), /write_budget_exceeded/); assert.deepEqual([...f.records], before);
  const result = await f.batch(intents, 495);
  assert.equal(result.createdCount, 3); assert.equal(result.writeCount, 5);
  assert.equal(f.records.get(queuePath('p1')).pendingCount, 2); assert.equal(f.records.get(queuePath('p2')).pendingCount, 1);
  assert.equal(f.records.get(queuePath('p1')).revision, 1); assert.equal(f.records.get(queuePath('p2')).revision, 1);
  assert.equal(f.records.get(printerPath('p2')).configuration.state, 'paused');
});

test('bounded strict batch input and printer count are rejected before any I/O', async () => {
  for (const input of [null, [], { intents: [], reservedWriteCount: 1 }, { intents: [command] },
    { intents: Array(65).fill(command), reservedWriteCount: 1 }, { intents: [command], reservedWriteCount: -1 },
    { intents: [command], reservedWriteCount: 501 }, { intents: [command], reservedWriteCount: 1.5 },
    { intents: [command], reservedWriteCount: 0, paid: true }, { intents: [{ ...command, revision: 1 }], reservedWriteCount: 1 },
    { intents: Array.from({ length: 17 }, (_, i) => ({ ...command, printerId: `p${i + 1}` })), reservedWriteCount: 1 }]) {
    const f = fixture();
    await assert.rejects(f.db.runTransaction(tx => f.service.prepareOriginalPrintIntents(f.db, tx, input)), /invalid_intent/);
    assert.deepEqual(f.reads, []); assert.equal(f.commits.length, 0);
  }
});

test('native persisted order/printer ownership, ineligible later item and deletion fail the whole batch', async () => {
  for (const mutate of [
    f => f.records.set('orders/o2', { ...order, status: 'Pending' }),
    f => f.records.set('orders/o2', { ...order, paymentStatus: 'Pending' }),
    f => f.records.set('orders/o2', { ...order, brandId: 'foreign' }),
    f => f.records.set('orders/o2', { ...order, locationId: 'foreign' }),
    f => f.records.set(printerPath('p2'), record({ configuration: config({ id: 'p2', state: 'active', brandId: 'foreign' }) })),
    f => f.records.set(printerPath('p2'), record({ configuration: config({ id: 'p2', state: 'active' }), deletedAt: 1 })),
    f => f.records.set('locations/location', { brandId: 'foreign' }),
  ]) {
    const f = fixture(); mutate(f); const before = structuredClone([...f.records]);
    await assert.rejects(f.batch([command, { ...command, orderId: 'o2', printerId: 'p2' }]), /ineligible_intent/);
    assert.deepEqual([...f.records], before); assert.equal(f.commits.length, 0);
  }
});

test('canonical full scan rejects later foreign/expired/uncertain/exhausted or corrupt history without repair', async () => {
  for (const mutate of [
    f => f.records.get(jobPath({ ...command, orderId: 'seed2' })).brandId = 'foreign',
    f => f.records.get(jobPath({ ...command, orderId: 'seed2' })).state = 'expired',
    f => f.records.get(jobPath({ ...command, orderId: 'seed2' })).state = 'uncertain',
    f => f.records.get(jobPath({ ...command, orderId: 'seed2' })).createdAt = Date.now() + 60000,
    f => f.records.get(jobPath({ ...command, orderId: 'seed2' })).createdAt = 0,
    f => f.records.get(queuePath('p1')).revision = Number.MAX_SAFE_INTEGER,
    f => f.records.get(queuePath('p1')).pendingCount = 0,
    f => f.records.delete(queuePath('p1')),
  ]) {
    const f = fixture(); f.seed(2); mutate(f); const before = structuredClone([...f.records]);
    await assert.rejects(f.batch([command, packing]), /queue_unverified/); assert.deepEqual([...f.records], before);
  }
  const f = fixture(); f.seed(2); f.records.get(queuePath('p1')).revision = Number.MAX_SAFE_INTEGER;
  assert.equal((await f.batch([{ ...command, orderId: 'seed1' }])).createdCount, 0);
});

test('legacy job and501-row overflow fail closed even with plausible ledger', async () => {
  for (const count of [1, 501]) {
    const f = fixture(); f.seed(count); if (count === 1) f.records.set(`${printerPath('p1')}/jobs/legacy`, { state: 'queued' });
    const before = structuredClone([...f.records]); await assert.rejects(f.batch(), /queue_unverified/); assert.deepEqual([...f.records], before);
  }
});

test('job, ledger and final commit failures roll back all printers plus caller order mutation', async () => {
  const second = { ...command, printerId: 'p2' };
  for (const fail of [jobPath(command), jobPath(second), queuePath('p1'), queuePath('p2'), 'orders/o1', 'commit']) {
    const f = fixture({ fail }); const before = structuredClone([...f.records]);
    await assert.rejects(f.batch([command, packing, second], 1, tx => tx.set(f.db.collection('orders').doc('o1'), { ...order, status: 'Ready' })));
    assert.deepEqual([...f.records], before); assert.equal(f.commits.length, 0);
  }
});

test('competing batch calls and winner-on-retry produce original jobs exactly once', async () => {
  const f = fixture(); const results = await Promise.all([f.batch([command, packing]), f.batch([packing, command])]);
  assert.equal(results.reduce((n, r) => n + r.createdCount, 0), 2); assert.equal(f.records.get(queuePath('p1')).pendingCount, 2);
  const winner = fixture(); await winner.batch([command, packing]);
  const retry = fixture({ retry: records => { for (const [key, value] of winner.records) records.set(key, structuredClone(value)); } });
  assert.equal((await retry.batch([command, packing])).createdCount, 0);
  assert.equal(retry.records.get(queuePath('p1')).revision, 1); assert.deepEqual(retry.commits[0], []);
});

test('retry revalidates changed order, printer, queue capacity and reserved writes before any commit', async () => {
  for (const change of [
    records => records.set('orders/o1', { ...order, status: 'Canceled' }),
    records => records.set(printerPath('p1'), record()),
    records => { const winner = fixture(); winner.seed(499); for (const [key, value] of winner.records) records.set(key, value); },
  ]) {
    const f = fixture({ retry: change }); await assert.rejects(f.batch([command, packing]));
    assert.equal(f.records.has(jobPath(command)), false); assert.equal(f.records.has(jobPath(packing)), false); assert.equal(f.commits.length, 0);
  }
});

test('applying a mutating batch twice rejects and transaction rollback preserves original history', async () => {
  const f = fixture(); const before = structuredClone([...f.records]);
  await assert.rejects(f.batch([command, packing], 1, (_tx, plan) => plan.apply()), /job_conflict/);
  assert.deepEqual([...f.records], before);
});

test('maximum allowed64 intents and16 printers keep every aggregate inside the reserved application budget', async () => {
  const f = fixture();
  const intents = Array.from({ length: 64 }, (_, i) => {
    const c = { ...command, printerId: `p${Math.floor(i / 4) + 1}`, orderId: `bound${i}` };
    f.records.set(`orders/${c.orderId}`, order); return c;
  });
  const result = await f.batch(intents, 420);
  assert.equal(result.createdCount, 64); assert.equal(result.writeCount, 80);
  for (let i = 1; i <= 16; i++) {
    const ledger = f.records.get(queuePath(`p${i}`));
    assert.equal(ledger.pendingCount, 4); assert.equal(ledger.revision, 1);
  }
});

test('unsafe server clocks fail before staging any jobs or ledger', async () => {
  const originalNow = Date.now;
  try {
    for (const now of [0, -1, NaN, Number.MAX_SAFE_INTEGER + 1]) {
      Date.now = () => now;
      const f = fixture(), before = structuredClone([...f.records]);
      await assert.rejects(f.batch(), /queue_unverified/); assert.deepEqual([...f.records], before);
    }
  } finally { Date.now = originalNow; }
});
