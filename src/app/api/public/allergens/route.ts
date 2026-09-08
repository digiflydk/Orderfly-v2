import { getAdminDb } from '@/lib/firebase-admin';
import { unstable_cache } from 'next/cache';
export const runtime = 'nodejs';
const read = unstable_cache(async () => {
  const snapshot = await getAdminDb().collection('allergens').where('isActive', '==', true).get();
  return snapshot.docs.map(doc => ({id: doc.id, allergenName: doc.data().allergenName, icon: doc.data().icon || '', isActive: true}));
}, ['public-allergens-v1'], {revalidate: 60, tags: ['storefront']});
export async function GET() { try { return Response.json(await read()); } catch { return Response.json({error: 'Unavailable'}, {status: 503}); } }
