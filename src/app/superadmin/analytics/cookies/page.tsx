

import { getAnonymousCookieConsents } from './actions';
import { getBrands } from '@/app/superadmin/brands/actions';
import { CookiesClientPage } from './client-page';

export const revalidate = 0;

export default async function CookiesPage() {
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
