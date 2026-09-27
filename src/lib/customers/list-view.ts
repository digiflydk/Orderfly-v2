import { format } from 'date-fns';
import type { Customer } from '@/types';
import { asDate } from '@/lib/loyalty/model';

// Customer documents created by older checkout flows can omit locationIds or
// contain timestamps in different Firestore/JSON formats.
export function customerListView(customer: Customer, brandNames: Map<string, string>, locationNames: Map<string, string>) {
  const createdAt = asDate(customer.createdAt);
  const lastOrderDate = asDate(customer.lastOrderDate);
  const consentDate = asDate(customer.cookie_consent?.timestamp);
  const locationIds = Array.isArray(customer.locationIds) ? customer.locationIds : [];

  return {
    ...customer,
    locationIds,
    createdAt: createdAt ? format(createdAt, 'yyyy-MM-dd') : '',
    lastOrderDate: lastOrderDate ? format(lastOrderDate, 'yyyy-MM-dd') : undefined,
    cookie_consent: customer.cookie_consent ? {
      ...customer.cookie_consent,
      timestamp: consentDate?.toISOString() ?? '',
    } : undefined,
    brandName: brandNames.get(customer.brandId) || 'N/A',
    locationNames: locationIds.map(id => locationNames.get(id) || 'Unknown').join(', '),
  };
}
