

import { dbAdmin } from '@/lib/firebase/admin';
import type { Brand } from '@/types';

export type BrandDoc = Brand | null;

export async function getBrandBySlugServer(slug: string): Promise<BrandDoc> {
  if (!slug) return null;
  try {
    const snap = await dbAdmin.collection('brands').where('slug', '==', slug).limit(1).get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    const data = doc.data();
    // minimal validering – ingen throw:
    if (!data.slug || !data.name) return null;
    return { id: doc.id, ...data } as Brand;
  } catch (err) {
      console.error(`[brands.server] Failed to fetch brand by slug '${slug}':`, err);
      return null;
  }
}
