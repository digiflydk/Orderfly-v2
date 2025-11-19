

import { getAnonymousCookieConsents } from './actions';
import { getBrands } from '@/app/superadmin/brands/actions';
import { CookiesClientPage } from './client-page';
import { isAdminReady } from '@/lib/runtime';
import EmptyState from '@/components/ui/empty-state';

export const revalidate = 0;

async function CookiesPageContent() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [consents, brands] = await Promise.all([
        getAnonymousCookieConsents(todayStart, todayEnd),
        getBrands(),
    ]);

    const brandMap = new Map(brands.map(b => [b.id, b.name]));

    const consentsWithDetails = consents.map(consent => ({
        ...consent,
        brandName: brandMap.get(consent.brand_id) || 'Unknown Brand',
    }));

    return (
        <div className="space-y-4">
             <div>
                <h1 className="text-2xl font-bold tracking-tight">Cookie Consent Management</h1>
                <p className="text-muted-foreground">
                    View and manage cookie consents from anonymous users across all brands.
                </p>
            </div>
            <CookiesClientPage
                initialConsents={consentsWithDetails}
                brands={brands}
            />
        </div>
    );
}

export default function CookiesPage() {
    if (!isAdminReady()) {
        return (
            <EmptyState
                title="Admin Environment Not Configured"
                hint="This page requires Firebase Admin credentials, which are not available in this environment."
                details="Set FIREBASE_SERVICE_ACCOUNT_JSON to enable this page."
            />
        );
    }
    return <CookiesPageContent />;
}
