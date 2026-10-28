import type { Firestore } from 'firebase-admin/firestore';

/** Browser topping IDs are hints for suppression, never price or eligibility evidence. */
export async function linkedCartProductIds(
  db: Firestore,
  brandId: string,
  locationId: string,
  items: { toppingIds?: string[] }[],
  publicProducts: (ids: string[], brandId: string, locationId: string) => Promise<{ id: string }[]>,
): Promise<string[]> {
  const selected = new Set(items.flatMap(item => item.toppingIds || []).slice(0, 500));
  if (!selected.size) return [];
  const location = await db.collection('locations').doc(locationId).get();
  if (!location.exists || location.data()?.brandId !== brandId || location.data()?.isActive !== true) return [];
  // Legacy toppings are owned by locations and do not necessarily have brandId.
  const toppings = await db.collection('toppings')
    .where('locationIds', 'array-contains', locationId).where('isActive', '==', true).get();
  const links = [...new Set(toppings.docs.flatMap(doc => {
    const topping = doc.data();
    return selected.has(doc.id) && topping.isActive === true && topping.locationIds?.includes(locationId)
      && typeof topping.productId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(topping.productId)
      ? [topping.productId as string] : [];
  }))];
  if (!links.length) return [];
  // Existing public catalog enforces linked product brand, location and availability.
  return (await publicProducts(links, brandId, locationId)).map(product => product.id);
}
