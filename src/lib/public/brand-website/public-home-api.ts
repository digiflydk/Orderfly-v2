
'use server';

import { getAdminDb } from '@/lib/firebase-admin';
import type { BrandWebsiteHome } from '@/lib/types/brandWebsite';
import { brandWebsiteHomeSchema } from '@/lib/superadmin/brand-website/home-schemas';
import { logBrandWebsiteApiCall } from '@/lib/developer/brand-website-api-logger';

export async function getPublicBrandWebsiteHome(brandId: string): Promise<BrandWebsiteHome | null> {
    const start = Date.now();
    const path = `/brands/${brandId}/website/home`;
    try {
        const db = getAdminDb();
        const docSnap = await db.doc(path).get();

        if (!docSnap.exists) {
            await logBrandWebsiteApiCall({ layer: 'public', action: 'getPublicBrandWebsiteHome', brandId, status: 'success', durationMs: Date.now() - start, path });
            return null;
        }

        const data = docSnap.data() as BrandWebsiteHome;
        const validated = brandWebsiteHomeSchema.parse(data);
        
        await logBrandWebsiteApiCall({ layer: 'public', action: 'getPublicBrandWebsiteHome', brandId, status: 'success', durationMs: Date.now() - start, path });
        return validated;

    } catch (error: any) {
        await logBrandWebsiteApiCall({ layer: 'public', action: 'getPublicBrandWebsiteHome', brandId, status: 'error', durationMs: Date.now() - start, path, errorMessage: error?.message ?? 'Unknown error' });
        return null;
    }
}
