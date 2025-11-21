
'use server';

import 'server-only';
import { getAdminDb, getAdminFieldValue } from '@/lib/firebase-admin';
import { requireSuperadmin } from '@/lib/auth/superadmin';
import type { BrandWebsiteConfig } from '@/lib/types/brandWebsite';
import {
  brandWebsiteConfigBaseSchema,
  brandWebsiteDesignSystemSchema,
  brandWebsiteSeoSchema,
  brandWebsiteSocialSchema,
  brandWebsiteTrackingSchema,
  brandWebsiteLegalSchema,
  type SaveBrandWebsiteConfigInput,
  type DesignSystemInput,
  type SeoInput,
  type SocialInput,
  type TrackingInput,
  type LegalInput,
} from './config-schemas';

const CONFIG_PATH = (brandId: string) => `brands/${brandId}/website/config`;

const VIRTUAL_CONFIG: BrandWebsiteConfig = {
  active: false,
  template: 'template-1',
  domains: [],
  defaultLocationId: null,
  designSystem: {},
  seo: {},
  social: {},
  tracking: {},
  legal: {},
  updatedAt: null,
};

/**
 * Retrieves the website configuration for a given brand.
 * Returns a default configuration object if no document exists.
 */
export async function getBrandWebsiteConfig(brandId: string): Promise<BrandWebsiteConfig> {
  await requireSuperadmin(); // Auth check
  const db = getAdminDb();
  const docRef = db.doc(CONFIG_PATH(brandId));
  const docSnap = await docRef.get();

  if (!docSnap.exists) {
    return VIRTUAL_CONFIG;
  }

  const data = docSnap.data() as BrandWebsiteConfig;
  return {
    ...VIRTUAL_CONFIG, // Ensure all keys are present
    ...data,
  };
}

/**
 * Saves the base configuration for a brand's website.
 */
export async function saveBrandWebsiteConfig(brandId: string, input: SaveBrandWebsiteConfigInput): Promise<BrandWebsiteConfig> {
  const validated = brandWebsiteConfigBaseSchema.safeParse(input);
  if (!validated.success) {
    throw new Error(`Validation failed: ${validated.error.message}`);
  }

  const currentConfig = await getBrandWebsiteConfig(brandId);
  const updatedConfig = { ...currentConfig, ...validated.data };
  
  const db = getAdminDb();
  const docRef = db.doc(CONFIG_PATH(brandId));
  await docRef.set({ ...updatedConfig, updatedAt: getAdminFieldValue().serverTimestamp() }, { merge: true });

  return getBrandWebsiteConfig(brandId);
}


/**
 * Merges and saves Design System settings.
 */
export async function saveBrandWebsiteDesignSystem(brandId: string, input: DesignSystemInput): Promise<BrandWebsiteConfig> {
    const validated = brandWebsiteDesignSystemSchema.safeParse(input);
    if (!validated.success) {
        throw new Error(`Validation failed: ${validated.error.message}`);
    }
    const currentConfig = await getBrandWebsiteConfig(brandId);
    const updatedConfig = {
        ...currentConfig,
        designSystem: { ...currentConfig.designSystem, ...validated.data },
    };
    
    const db = getAdminDb();
    const docRef = db.doc(CONFIG_PATH(brandId));
    await docRef.set({ ...updatedConfig, updatedAt: getAdminFieldValue().serverTimestamp() }, { merge: true });

    return getBrandWebsiteConfig(brandId);
}

/**
 * Merges and saves SEO settings.
 */
export async function saveBrandWebsiteSeo(brandId: string, input: SeoInput): Promise<BrandWebsiteConfig> {
    const validated = brandWebsiteSeoSchema.safeParse(input);
    if (!validated.success) {
        throw new Error(`Validation failed: ${validated.error.message}`);
    }
    const currentConfig = await getBrandWebsiteConfig(brandId);
    const updatedConfig = {
        ...currentConfig,
        seo: { ...currentConfig.seo, ...validated.data },
    };
    
    const db = getAdminDb();
    const docRef = db.doc(CONFIG_PATH(brandId));
    await docRef.set({ ...updatedConfig, updatedAt: getAdminFieldValue().serverTimestamp() }, { merge: true });
    
    return getBrandWebsiteConfig(brandId);
}

/**
 * Merges and saves Social settings.
 */
export async function saveBrandWebsiteSocial(brandId: string, input: SocialInput): Promise<BrandWebsiteConfig> {
    const validated = brandWebsiteSocialSchema.safeParse(input);
    if (!validated.success) {
        throw new Error(`Validation failed: ${validated.error.message}`);
    }
    const currentConfig = await getBrandWebsiteConfig(brandId);
    const updatedConfig = {
        ...currentConfig,
        social: { ...currentConfig.social, ...validated.data },
    };

    const db = getAdminDb();
    const docRef = db.doc(CONFIG_PATH(brandId));
    await docRef.set({ ...updatedConfig, updatedAt: getAdminFieldValue().serverTimestamp() }, { merge: true });

    return getBrandWebsiteConfig(brandId);
}

/**
 * Merges and saves Tracking settings.
 */
export async function saveBrandWebsiteTracking(brandId: string, input: TrackingInput): Promise<BrandWebsiteConfig> {
    const validated = brandWebsiteTrackingSchema.safeParse(input);
    if (!validated.success) {
        throw new Error(`Validation failed: ${validated.error.message}`);
    }
    const currentConfig = await getBrandWebsiteConfig(brandId);
    const updatedConfig = {
        ...currentConfig,
        tracking: { ...currentConfig.tracking, ...validated.data },
    };

    const db = getAdminDb();
    const docRef = db.doc(CONFIG_PATH(brandId));
    await docRef.set({ ...updatedConfig, updatedAt: getAdminFieldValue().serverTimestamp() }, { merge: true });

    return getBrandWebsiteConfig(brandId);
}

/**
 * Merges and saves Legal settings.
 */
export async function saveBrandWebsiteLegal(brandId: string, input: LegalInput): Promise<BrandWebsiteConfig> {
    const validated = brandWebsiteLegalSchema.safeParse(input);
    if (!validated.success) {
        throw new Error(`Validation failed: ${validated.error.message}`);
    }
    const currentConfig = await getBrandWebsiteConfig(brandId);
    const updatedConfig = {
        ...currentConfig,
        legal: { ...currentConfig.legal, ...validated.data },
    };

    const db = getAdminDb();
    const docRef = db.doc(CONFIG_PATH(brandId));
    await docRef.set({ ...updatedConfig, updatedAt: getAdminFieldValue().serverTimestamp() }, { merge: true });

    return getBrandWebsiteConfig(brandId);
}
