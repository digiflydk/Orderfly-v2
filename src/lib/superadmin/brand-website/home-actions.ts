
'use server';

import { getAdminDb, admin } from '@/lib/firebase-admin';
import { requireSuperadmin } from '@/lib/auth/superadmin';
import type { BrandWebsiteHome } from '@/lib/types/brandWebsite';
import {
  brandWebsiteHomeSchema,
  brandWebsiteHeroSlideSchema,
  brandWebsitePromoTileSchema,
  brandWebsiteCampaignBannerSchema,
  brandWebsiteMenuPreviewItemSchema,
  brandWebsiteFooterCtaSchema,
  type BrandWebsiteHeroSlideInput,
  type BrandWebsitePromoTileInput,
  type BrandWebsiteCampaignBannerInput,
  type BrandWebsiteMenuPreviewItemInput,
  type BrandWebsiteFooterCtaInput,
} from './home-schemas';
import type { ZodSchema } from 'zod';
import { z } from 'zod';
import { logBrandWebsiteAuditEntry } from './brand-website-audit';

const homePath = (brandId: string) => `/brands/${brandId}/website/home`;

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
      updatedAt: data.updatedAt || null,
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
  await requireSuperadmin();
  return readHome(brandId);
}

async function savePartial<T>(
  brandId: string,
  field: keyof BrandWebsiteHome,
  data: T,
  schema: ZodSchema<T>
): Promise<BrandWebsiteHome> {
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
    entityId: 'home',
    action: 'update',
    changedFields: [field],
    path: homePath(brandId),
  });

  return result;
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

export async function saveBrandWebsitePromoTiles(
  brandId: string,
  tiles: BrandWebsitePromoTileInput[]
): Promise<BrandWebsiteHome> {
  return savePartial(
    brandId,
    'promoTiles',
    tiles,
    brandWebsitePromoTileSchema.array()
  );
}

export async function saveBrandWebsiteCampaignBanner(
  brandId: string,
  banner: BrandWebsiteCampaignBannerInput | null
): Promise<BrandWebsiteHome> {
  return savePartial(
    brandId,
    'campaignBanner',
    banner,
    brandWebsiteCampaignBannerSchema.nullable()
  );
}

export async function saveBrandWebsiteMenuPreview(
  brandId: string,
  items: BrandWebsiteMenuPreviewItemInput[]
): Promise<BrandWebsiteHome> {
  return savePartial(
    brandId,
    'menuPreview',
    items,
    brandWebsiteMenuPreviewItemSchema.array()
  );
}

export async function saveBrandWebsiteFooterCta(
  brandId: string,
  cta: BrandWebsiteFooterCtaInput | null
): Promise<BrandWebsiteHome> {
  return savePartial(
    brandId,
    'footerCta',
    cta,
    brandWebsiteFooterCtaSchema.nullable()
  );
}
