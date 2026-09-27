import { expect, test } from '@playwright/test';
import { customerListView } from '../src/lib/customers/list-view';
import type { Customer } from '../src/types';

const brands = new Map([['brand-1', 'Esmeralda']]);
const locations = new Map([['location-1', 'Amager']]);

test('renders a legacy customer without locations or consent timestamp', () => {
  const customer = {
    id: 'customer-1', brandId: 'brand-1', fullName: 'Guest', email: 'guest@example.com',
    phone: '12345678', status: 'active', createdAt: { seconds: 1_700_000_000 },
    cookie_consent: { marketing: false, statistics: false, functional: true },
  } as unknown as Customer;

  const view = customerListView(customer, brands, locations);
  expect(view.locationIds).toEqual([]);
  expect(view.locationNames).toBe('');
  expect(view.createdAt).toBe('2023-11-14');
  expect(view).not.toHaveProperty('cookie_consent');
});

test('preserves valid locations, loyalty data and mixed timestamp formats', () => {
  class FirestoreTimestamp { toDate() { return new Date('2026-09-27T12:00:00Z'); } }
  const customer = {
    id: 'customer-2', brandId: 'brand-1', fullName: 'Guest', email: 'guest@example.com',
    phone: '12345678', status: 'active', createdAt: new Date('2026-09-01T10:00:00Z'),
    lastOrderDate: '2026-09-26T10:00:00Z', locationIds: ['location-1', 'retired'],
    loyaltyScore: 80, cookie_consent: { timestamp: { seconds: 1_700_000_000 } },
    integrationSources: { esmeralda: { lastSyncedAt: new FirestoreTimestamp() } },
  } as unknown as Customer;

  const view = customerListView(customer, brands, locations);
  expect(view.locationNames).toBe('Amager, Unknown');
  expect(view.lastOrderDate).toBe('2026-09-26');
  expect(view.loyaltyScore).toBe(80);
  expect(view).not.toHaveProperty('cookie_consent');
  expect(view).not.toHaveProperty('integrationSources');
  expect(Object.keys(view).sort()).toEqual([
    'brandId', 'brandName', 'createdAt', 'email', 'fullName', 'id', 'lastOrderDate',
    'locationIds', 'locationNames', 'loyaltyClassification', 'loyaltyScore', 'phone', 'status',
  ]);
});
