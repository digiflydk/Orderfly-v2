const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');

// Execute the real bridge. Only the Admin SDK I/O is isolated; no compatibility
// wrapper, native context construction or ref/snapshot conversion is mocked.
function fixture({ fail, retry } = {}) {
  const rows = new Map([
    ['orders/o1', { brandId: 'brand', status: 'Pending', untouched: true }],
    ['jobs/a', { brandId: 'brand', sequence: 1 }],
    ['jobs/b', { brandId: 'brand', sequence: 2 }],
    ['jobs/foreign', { brandId: 'other', sequence: 3 }],
    ['obsolete/o1', { retained: false }],
  ]);
  const events = [], attempts = [], commits = [];
  let runCount = 0, dbCalls = 0;
  const ref = path => ({ path, id: path.split('/').at(-1),
    get() { events.push(['outside-read', path]); return Promise.resolve(snapshot(path, rows)); },
  });
  function snapshot(path, saved) { return { id: path.split('/').at(-1), ref: ref(path), exists: saved.has(path), data: () => structuredClone(saved.get(path)) }; }
  function query(path, filters = [], ordering, count = Infinity, after) {
    const result = { path, query: true, filters, ordering, count, after,
      doc: id => ref(`${path}/${id || 'generated'}`),
      where: (field, operator, value) => query(path, [...filters, { field, operator, value }], ordering, count, after),
      orderBy: (field, direction) => query(path, filters, { field, direction }, count, after),
      limit: value => query(path, filters, ordering, value, after),
      startAfter: value => query(path, filters, ordering, count, value),
      get() { events.push(['outside-query', path]); return Promise.resolve(readQuery(result, rows)); },
    }; return result;
  }
  function readQuery(q, saved) {
    let matches = [...saved].filter(([path, value]) => path.startsWith(`${q.path}/`) && !path.slice(q.path.length + 1).includes('/') && q.filters.every(f => {
      assert.equal(f.operator, '=='); return value[f.field] === f.value;
    }));
    if (q.ordering) matches.sort((a, b) => (a[1][q.ordering.field] - b[1][q.ordering.field]) * (q.ordering.direction === 'desc' ? -1 : 1));
    if (q.after) { const index = matches.findIndex(([path]) => path === q.after.ref.path); matches = matches.slice(index + 1); }
    const docs = matches.slice(0, q.count).map(([path]) => snapshot(path, saved));
    return { docs, empty: !docs.length, size: docs.length };
  }
  const db = { doc: ref, collection: query, async runTransaction(run) {
    runCount++;
    // The real Admin SDK may reuse its Transaction object after resetting the
    // attempt's writes. Context must be fresh even when native identity is not.
    const reusedTransaction = {};
    for (let attempt = 0;; attempt++) {
      const saved = new Map(structuredClone([...rows])), writes = [];
      let writing = false, active = true;
      const ensureActive = () => { if (!active) throw Error('attempt closed'); };
      const tx = {
        async get(r) {
          ensureActive(); if (writing) throw Error('read after write');
          events.push(['tx-read', r.path]);
          return r.query ? readQuery(r, saved) : snapshot(r.path, saved);
        },
        create(r, value) { ensureActive(); writing = true; if (saved.has(r.path) || fail === `create:${r.path}`) throw Error('create failed'); writes.push(['create', r.path]); saved.set(r.path, structuredClone(value)); },
        set(r, value, options) { ensureActive(); writing = true; if (fail === `set:${r.path}`) throw Error('set failed'); writes.push(['set', r.path, options]); saved.set(r.path, options?.merge ? { ...saved.get(r.path), ...structuredClone(value) } : structuredClone(value)); },
        update(r, value) { ensureActive(); writing = true; if (!saved.has(r.path) || fail === `update:${r.path}`) throw Error('update failed'); writes.push(['update', r.path]); saved.set(r.path, { ...saved.get(r.path), ...structuredClone(value) }); },
        delete(r) { ensureActive(); writing = true; if (fail === `delete:${r.path}`) throw Error('delete failed'); writes.push(['delete', r.path]); saved.delete(r.path); },
      };
      Object.assign(reusedTransaction, tx);
      attempts.push(reusedTransaction);
      let result;
      try { result = await run(reusedTransaction); }
      finally { active = false; }
      if (retry && attempt === 0) { retry(rows); continue; }
      if (fail === 'commit') throw Error('commit failed');
      rows.clear(); for (const row of saved) rows.set(...row); commits.push(writes); return result;
    }
  } };
  const api = loadTs('src/lib/server/firestore-compat.ts', {
    'server-only': {}, '@/lib/firebase-admin': { getAdminDb: () => { dbCalls++; return db; } },
    'firebase-admin/firestore': { Timestamp: {}, FieldValue: { serverTimestamp: () => 'timestamp' } },
  });
  return { rows, api, db, events, attempts, commits, get runCount() { return runCount; }, get dbCalls() { return dbCalls; } };
}

