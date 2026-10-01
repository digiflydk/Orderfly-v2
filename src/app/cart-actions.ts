'use server';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { cartChoicesSchema } from '@/lib/cart-snapshot';
import { restoreCartItems, type RestoreCatalog } from '@/lib/cart-restore';
import { getActiveStandardDiscounts } from '@/app/superadmin/standard-discounts/actions';

const id = z.string().min(1).max(200).refine(value => !value.includes('/'));
const requestSchema = z.object({ brandId: id, locationId: id, deliveryType: z.enum(['pickup', 'delivery']), choices: cartChoicesSchema });

export async function restoreCartAction(raw: unknown) {
  const input = requestSchema.parse(raw), db = getAdminDb();
  const [brand, location] = await Promise.all([db.collection('brands').doc(input.brandId).get(), db.collection('locations').doc(input.locationId).get()]);
  if (!brand.exists || !location.exists || location.data()?.brandId !== input.brandId) throw new Error('Restaurant context is invalid.');
  if (!input.choices.length) return { items: [], removed: 0, discounts: await getActiveStandardDiscounts(input) };
  async function byIds(collection: string, ids: string[]) {
    const unique = [...new Set(ids)];
    if (!unique.length) return [];
    const rows = await db.getAll(...unique.map(value => db.collection(collection).doc(value)));
    return rows.filter(row => row.exists).map(row => ({ ...row.data(), id: row.id }));
  }
  const productIds = input.choices.flatMap(c => c.itemType === 'product' ? [c.id, ...(c.id.endsWith('-offer') ? [c.id.slice(0, -6)] : [])] : (c.comboSelections || []).flatMap(g => g.products.map(p => p.id)));
  const [products, combos, toppingRows, groupRows, discounts, upsellRows] = await Promise.all([
    byIds('products', productIds), byIds('comboMenus', input.choices.filter(c => c.itemType === 'combo').map(c => c.id)),
    db.collection('toppings').where('locationIds', 'array-contains', input.locationId).get(),
    db.collection('topping_groups').where('locationIds', 'array-contains', input.locationId).get(),
    getActiveStandardDiscounts(input),
    db.collection('upsells').where('brandId', '==', input.brandId).where('isActive', '==', true).get(),
  ]);
  const catalog = { products, combos, discounts,
    toppings: toppingRows.docs.map(row => ({ ...row.data(), id: row.id })),
    groups: groupRows.docs.map(row => ({ ...row.data(), id: row.id })),
    upsells: upsellRows.docs.map(row => ({ ...row.data(), id: row.id })),
  } as RestoreCatalog;
  return { ...restoreCartItems(input.choices, catalog, input), discounts };
}
