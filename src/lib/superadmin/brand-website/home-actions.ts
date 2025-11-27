
'use server';

import { getAdminDb, admin } from '@/lib/firebase-admin';
import { requireSuperadmin } from '@/lib/auth/superadmin';
import type { BrandWebsiteHome } from '@/types';
import {
  brandWebsiteHomeSchema,
  brandWebsiteHeroSlideSchema,
  type BrandWebsiteHeroSlideInput,
} from './home-schemas';
import type { ZodSchema } from 'zod';
import { z } from 'zod';
import { logBrandWebsiteAuditEntry } from './brand-website-audit';
import { logBrandWebsiteApiCall } from '@/lib/developer/brand-website-api-logger';
import { serializeTimestamp } from './config-utils';

const homePath = (brandId: string) => `brands/${brandId}/website/home`;

const VIRTUAL_HOME: BrandWebsiteHome = {
  hero: [],
  promoTiles: [],
  campaignBanner: null,
  menuPreview: [],
  footerCta: null,
  updatedAt: null,
};

async function readHome(brandId: string): Promise<BrandWebsiteHome> {
  const db = getAdminDb();
  const docRef = db.doc(homePath(brandId));
  const docSnap = await docRef.get();

  if (!docSnap.exists) {
    return VIRTUAL_HOME;
  }
  
  const data = docSnap.data() ?? {};
  const merged = { ...VIRTUAL_HOME, ...data };
  
  const validated = brandWebsiteHomeSchema.parse(merged);
  
  return {
    ...validated,
    updatedAt: serializeTimestamp(data.updatedAt),
  } as BrandWebsiteHome;
}

async function writeHome(
  brandId: string,
  data: Partial<BrandWebsiteHome>
): Promise<BrandWebsiteHome> {
  const db = getAdminDb();
  const docRef = db.doc(homePath(brandId));

  const updatedData = {
    ...data,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await docRef.set(updatedData, { merge: true });
  return readHome(brandId);
}

export async function getBrandWebsiteHome(
  brandId: string
): Promise<BrandWebsiteHome> {
  const start = Date.now();
  const action = 'getBrandWebsiteHome';
  try {
    await requireSuperadmin();
    const result = await readHome(brandId);
    await logBrandWebsiteApiCall({
        layer: 'cms', action, brandId, status: 'success', durationMs: Date.now() - start, path: homePath(brandId)
    });
    return result;
  } catch(error: any) {
    await logBrandWebsiteApiCall({
        layer: 'cms', action, brandId, status: 'error', durationMs: Date.now() - start, path: homePath(brandId), errorMessage: error?.message ?? 'Unknown error'
    });
    throw error;
  }
}

async function savePartial<T>(
  brandId: string,
  field: keyof BrandWebsiteHome,
  data: T,
  schema: ZodSchema<T>
): Promise<BrandWebsiteHome> {
    const start = Date.now();
    const actionName = `saveBrandWebsite${field.charAt(0).toUpperCase() + field.slice(1)}`;
    try {
        await requireSuperadmin();
        const validatedData = schema.parse(data);
        const currentHome = await readHome(brandId);
        const newHome = {
            ...currentHome,
            [field]: validatedData,
        };
        const result = await writeHome(brandId, newHome);

        await logBrandWebsiteAuditEntry({
            brandId,
            entity: 'home',
            entityId: 'homepage',
            action: 'update',
            changedFields: [field],
            path: homePath(brandId),
        });

        await logBrandWebsiteApiCall({
            layer: 'cms', action: actionName, brandId, status: 'success', durationMs: Date.now() - start, path: homePath(brandId)
        });

        return result;
    } catch(error: any) {
        await logBrandWebsiteApiCall({
            layer: 'cms', action: actionName, brandId, status: 'error', durationMs: Date.now() - start, path: homePath(brandId), errorMessage: error?.message ?? 'Unknown error'
        });
        throw error;
    }
}


export async function saveBrandWebsiteHero(
  brandId: string,
  slides: BrandWebsiteHeroSlideInput[]
): Promise<BrandWebsiteHome> {
  return savePartial(
    brandId,
    'hero',
    slides,
    brandWebsiteHeroSlideSchema.array()
  );
}

// Stubs for other sections to be implemented later
export async function saveBrandWebsitePromoTiles(brandId: string, tiles: any[]): Promise<BrandWebsiteHome> {
  return savePartial(brandId, 'promoTiles', tiles, z.array(z.any()));
}
export async function saveBrandWebsiteCampaignBanner(brandId: string, banner: any | null): Promise<BrandWebsiteHome> {
  return savePartial(brandId, 'campaignBanner', banner, z.any().nullable());
}
export async function saveBrandWebsiteMenuPreview(brandId: string, items: any[]): Promise<BrandWebsiteHome> {
  return savePartial(brandId, 'menuPreview', items, z.array(z.any()));
}
export async function saveBrandWebsiteFooterCta(brandId: string, cta: any | null): Promise<BrandWebsiteHome> {
  return savePartial(brandId, 'footerCta', cta, z.any().nullable());
}