test('one real Admin transaction provides exact native db/attempt while compat order update and native query/create commit together', async () => {
  const f = fixture(), c = f.api;
  const orderRef = c.doc(c.db, 'orders', 'o1');
  const result = await c.runTransaction(c.db, async (compat, context) => {
    assert.equal(context.db, f.db); assert.equal(context.transaction, f.attempts[0]);
    assert.equal(Object.isFrozen(context), true); assert.notEqual(compat, context.transaction);
    const order = await compat.get(orderRef);
    assert.equal(order.exists(), true); assert.equal(order.ref.path, 'orders/o1'); assert.equal(order.id, 'o1');
    const existing = await context.transaction.get(context.db.collection('jobs').where('brandId', '==', 'brand').orderBy('sequence', 'asc').limit(2));
    assert.deepEqual(existing.docs.map(doc => doc.id), ['a', 'b']);
    context.transaction.create(context.db.collection('jobs').doc('new'), { brandId: order.data().brandId, state: 'queued' });
    compat.update(orderRef, { status: 'Received' });
    return 'committed';
  });
  assert.equal(result, 'committed'); assert.equal(f.runCount, 1); assert.equal(f.dbCalls, 1);
  assert.equal(f.rows.get('orders/o1').status, 'Received'); assert.equal(f.rows.get('jobs/new').state, 'queued');
  assert.deepEqual(f.events.filter(e => e[0].startsWith('outside')), []);
  assert.deepEqual(f.commits[0].map(w => w.slice(0, 2)), [['create', 'jobs/new'], ['update', 'orders/o1']]);
});

test('existing single-argument callback preserves document ref/snapshot, exists(), set merge, update, delete and return behavior', async () => {
  const f = fixture(), c = f.api;
  const result = await c.runTransaction(c.db, async compat => {
    const missing = await compat.get(c.doc(c.db, 'missing', 'none'));
    assert.equal(missing.exists(), false); assert.equal(missing.data(), undefined);
    const saved = await compat.get(c.doc(c.db, 'orders', 'o1'));
    assert.equal(saved.ref.kind, 'document'); assert.equal(saved._snapshot.ref.path, saved.ref.path);
    compat.set(saved.ref, { marker: 1 }, { merge: true });
    compat.update(saved.ref, { status: 'Received' });
    compat.set(c.doc(c.db, 'replacement', 'a'), { first: true });
    compat.set(c.doc(c.db, 'replacement', 'a'), { final: true });
    compat.delete(c.doc(c.db, 'obsolete', 'o1'));
    return { id: saved.id };
  });
  assert.deepEqual(result, { id: 'o1' });
  assert.deepEqual(f.rows.get('orders/o1'), { brandId: 'brand', status: 'Received', untouched: true, marker: 1 });
  assert.deepEqual(f.rows.get('replacement/a'), { final: true }); assert.equal(f.rows.has('obsolete/o1'), false);
  assert.equal(f.runCount, 1); assert.equal(f.dbCalls, 1);
});

test('standalone compatibility query constraints, wrapped snapshots and startAfter keep their existing behavior', async () => {
  const f = fixture(), c = f.api;
  const first = await c.getDocs(c.query(c.collection(c.db, 'jobs'), c.where('brandId', '==', 'brand'), c.orderBy('sequence', 'asc'), c.limit(1)));
  assert.equal(first.size, 1); assert.equal(first.empty, false); assert.equal(first.docs[0].exists(), true);
  const keys = []; first.forEach(doc => keys.push(doc.id)); assert.deepEqual(keys, ['a']);
  const next = await c.getDocs(c.query(c.collection(c.db, 'jobs'), c.where('brandId', '==', 'brand'), c.orderBy('sequence', 'asc'), c.startAfter(first.docs[0]), c.limit(1)));
  assert.deepEqual(next.docs.map(doc => doc.id), ['b']); assert.equal(f.runCount, 0);
});

