
import { getAllLocations } from './actions';
import { getBrands } from '../brands/actions';
import { LocationsClientPage } from './client-page';
import type { Brand, Location } from '@/types';
import { isAdminReady } from '@/lib/runtime';
import EmptyState from '@/components/ui/empty-state';

async function LocationsPageContent() {
    const [locations, brands] = await Promise.all([
        getAllLocations(),
        getBrands()
    ]);

    const brandsMap = new Map(brands.map(b => [b.id, b.name]));

    const locationsWithBrandNames = locations.map(location => ({
        ...location,
        brandName: brandsMap.get(location.brandId) || 'Unknown Brand',
    }));

    return (
       <LocationsClientPage initialLocations={locationsWithBrandNames} brands={brands} />
    );
}

export default function LocationsOverviewPage() {
    if (!isAdminReady()) {
        return (
            <EmptyState
                title="Admin Environment Not Configured"
                hint="This page requires Firebase Admin credentials, which are not available in this environment."
                details="Set FIREBASE_SERVICE_ACCOUNT_JSON to enable this page."
            />
        );
    }
    return <LocationsPageContent />;
}
