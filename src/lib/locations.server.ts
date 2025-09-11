
import { dbAdmin } from '@/lib/firebase/admin';

export async function getLocationsByBrandServer(brandId: string) {
  if (!brandId) return [];
  const snap = await dbAdmin.collection('locations').where('brandId', '==', brandId).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
