'use server';

import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import type { BrandWebsiteConfig } from '@/lib/types/brandWebsite';
import { brandWebsiteConfigBaseSchema, brandWebsiteDesignSystemSchema, brandWebsiteSeoSchema, brandWebsiteSocialSchema, brandWebsiteTrackingSchema, brandWebsiteLegalSchema } from '@/lib/superadmin/brand-website/config-schemas';
import { z } from 'zod';

const configPath = (brandId: string) => `brands/${brandId}/website/config`;

/**
 * Fetches and validates the public-safe portion of a brand's website configuration.
 *
 * @param brandId The ID of the brand.
 * @returns A validated BrandWebsiteConfig object with CMS-only fields removed, or null if not found/inactive.
 */
export async function getPublicBrandWebsiteConfig(brandId: string): Promise<Partial<BrandWebsiteConfig> | null> {
  const db = getAdminDb();
  const docRef = db.doc(configPath(brandId));
  const docSnap = await docRef.get();

  if (!docSnap.exists) {
    return null;
  }

  const data = docSnap.data() as Partial<BrandWebsiteConfig>;
  
  // Only return public-safe data
  if (!data.active) {
    return null;
  }

  const publicConfigSchema = z.object({
      domains: z.array(z.string()).default([]),
      defaultLocationId: z.string().nullable().default(null),
      designSystem: brandWebsiteDesignSystemSchema,
      seo: brandWebsiteSeoSchema,
      social: brandWebsiteSocialSchema,
      tracking: brandWebsiteTrackingSchema,
      legal: brandWebsiteLegalSchema,
  });

  const validated = publicConfigSchema.safeParse(data);

  if (!validated.success) {
      console.error(`[public-config-api] Validation failed for brand ${brandId}:`, validated.error);
      return null;
  }

  return validated.data;
}
