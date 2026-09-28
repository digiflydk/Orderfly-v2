const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');

function fixture() {
  const records = new Map([
    ['brands/esmeralda', { name: 'Esmeralda' }],
    ['brands/other', { name: 'Other' }],
    ['locations/amager', { brandId: 'esmeralda' }],
    ['locations/foreign', { brandId: 'other' }],
    ['discounts/uP2DDd0J0zao4GSi5zmp', { brandId: 'esmeralda', locationIds: ['retired'], code: 'SUMMER20' }],
    ['discounts/raSE3kQxIEUSPPmM8RI2', { brandId: 'esmeralda', locationIds: ['retired'], code: 'NEWSLETTER_SIGNUP' }],
    ['standard_discounts/Fk5pCg8dvTeA8jBC2jzQ', { brandId: 'esmeralda', locationIds: ['retired'], discountName: 'Pizza Pizza' }],
    ['platformAdminControl/access-v1', { policy: true }],
  ]);
  let companyGrant = true;
  const snap = (path) => ({ id: path.split('/').at(-1), exists: records.has(path), data: () => records.get(path) });
  const db = {
    collection: name => ({ doc: id => ({ id, path: `${name}/${id}`, get: async () => snap(`${name}/${id}`) }) }),
    runTransaction: async run => run({
      get: async ref => snap(ref.path),
      set: (ref, data) => records.set(ref.path, data),
      delete: ref => records.delete(ref.path),
    }),
  };
  class AuthorityError extends Error {}
  const mod = loadTs('src/lib/access/scoped-data.ts', {
    'server-only': {},
    '@/lib/firebase-admin': { getAdminDb: () => db },
    './policy': {
      policySchema: { safeParse: value => ({ success: !!value?.policy, data: { companies: [{ id: 'company', orderflyBrandIds: ['esmeralda'] }] } }) },
      authorize: (_, request) => ({ allowed: companyGrant && request.companyId === 'company' &&
        (request.locationIds === null || request.locationIds.every(id => id === 'amager')) }),
    },
    './authority': { AuthorityError, principalKey: () => 'actor' },
    './orderfly-session': {
      verifiedOrderflyIdentity: async () => ({ provider: 'firebase', subject: 'actor' }),
      requireOrderflyAccess: async (brand, locations) => {
        if (!companyGrant || brand !== 'esmeralda' || locations?.some(id => id !== 'amager')) throw new AuthorityError('forbidden');
      },
      orderflyReadGrants: async () => [],
    },
  });
  return { mod, records, setCompanyGrant: value => { companyGrant = value; } };
}

test('historical QA promotions require a company grant for a deleted location', async () => {
  const f = fixture();
  for (const [collection, id] of [
    ['discounts', 'uP2DDd0J0zao4GSi5zmp'],
    ['discounts', 'raSE3kQxIEUSPPmM8RI2'],
    ['standard_discounts', 'Fk5pCg8dvTeA8jBC2jzQ'],
  ]) {
    await assert.rejects(f.mod.getScopedDocument(collection, id, 'orderfly.discounts:view', 'locations'), /forbidden/);
    assert.equal((await f.mod.getScopedDocument(collection, id, 'orderfly.discounts:view', 'locations', true)).id, id);
  }
  f.setCompanyGrant(false);
  await assert.rejects(f.mod.getScopedDocument('discounts', 'uP2DDd0J0zao4GSi5zmp', 'orderfly.discounts:view', 'locations', true), /forbidden/);
});

test('an edit preserves a retired location but cannot add an arbitrary missing or foreign location', async () => {
  const f = fixture();
  const edit = (ids) => f.mod.mutateScopedDocument('discounts', 'uP2DDd0J0zao4GSi5zmp',
    'orderfly.discounts:edit', 'locations', before => ({ ...before, description: 'updated', locationIds: ids }), true);
  await edit(['retired']);
  assert.deepEqual(f.records.get('discounts/uP2DDd0J0zao4GSi5zmp').locationIds, ['retired']);
  await assert.rejects(edit(['retired', 'unknown']), /forbidden/);
  await assert.rejects(edit(['foreign']), /forbidden/);
  await edit(['amager']);
  assert.deepEqual(f.records.get('discounts/uP2DDd0J0zao4GSi5zmp').locationIds, ['amager']);
});

test('foreign existing location is rejected even with a company grant', async () => {
  const f = fixture();
  f.records.set('discounts/uP2DDd0J0zao4GSi5zmp', { brandId: 'esmeralda', locationIds: ['retired', 'foreign'] });
  await assert.rejects(f.mod.getScopedDocument('discounts', 'uP2DDd0J0zao4GSi5zmp', 'orderfly.discounts:view', 'locations', true), /forbidden/);
  await assert.rejects(f.mod.mutateScopedDocument('discounts', 'uP2DDd0J0zao4GSi5zmp', 'orderfly.discounts:edit', 'locations', before => before, true), /forbidden/);
});
