'use server';

import { getAdminDb, admin } from '@/lib/firebase-admin';
import type { User } from '@/types';

export async function logBrandWebsiteAuditEntry(entry: {
  brandId: string;
  entity: 'config' | 'home' | 'page' | 'menuSettings';
  entityId: string;
  action: 'create' | 'update' | 'delete';
  user?: User | null;
  changedFields?: string[];
  path: string;
}): Promise<void> {
  try {
    const db = getAdminDb();
    const ref = db.collection('auditLogs').doc();
    const { user, ...restOfEntry } = entry;
    const payload = {
      ...restOfEntry,
      module: 'brand-website',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      performedBy: {
        userId: user?.id ?? null,
        email: user?.email ?? null,
        role: user?.isSuperAdmin ? 'superadmin' : (user?.roleIds?.[0] ?? 'unknown'),
      },
    };
    await ref.set(payload);
  } catch (error) {
    console.error('Failed to write audit log entry:', error);
    // Do not throw to avoid failing the primary operation
  }
}
