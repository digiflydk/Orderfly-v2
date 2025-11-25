
'use server';

import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import type { BrandWebsiteConfig } from '@/lib/types/brandWebsite';
import { logBrandWebsiteApiCall } from '@/lib/developer/brand-website-api-logger';
import { serializeTimestamp, VIRTUAL_CONFIG } from '@/lib/brand-website/utils/public-config-helpers';

async function readConfig(brandId: string): Promise<BrandWebsiteConfig> {
  const db = getAdminDb();
  const docRef = db.doc(`brands/${brandId}/website/config`);
  const docSnap = await docRef.get();

  if (!docSnap.exists) {
    return VIRTUAL_CONFIG;
  }

  const data = docSnap.data() as Partial<BrandWebsiteConfig>;

  return {
    ...VIRTUAL_CONFIG,
    ...data,
    updatedAt: serializeTimestamp(data.updatedAt),
  };
}


export async function getPublicBrandWebsiteConfig(brandId: string): Promise<BrandWebsiteConfig> {
  const start = Date.now();
  const action = 'getPublicBrandWebsiteConfig';
  try {
    const result = await readConfig(brandId);
    await logBrandWebsiteApiCall({
        layer: 'public', action, brandId, status: 'success', durationMs: Date.now() - start
    });
    return result;
  } catch (error: any) {
    await logBrandWebsiteApiCall({
        layer: 'public', action, brandId, status: 'error', durationMs: Date.now() - start, errorMessage: error?.message ?? 'Unknown error'
    });
    throw error;
  }
}

