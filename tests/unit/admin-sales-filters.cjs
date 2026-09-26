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

test('sales summary queries only scoped orders and all displayed KPIs share the selected period and location', async () => {
  let reads = [];
  const { getSalesDashboardData } = loadTs('src/lib/superadmin/getSalesSummary.ts', {
    'firebase-admin/firestore': { Timestamp: { fromDate: date => date } },
    '@/lib/access/scoped-data': {
      listScopedDocuments: async (collection, permission, scope, predicates) => {
        reads.push({ collection, permission, scope, predicates });
        return [
          { data: () => ({ brandId: 'a', locationId: 'la', paymentStatus: 'Paid', status: 'Completed', totalAmount: 100, deliveryType: 'Pickup', paymentDetails: { discountTotal: 10, upsellAmount: 5 }, productItems: [] }) },
          { data: () => ({ brandId: 'a', locationId: 'la', paymentStatus: 'Pending', status: 'Received', totalAmount: 60, deliveryType: 'Delivery', paymentDetails: { discountTotal: 0 }, productItems: [] }) },
        ];
      },
    },
  });
  const result = await getSalesDashboardData({ dateFrom: '2026-09-01', dateTo: '2026-09-05', brandId: 'a', locationIds: ['la'] });
  assert.equal(reads.length, 1);
  assert.deepEqual(reads[0].predicates.map(([field]) => field), ['createdAt', 'createdAt', 'brandId', 'locationId']);
  assert.equal(reads[0].collection, 'orders');
  assert.equal(reads[0].permission, 'orderfly.analytics:view');
  assert.equal(reads[0].scope, 'location');
  assert.equal(result.kpis.totalSales, 100);
  assert.equal(result.kpis.pendingOrders, 1);
  assert.equal('totalCookieConsents' in result.kpis, false);
  assert.equal('totalActiveBrands' in result, false);
});
