
'use server';

import { getAdminDb, admin } from '@/lib/firebase-admin';
import type { User } from '@/types';
import { getSuperadminUserContext } from '@/lib/auth/superadmin-context';

export interface BrandWebsiteAuditEntry {
  module: 'brand-website';
  brandId: string;
  entity: 'config' | 'home' | 'page' | 'menuSettings';
  entityId: string;
  action: 'create' | 'update' | 'delete';
  performedBy?: {
    userId?: string | null;
    email?: string | null;
    role?: string | null;
  };
  changedFields?: string[];
  path: string;
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

export async function logBrandWebsiteAuditEntry(
  entry: Omit<BrandWebsiteAuditEntry, 'module' | 'timestamp' | 'performedBy'> & { performedBy?: BrandWebsiteAuditEntry['performedBy']}
): Promise<void> {
  if (!brandWebsiteApiLoggingConfig.enabled) return;

  // This is a placeholder for more granular config if needed later
  // if (entry.layer === 'cms' && !brandWebsiteApiLoggingConfig.cmsEnabled) return;
  // if (entry.layer === 'public' && !brandWebsiteApiLoggingConfig.publicEnabled) return;

  const actionEnabled = brandWebsiteApiLoggingConfig.actions[entry.action];
  if (actionEnabled === false) return;
  
  try {
    const db = getAdminDb();
    const ref = db.collection('/auditLogs').doc();
    
    let performedBy = entry.performedBy;
    if (!performedBy) {
        const user = await getSuperadminUserContext();
        performedBy = {
            userId: user.id,
            email: user.email,
            role: user.role ?? 'superadmin',
        };
    }

    const payload = {
      ...entry,
      module: 'brand-website',
      performedBy,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    };
    await ref.set(payload);
  } catch (error) {
    console.error("Failed to write audit log entry:", error);
    // Do not throw to avoid failing the primary operation
  }
}
