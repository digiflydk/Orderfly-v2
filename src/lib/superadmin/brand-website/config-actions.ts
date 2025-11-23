
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
import { requireSuperadmin } from '@/lib/auth/superadmin';
import type { ZodSchema } from 'zod';
import { logBrandWebsiteAuditEntry } from './brand-website-audit';


const configPath = (brandId: string) => `/brands/${brandId}/website/config`;

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
  
  return readConfig(brandId);
}

export async function getBrandWebsiteConfig(brandId: string): Promise<BrandWebsiteConfig> {
  await requireSuperadmin();
  return readConfig(brandId);
}

export async function saveBrandWebsiteConfig(brandId: string, input: SaveBrandWebsiteConfigInput): Promise<BrandWebsiteConfig> {
  const user = await requireSuperadmin();
  const validatedInput = brandWebsiteConfigBaseSchema.parse(input);
  const currentConfig = await readConfig(brandId);

  const mergedConfig: Partial<BrandWebsiteConfig> = {
    ...currentConfig,
    ...validatedInput,
  };

  const result = await writeConfig(brandId, mergedConfig);

  await logBrandWebsiteAuditEntry({
    brandId,
    entity: 'config',
    entityId: 'config',
    action: 'update',
    user,
    changedFields: ['config'],
    path: configPath(brandId),
  });

  return result;
}

async function savePartial<T>(
    brandId: string,
    field: keyof BrandWebsiteConfig,
    data: T,
    schema: ZodSchema<T>
): Promise<BrandWebsiteConfig> {
    const user = await requireSuperadmin();
    const validatedInput = schema.parse(data);
    const currentConfig = await readConfig(brandId);
    
    const newConfig: BrandWebsiteConfig = {
        ...currentConfig,
        [field]: {
            ...(currentConfig[field] as object || {}),
            ...validatedInput,
        },
    };
    const result = await writeConfig(brandId, newConfig);

    await logBrandWebsiteAuditEntry({
        brandId,
        entity: 'config',
        entityId: 'config',
        action: 'update',
        user,
        changedFields: [field],
        path: configPath(brandId),
    });

    return result;
}


export async function saveBrandWebsiteDesignSystem(brandId: string, input: DesignSystemInput): Promise<BrandWebsiteConfig> {
  return savePartial(brandId, 'designSystem', input, brandWebsiteDesignSystemSchema);
}

export async function saveBrandWebsiteSeo(brandId: string, input: SeoInput): Promise<BrandWebsiteConfig> {
  return savePartial(brandId, 'seo', input, brandWebsiteSeoSchema);
}

export async function saveBrandWebsiteSocial(brandId: string, input: SocialInput): Promise<BrandWebsiteConfig> {
  return savePartial(brandId, 'social', input, brandWebsiteSocialSchema);
}

export async function saveBrandWebsiteTracking(brandId: string, input: TrackingInput): Promise<BrandWebsiteConfig> {
  return savePartial(brandId, 'tracking', input, brandWebsiteTrackingSchema);
}

export async function saveBrandWebsiteLegal(brandId: string, input: LegalInput): Promise<BrandWebsiteConfig> {
  return savePartial(brandId, 'legal', input, brandWebsiteLegalSchema);
}
