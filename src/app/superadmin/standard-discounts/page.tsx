
import { getStandardDiscounts } from './actions';
import { upsellClientData } from '@/lib/upsell-serialization';
import { getBrands } from '@/app/superadmin/brands/actions';
import { StandardDiscountsClientPage } from './client-page';
import { getAllLocations } from '../locations/actions';
import { isAdminReady } from '@/lib/runtime';
import EmptyState from '@/components/ui/empty-state';
import { loadSuperadminPage } from '@/lib/access/superadmin-page';
import { AccessDeniedPage } from '@/components/superadmin/access-denied-page';

async function StandardDiscountsPageContent() {
    const result = await loadSuperadminPage('orderfly.discounts:view', () => Promise.all([
        getStandardDiscounts(),
        getBrands(),
        getAllLocations(),
    ]));
    if (!result) return <AccessDeniedPage />;
    const [discounts, brands, locations] = result;

    const brandMap = new Map(brands.map(b => [b.id, b.name]));

    const discountsWithDetails = discounts.map(discount => ({
        ...discount,
        brandName: brandMap.get(discount.brandId) || 'Unknown Brand',
    }));

    return (
       <StandardDiscountsClientPage 
            initialDiscounts={discountsWithDetails} 
            brands={upsellClientData(brands)}
            locations={upsellClientData(locations)}
        />
    );
}

export default function StandardDiscountsPage() {
    if (!isAdminReady()) {
        return (
            <EmptyState
                title="Admin Environment Not Configured"
                hint="This page requires Firebase Admin credentials, which are not available in this environment."
                details="Set FIREBASE_SERVICE_ACCOUNT_JSON to enable this page."
            />
        );
    }
    return <StandardDiscountsPageContent />;
}
