

import { getCustomers } from './actions';
import { getBrands } from '@/app/superadmin/brands/actions';
import { CustomersClientPage } from './client-page';
import type { Customer } from '@/types';
import { getAllLocations } from '../locations/actions';
import { getLoyaltySettings } from '../loyalty/actions';
import { format } from 'date-fns';

export const revalidate = 0;

export default async function CustomersPage() {
    const [customers, brands, locations, loyaltySettings] = await Promise.all([
        getCustomers(),
        getBrands(),
        getAllLocations(),
        getLoyaltySettings()
    ]);

    const brandMap = new Map(brands.map(b => [b.id, b.name]));
    const locationMap = new Map(locations.map(l => [l.id, l.name]));

    // Use the already calculated loyalty fields from the enhanced getCustomers()
    // and ensure all date-like objects are converted to strings
    const customersWithDetails = customers.map(customer => ({
        ...customer,
        lastOrderDate: customer.lastOrderDate instanceof Date ? format(customer.lastOrderDate, 'yyyy-MM-dd') : undefined,
        createdAt: customer.createdAt instanceof Date ? format(customer.createdAt, 'yyyy-MM-dd') : '',
        cookie_consent: customer.cookie_consent ? {
            ...customer.cookie_consent,
            timestamp: (customer.cookie_consent.timestamp as Date).toISOString(),
        } : undefined,
        brandName: brandMap.get(customer.brandId) || 'N/A',
        locationNames: customer.locationIds.map(id => locationMap.get(id) || 'Unknown').join(', '),
    }));

    return (
        <CustomersClientPage
            initialCustomers={customersWithDetails as any}
            brands={brands}
        />
    );
}
