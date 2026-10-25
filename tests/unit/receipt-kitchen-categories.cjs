const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { policy } = require('../helpers/printing-fixture.cjs');
const authority = loadTs('src/lib/access/authority.ts', { 'server-only': {} });
const identity = { provider: 'firebase', subject: 'writer' };
const order = (patch = {}) => ({ brandId: 'brand', locationId: 'location', productItems: [{ id: 'pizza', name: 'Pizza', itemType: 'product' }], ...patch });
function fixture(options = {}) {
  const records = new Map([
    ['platformAdminControl/access-v1', policy(['orderfly.orders:view'])],
    ['brands/brand', { status: 'active' }], ['locations/location', { brandId: 'brand' }],
    ['products/pizza', { brandId: 'brand', locationIds: ['location'], isActive: true, categoryId: 'pizza-cat' }],
    ['categories/pizza-cat', { brandId: 'brand', locationIds: ['location'], isActive: true, categoryName: 'Pizza' }],
  ]);
  const reads = []; let dbCalls = 0;
  const db = {
    collection(name) { return { doc(id) { return { path: `${name}/${id}`, id }; } }; },
    async runTransaction(run, txOptions) {
      assert.deepEqual(txOptions, { readOnly: true });
      for (let attempt = 0; ; attempt++) {
        const snapshot = new Map(structuredClone([...records]));
        const result = await run({ async get(ref) {
          reads.push(ref.path);
          const error = options.readError?.(ref.path, attempt);
          if (error) throw error;
          return { id: ref.id, exists: snapshot.has(ref.path), data: () => snapshot.get(ref.path) };
        } });
        if (attempt === 0 && options.retry) { options.retry(records); continue; }
        if (options.completionError) throw options.completionError;
        return result;
      }
    },
  };
  const service = loadTs('src/lib/receipts/kitchen-categories-server.ts', {
    'server-only': {}, '@/lib/access/authority': authority, './authority': authority,
    '@/lib/firebase-admin': { getAdminDb() { dbCalls++; if (options.fail) throw Error('PRIVATE database'); return db; } },
    '@/lib/access/orderfly-session': { async verifiedOrderflyIdentity() { if (options.denied) throw new authority.AuthorityError('unauthorized', 401); return identity; } },
  });
  return { records, reads, get dbCalls() { return dbCalls; }, read: service.readKitchenCategoriesForOrder };
}
test('current labels use only scoped product/category docs, deduplicate and never mutate the order', async () => {
  const f = fixture();
  const input = order({ productItems: [{ id: 'pizza', name: 'Saved pizza' }, { id: 'pizza', name: 'Other topping pizza' }, { id: 'menu', itemType: 'combo', name: 'Menu' }] });
  const before = structuredClone(input);
  assert.deepEqual(await f.read(input), { pizza: 'Pizza' });
  assert.deepEqual(input, before);
  assert.deepEqual(f.reads, ['platformAdminControl/access-v1', 'brands/brand', 'locations/location', 'products/pizza', 'categories/pizza-cat']);
});
test('authentication is first; revoked native ownership and scope deny before catalog access', async () => {
  const denied = fixture({ denied: true }); await assert.rejects(denied.read(null), /unauthorized/); assert.equal(denied.dbCalls, 0);
  for (const mutate of [
    rows => rows.get('platformAdminControl/access-v1').principals[0].active = false,
    rows => rows.get('platformAdminControl/access-v1').roles[0].permissions = [],
    rows => rows.get('platformAdminControl/access-v1').companies[0].orderflyBrandIds = ['other'],
    rows => rows.set('locations/location', { brandId: 'other' }),
    rows => rows.delete('brands/brand'), rows => rows.delete('locations/location'),
  ]) {
    const f = fixture(); mutate(f.records); await assert.rejects(f.read(order()), /forbidden/);
    assert.ok(f.reads.every(path => !path.startsWith('products/') && !path.startsWith('categories/')));
  }
});
test('missing, inactive, foreign, deleted and mismatched product/category records yield no label', async () => {
  for (const path of ['products/pizza', 'categories/pizza-cat']) {
    for (const patch of [null, ...(path.startsWith('products/') ? [{ brandId: 'other' }] : []), { locationIds: ['other'] }, { locationIds: null }, { locationIds: ['../bad'] }, { isActive: false }, { deleted: true }, { isDeleted: true }, { deletedAt: 123 }, { isTestData: true }, { id: 'other' }]) {
      const f = fixture(); if (patch === null) f.records.delete(path); else Object.assign(f.records.get(path), patch);
      assert.deepEqual(await f.read(order()), {}, `${path}: ${JSON.stringify(patch)}`);
    }
  }
});
test('brand-wide products are allowed, categories require explicit local membership and safe labels', async () => {
  for (const locations of [undefined, []]) {
    const f = fixture(); f.records.get('products/pizza').locationIds = locations;
    assert.deepEqual(await f.read(order()), { pizza: 'Pizza' });
    f.records.get('categories/pizza-cat').locationIds = locations;
    assert.deepEqual(await f.read(order()), {});
  }
  for (const name of ['', ' ', 'x'.repeat(161), '\u001bPRINT', 'Pizza\nBurger', 'Pizza\u202e']) {
    const f = fixture(); f.records.get('categories/pizza-cat').categoryName = name; assert.deepEqual(await f.read(order()), {});
  }
});
test('lookup respects native 97-line bound, safe ids, exact canonical identity and shared categories', async () => {
  const f = fixture();
  assert.deepEqual(await f.read(order({ productItems: Array.from({ length: 98 }, () => ({ id: 'pizza' })) })), {});
  assert.equal(f.reads.length, 3);
  assert.deepEqual(await f.read(order({ productItems: [{ id: '../pizza' }, { id: 'x'.repeat(129) }, { id: 'pizza-offer' }, { name: 'Pizza' }] })), {});
  assert.ok(!f.reads.includes('products/pizza'));
  f.records.set('products/pasta', { ...f.records.get('products/pizza') });
  const start = f.reads.length;
  assert.deepEqual(await f.read(order({ productItems: [{ id: 'pizza' }, { id: 'pasta' }] })), { pizza: 'Pizza', pasta: 'Pizza' });
  assert.equal(f.reads.slice(start).filter(path => path === 'categories/pizza-cat').length, 1);
});
test('historical brand lifecycle does not change order permission; unknown errors do not leak', async () => {
  const f = fixture(); f.records.set('brands/brand', { status: 'suspended' });
  assert.deepEqual(await f.read(order()), { pizza: 'Pizza' });
  await assert.rejects(fixture({ fail: true }).read(order()), error => error.message === 'kitchen_categories_unavailable');
});

