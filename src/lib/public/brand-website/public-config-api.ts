'use server';

import 'server-only';
import type { BrandWebsiteConfig } from '@/lib/types/brandWebsite';
import { getAdminDb } from '@/lib/firebase-admin';
import { brandWebsiteConfigBaseSchema, brandWebsiteDesignSystemSchema, brandWebsiteLegalSchema, brandWebsiteSeoSchema, brandWebsiteSocialSchema, brandWebsiteTrackingSchema } from '@/lib/superadmin/brand-website/config-schemas';
import { z } from 'zod';

const publicConfigSchema = z.object({
  domains: z.array(z.string()).optional(),
  designSystem: brandWebsiteDesignSystemSchema.optional(),
  seo: brandWebsiteSeoSchema.optional(),
  social: brandWebsiteSocialSchema.optional(),
  tracking: brandWebsiteTrackingSchema.optional(),
  legal: brandWebsiteLegalSchema.optional(),
});


export async function getPublicBrandWebsiteConfig(
  brandId: string
): Promise<Partial<BrandWebsiteConfig> | null> {
  const db = getAdminDb();
  const docRef = db.doc(`/brands/${brandId}/website/config`);
  const docSnap = await docRef.get();

  if (!docSnap.exists) {
    return null;
  }

  const data = docSnap.data();
  const validated = publicConfigSchema.parse(data);

  return {
    domains: validated.domains || [],
    designSystem: validated.designSystem || {},
    seo: validated.seo || {},
    social: validated.social || {},
    tracking: validated.tracking || {},
    legal: validated.legal || {},
  };
}
