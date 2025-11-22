'use server';

import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import type { BrandWebsiteMenuSettings } from '@/lib/types/brandWebsite';
import { brandWebsiteMenuSettingsSchema } from '@/lib/superadmin/brand-website/menu-settings-schemas';

const menuSettingsPath = (brandId: string) => `/brands/${brandId}/website/menuSettings`;

const VIRTUAL_MENU_SETTINGS: BrandWebsiteMenuSettings = {
  hero: null,
  gridLayout: 3,
  showPrice: true,
  showDescription: true,
  stickyCategories: true,
  defaultLocationId: null,
  updatedAt: null,
};


/**
 * Fetches and validates the public menu settings for a brand.
 *
 * @param brandId The ID of the brand.
 * @returns The validated menu settings, or null if the document doesn't exist.
 */
export async function getPublicBrandWebsiteMenuSettings(brandId: string): Promise<BrandWebsiteMenuSettings | null> {
  const db = getAdminDb();
  const docRef = db.doc(menuSettingsPath(brandId));
  const docSnap = await docRef.get();

  if (!docSnap.exists) {
    return null; // Per spec, return null if no settings document exists.
  }

  try {
    const data = docSnap.data() ?? {};
    const merged = { ...VIRTUAL_MENU_SETTINGS, ...data };
    const validated = brandWebsiteMenuSettingsSchema.parse(merged);
    return {
      ...validated,
      updatedAt: data.updatedAt || null,
    } as BrandWebsiteMenuSettings;
  } catch (error) {
    console.error(`[public-menu-settings-api] Validation failed for brand ${brandId}:`, error);
    return null;
  }
}
