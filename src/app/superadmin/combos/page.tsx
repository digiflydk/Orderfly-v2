
import { getCombos } from './actions';
import { getBrands } from '@/app/superadmin/brands/actions';
import { CombosClientPage } from './client-page';
import { getAllLocations } from '../locations/actions';
import { isAdminReady } from '@/lib/runtime';
import EmptyState from '@/components/ui/empty-state';
import { loadSuperadminPage } from '@/lib/access/superadmin-page';
import { AccessDeniedPage } from '@/components/superadmin/access-denied-page';

async function CombosPageContent() {
    const result = await loadSuperadminPage('orderfly.catalog:view', () => Promise.all([
        getCombos(),
        getBrands(),
        getAllLocations(),
    ]));
    if (!result) return <AccessDeniedPage />;
    const [combos, brands, locations] = result;

    const brandMap = new Map(brands.map(b => [b.id, b.name]));
    const locationMap = new Map(locations.map(l => [l.id, l.name]));

    const combosWithDetails = combos.map(combo => ({
        ...combo,
        brandName: brandMap.get(combo.brandId) || 'Unknown Brand',
        locationNames: (Array.isArray(combo.locationIds) ? combo.locationIds : []).map(id => locationMap.get(id) || 'Unknown Location').join(', '),
    }));

    return (
       <CombosClientPage 
            initialCombos={combosWithDetails} 
            brands={brands} 
            locations={locations}
        />
    );
}

export default function CombosPage() {
    if (!isAdminReady()) {
        return (
            <EmptyState
                title="Admin Environment Not Configured"
                hint="This page requires Firebase Admin credentials, which are not available in this environment."
                details="Set FIREBASE_SERVICE_ACCOUNT_JSON to enable this page."
            />
        );
    }
    return <CombosPageContent />;
}
