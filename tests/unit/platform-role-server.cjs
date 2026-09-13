const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { fixture, formData, brand } = require('../helpers/brand-location-fixture.cjs');

test('all retired catalogue server writers reject before database access, including rollback', async () => {
  const prior = process.env.MPANEL_PLATFORM_ADMIN_ENABLED;
  let calls = 0;
  const forbiddenDb = () => { calls++; throw Error('Unexpected database access'); };
  const mocks = {
    'server-only': {}, 'next/cache': {}, 'next/navigation': {},
    '@/lib/firebase-admin': { getAdminDb: forbiddenDb },
    '@/lib/firebase': { db: {} },
    'firebase/firestore': { collection: forbiddenDb, doc: forbiddenDb, setDoc: forbiddenDb, deleteDoc: forbiddenDb },
  };
  try {
    for (const flag of ['true', 'false', undefined]) {
      if (flag === undefined) delete process.env.MPANEL_PLATFORM_ADMIN_ENABLED;
      else process.env.MPANEL_PLATFORM_ADMIN_ENABLED = flag;
      for (const [file, save, remove] of [
        ['src/roles/actions.ts', 'createOrUpdateRole', 'deleteRole'],
        ['src/app/superadmin/roles/actions.ts', 'createOrUpdateRole', 'deleteRole'],
        ['src/app/superadmin/users/actions.ts', 'createOrUpdateUser', 'deleteUser'],
        ['src/app/superadmin/subscriptions/actions.ts', 'createOrUpdatePlan', 'deletePlan'],
      ]) {
        const actions = loadTs(file, mocks);
        await assert.rejects(actions[save](null, new FormData()), /mPanel/);
        await assert.rejects(actions[remove]('record'), /mPanel/);
      }
    }
    assert.equal(calls, 0);
  } finally {
    if (prior === undefined) delete process.env.MPANEL_PLATFORM_ADMIN_ENABLED;
    else process.env.MPANEL_PLATFORM_ADMIN_ENABLED = prior;
  }
});

test('legacy brand creation cannot create catalogue users while the bridge is off', async () => {
  const prior = process.env.MPANEL_PLATFORM_ADMIN_ENABLED;
  process.env.MPANEL_PLATFORM_ADMIN_ENABLED = 'false';
  try {
    const f = fixture([]);
    const legacy = loadTs('src/brands/actions.ts', {
      'server-only': {}, 'next/cache': {}, 'next/navigation': {},
      '@/lib/firebase-admin': { getAdminDb: () => ({ collection: () => ({
        where: () => ({ get: async () => ({ empty: true, docs: [] }) }),
        doc: () => { throw Error('Catalogue creation reached the database'); },
      }) }) },
      '@/lib/permissions': { hasPermission: () => true },
    });
    for (const actions of [f.brands, legacy]) {
      const result = await actions.createOrUpdateBrand(null, formData({ ...brand,
        id: undefined, slug: 'new-brand', ownerName: 'Owner', ownerEmail: 'owner@example.test',
      }));
      assert.equal(result.error, true);
      assert.match(result.message, /mPanel/);
    }
    assert.deepEqual(f.writes, []);
  } finally {
    if (prior === undefined) delete process.env.MPANEL_PLATFORM_ADMIN_ENABLED;
    else process.env.MPANEL_PLATFORM_ADMIN_ENABLED = prior;
  }
});
