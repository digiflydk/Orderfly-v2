const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');
const filename = path.resolve(__dirname, '../../src/lib/qr/store.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
const mod = new Module(filename, module); mod.paths = module.paths; mod._compile(compiled.outputText, filename);
const { createQrStore, QrStoreError } = mod.exports;

// Executable transaction double: atomic commits, create-only semantics and the
// Firestore read-before-write rule. It is not a Firestore emulator integration.
class Database {
  rows = new Map(); pending = Promise.resolve(); queries = [];
  collection(prefix) {
    const db = this;
    const collection = (filters = [], limit = Infinity) => ({
      doc(id) { const p = prefix + '/' + id; return { path: p, collection: suffix => db.collection(p + '/' + suffix) }; },
      where(field, op, value) { assert.equal(op, '=='); return collection([...filters, [field, value]], limit); },
      limit(n) { return collection(filters, n); },
      async get() {
        db.queries.push({ prefix, filters, limit });
        return { docs: [...db.rows].filter(([p, row]) => p.startsWith(prefix + '/') && p.split('/').length === prefix.split('/').length + 1 && filters.every(([f, v]) => row[f] === v))
          .slice(0, limit).map(([p, row]) => db.snapshot(p, row)) };
      },
    });
    return collection();
  }
  snapshot(p, row) { return { id: p.split('/').at(-1), exists: !!row, data: () => row ? structuredClone(row) : undefined }; }
  async runTransaction(body) {
    const before = this.pending; let release; this.pending = new Promise(r => { release = r; }); await before;
    const staged = new Map(this.rows); let writes = false;
    try {
      const result = await body({
        get: async ref => { assert.equal(writes, false, 'read must precede writes'); return this.snapshot(ref.path, staged.get(ref.path)); },
        create: (ref, value) => { writes = true; if (staged.has(ref.path)) throw new Error('already_exists'); staged.set(ref.path, structuredClone(value)); },
        set: (ref, value) => { writes = true; staged.set(ref.path, structuredClone(value)); },
      });
      this.rows = staged; return result;
    } finally { release(); }
  }
}
const scope = { brandId: 'brandA', locationIds: null, actorId: 'actorA' };
const req = n => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const input = { name: 'Menu', destination: 'https://example.com/menu?utm_source=poster', locationId: null };
function fixture() {
  const db = new Database(); db.rows.set('brands/brandA', { status: 'active' }); db.rows.set('brands/brandB', { status: 'active' });
  db.rows.set('locations/locA', { brandId: 'brandA', isActive: true }); db.rows.set('locations/locB', { brandId: 'brandB', isActive: true });
  let time = 100000, serial = 0;
  const store = createQrStore(db, { now: () => time, newId: () => (++serial).toString(16).padStart(32, '0'),
    normalizeDestination: value => { const url = new URL(value); if (url.protocol !== 'https:' || url.hostname === 'localhost') throw new Error('invalid_destination'); return url.toString(); } });
  return { db, store, tick: value => { time = value; } };
}
const rejects = (fn, code) => assert.rejects(fn, error => error instanceof QrStoreError && error.code === code);

test('create is atomic, public index is minimal and replay writes nothing', async () => {
  const { db, store } = fixture();
  const row = await store.create(scope, input, req(1));
  assert.match(row.slug, /^[a-f0-9]{32}$/); assert.notEqual(row.slug, row.id);
  assert.deepEqual(db.rows.get(`qrPublicCodes/${row.slug}`), { brandId: 'brandA', codeId: row.id });
  const before = [...db.rows]; assert.deepEqual(await store.create(scope, input, req(1)), row); assert.deepEqual([...db.rows], before);
  assert.equal(await store.resolve(row.slug), input.destination);
  assert.equal(db.rows.get(`brands/brandA/qrCodes/${row.id}/audit/${req(1)}`).action, 'create');
});

test('same request with changed input or actor conflicts', async () => {
  const { store } = fixture(); await store.create(scope, input, req(1));
  await rejects(() => store.create(scope, { ...input, name: 'changed' }, req(1)), 'request_conflict');
  await rejects(() => store.create({ ...scope, actorId: 'actorB' }, input, req(1)), 'request_conflict');
});

test('updates preserve index, increment revision and reject concurrent stale edits', async () => {
  const { db, store } = fixture(); const row = await store.create(scope, input, req(1));
  const outcomes = await Promise.allSettled([
    store.update(scope, row.id, { ...input, name: 'first' }, 1, req(2)),
    store.update(scope, row.id, { ...input, name: 'second' }, 1, req(3)),
  ]);
  assert.equal(outcomes.filter(o => o.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find(o => o.status === 'rejected').reason.code, 'revision_conflict');
  const saved = await store.get(scope, row.id); assert.equal(saved.revision, 2); assert.equal(saved.slug, row.slug);
  assert.equal([...db.rows.keys()].filter(k => k.startsWith('qrPublicCodes/')).length, 1);
  assert.equal([...db.rows.keys()].filter(k => k.includes('/audit/')).length, 2);
  assert.deepEqual(await store.update(scope, row.id, { ...input, name: 'first' }, 1, req(2)), saved);
});

test('scope boundaries reject foreign brand, locations, moved scope and global code reads', async () => {
  const { store } = fixture(); const row = await store.create(scope, { ...input, locationId: 'locA' }, req(1));
  const restricted = { ...scope, locationIds: ['locA'] };
  assert.equal((await store.get(restricted, row.id)).id, row.id);
  await rejects(() => store.get({ ...scope, brandId: 'brandB' }, row.id), 'not_found');
  await rejects(() => store.get({ ...scope, locationIds: ['locB'] }, row.id), 'forbidden');
  await rejects(() => store.create(scope, { ...input, locationId: 'locB' }, req(2)), 'invalid_location');
  await rejects(() => store.create(restricted, input, req(2)), 'forbidden');
  await rejects(() => store.update({ ...scope, locationIds: ['locB'] }, row.id, { ...input, locationId: 'locB' }, 1, req(2)), 'forbidden');
  const global = await store.create(scope, input, req(3)); await rejects(() => store.get(restricted, global.id), 'forbidden');
  await rejects(() => store.create({ ...scope, locationIds: [] }, { ...input, locationId: 'locA' }, req(4)), 'forbidden');
});

test('pause, activate and archive cannot recycle a published slug', async () => {
  const { db, store } = fixture(); const row = await store.create(scope, input, req(1));
  const paused = await store.pause(scope, row.id, 1, req(2)); await rejects(() => store.resolve(row.slug), 'not_found');
  const active = await store.activate(scope, row.id, paused.revision, req(3)); assert.equal(await store.resolve(row.slug), input.destination);
  const archived = await store.archive(scope, row.id, active.revision, req(4));
  assert.equal(archived.status, 'archived'); await rejects(() => store.resolve(row.slug), 'not_found');
  await rejects(() => store.activate(scope, row.id, archived.revision, req(5)), 'revision_conflict');
  assert.ok(db.rows.has(`qrPublicCodes/${row.slug}`)); assert.ok(db.rows.has(`brands/brandA/qrCodes/${row.id}`));
});

test('expiry, inactive/missing brand/location and corrupt public index fail closed', async () => {
  const { db, store, tick } = fixture(); const row = await store.create(scope, { ...input, locationId: 'locA', expiresAt: 200000 }, req(1));
  tick(200000); await rejects(() => store.resolve(row.slug), 'not_found');
  // A successful create replay stays idempotent after expiry.
  assert.deepEqual(await store.create(scope, { ...input, locationId: 'locA', expiresAt: 200000 }, req(1)), row);
  tick(100000); db.rows.get('locations/locA').isActive = false; await rejects(() => store.resolve(row.slug), 'invalid_location');
  db.rows.get('locations/locA').isActive = true; db.rows.get('brands/brandA').status = 'suspended'; await rejects(() => store.resolve(row.slug), 'not_found');
  db.rows.get('brands/brandA').status = 'unknown'; await rejects(() => store.resolve(row.slug), 'not_found');
  db.rows.get('brands/brandA').status = 'pending'; await rejects(() => store.resolve(row.slug), 'not_found');
  db.rows.get('brands/brandA').status = 'trialing'; assert.equal(await store.resolve(row.slug), input.destination);
  db.rows.get('brands/brandA').status = 'active'; db.rows.get(`qrPublicCodes/${row.slug}`).brandId = 'brandB'; await rejects(() => store.resolve(row.slug), 'not_found');
  await rejects(() => store.resolve('missing'), 'not_found');
});

test('public target can be read inside the event writer transaction without a resolve/write race', async () => {
  const { db, store } = fixture(); const row = await store.create(scope, { ...input, campaign: 'Menu2026', tags: ['table'] }, req(1));
  const target = await db.runTransaction(async tx => {
    const target = await store.resolveInTransaction(tx, row.slug);
    tx.create(db.collection('brands').doc(target.brandId).collection('qrCodes').doc(target.codeId).collection('events').doc(req(2)), { at: 100000, revision: target.revision });
    return target;
  });
  assert.deepEqual(target, { destination: input.destination, brandId: 'brandA', codeId: row.id, locationId: null, revision: 1, campaign: 'Menu2026', tags: ['table'] });
  await store.pause(scope, row.id, 1, req(3));
  await rejects(() => db.runTransaction(async tx => {
    await store.resolveInTransaction(tx, row.slug);
    tx.create(db.collection('brands').doc('brandA').collection('qrCodes').doc(row.id).collection('events').doc(req(4)), { at: 100000 });
  }), 'not_found');
  assert.equal([...db.rows.keys()].filter(k => k.includes('/events/')).length, 1);
});

test('duplicate creates an independent paused code with new slug and audit', async () => {
  const { store } = fixture(); const row = await store.create(scope, input, req(1));
  const copy = await store.duplicate(scope, row.id, 'Copy', req(2));
  assert.notEqual(copy.id, row.id); assert.notEqual(copy.slug, row.slug); assert.equal(copy.status, 'paused'); assert.equal(copy.destination, row.destination);
  assert.deepEqual(await store.duplicate(scope, row.id, 'Copy', req(2)), copy);
  await rejects(() => store.resolve(copy.slug), 'not_found');
});

test('location list applies both brand and location filters before limit and reports truncation', async () => {
  const { db, store } = fixture();
  await store.create(scope, { ...input, locationId: 'locA' }, req(1)); await store.create(scope, { ...input, locationId: 'locA' }, req(2)); await store.create(scope, input, req(3));
  const result = await store.list({ ...scope, locationIds: ['locA'] }, { locationId: 'locA', limit: 1 });
  assert.equal(result.rows.length, 1); assert.equal(result.truncated, true);
  assert.deepEqual(db.queries[0].filters, [['brandId', 'brandA'], ['locationId', 'locA']]);
  await rejects(() => store.list({ ...scope, locationIds: ['locA'] }, { locationId: null }), 'forbidden');
});

test('invalid destinations, metadata, expiry, ids, request ids and limits write nothing', async () => {
  const { db, store } = fixture(); const size = db.rows.size;
  await assert.rejects(() => store.create(scope, { ...input, destination: 'http://localhost' }, req(1)));
  await rejects(() => store.create(scope, { ...input, name: '\nInjected' }, req(1)), 'invalid_text');
  await rejects(() => store.create(scope, { ...input, expiresAt: 50000 }, req(1)), 'invalid_expiry');
  await rejects(() => store.create(scope, { ...input, tags: Array(21).fill('x') }, req(1)), 'invalid_tags');
  await rejects(() => store.create({ ...scope, brandId: '../other' }, input, req(1)), 'invalid_id');
  await rejects(() => store.create(scope, input, 'no'), 'invalid_request_id');
  await rejects(() => store.list(scope, { locationId: null, limit: 1000 }), 'invalid_limit');
  assert.equal(db.rows.size, size);
});

test('create collisions roll back the new record and audit instead of overwriting index', async () => {
  const { db } = fixture(); const constant = 'a'.repeat(32);
  const store = createQrStore(db, { newId: () => constant, normalizeDestination: v => v });
  await store.create(scope, input, req(1)); const before = [...db.rows];
  await assert.rejects(() => store.create(scope, { ...input, name: 'Collision' }, req(2)), /already_exists/);
  assert.deepEqual([...db.rows], before);
});
