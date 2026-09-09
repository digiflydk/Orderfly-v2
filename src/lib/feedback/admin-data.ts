import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import type { FeedbackAccess } from './access';

export async function feedbackScopeOptions(access: FeedbackAccess) {
  const db = getAdminDb();
  const brandDocs = access.brandIds === null
    ? (await db.collection('brands').get()).docs
    : await Promise.all(access.brandIds.map(id => db.collection('brands').doc(id).get()));
  const brands = brandDocs.filter(d => d.exists).map(d => ({ id: d.id, name: String(d.data()?.name || d.id), slug: String(d.data()?.slug || '') }));
  const locationDocs = access.brandIds === null
    ? (await db.collection('locations').get()).docs
    : (await Promise.all(brands.map(b => db.collection('locations').where('brandId', '==', b.id).get()))).flatMap(s => s.docs);
  const brandIds = new Set(brands.map(b => b.id));
  const locations = locationDocs.filter(d => brandIds.has(d.data()?.brandId)).map(d => ({ id: d.id, brandId: d.data()!.brandId as string, name: String(d.data()?.name || d.id), slug: String(d.data()?.slug || '') }));
  return { brands, locations };
}
