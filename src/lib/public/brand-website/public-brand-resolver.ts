
'use server';

import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';

export async function resolveBrandByDomain(domain: string): Promise<string | null> {
  if (!domain) return null;
  
  const db = getAdminDb();
  try {
    const q = db.collection('brands').where('website.config.domains', 'array-contains', domain).limit(1);
    const snap = await q.get();
    
    if (snap.empty) {
      return null;
    }
    
    return snap.docs[0].id;
  } catch (error: any) {
    console.error(`[public-brand-resolver] Failed to resolve domain '${domain}':`, error.message);
    return null; // Never throw for public-facing resolution
  }
}
