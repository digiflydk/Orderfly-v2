
import { getUpsells } from './actions';
import { getBrands } from '@/app/superadmin/brands/actions';
import { UpsellsClientPage } from './client-page';
import { getAllLocations } from '../locations/actions';
import { isAdminReady } from '@/lib/runtime';
import EmptyState from '@/components/ui/empty-state';

async function UpsellsPageContent() {
    const [upsells, brands, locations] = await Promise.all([
        getUpsells(),
        getBrands(),
        getAllLocations(),
    ]);

    const brandMap = new Map(brands.map(b => [b.id, b.name]));

    const upsellsWithDetails = upsells.map(upsell => ({
        ...upsell,
        brandName: brandMap.get(upsell.brandId) || 'Unknown Brand',
    }));

    return (
       <UpsellsClientPage 
            initialUpsells={upsellsWithDetails} 
            brands={brands} 
        />
    );
}

export default function UpsellsPage() {
    if (!isAdminReady()) {
        return (
            <EmptyState
                title="Admin Environment Not Configured"
                hint="This page requires Firebase Admin credentials, which are not available in this environment."
                details="Set FIREBASE_SERVICE_ACCOUNT_JSON to enable this page."
            />
        );
    }
    return <UpsellsPageContent />;
}
