
'use server';

import { getAdminDb } from '@/lib/firebase-admin';
import type { BrandWebsiteConfig } from '@/lib/types/brandWebsite';
import { brandWebsiteConfigBaseSchema, brandWebsiteDesignSystemSchema, brandWebsiteSeoSchema, brandWebsiteSocialSchema, brandWebsiteTrackingSchema, brandWebsiteLegalSchema } from '@/lib/superadmin/brand-website/config-schemas';
import { logBrandWebsiteApiCall } from '@/lib/developer/brand-website-api-logger';
import { z } from 'zod';

const publicConfigSchema = z.object({
  domains: z.array(z.string()).optional().default([]),
  designSystem: brandWebsiteDesignSystemSchema.optional().default({}),
  seo: brandWebsiteSeoSchema.optional().default({}),
  social: brandWebsiteSocialSchema.optional().default({}),
  tracking: brandWebsiteTrackingSchema.optional().default({}),
  legal: brandWebsiteLegalSchema.optional().default({}),
});

export async function getPublicBrandWebsiteConfig(brandId: string): Promise<Partial<BrandWebsiteConfig> | null> {
    const start = Date.now();
    const path = `/brands/${brandId}/website/config`;
    try {
        const db = getAdminDb();
        const docSnap = await db.doc(path).get();
        if (!docSnap.exists) {
            await logBrandWebsiteApiCall({ layer: 'public', action: 'getPublicBrandWebsiteConfig', brandId, status: 'success', durationMs: Date.now() - start, path });
            return null;
        }

        const data = docSnap.data();
        const validated = publicConfigSchema.parse(data);

        await logBrandWebsiteApiCall({ layer: 'public', action: 'getPublicBrandWebsiteConfig', brandId, status: 'success', durationMs: Date.now() - start, path });
        return validated;

    } catch (error: any) {
        await logBrandWebsiteApiCall({ layer: 'public', action: 'getPublicBrandWebsiteConfig', brandId, status: 'error', durationMs: Date.now() - start, path, errorMessage: error?.message ?? 'Unknown error' });
        // Don't throw in public API, just return null
        return null;
    }
}
