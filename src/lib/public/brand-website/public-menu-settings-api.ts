
'use server';

import { getAdminDb } from '@/lib/firebase-admin';
import type { BrandWebsiteMenuSettings } from '@/lib/types/brandWebsite';
import { brandWebsiteMenuSettingsSchema } from '@/lib/superadmin/brand-website/menu-settings-schemas';
import { logBrandWebsiteApiCall } from '@/lib/developer/brand-website-api-logger';

export async function getPublicBrandWebsiteMenuSettings(brandId: string): Promise<BrandWebsiteMenuSettings | null> {
    const start = Date.now();
    const path = `/brands/${brandId}/website/menuSettings`;
    try {
        const db = getAdminDb();
        const docSnap = await db.doc(path).get();
        if (!docSnap.exists) {
            await logBrandWebsiteApiCall({ layer: 'public', action: 'getPublicBrandWebsiteMenuSettings', brandId, status: 'success', durationMs: Date.now() - start, path });
            return null;
        }

        const data = docSnap.data();
        const validated = brandWebsiteMenuSettingsSchema.parse(data);

        await logBrandWebsiteApiCall({ layer: 'public', action: 'getPublicBrandWebsiteMenuSettings', brandId, status: 'success', durationMs: Date.now() - start, path });
        return validated as BrandWebsiteMenuSettings;

    } catch (error: any) {
        await logBrandWebsiteApiCall({ layer: 'public', action: 'getPublicBrandWebsiteMenuSettings', brandId, status: 'error', durationMs: Date.now() - start, path, errorMessage: error?.message ?? 'Unknown error' });
        return null;
    }
}
