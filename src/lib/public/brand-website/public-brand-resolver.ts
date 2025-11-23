
'use server';

import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';

export async function resolveBrandByDomain(domain: string): Promise<string | null> {
  if (!domain) {
    return null;
  }
  const db = getAdminDb();
  try {
    const brandsRef = db.collection('brands');
    // Firestore does not support querying for an exact match within an array in a nested object.
    // We must fetch all brands and filter in memory. This is acceptable for a limited number of brands.
    const snapshot = await brandsRef.get();

    if (snapshot.empty) {
      return null;
    }
    
    for (const doc of snapshot.docs) {
      const data = doc.data();
      if (data.website?.config?.domains?.includes(domain)) {
        return doc.id;
      }
    }

    return null;
  } catch (error) {
    console.error("Error resolving brand by domain:", error);
    return null;
  }
}
