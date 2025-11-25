
'use server';

import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import type { BrandWebsiteConfig } from '@/lib/types/brandWebsite';
import { VIRTUAL_CONFIG, resolveLinkClass } from '@/lib/brand-website/utils/public-config-helpers';

function serializeTimestamp(value: any): string | null {
  if (!value) return null;
  // Runtime-safe check for Firestore Timestamp
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
  try {
    return await readConfig(brandId);
  } catch (error) {
    console.error(`Failed to get public brand config for ${brandId}:`, error);
    return VIRTUAL_CONFIG;
  }
}
