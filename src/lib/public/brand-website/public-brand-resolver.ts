
'use server';

import { getAdminDb } from '@/lib/firebase-admin';

export async function resolveBrandByDomain(domain: string): Promise<string | null> {
  try {
    const db = getAdminDb();
    const snapshot = await db
      .collectionGroup('config')
      .where('domains', 'array-contains', domain)
      .limit(1)
      .get();
      
    if (snapshot.empty) {
      return null;
    }
    
    const brandDoc = snapshot.docs[0];
    const brandId = brandDoc.ref.parent.parent?.id; // /brands/{brandId}/website/config

    return brandId || null;
    
  } catch (error) {
    console.error(`Error resolving brand by domain "${domain}":`, error);
    return null;
  }
}


    