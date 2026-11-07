import type { Firestore } from 'firebase-admin/firestore';
import type { ComboMenu, ComboSelection, ProductForMenu, StandardDiscount, MinimalCartItem } from '@/types';
import { comboSelectionAdjustments } from '@/lib/combo-pricing';
import { comboEligible } from '@/lib/combo-eligibility';
import { minimumCheckoutPrices, type CatalogPriceLine } from '@/lib/checkout-price-validation';
import { money } from '@/lib/money';

export type UpsellCartItem = {
  id: string; categoryId?: string; itemType?: 'product' | 'combo'; tags?: string[];
  includedProductIds?: string[]; toppingIds?: string[]; quantity?: number; totalPrice?: number;
  comboSelections?: { groupId?: string; groupName: string; products: {id: string}[] }[];
};

/** Resolve native identities and channel prices. Browser totals can only lower qualification. */
export async function upsellCart(db: Firestore, input: UpsellCartItem[], scope: {brandId: string; locationId: string; deliveryType: 'pickup' | 'delivery'},
  getProducts: (ids: string[], brandId: string, locationId: string) => Promise<ProductForMenu[]>, discounts: StandardDiscount[]) {
  const comboIds = [...new Set(input.filter(item => item.itemType === 'combo').map(item => item.id))];
  const [products, comboRows] = await Promise.all([
    getProducts(input.filter(item => item.itemType !== 'combo').map(item => item.id), scope.brandId, scope.locationId),
    comboIds.length ? db.getAll(...comboIds.map(id => db.collection('comboMenus').doc(id))) : [],
  ]);
  const catalog: CatalogPriceLine[] = [], items: MinimalCartItem[] = [];
  for (const item of input) {
    const product = products.find(p => p.id === item.id);
    const row = comboRows.find(row => row.id === item.id && row.exists);
    const combo = row ? {...row.data(), id: row.id} as ComboMenu : undefined;
    if (item.itemType === 'combo' ? !combo || !comboEligible(combo, scope) : !product || product.comboOnly) continue;
    let price: number;
    try {
      const raw = combo ? (scope.deliveryType === 'delivery' ? combo.deliveryPrice : combo.pickupPrice)
        : (scope.deliveryType === 'delivery' ? product!.priceDelivery ?? product!.price : product!.price);
      if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) continue;
      price = money(raw + (combo ? comboSelectionAdjustments(combo, (item.comboSelections || []) as ComboSelection[]) : 0));
    } catch { continue; }
    const quantity = item.quantity ?? 1;
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 999 || !Number.isFinite(price) || price < 0) continue;
    catalog.push({id:item.id, isCombo:!!combo, price, categoryId:product?.categoryId,
      tags:product ? [...(product.isPopular ? ['Popular'] : []), ...(product.isFeatured ? ['Recommended'] : []), ...(product.isNew ? ['Campaign'] : [])] : []});
    items.push({id:item.id, name:'', quantity, unitPrice:price, totalPrice:Math.max(0, Math.min(item.totalPrice ?? 0, price * quantity))});
  }
  return {items, catalog, standardPrices: minimumCheckoutPrices(items, catalog, discounts, [], scope)};
}
