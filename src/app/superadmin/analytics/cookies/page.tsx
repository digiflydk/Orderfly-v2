
import { getAnonymousCookieConsents } from './actions';
import { getBrands } from '@/app/superadmin/brands/actions';
import { CookiesClientPage } from './client-page';
import { isAdminReady } from '@/lib/runtime';
import EmptyState from '@/components/ui/empty-state';
import { cookieReportDay } from '@/lib/analytics/cookie-consent-dates';

export const revalidate = 0;

async function CookiesPageContent() {
    const today = cookieReportDay();

    const [consents, brands] = await Promise.all([
        getAnonymousCookieConsents(today, today),
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
                    View cookie consent records across all brands. Dates and times are shown in Europe/Copenhagen.
                </p>
            </div>
            <CookiesClientPage
                initialConsents={consentsWithDetails}
                brands={brands}
                initialDateFrom={today}
                initialDateTo={today}
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
