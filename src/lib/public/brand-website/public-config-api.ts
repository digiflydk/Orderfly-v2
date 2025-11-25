
'use server';

import 'server-only';
import { getAdminDb, admin } from '@/lib/firebase-admin';
import type { BrandWebsiteConfig } from '@/lib/types/brandWebsite';
import { VIRTUAL_CONFIG } from './public-config-helpers';

function serializeTimestamp(value: any): string | null {
  if (!value) return null;

  if (typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  return null;
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

export async function getPublicBrandWebsiteConfig(brandId: string): Promise<BrandWebsiteConfig> {
  // Public-facing API should not throw errors, but return defaults.
  // It also does NOT require superadmin access.
  try {
    const result = await readConfig(brandId);
    return result;
  } catch (error: any) {
    console.error(`[public-config-api] Failed to read config for brand ${brandId}:`, error.message);
    return VIRTUAL_CONFIG;
  }
}
