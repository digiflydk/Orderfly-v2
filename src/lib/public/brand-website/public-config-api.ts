
'use server';

import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import {
  VIRTUAL_CONFIG,
  serializeTimestamp,
} from '@/lib/brand-website/utils/public-config-helpers';
import type { BrandWebsiteConfig } from '@/lib/types/brandWebsite';

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

export async function getPublicBrandWebsiteConfig(
  brandId: string
): Promise<BrandWebsiteConfig> {
  try {
    const result = await readConfig(brandId);
    return result;
  } catch (error: any) {
    console.error('getPublicBrandWebsiteConfig failed:', error);
    // Return a safe fallback to prevent crashes on public pages
    return { ...VIRTUAL_CONFIG, domains: [brandId] };
  }
}
