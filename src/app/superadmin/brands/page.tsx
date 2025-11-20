
import { getBrands } from './actions';
import type { Brand, SubscriptionPlan, User } from '@/types';
import { getSubscriptionPlans } from '../subscriptions/actions';
import { getUsers } from '../users/actions';
import { BrandsClientPage } from './client-page';
import { isAdminReady } from '@/lib/runtime';
import EmptyState from '@/components/ui/empty-state';


async function BrandsPageContent() {
    const [brands, users, plans] = await Promise.all([
        getBrands(),
        getUsers(),
        getSubscriptionPlans(),
    ]);

    // This mapping is for display purposes, as we are fetching all data here.
    const brandsWithDetails = brands.map(brand => ({
        ...brand,
        ownerName: users.find(u => u.id === brand.ownerId)?.name || 'N/A',
        planName: plans.find(p => p.id === brand.subscriptionPlanId)?.name || 'N/A',
    }));

    return (
        <BrandsClientPage
            initialBrands={brandsWithDetails}
        />
    );
}


export default function BrandsPage() {
    if (!isAdminReady()) {
        return (
            <EmptyState
                title="Admin Environment Not Configured"
                hint="This page requires Firebase Admin credentials, which are not available in this environment."
                details="Set FIREBASE_SERVICE_ACCOUNT_JSON to enable this page."
            />
        );
    }
  return <BrandsPageContent />;
}
