
import { ToppingsClientPage } from './toppings-client-page';
import { getToppingGroups, getToppings } from './actions';
import { getAllLocations } from '@/app/superadmin/locations/actions';
import { getBrands } from '@/app/superadmin/brands/actions';
import { isAdminReady } from '@/lib/runtime';
import EmptyState from '@/components/ui/empty-state';

async function ToppingsPageContent() {
    const [toppingGroups, toppings, locations, brands] = await Promise.all([
        getToppingGroups(),
        getToppings(),
        getAllLocations(),
        getBrands(),
    ]);

    return (
        <ToppingsClientPage 
            initialToppingGroups={toppingGroups}
            initialToppings={toppings}
            initialLocations={locations}
            initialBrands={brands}
        />
    );
}

export default function ToppingsPage() {
    if (!isAdminReady()) {
        return (
            <EmptyState
                title="Admin Environment Not Configured"
                hint="This page requires Firebase Admin credentials, which are not available in this environment."
                details="Set FIREBASE_SERVICE_ACCOUNT_JSON to enable this page."
            />
        );
    }
    return <ToppingsPageContent />;
}
