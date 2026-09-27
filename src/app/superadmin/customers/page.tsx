
import { customerDirectory } from '@/lib/customers/directory-server';
import { getCustomers } from './actions';
import { getBrands } from '@/app/superadmin/brands/actions';
import { getAllLocations } from '../locations/actions';
import { customerListView } from '@/lib/customers/list-view';
import { CustomersWorkspace } from './workspace';
import { isAdminReady } from '@/lib/runtime';
import EmptyState from '@/components/ui/empty-state';

export const revalidate = 0;
export const dynamic = 'force-dynamic';

async function CustomerPageContent() {
    const [customers, brands, locations] = await Promise.all([
        getCustomers(), getBrands(), getAllLocations(),
    ]);
    const { entries, global } = await customerDirectory(customers);
    const brandNames = new Map(brands.map(brand => [brand.id, brand.name]));
    const locationNames = new Map(locations.map(location => [location.id, location.name]));
    return <CustomersWorkspace
        customers={customers.map(customer => customerListView(customer, brandNames, locationNames))}
        brands={brands.map(brand => ({ id: brand.id, name: brand.name }))}
        entries={entries}
        brandNames={Object.fromEntries(brands.map(brand => [brand.id, brand.name]))}
        global={global}
    />;
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
