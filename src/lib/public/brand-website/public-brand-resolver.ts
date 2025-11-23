
'use server';

import { getAdminDb } from '@/lib/firebase-admin';

export async function resolveBrandByDomain(domain: string): Promise<string | null> {
  if (!domain) return null;

  const db = getAdminDb();

  try {
    const q = db
      .collection('brands')
      .where('website.config.domains', 'array-contains', domain)
      .limit(1);

    const snap = await q.get();

    if (snap.empty) {
      return null;
    }

    return snap.docs[0].id;
  } catch {
    // Public API resolver must never throw
    return null;
  }
}
