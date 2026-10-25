import 'server-only';
import type { OrderDetail } from '@/types';
import { getAdminDb } from '@/lib/firebase-admin';
import { AuthorityError } from '@/lib/access/authority';
import { verifiedOrderflyIdentity } from '@/lib/access/orderfly-session';
import { authorizeTransaction } from '@/lib/access/scoped-data';
import { kitchenCatalogLabelApplies as applicable } from './kitchen-category-scope';

const identifier = /^[A-Za-z0-9_-]{1,128}$/;
// checkoutRequestSchema accepts at most 97 merchandise lines. An oversized
// legacy order still displays every saved line, simply without catalog labels.
const MAX_LINES = 97;
function validId(value: unknown): value is string {
  return typeof value === 'string' && identifier.test(value);
}

/** Current catalog headings only; never replace the saved order's food/details.
 * Caller supplies the already authorized OrderDetail. Recheck current native
 * order scope in the same read-only snapshot as every product/category lookup.
 */
export async function readKitchenCategoriesForOrder(order: OrderDetail): Promise<Record<string, string>> {
  const identity = await verifiedOrderflyIdentity();
  if (!validId(order.brandId) || (order.locationId != null && order.locationId !== '' && !validId(order.locationId))) {
    throw new AuthorityError('invalid_identifier', 400);
  }
  let scopeVerified = false;
  try {
    const db = getAdminDb();
    return await db.runTransaction(async tx => {
      // Each attempt must establish fresh authority. A retry may see revocation
      // or a scope read failure after a previous attempt authorized successfully.
      scopeVerified = false;
      await authorizeTransaction(tx, identity, { brandId: order.brandId, locationId: order.locationId }, 'orderfly.orders:view', 'location');
      scopeVerified = true;
      if (!validId(order.locationId) || !Array.isArray(order.productItems) || order.productItems.length > MAX_LINES) return {};
      // Checkout already stores canonical product IDs. Do not guess by stripping
      // '-offer', or by looking up a product with the same display name.
      const ids = [...new Set(order.productItems.filter(item => item.itemType !== 'combo').map(item => item.id).filter(validId))];
      const labels = new Map<string, string>();
      const categories = new Map<string, string | undefined>();
      for (const id of ids) {
        const product = await tx.get(db.collection('products').doc(id)), row = product.data();
        if (!product.exists || !applicable(row, id, order.brandId, order.locationId, true) || !validId(row?.categoryId)) continue;
        const categoryId: string = row!.categoryId;
        if (!categories.has(categoryId)) {
          const category = await tx.get(db.collection('categories').doc(categoryId)), data = category.data();
          const name = data?.categoryName;
          categories.set(categoryId, category.exists && applicable(data, categoryId, order.brandId, order.locationId, false)
            && typeof name === 'string' && name.trim().length > 0 && name.length <= 160
            && !/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(name) ? name.trim() : undefined);
        }
        const name = categories.get(categoryId);
        if (name !== undefined) labels.set(id, name);
      }
      return Object.fromEntries(labels);
    }, { readOnly: true });
  } catch (error) {
    if (error instanceof AuthorityError) throw error;
    // Category headings are optional enrichment. Keep the authorized saved
    // order usable if catalog reads or transaction completion are unavailable.
    // Unknown authorization/scope failures must still fail closed.
    if (scopeVerified) return {};
    throw new Error('kitchen_categories_unavailable');
  }
}
