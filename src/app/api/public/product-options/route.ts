import { money } from '@/lib/money';
import { getAdminDb } from '@/lib/firebase-admin';
import { unstable_cache } from 'next/cache';
export const runtime = 'nodejs';
const read = unstable_cache(async (brandId: string, locationId: string) => {
  const db = getAdminDb();
  const location = await db.collection('locations').doc(locationId).get();
  if (!location.exists || location.data()?.brandId !== brandId || !location.data()?.isActive) throw new Error('Invalid restaurant');
  const [tops, groups] = await Promise.all([
    db.collection('toppings').where('locationIds', 'array-contains', locationId).where('isActive', '==', true).get(),
    db.collection('topping_groups').where('locationIds', 'array-contains', locationId).get(),
  ]);
  return {
    toppings: tops.docs.filter(doc => !doc.data().brandId || doc.data().brandId === brandId).map(doc => {
      const t = doc.data(); return {id: doc.id, toppingName: t.toppingName, price: money(t.price), isDefault: !!t.isDefault, sortOrder: t.sortOrder, groupId: t.groupId, locationIds: [locationId], isActive: true};
    }),
    groups: groups.docs.filter(doc => !doc.data().brandId || doc.data().brandId === brandId).map(doc => {
      const g = doc.data(); return {id: doc.id, groupName: g.groupName, minSelection: g.minSelection, maxSelection: g.maxSelection,
        selectionType: g.selectionType, sortOrder: g.sortOrder, locationIds: [locationId]};
    }),
  };
}, ['public-options-v1'], {revalidate: 60, tags: ['storefront']});
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams, brand = params.get('brandId') || '', location = params.get('locationId') || '';
  if (![brand, location].every(id => /^[^/\\?#]{1,160}$/.test(id))) return Response.json({error: 'Invalid restaurant'}, {status: 400});
  try { return Response.json(await read(brand, location)); }
  catch { return Response.json({error: 'Options unavailable. Please retry.'}, {status: 503}); }
}
