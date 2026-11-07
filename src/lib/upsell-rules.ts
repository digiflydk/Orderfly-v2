import type { MinimalCartItem, Upsell } from '@/types';
import type { CatalogPriceLine } from './checkout-price-validation';

/** Shared by recommendations and final checkout. Other items alone qualify the offer. */
export function upsellTriggered(upsell: Upsell, offeredProductId: string, items: Pick<MinimalCartItem, 'quantity' | 'totalPrice'>[], catalog: CatalogPriceLine[], standardPrices: number[]): boolean {
  return matchingUpsellQuantities(upsell, offeredProductId, items, catalog, standardPrices).length > 0;
}
function matchingUpsellQuantities(upsell: Upsell, offeredProductId: string, items: Pick<MinimalCartItem, 'quantity' | 'totalPrice'>[], catalog: CatalogPriceLine[], standardPrices: number[]): number[] {
  const others = catalog.map((record,i)=>({record,i})).filter(x=>x.record.id !== offeredProductId);
  return upsell.triggerConditions.flatMap(t => {
    if(t.type === 'cart_value_over') return others.reduce((sum,{i})=>sum+Math.max(0,Math.min(items[i].totalPrice,standardPrices[i]*items[i].quantity)),0)>Number(t.referenceId) ? [others.reduce((n,{i})=>n+items[i].quantity,0)] : [];
    const count=others.reduce((n,{record,i})=>n+((t.type === 'product_in_cart' ? !record.isCombo && record.id === t.referenceId : t.type === 'category_in_cart' ? record.categoryId === t.referenceId : t.type === 'combo_in_cart' ? record.isCombo && record.id === t.referenceId : t.type === 'product_tag_in_cart' && record.tags.includes(t.referenceId)) ? items[i].quantity : 0),0);
    return count >= (t.minQuantity ?? 1) && count <= (t.maxQuantity ?? Infinity) ? [count] : [];
  });
}
export function upsellHeading(upsell: Upsell, offeredProductId: string, items: Pick<MinimalCartItem, 'quantity' | 'totalPrice'>[], catalog: CatalogPriceLine[], standardPrices: number[]): string {
  const count=matchingUpsellQuantities(upsell,offeredProductId,items,catalog,standardPrices)[0] ?? 0;
  const template=(count === 1 ? upsell.headingSingular : upsell.headingPlural)?.trim();
  return (template || upsell.upsellName || 'Lidt ekstra til din ordre').replaceAll('{antal}',String(count));
}

/** Larger priority wins; old campaigns default to zero. Stable tie-break avoids query-order dependence. */
export function compareUpsells(a: Upsell, b: Upsell) {
  return (b.priority ?? 0) - (a.priority ?? 0) || a.id.localeCompare(b.id);
}

/** Display-only exclusions never revoke an accepted offer's checkout discount. */
export function upsellExcluded(upsell: Pick<Upsell, 'excludeProductIds' | 'excludeCategoryIds' | 'excludeComboIds'>, products: {id:string; categoryId?:string}[], comboIds: string[]): boolean {
  return products.some(p => upsell.excludeProductIds?.includes(p.id) || (p.categoryId && upsell.excludeCategoryIds?.includes(p.categoryId))) || comboIds.some(id => upsell.excludeComboIds?.includes(id));
}
