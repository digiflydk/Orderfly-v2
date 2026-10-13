import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import type { Customer } from '@/types';
import { asDate } from '@/lib/loyalty/model';

export type CustomerListRow = Pick<Customer, 'id' | 'brandId' | 'fullName' | 'email' | 'phone' | 'status' | 'loyaltyScore' | 'loyaltyClassification' | 'totalOrders' | 'totalSpend'> & {
  emailAliases: string[];
  phoneAliases: string[];
  hasBookingSource: boolean;
  hasOmnisendSource: boolean;
  createdAt: string;
  lastOrderDate?: string;
  locationIds: string[];
  brandName: string;
  locationNames: string;
};

function stringValues(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean))].slice(0, 50);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

// Firestore customer documents may contain nested Timestamp instances, notably
// integrationSources.esmeralda.lastSyncedAt. Never spread a database document
// into props passed from a Server Component to a Client Component.
export function customerListView(customer: Customer, brandNames: Map<string, string>, locationNames: Map<string, string>): CustomerListRow {
  const extended = customer as Customer & {
    emailAliases?: unknown;
    phoneAliases?: unknown;
    integrationSources?: unknown;
  };
  const integrations = record(extended.integrationSources);
  const bookingSource = record(integrations.esmeralda);
  const omnisendSource = record(integrations.omnisend);
  const createdAt = asDate(customer.createdAt);
  const lastOrderDate = asDate(customer.lastOrderDate);
  const locationIds = Array.isArray(customer.locationIds) ? customer.locationIds : [];

  return {
    id: customer.id,
    brandId: customer.brandId,
    fullName: typeof customer.fullName === 'string' ? customer.fullName : '',
    email: typeof customer.email === 'string' ? customer.email : '',
    emailAliases: stringValues(extended.emailAliases),
    phone: typeof customer.phone === 'string' ? customer.phone : '',
    phoneAliases: stringValues(extended.phoneAliases),
    hasBookingSource: Object.keys(bookingSource).length > 0,
    hasOmnisendSource: Object.keys(omnisendSource).length > 0,
    status: customer.status === 'active' ? 'active' : 'inactive',
    loyaltyScore: Number.isFinite(customer.loyaltyScore) ? customer.loyaltyScore : 0,
    totalOrders: Number.isFinite(customer.totalOrders) ? customer.totalOrders : 0,
    totalSpend: Number.isFinite(customer.totalSpend) ? customer.totalSpend : 0,
    loyaltyClassification: typeof customer.loyaltyClassification === 'string' ? customer.loyaltyClassification : 'New',
    locationIds,
    createdAt: createdAt ? format(toZonedTime(createdAt, 'Europe/Copenhagen'), 'yyyy-MM-dd') : '',
    lastOrderDate: lastOrderDate ? format(toZonedTime(lastOrderDate, 'Europe/Copenhagen'), 'yyyy-MM-dd') : undefined,
    brandName: brandNames.get(customer.brandId) || 'N/A',
    locationNames: locationIds.map(id => locationNames.get(id) || 'Unknown').join(', '),
  };
}
