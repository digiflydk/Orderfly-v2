

import { getCustomers } from './actions';
import { getBrands } from '@/app/superadmin/brands/actions';
import { CustomersClientPage } from './client-page';
import { getAllLocations } from '../locations/actions';
import { customerListView } from '@/lib/customers/list-view';

export const revalidate = 0;

export default async function CustomersPage() {
    const [customers, brands, locations] = await Promise.all([
        getCustomers(),
        getBrands(),
        getAllLocations(),
    ]);

    const brandMap = new Map(brands.map(b => [b.id, b.name]));
    const locationMap = new Map(locations.map(l => [l.id, l.name]));

    const customersWithDetails = customers.map(customer => customerListView(customer, brandMap, locationMap));

    return (
        <CustomersClientPage
            initialCustomers={customersWithDetails as any}
            brands={brands}
        />
    );
}
