
import { getCustomers } from './actions';
import { getBrands } from '@/app/superadmin/brands/actions';
import { CustomersClientPage } from './client-page';
import { getAllLocations } from '../locations/actions';
import { customerListView } from '@/lib/customers/list-view';
import { isAdminReady } from '@/lib/runtime';
import EmptyState from '@/components/ui/empty-state';

export const revalidate = 0;
export const dynamic = 'force-dynamic';

async function CustomerPageContent() {
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
            initialCustomers={customersWithDetails}
            brands={brands.map(brand => ({ id: brand.id, name: brand.name }))}
        />
    );
}


export default function CustomersPage() {
    if (!isAdminReady()) {
        return (
            <EmptyState
                title="Admin Environment Not Configured"
                hint="This page requires Firebase Admin credentials, which are not available in this environment."
                details="Set FIREBASE_SERVICE_ACCOUNT_JSON to enable this page."
            />
        );
    }
    
    return <CustomerPageContent />;
}
