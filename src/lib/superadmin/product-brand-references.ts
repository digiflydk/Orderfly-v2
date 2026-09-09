import 'server-only';

import type { Firestore } from 'firebase-admin/firestore';

const includesProduct = (value: unknown, productId: string): boolean =>
  Array.isArray(value) && value.includes(productId);

/** References stay with their source brand, including inactive/scheduled records. */
export async function getProductBrandReferences(
  db: Firestore,
  brandId: string,
  productId: string,
): Promise<string[]> {
  const [combos, discounts, upsells] = await Promise.all(
    ['comboMenus', 'standard_discounts', 'upsells'].map(collection =>
      db.collection(collection).where('brandId', '==', brandId).get(),
    ),
  );
  const references: string[] = [];
  const label = (kind: string, name: unknown, id: string) =>
    typeof name === 'string' && name.trim()
      ? `${kind} "${name.trim()}" (${id})`
      : `${kind} (${id})`;

  for (const doc of combos.docs) {
    const combo = doc.data();
    if ((Array.isArray(combo.productGroups) && combo.productGroups.some(group =>
      includesProduct(group?.productIds, productId),
    )) || includesProduct(combo.upgradeProductIds, productId)) {
      references.push(label('Combo menu', combo.comboName, doc.id));
    }
  }
  for (const doc of discounts.docs) {
    const discount = doc.data();
    // Category discounts use the same field for category IDs.
    if (discount.discountType === 'product' && includesProduct(discount.referenceIds, productId)) {
      references.push(label('Discount', discount.discountName, doc.id));
    }
  }
  for (const doc of upsells.docs) {
    const upsell = doc.data();
    if (includesProduct(upsell.offerProductIds, productId) ||
        (Array.isArray(upsell.triggerConditions) && upsell.triggerConditions.some(condition =>
          condition?.type === 'product_in_cart' && condition.referenceId === productId,
        ))) {
      references.push(label('Upsell', upsell.upsellName, doc.id));
    }
  }
  return references;
}
