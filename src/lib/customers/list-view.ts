import { format } from 'date-fns';
import type { Customer } from '@/types';
import { asDate } from '@/lib/loyalty/model';

export type CustomerListRow = Pick<Customer, 'id' | 'brandId' | 'fullName' | 'email' | 'phone' | 'status' | 'loyaltyScore' | 'loyaltyClassification'> & {
  createdAt: string;
  lastOrderDate?: string;
  locationIds: string[];
  brandName: string;
  locationNames: string;
};

// Firestore customer documents may contain nested Timestamp instances, notably
// integrationSources.esmeralda.lastSyncedAt. Never spread a database document
// into props passed from a Server Component to a Client Component.
export function customerListView(customer: Customer, brandNames: Map<string, string>, locationNames: Map<string, string>): CustomerListRow {
  const createdAt = asDate(customer.createdAt);
  const lastOrderDate = asDate(customer.lastOrderDate);
  const locationIds = Array.isArray(customer.locationIds) ? customer.locationIds : [];

  return {
    id: customer.id,
    brandId: customer.brandId,
    fullName: typeof customer.fullName === 'string' ? customer.fullName : '',
    email: typeof customer.email === 'string' ? customer.email : '',
    phone: typeof customer.phone === 'string' ? customer.phone : '',
    status: customer.status === 'active' ? 'active' : 'inactive',
    loyaltyScore: Number.isFinite(customer.loyaltyScore) ? customer.loyaltyScore : 0,
    loyaltyClassification: typeof customer.loyaltyClassification === 'string' ? customer.loyaltyClassification : 'New',
    locationIds,
    createdAt: createdAt ? format(createdAt, 'yyyy-MM-dd') : '',
    lastOrderDate: lastOrderDate ? format(lastOrderDate, 'yyyy-MM-dd') : undefined,
    brandName: brandNames.get(customer.brandId) || 'N/A',
    locationNames: locationIds.map(id => locationNames.get(id) || 'Unknown').join(', '),
  };
}
