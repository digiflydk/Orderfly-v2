

import { getStandardDiscounts } from './actions';
import { getBrands } from '@/app/superadmin/brands/actions';
import { StandardDiscountsClientPage } from '@/components/superadmin/standard-discount-client-page';
import { getAllLocations } from '../locations/actions';
import { isAdminReady } from '@/lib/runtime';
import EmptyState from '@/components/ui/empty-state';

async function StandardDiscountsPageContent() {
    const [discounts, brands, locations] = await Promise.all([
        getStandardDiscounts(),
        getBrands(),
        getAllLocations(),
    ]);

    const brandMap = new Map(brands.map(b => [b.id, b.name]));

    const discountsWithDetails = discounts.map(discount => ({
        ...discount,
        brandName: brandMap.get(discount.brandId) || 'Unknown Brand',
    }));

    return (
       <StandardDiscountsClientPage 
            initialDiscounts={discountsWithDetails} 
            brands={brands} 
            locations={locations}
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
