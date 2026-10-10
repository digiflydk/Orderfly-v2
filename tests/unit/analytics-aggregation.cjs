const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { analyticsDateRange, analyticsCalendarDay } = loadTs('src/lib/analytics/date-range.ts');

function fixture() {
  const rows = new Map();
  const collection = (name, filters = []) => ({
    where(field, operator, value) {
      return collection(name, [...filters, { field, operator, value }]);
    },
    doc(id) {
      return { set: async value => rows.set(`${name}/${id}`, value) };
    },
    async get() {
      const docs = [...rows].filter(([key, row]) => key.startsWith(`${name}/`) && filters.every(({ field, operator, value }) => {
        const actual = row[field]?.toDate?.() ?? row[field];
        const expected = value?.toDate?.() ?? value;
        if (operator === '>=') return actual >= expected;
        if (operator === '<=') return actual <= expected;
        if (operator === '<') return actual < expected;
        return actual === expected;
      })).map(([key, row]) => ({ id: key.slice(name.length + 1), data: () => row }));
      return { docs, forEach: callback => docs.forEach(callback) };
    },
  });
  return { rows, db: { collection } };
}

test('analytics calendar ranges use Copenhagen dates and handle the autumn DST day', () => {
  const range = analyticsDateRange('2026-10-25', '2026-10-25');
  assert.equal(range.start.toISOString(), '2026-10-24T22:00:00.000Z');
  assert.equal(range.endExclusive.toISOString(), '2026-10-25T23:00:00.000Z');
  assert.equal(analyticsCalendarDay(new Date('2026-10-24T22:30:00.000Z')), '2026-10-25');
});

test('daily aggregation sums all paid-order attribution groups and does not double-count payment events', async () => {
  const { rows, db } = fixture();
  const date = new Date('2026-10-10T12:00:00.000Z');
  rows.set('analytics_events/menu', {
    name: 'view_menu', brandId: 'brand-a', locationId: 'location-a', sessionId: 'session-a', ts: date,
  });
  rows.set('analytics_events/paid-event', {
    name: 'payment_succeeded', brandId: 'brand-a', locationId: 'location-a', sessionId: 'server-payment-only',
    cartValue: 100, deliveryFee: 10, discountTotal: 5, ts: date,
  });
  rows.set('analytics_events/vital', {
    name: 'web_vital', brandId: 'brand-a', locationId: 'location-a', sessionId: 'vitals-only', ts: date,
  });
  rows.set('analytics_events/payment-session', {
    name: 'payment_session_created', brandId: 'brand-a', locationId: 'location-a', sessionId: 'server-session-only', ts: date,
  });

  const purchases = [
    { brandId: 'brand-a', locationId: 'location-a', count: 1, revenue: 100, deliveryFee: 10, discount: 5, sessionIds: new Set(['session-a']) },
    { brandId: 'brand-a', locationId: 'location-a', count: 1, revenue: 200, deliveryFee: 20, discount: 0, sessionIds: new Set(['session-b']) },
  ];
  const { aggregateDailyData } = loadTs('src/lib/analytics/aggregateDaily.ts', {
    '@/lib/access/orderfly-session': { requirePlatformSuperuser: async () => ({ superuser: true }) },
    '@/lib/firebase-admin': { getAdminDb: () => db },
    './sources/orders': { getPurchasesInRange: async () => purchases },
    'firebase-admin': { firestore: { Timestamp: { fromDate: value => value, now: () => date } } },
  });

  const result = await aggregateDailyData('2026-10-10T12:00:00.000Z', '2026-10-10T12:00:00.000Z');
  const daily = rows.get('analytics_daily/2026-10-10_brand-a_location-a');
  assert.equal(result.daysProcessed, 1);
  assert.equal(daily.payment_succeeded, 2);
  assert.equal(daily.revenue_paid, 300);
  assert.equal(daily.delivery_fees_total, 30);
  assert.equal(daily.discounts_total, 5);
  assert.equal(daily.view_menu, 1);
  assert.equal(daily.unique_sessions, 2);
  assert.equal(daily.payment_session_created, 1);
});
