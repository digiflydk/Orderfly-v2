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

export async function logBrandWebsiteAuditEntry(
  entry: Omit<BrandWebsiteAuditEntry, 'module' | 'timestamp'>
): Promise<void> {
  try {
    const db = getAdminDb();
    const ref = db.collection('auditLogs').doc();
    
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
