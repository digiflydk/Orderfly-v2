
'use server';

import { getAdminDb, admin } from '@/lib/firebase-admin';
import type { BrandWebsiteConfig } from '@/lib/types/brandWebsite';
import { 
  brandWebsiteConfigBaseSchema,
  brandWebsiteDesignSystemSchema,
  brandWebsiteSeoSchema,
  brandWebsiteSocialSchema,
  brandWebsiteTrackingSchema,
  brandWebsiteLegalSchema,
  type DesignSystemInput,
  type SeoInput,
  type SocialInput,
  type TrackingInput,
  type LegalInput,
  type SaveBrandWebsiteConfigInput
} from './config-schemas';

const configPath = (brandId: string) => `brands/${brandId}/website/config`;

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

async function readConfig(brandId: string): Promise<BrandWebsiteConfig> {
  const db = getAdminDb();
  const docRef = db.doc(configPath(brandId));
  const docSnap = await docRef.get();

  if (!docSnap.exists) {
    return VIRTUAL_CONFIG;
  }

  const data = docSnap.data() as Partial<BrandWebsiteConfig>;

  // Ensure all sub-objects exist
  return {
    ...VIRTUAL_CONFIG,
    ...data,
    designSystem: data.designSystem || {},
    seo: data.seo || {},
    social: data.social || {},
    tracking: data.tracking || {},
    legal: data.legal || {},
  };
}

async function writeConfig(brandId: string, data: Partial<BrandWebsiteConfig>): Promise<BrandWebsiteConfig> {
  const db = getAdminDb();
  const docRef = db.doc(configPath(brandId));
  
  const updatedData = {
    ...data,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await docRef.set(updatedData, { merge: true });
  
  // Re-read to get the final state with server timestamp
  return readConfig(brandId);
}

export async function getBrandWebsiteConfig(brandId: string): Promise<BrandWebsiteConfig> {
  // TODO: Add superadmin/brand-admin auth check
  return readConfig(brandId);
}

export async function saveBrandWebsiteConfig(brandId: string, input: SaveBrandWebsiteConfigInput): Promise<BrandWebsiteConfig> {
  const validatedInput = brandWebsiteConfigBaseSchema.parse(input);
  const currentConfig = await readConfig(brandId);

  const mergedConfig: Partial<BrandWebsiteConfig> = {
    ...currentConfig,
    ...validatedInput,
  };

  return writeConfig(brandId, mergedConfig);
}

export async function saveBrandWebsiteDesignSystem(brandId: string, input: DesignSystemInput): Promise<BrandWebsiteConfig> {
    const validatedInput = brandWebsiteDesignSystemSchema.parse(input);
    const currentConfig = await readConfig(brandId);
    
    const newConfig: BrandWebsiteConfig = {
        ...currentConfig,
        designSystem: {
            ...currentConfig.designSystem,
            ...validatedInput,
        },
    };
    return writeConfig(brandId, newConfig);
}

export async function saveBrandWebsiteSeo(brandId: string, input: SeoInput): Promise<BrandWebsiteConfig> {
    const validatedInput = brandWebsiteSeoSchema.parse(input);
    const currentConfig = await readConfig(brandId);
    
    const newConfig: BrandWebsiteConfig = {
        ...currentConfig,
        seo: {
            ...currentConfig.seo,
            ...validatedInput,
        },
    };
    return writeConfig(brandId, newConfig);
}

export async function saveBrandWebsiteSocial(brandId: string, input: SocialInput): Promise<BrandWebsiteConfig> {
    const validatedInput = brandWebsiteSocialSchema.parse(input);
    const currentConfig = await readConfig(brandId);
    
    const newConfig: BrandWebsiteConfig = {
        ...currentConfig,
        social: {
            ...currentConfig.social,
            ...validatedInput,
        },
    };
    return writeConfig(brandId, newConfig);
}

export async function saveBrandWebsiteTracking(brandId: string, input: TrackingInput): Promise<BrandWebsiteConfig> {
    const validatedInput = brandWebsiteTrackingSchema.parse(input);
    const currentConfig = await readConfig(brandId);

    const newConfig: BrandWebsiteConfig = {
        ...currentConfig,
        tracking: {
            ...currentConfig.tracking,
            ...validatedInput,
        },
    };
    return writeConfig(brandId, newConfig);
}

export async function saveBrandWebsiteLegal(brandId: string, input: LegalInput): Promise<BrandWebsiteConfig> {
    const validatedInput = brandWebsiteLegalSchema.parse(input);
    const currentConfig = await readConfig(brandId);
    
    const newConfig: BrandWebsiteConfig = {
        ...currentConfig,
        legal: {
            ...currentConfig.legal,
            ...validatedInput,
        },
    };
    return writeConfig(brandId, newConfig);
}
