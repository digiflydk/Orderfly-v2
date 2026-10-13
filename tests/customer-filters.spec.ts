import { expect, test } from '@playwright/test';
import { matchesCustomerSearch, matchesCustomerType, matchesDateRange } from '../src/lib/customers/filtering';

test('creation date range includes both endpoints and rejects missing or invalid dates', () => {
  expect(matchesDateRange('2026-09-01T12:30:00.000Z', '2026-09-01', '2026-09-30')).toBe(true);
  expect(matchesDateRange('2026-09-30', '2026-09-01', '2026-09-30')).toBe(true);
  expect(matchesDateRange('2026-08-31', '2026-09-01', '2026-09-30')).toBe(false);
  expect(matchesDateRange(null, '2026-09-01', '')).toBe(false);
  expect(matchesDateRange('2026-09-12', '2026-09-30', '2026-09-01')).toBe(false);
  expect(matchesDateRange(null)).toBe(true);
});

test('customer type segments use only the customer sources passed for a brand', () => {
  const firstOrder = [{ kind: 'customer' as const, totalOrders: 1 }];
  const repeatCustomer = [{ kind: 'customer' as const, totalOrders: 3 }];
  const noOrders = [{ kind: 'customer' as const, totalOrders: 0 }];
  const gamesOnly = [{ kind: 'game' as const }];

  expect(matchesCustomerType('first-order', firstOrder)).toBe(true);
  expect(matchesCustomerType('returning', firstOrder)).toBe(false);
  expect(matchesCustomerType('returning', repeatCustomer)).toBe(true);
  expect(matchesCustomerType('no-orders', noOrders)).toBe(true);
  expect(matchesCustomerType('game-only', gamesOnly)).toBe(true);
  expect(matchesCustomerType('game-only', [...firstOrder, ...gamesOnly])).toBe(false);

  const cafe = [{ kind: 'customer' as const, totalOrders: 1 }];
  const pizza = [{ kind: 'customer' as const, totalOrders: 3 }];
  expect(matchesCustomerType('returning', cafe)).toBe(false);
  expect(matchesCustomerType('returning', pizza)).toBe(true);
});

test('customer search is case-insensitive and ignores surrounding query whitespace', () => {
  expect(matchesCustomerSearch('  ANNA@EXAMPLE.COM ', ['Anna Jensen', 'anna@example.com', '12345678'])).toBe(true);
  expect(matchesCustomerSearch('9988', ['Anna Jensen', 'anna@example.com', '12345678'])).toBe(false);
  expect(matchesCustomerSearch('', [])).toBe(true);
});