test('optional product/category and transaction-completion failures fall back only after scope verification', async () => {
  for (const path of ['products/pizza', 'categories/pizza-cat']) {
    const f = fixture({ readError: current => current === path ? Error('PRIVATE catalog unavailable') : undefined });
    assert.deepEqual(await f.read(order()), {});
    assert.deepEqual(f.reads.slice(0, 3), ['platformAdminControl/access-v1', 'brands/brand', 'locations/location']);
  }
  assert.deepEqual(await fixture({ completionError: Error('PRIVATE transaction completion') }).read(order()), {});
});
test('unknown policy/native-scope failures and explicit authority errors are never hidden by enrichment fallback', async () => {
  for (const path of ['platformAdminControl/access-v1', 'brands/brand', 'locations/location']) {
    const f = fixture({ readError: current => current === path ? Error('PRIVATE scope unavailable') : undefined });
    await assert.rejects(f.read(order()), error => error.message === 'kitchen_categories_unavailable');
    assert.ok(f.reads.every(read => !read.startsWith('products/') && !read.startsWith('categories/')));
  }
  for (const path of ['products/pizza', 'categories/pizza-cat']) {
    const f = fixture({ readError: current => current === path ? new authority.AuthorityError('forbidden') : undefined });
    await assert.rejects(f.read(order()), error => error instanceof authority.AuthorityError && error.status === 403);
  }
});
test('transaction retry resets successful scope verification before revoked or unavailable authority', async () => {
  const revoked = fixture({ retry: rows => rows.get('platformAdminControl/access-v1').principals[0].active = false });
  await assert.rejects(revoked.read(order()), /forbidden/);
  assert.equal(revoked.reads.filter(path => path === 'products/pizza').length, 1);
  for (const path of ['platformAdminControl/access-v1', 'brands/brand', 'locations/location']) {
    const f = fixture({ retry: () => {}, readError: (current, attempt) => attempt === 1 && current === path ? Error('PRIVATE retry scope') : undefined });
    await assert.rejects(f.read(order()), error => error.message === 'kitchen_categories_unavailable');
    assert.equal(f.reads.filter(read => read === 'products/pizza').length, 1);
  }
});

// Native category writers omit brandId or preserve a former primary brand on
// shared categories. Authorized native location membership is their ownership.
test('category ownership follows native location membership; product brand ownership stays mandatory', async () => {
  for (const brandId of [undefined, 'former-primary-brand']) {
    const f = fixture(); f.records.get('categories/pizza-cat').brandId = brandId;
    assert.deepEqual(await f.read(order()), { pizza: 'Pizza' });
    f.records.get('categories/pizza-cat').locationIds = ['other-location'];
    assert.deepEqual(await f.read(order()), {});
  }
  const f = fixture(); delete f.records.get('products/pizza').brandId;
  assert.deepEqual(await f.read(order()), {});
});
