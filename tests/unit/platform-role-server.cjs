const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');

for (const filename of ['src/roles/actions.ts', 'src/app/superadmin/roles/actions.ts']) {
  test(`${filename}: server role lifecycle works without public Firestore writes; cutover rejects writes`, async () => {
    const rows = new Map();
    let enabled = false, dbCalls = 0;
    const snapshot = id => ({ id, exists: rows.has(id), data: () => rows.get(id) });
    const db = { collection: name => {
      assert.equal(name, 'roles');
      return {
        doc: (id = 'native-role') => ({ id,
          set: async value => rows.set(id, value),
          get: async () => snapshot(id),
          delete: async () => rows.delete(id),
        }),
        orderBy: () => ({ get: async () => ({ docs: [...rows.keys()].map(snapshot) }) }),
      };
    } };
    const actions = loadTs(filename, {
      '@/lib/firebase-admin': { getAdminDb: () => { dbCalls++; return db; } },
      '@/lib/firebase': new Proxy({}, { get: () => { throw Error('Browser database must not be used'); } }),
      '@/lib/mpanel-admin-cutover': { assertLegacyAdminWrite: () => { if (enabled) throw Error('Managed in mPanel'); } },
      'next/cache': { revalidatePath() {} },
      'next/navigation': { redirect() {} },
    });
    const form = (name, id) => {
      const value = new FormData(); value.set('name', name); value.append('permissions', 'users:view');
      if (id) value.set('id', id);
      return value;
    };
    await actions.createOrUpdateRole(null, form('Reader'));
    assert.equal((await actions.getRoleById('native-role')).name, 'Reader');
    await actions.createOrUpdateRole(null, form('Updated', 'native-role'));
    rows.get('native-role').id = 'stale-import-id';
    assert.equal((await actions.getRoles())[0].id, 'native-role');
    assert.equal((await actions.getRoleById('native-role')).id, 'native-role');
    assert.equal((await actions.getRoles())[0].name, 'Updated');
    enabled = true;
    const before = dbCalls;
    await assert.rejects(actions.createOrUpdateRole(null, form('Blocked')), /mPanel/);
    await assert.rejects(actions.deleteRole('native-role'), /mPanel/);
    assert.equal(dbCalls, before);
    assert.equal(rows.size, 1);
    enabled = false;
    assert.equal((await actions.deleteRole('native-role')).error, false);
    assert.equal(await actions.getRoleById('native-role'), null);
  });
}
