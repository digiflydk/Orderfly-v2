const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { fixture, formData, location, brand } = require('../helpers/brand-location-fixture.cjs');
const { deliveryMethodLabel, deliveryMethodLabelSchema } = loadTs('src/lib/delivery-method-labels.ts');
const { publicLocationRecord } = loadTs('src/lib/public-native-records.ts');
const redirected = result => assert.rejects(result, error => error.digest?.startsWith('NEXT_REDIRECT;'));

test('optional labels trim, preserve literal offer text and limit input to 40 plain-text characters', () => {
  assert.equal(deliveryMethodLabelSchema.parse('  Spar 25%  '), 'Spar 25%');
  assert.equal(deliveryMethodLabelSchema.parse(''), '');
  assert.equal(deliveryMethodLabelSchema.parse('x'.repeat(40)), 'x'.repeat(40));
  for (const invalid of ['x'.repeat(41), '<b>Gratis</b>', 'Gratis\nlevering', 'x\u0000y', 25, {}]) assert.equal(deliveryMethodLabelSchema.safeParse(invalid).success, false);
});

test('legacy pickup tags remain readable, explicit empty hides them, and delivery never borrows pickup offers', () => {
  assert.equal(deliveryMethodLabel({ pickupSaveTag: '25%' }, 'pickup'), 'Spar 25%');
  assert.equal(deliveryMethodLabel({ pickupSaveTag: 'Save 25%' }, 'pickup'), 'Spar 25%');
  assert.equal(deliveryMethodLabel({ pickupSaveTag: 'Spar 25%' }, 'pickup'), 'Spar 25%');
  assert.equal(deliveryMethodLabel({ pickupSaveTag: '25%', pickupLabel: '' }, 'pickup'), '');
  assert.equal(deliveryMethodLabel({ pickupSaveTag: '25%' }, 'delivery'), '');
  assert.equal(deliveryMethodLabel({ pickupLabel: '<script>' }, 'pickup'), '');
});

test('public projection includes only safe labels with independent location identity and no secrets', () => {
  const output = publicLocationRecord('l', { ...location, pickupLabel: ' Spar 25% ', deliveryLabel: 'Gratis levering', apiSecret: 'private', ownerId: 'owner' });
  assert.equal(output.pickupLabel, 'Spar 25%'); assert.equal(output.deliveryLabel, 'Gratis levering');
  assert.equal(output.id, 'l'); assert.equal(output.apiSecret, undefined); assert.equal(output.ownerId, undefined);
  assert.equal(publicLocationRecord('other', { ...location, pickupLabel: 23 }).pickupLabel, '');
  assert.equal(publicLocationRecord('other', { ...location }).deliveryLabel, '');
});

test('location save persists both labels, clears legacy fallback explicitly and never changes fee or minimum', async () => {
  const f = fixture([['brands/b', brand], ['locations/l', { ...location, brandId: 'b', deliveryFee: 39, minOrder: 100, pickupSaveTag: '25%' }]]);
  await redirected(f.locations.createOrUpdateLocation(null, formData({ ...location, brandId: 'b', deliveryFee: 39, minOrder: 100, pickupLabel: ' Spar 25% ', deliveryLabel: 'Gratis levering' })));
  let saved = await f.locations.getLocationById('l');
  assert.equal(saved.pickupLabel, 'Spar 25%'); assert.equal(saved.deliveryLabel, 'Gratis levering');
  assert.equal(saved.deliveryFee, 39); assert.equal(saved.minOrder, 100);
  await redirected(f.locations.createOrUpdateLocation(null, formData({ ...location, brandId: 'b', pickupLabel: '', deliveryLabel: '' })));
  saved = await f.locations.getLocationById('l');
  assert.equal(saved.pickupLabel, ''); assert.equal(saved.deliveryLabel, '');
  assert.equal(f.records.get('locations/l').pickupSaveTag, '25%');
});

test('server rejects invalid labels before any write, even when browser validation is bypassed', async () => {
  for (const field of ['pickupLabel', 'deliveryLabel']) for (const value of ['x'.repeat(41), '<img src=x>', 'a\nb']) {
    const f = fixture(); const result = await f.locations.createOrUpdateLocation(null, formData({ ...location, brandId: 'b', [field]: value }));
    assert.equal(result.error, true); assert.equal(f.writes.length, 0);
  }
});

test('label writes retain existing permission and brand/location validation boundaries', async () => {
  for (const [allowed, patch] of [[false, {}], [true, { brandId: 'foreign-missing' }], [true, { id: 'deleted' }]]) {
    const f = fixture(undefined, allowed); const result = await f.locations.createOrUpdateLocation(null, formData({ ...location, brandId: 'b', pickupLabel: 'Spar 25%', ...patch }));
    assert.equal(result.error, true); assert.equal(f.writes.length, 0);
  }
});
