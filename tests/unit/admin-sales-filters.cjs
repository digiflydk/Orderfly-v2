const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');

test('sales choices use the analytics grant instead of unrelated feature scopes', async () => {
  let permission;
  const { getAnalyticsFiltersData } = loadTs('src/app/superadmin/_analytics-filters-data.ts', {
    '@/lib/access/native-catalog': {
      nativeCatalog: async requested => {
        permission = requested;
        return { brands: [{ id: 'a', name: 'Analytics' }], locations: [{ id: 'la', brandId: 'a', name: 'A' }] };
      },
      selectorCatalog: () => { throw Error('unrelated feature grants must not populate sales filters'); },
    },
  });
  const result = await getAnalyticsFiltersData();
  assert.equal(permission, 'orderfly.analytics:view');
  assert.deepEqual(result.brands.map(brand => brand.id), ['a']);
  assert.deepEqual(result.locations.map(location => location.id), ['la']);
});

test('brand changes remove incompatible locations but preserve valid choices', () => {
  const { locationsAfterBrandChange } = loadTs('src/components/superadmin/filter-selection.ts');
  const locations = [{ id: 'la', brandId: 'a' }, { id: 'lb', brandId: 'b' }];
  assert.deepEqual(locationsAfterBrandChange(['la'], 'b', locations), []);
  assert.deepEqual(locationsAfterBrandChange(['la', 'lb'], 'b', locations), ['lb']);
  assert.deepEqual(locationsAfterBrandChange(['la'], 'all', locations), ['la']);
});

test('sales use the selected paidAt period while current pending orders stay separately scoped', async () => {
  let reads = [];
  const orders = [
    // Created outside the selected range, but paid within it: must be included.
    { brandId: 'a', locationId: 'la', paymentStatus: 'Paid', status: 'Completed', createdAt: new Date('2026-09-06T12:00:00Z'), paidAt: new Date('2026-09-02T12:00:00Z'), totalAmount: 100, deliveryType: 'Pickup', paymentDetails: { discountTotal: 10, upsellAmount: 5 }, productItems: [] },
    // Created within the range, but paid after it: must be excluded.
    { brandId: 'a', locationId: 'la', paymentStatus: 'Paid', status: 'Completed', createdAt: new Date('2026-09-02T12:00:00Z'), paidAt: new Date('2026-09-06T12:00:00Z'), totalAmount: 800, deliveryType: 'Delivery', paymentDetails: { discountTotal: 0 }, productItems: [] },
    // No payment date; current pending count is scoped independently of dates.
    { brandId: 'a', locationId: 'la', paymentStatus: 'Pending', status: 'Received', totalAmount: 60, deliveryType: 'Delivery', paymentDetails: { discountTotal: 0 }, productItems: [] },
  ];
  const { getSalesDashboardData } = loadTs('src/lib/superadmin/getSalesSummary.ts', {
    'firebase-admin/firestore': { Timestamp: { fromDate: date => date } },
    '@/lib/access/scoped-data': {
      listScopedDocuments: async (collection, permission, scope, predicates) => {
        reads.push({ collection, permission, scope, predicates });
        const matches = order => predicates.every(([field, operator, expected]) => {
          const actual = order[field];
          if (operator === '>=') return actual >= expected;
          if (operator === '<') return actual < expected;
          if (operator === '==') return actual === expected;
          if (operator === 'in') return expected.includes(actual);
          return false;
        });
        return orders.filter(matches).map(order => ({ data: () => order }));
      },
    },
  });
  const result = await getSalesDashboardData({ dateFrom: '2026-09-01', dateTo: '2026-09-05', brandId: 'a', locationIds: ['la'] });
  assert.equal(reads.length, 2);
  assert.deepEqual(reads[0].predicates.map(([field]) => field), ['paidAt', 'paidAt', 'brandId', 'locationId']);
  assert.equal(reads[0].predicates[0][2].toISOString(), '2026-08-31T22:00:00.000Z');
  assert.equal(reads[0].predicates[1][2].toISOString(), '2026-09-05T22:00:00.000Z');
  assert.deepEqual(reads[1].predicates.map(([field]) => field), ['paymentStatus', 'brandId', 'locationId']);
  for (const read of reads) {
    assert.equal(read.collection, 'orders');
    assert.equal(read.permission, 'orderfly.analytics:view');
    assert.equal(read.scope, 'location');
  }
  assert.equal(result.kpis.totalSales, 100);
  assert.equal(result.kpis.pendingOrders, 1);
  assert.equal('totalCookieConsents' in result.kpis, false);
  assert.equal('totalActiveBrands' in result, false);
});
