import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkApply, sha256 } from '../../scripts/firestore-rules-release.mjs';
import { AUDIT_COLLECTION, manifestSha256, migrationFile, runMigration } from '../../scripts/firestore-migrate.mjs';

test('rules apply needs the reviewed live hash and skips a no-op release', () => {
  const live = "rules_version = '2';", candidate = live + '\n// deny all';
  assert.equal(checkApply({ live, candidate, expectedLiveSha256: sha256(live) }), 'publish');
  assert.equal(checkApply({ live, candidate: live, expectedLiveSha256: sha256(live) }), 'unchanged');
  assert.throws(() => checkApply({ live, candidate, expectedLiveSha256: '' }), /reviewed preview/);
  assert.throws(() => checkApply({ live: live + ' ', candidate, expectedLiveSha256: sha256(live) }), /changed since/);
});

function fakeDb() {
  const docs = {};
  let next = 0;
  return {
    docs,
    collection: name => ({
      doc: () => {
        const id = `${name}/${++next}`;
        return { id, set: async data => { docs[id] = { ...data }; }, update: async data => { Object.assign(docs[id], data); } };
      },
    }),
  };
}

const base = { name: 'rename-field', project: 'orderfly-39325', run: { local: true } };

test('preview plans without writing and gives a stable manifest hash', async () => {
  const db = fakeDb();
  const migration = { plan: async () => [{ path: 'a/1', to: 'x' }], applyItem: async () => assert.fail('preview must not write') };
  const first = await runMigration({ ...base, db, migration, apply: false });
  assert.equal(first.items, 1);
  assert.equal(first.manifestSha256, manifestSha256({ version: 1, migration: 'rename-field', project: 'orderfly-39325', items: [{ to: 'x', path: 'a/1' }] }));
  assert.deepEqual(db.docs, {});
});

test('apply refuses changed plans and audits completed and failed runs', async () => {
  const db = fakeDb(), applied = [];
  const migration = { plan: async () => [{ path: 'a/1' }, { path: 'a/2' }], applyItem: async (_, item) => { applied.push(item.path); } };
  const { manifestSha256: reviewed } = await runMigration({ ...base, db, migration, apply: false });
  await assert.rejects(runMigration({ ...base, db, migration, apply: true, expectedSha256: '0'.repeat(64) }), /differ from the reviewed preview/);
  assert.deepEqual(applied, []);

  const done = await runMigration({ ...base, db, migration, apply: true, expectedSha256: reviewed });
  assert.deepEqual(applied, ['a/1', 'a/2']);
  assert.equal(db.docs[done.auditId].status, 'completed');
  assert.equal(db.docs[done.auditId].applied, 2);
  assert.ok(done.auditId.startsWith(`${AUDIT_COLLECTION}/`));

  const failing = { plan: migration.plan, applyItem: async (_, item) => { if (item.path === 'a/2') throw new Error('document changed'); } };
  const failDb = fakeDb();
  await assert.rejects(runMigration({ ...base, db: failDb, migration: failing, apply: true, expectedSha256: reviewed }), /Stopped after 1 of 2/);
  const [audit] = Object.values(failDb.docs);
  assert.equal(audit.status, 'failed');
  assert.equal(audit.applied, 1);
});

test('migration names cannot leave scripts/migrations', () => {
  assert.match(migrationFile('rename-field').pathname, /\/scripts\/migrations\/rename-field\.mjs$/);
  for (const name of ['../firestore-indexes', 'a/b', 'Upper', '', undefined]) assert.throws(() => migrationFile(name));
});
