import 'server-only';
import { unstable_cache } from 'next/cache';
import { getAdminDb } from '@/lib/firebase-admin';
import { storefrontMedia } from './storefront-media';

export const storefrontRows = unstable_cache(async (collection: string, brandId: string, locationId: string) => {
  let query: FirebaseFirestore.Query = getAdminDb().collection(collection);
  if (brandId) query = query.where('brandId', '==', brandId);
  if (locationId) query = query.where('locationIds', 'array-contains', locationId);
  const snapshot = await query.where('isActive', '==', true).get();
  return snapshot.docs.map(doc => storefrontMedia({ ...doc.data(), id: doc.id }, collection, doc.id));
}, ['storefront-rows-v1'], {revalidate:60,tags:['storefront']});
