import { expect, test } from '@playwright/test';
import type { OrderDetail } from '../src/types';
import { newsletterStatus, topCustomerProducts } from '../src/lib/customers/history';

const order = (brandId: string, id: string, paymentStatus: string, status: string, productItems: unknown[], refundedAmountOre = 0) => ({
  id, brandId, paymentStatus, status, totalAmount: 100, refundedAmountOre, productItems,
}) as OrderDetail;

test('top dishes count quantities from paid orders per merchant and ignore cancelled, pending and refunded sales', () => {
  const dish = (id: string, name: string, quantity: number) => ({ id, name, quantity });
  const rows = topCustomerProducts([
    order('pizza', 'a', 'Paid', 'Delivered', [dish('p1', 'Margherita', 2)]),
    order('pizza', 'b', 'Paid', 'Delivered', [dish('p1', 'Margherita', 3)]),
    order('cafe', 'c', 'Paid', 'Delivered', [dish('p1', 'Margherita', 1)]),
    order('pizza', 'd', 'Pending', 'Received', [dish('p1', 'Margherita', 50)]),
    order('pizza', 'e', 'Paid', 'Canceled', [dish('p1', 'Margherita', 50)]),
    order('pizza', 'f', 'Paid', 'Delivered', [dish('p1', 'Margherita', 50)], 10000),
  ], new Map([['pizza', 'Pizza'], ['cafe', 'Cafe']]));
  expect(rows.map(row => [row.merchant, row.quantity])).toEqual([['Pizza', 5], ['Cafe', 1]]);
});

test('newsletter status distinguishes recorded consent, sync and a provider opt-out', () => {
  expect(newsletterStatus(undefined, true, []).status).toBe('pending');
  expect(newsletterStatus({ state: 'synced' }, false, []).status).toBe('subscribed');
  expect(newsletterStatus({ state: 'synced', providerStatus: 'unsubscribed' }, true, ['accepted']).status).toBe('not_subscribed');
  expect(newsletterStatus(undefined, false, []).status).toBe('unknown');
});
