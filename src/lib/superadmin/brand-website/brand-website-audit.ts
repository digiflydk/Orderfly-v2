'use server';

import { getAdminDb, admin } from '@/lib/firebase-admin';

export async function logBrandWebsiteAuditEntry(entry: {
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
}): Promise<void> {
  try {
    const db = getAdminDb();
    const ref = db.collection('auditLogs').doc();
    const payload = {
      ...entry,
      module: 'brand-website',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      performedBy: entry.performedBy ?? { userId: null, email: null, role: 'superadmin' }
    };
    await ref.set(payload);
  } catch (error) {
    console.error('Failed to write audit log entry:', error);
    // Do not throw to avoid failing the primary operation
  }
}
