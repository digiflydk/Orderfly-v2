const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { optionalImageUrl } = loadTs('src/lib/optional-image-url.ts');

function fixture() {
  const saved = new Map();
  class Timestamp { constructor(date) { this.date = date; } toDate() { return this.date; } static now() { return new Timestamp(new Date()); } static fromDate(date) { return new Timestamp(date); } }
  function strict(value) {
    assert.notEqual(value, undefined, 'Firestore rejects undefined');
    if (value && typeof value === 'object') for (const entry of Object.values(value)) strict(entry);
  }
  const api = loadTs('src/app/superadmin/combos/actions.ts', {
    'next/cache': { revalidatePath() {}, revalidateTag() {} }, 'next/navigation': { redirect: () => { throw Error('REDIRECT'); } },
    '@/lib/storefront-cache': {}, '@/lib/firebase': { db: {} },
    '../products/actions': { getProductsByIds: async () => [{ id: 'p', brandId: 'b', price: 75 }] },
    'firebase/firestore': { Timestamp, collection: () => 'comboMenus', doc: (_, collection, id) => ({ id: id || 'new' }),
      setDoc: async (ref, data) => { strict(data); saved.set(ref.id, { ...saved.get(ref.id), ...data }); },
      getDoc: async ref => ({ id: ref.id, exists: () => saved.has(ref.id), data: () => saved.get(ref.id) }),
    },
  });
  function form(image, id) {
    const data = new FormData();
    for (const [key, value] of Object.entries({ brandId: 'b', comboName: 'Test combo', locationIds: 'l', description: '', pickupPrice: '100', orderTypes: 'pickup', isActive: 'on', productGroups: JSON.stringify([{ id: 'g', groupName: 'Pizza', productIds: ['p'], minSelection: 1, maxSelection: 1 }]), ...(id ? { id } : {}) })) data.set(key, value);
    if (image !== undefined) data.set('imageUrl', image);
    return data;
  }
  return { api, saved, form };
}
test('the shared field accepts blank/missing/null images and rejects nonempty invalid URLs', () => {
  for (const value of ['', '  ', null, undefined, 'https://example.test/pizza.png']) assert.equal(optionalImageUrl.safeParse(value).success, true);
  assert.equal(optionalImageUrl.safeParse('not-a-url').success, false);
});
for (const image of ['', '  ', undefined]) test(`create and reopen a pickup-only combo without an image (${String(image)})`, async () => {
  const { api, form } = fixture();
  await assert.rejects(api.createOrUpdateCombo(null, form(image)), /REDIRECT/);
  const combo = await api.getComboById('new');
  assert.ok(combo); assert.equal(combo.comboName, 'Test combo'); assert.equal(combo.pickupPrice, 100);
  assert.ok(!combo.imageUrl); assert.equal(combo.deliveryPrice, undefined);
});
test('editing can clear an existing image; bad images and missing locations still fail without writes', async () => {
  const { api, form, saved } = fixture();
  await assert.rejects(api.createOrUpdateCombo(null, form('https://example.test/pizza.png')), /REDIRECT/);
  await assert.rejects(api.createOrUpdateCombo(null, form('', 'new')), /REDIRECT/);
  assert.equal((await api.getComboById('new')).imageUrl, '');
  const before = JSON.stringify([...saved]);
  assert.equal((await api.createOrUpdateCombo(null, form('not-a-url', 'new'))).error, true);
  const noLocation = form('', 'new'); noLocation.delete('locationIds');
  assert.equal((await api.createOrUpdateCombo(null, noLocation)).error, true);
  assert.equal(JSON.stringify([...saved]), before);
});
