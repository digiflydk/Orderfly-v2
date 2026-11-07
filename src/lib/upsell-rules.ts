import type { MinimalCartItem, Upsell } from '@/types';
import type { CatalogPriceLine } from './checkout-price-validation';

/** Shared by recommendations and final checkout. Other items alone qualify the offer. */
export function upsellTriggered(upsell: Upsell, offeredProductId: string, items: Pick<MinimalCartItem, 'quantity' | 'totalPrice'>[], catalog: CatalogPriceLine[], standardPrices: number[]): boolean {
      const others = catalog.map((record,i) => ({record,i})).filter(x => x.record.id !== offeredProductId);
      return upsell.triggerConditions.some(t => {
        if (t.type === 'cart_value_over') return others.reduce((sum,{i}) => sum + Math.max(0,Math.min(items[i].totalPrice,standardPrices[i]*items[i].quantity)),0) > Number(t.referenceId);
        return others.some(({record}) => t.type === 'product_in_cart' ? !record.isCombo && record.id === t.referenceId :
          t.type === 'category_in_cart' ? record.categoryId === t.referenceId :
          t.type === 'combo_in_cart' ? record.isCombo && record.id === t.referenceId :
          t.type === 'product_tag_in_cart' && record.tags.includes(t.referenceId));
      });
}

/** Larger priority wins; old campaigns default to zero. Stable tie-break avoids query-order dependence. */
export function compareUpsells(a: Upsell, b: Upsell) {
  return (b.priority ?? 0) - (a.priority ?? 0) || a.id.localeCompare(b.id);
}