test('native create, compatibility update and final commit failures roll back every staged native/compat effect', async () => {
  for (const fail of ['create:jobs/new', 'update:orders/o1', 'commit']) {
    const f = fixture({ fail }), c = f.api, before = structuredClone([...f.rows]);
    await assert.rejects(c.runTransaction(c.db, async (compat, context) => {
      await compat.get(c.doc(c.db, 'orders', 'o1'));
      await context.transaction.get(context.db.collection('jobs').limit(10));
      // Stage compat effect first as well, so create failure proves rollback of it.
      compat.set(c.doc(c.db, 'audit', 'event'), { pending: true });
      context.transaction.create(context.db.collection('jobs').doc('new'), { state: 'queued' });
      compat.update(c.doc(c.db, 'orders', 'o1'), { status: 'Received' });
    }), /failed/);
    assert.deepEqual([...f.rows], before); assert.deepEqual(f.commits, []); assert.equal(f.runCount, 1);
  }
});

test('callback exceptions propagate unchanged and roll back writes without fallback', async () => {
  const f = fixture(), c = f.api, error = new Error('caller stopped'), before = structuredClone([...f.rows]);
  await assert.rejects(c.runTransaction(c.db, async (compat, context) => {
    await context.transaction.get(context.db.doc('orders/o1'));
    compat.update(c.doc(c.db, 'orders', 'o1'), { status: 'Received' });
    throw error;
  }), actual => actual === error);
  assert.deepEqual([...f.rows], before); assert.equal(f.runCount, 1); assert.deepEqual(f.commits, []);
});

test('SDK retry re-enters with fresh context and current snapshots even when the native Transaction object is reused', async () => {
  const f = fixture({ retry: rows => rows.set('orders/o1', { brandId: 'brand', status: 'Canceled', untouched: true }) }), c = f.api;
  const contexts = [], readStates = [];
  const result = await c.runTransaction(c.db, async (compat, context) => {
    contexts.push(context);
    const saved = await compat.get(c.doc(c.db, 'orders', 'o1'));
    readStates.push(saved.data().status);
    if (saved.data().status === 'Canceled') return 'blocked';
    context.transaction.create(context.db.doc('jobs/new'), { state: 'queued' });
    compat.update(saved.ref, { status: 'Received' });
    return 'prepared';
  });
  assert.equal(result, 'blocked'); assert.deepEqual(readStates, ['Pending', 'Canceled']);
  assert.notEqual(contexts[0], contexts[1]); assert.equal(contexts[0].transaction, contexts[1].transaction, 'SDK is allowed to reuse its native Transaction object');
  assert.equal(contexts[0].db, contexts[1].db); assert.equal(contexts[1].transaction, f.attempts[1]);
  assert.equal(f.runCount, 1); assert.equal(f.dbCalls, 1); assert.equal(f.rows.has('jobs/new'), false);
  assert.equal(f.rows.get('orders/o1').status, 'Canceled'); assert.deepEqual(f.commits, [[]]);
});

test('read-after-write rejection propagates through both APIs and aborts the shared attempt', async () => {
  for (const nativeWrite of [false, true]) for (const nativeRead of [false, true]) {
    const f = fixture(), c = f.api, before = structuredClone([...f.rows]);
    await assert.rejects(c.runTransaction(c.db, async (compat, context) => {
      if (nativeWrite) context.transaction.create(context.db.doc('jobs/new'), { state: 'queued' });
      else compat.update(c.doc(c.db, 'orders', 'o1'), { status: 'Received' });
      if (nativeRead) await context.transaction.get(context.db.collection('jobs').limit(2));
      else await compat.get(c.doc(c.db, 'orders', 'o1'));
    }), /read after write/);
    assert.deepEqual([...f.rows], before); assert.equal(f.runCount, 1); assert.deepEqual(f.commits, []);
    assert.deepEqual(f.events.filter(e => e[0].startsWith('outside')), []);
  }
});
