'use server';

import { getAdminDb } from '@/lib/firebase-admin';
import type { BrandWebsiteConfig } from '@/lib/types/brandWebsite';
import { VIRTUAL_CONFIG } from './public-config-helpers';

function serializeTimestamp(value: any): string | null {
  if (!value) return null;
  if (value instanceof admin.firestore.Timestamp) {
    return value.toDate().toISOString();
  }
  return value as any;
}

const configPath = (brandId: string) => `brands/${brandId}/website/config`;

async function readConfig(brandId: string): Promise<BrandWebsiteConfig> {
  const db = getAdminDb();
  const docRef = db.doc(configPath(brandId));
  const docSnap = await docRef.get();

  if (!docSnap.exists) {
    return VIRTUAL_CONFIG;
  }

  const data = docSnap.data() as Partial<BrandWebsiteConfig>;

  return {
    ...VIRTUAL_CONFIG,
    ...data,
    designSystem: data.designSystem || {},
    seo: data.seo || {},
    social: data.social || {},
    tracking: data.tracking || {},
    legal: data.legal || {},
    updatedAt: serializeTimestamp(data.updatedAt),
  };
}

export async function getPublicBrandWebsiteConfig(brandSlug: string): Promise<BrandWebsiteConfig> {
    const db = getAdminDb();
    const brandQuery = await db.collection('brands').where('slug', '==', brandSlug).limit(1).get();
    if (brandQuery.empty) {
        throw new Error(`Brand with slug "${brandSlug}" not found.`);
    }
    const brandId = brandQuery.docs[0].id;
    return readConfig(brandId);
}
