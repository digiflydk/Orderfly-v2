'use server';

import { getAdminDb, admin } from '@/lib/firebase-admin';

export interface BrandWebsiteApiLogEntry {
  module: 'brand-website';
  layer: 'cms' | 'public';
  action: string;
  brandId?: string | null;
  status: 'success' | 'error';
  errorMessage?: string | null;
  durationMs?: number | null;
  path?: string | null;
  timestamp?: any;
}

// simple config toggles
const brandWebsiteApiLoggingConfig = {
  enabled: true,
  cmsEnabled: true,
  publicEnabled: true,
  // optional per-action flags:
  actions: {} as Record<string, boolean>,
};

export async function logBrandWebsiteApiCall(
  entry: Omit<BrandWebsiteApiLogEntry, 'module' | 'timestamp'>
): Promise<void> {
  if (!brandWebsiteApiLoggingConfig.enabled) return;

  if (entry.layer === 'cms' && !brandWebsiteApiLoggingConfig.cmsEnabled) return;
  if (entry.layer === 'public' && !brandWebsiteApiLoggingConfig.publicEnabled) return;

  const actionEnabled = brandWebsiteApiLoggingConfig.actions[entry.action];
  if (actionEnabled === false) return;
  
  try {
    const db = getAdminDb();
    const ref = db.collection('/dadmin/developer/logs').doc();
    await ref.set({
      ...entry,
      module: 'brand-website',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error("Failed to write API log entry:", error);
    // Do not throw to avoid failing the primary operation
  }
}
