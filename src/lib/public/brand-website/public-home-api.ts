'use server';

import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import type { BrandWebsiteHome } from '@/lib/types/brandWebsite';
import { brandWebsiteHomeSchema } from '@/lib/superadmin/brand-website/home-schemas';

const homePath = (brandId: string) => `brands/${brandId}/website/home`;

/**
 * Fetches and validates the homepage content for a given brand.
 *
 * @param brandId The ID of the brand.
 * @returns The validated homepage content, or null if the document doesn't exist.
 */
export async function getPublicBrandWebsiteHome(brandId: string): Promise<BrandWebsiteHome | null> {
  const db = getAdminDb();
  const docRef = db.doc(homePath(brandId));
  const docSnap = await docRef.get();

  if (!docSnap.exists) {
    return null;
  }

  try {
    const data = docSnap.data() as Partial<BrandWebsiteHome>;
    const validatedData = brandWebsiteHomeSchema.parse(data);
    return { ...validatedData, updatedAt: data.updatedAt || null };
  } catch (error) {
    console.error(`[public-home-api] Validation failed for brand ${brandId}:`, error);
    return null;
  }
}
