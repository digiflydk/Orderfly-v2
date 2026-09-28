
import { getDiscounts } from './actions';
import { getBrands } from '@/app/superadmin/brands/actions';
import { DiscountsClientPage } from './client-page';
import { isAdminReady } from '@/lib/runtime';
import EmptyState from '@/components/ui/empty-state';
import { loadSuperadminPage } from '@/lib/access/superadmin-page';
import { AccessDeniedPage } from '@/components/superadmin/access-denied-page';

async function DiscountsPageContent() {
    const result = await loadSuperadminPage('orderfly.discounts:view', () => Promise.all([
        getDiscounts(),
        getBrands(),
    ]));
    if (!result) return <AccessDeniedPage />;
    const [discounts, brands] = result;

    const brandMap = new Map(brands.map(b => [b.id, b.name]));

    const discountsWithDetails = discounts.map(discount => ({
        ...discount,
        brandName: brandMap.get(discount.brandId) || 'Unknown Brand',
    }));

    return (
       <DiscountsClientPage 
            initialDiscounts={discountsWithDetails} 
            brands={brands} 
        />
    );
}

export default function DiscountsPage() {
    if (!isAdminReady()) {
        return (
            <EmptyState
                title="Admin Environment Not Configured"
                hint="This page requires Firebase Admin credentials, which are not available in this environment."
                details="Set FIREBASE_SERVICE_ACCOUNT_JSON to enable this page."
            />
        );
    }
    return <DiscountsPageContent />;
}
