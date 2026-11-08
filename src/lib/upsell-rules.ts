import type { MinimalCartItem, Upsell } from '@/types';
import type { CatalogPriceLine } from './checkout-price-validation';
import { ore } from './money';

/** Shared by recommendations and final checkout. Other items alone qualify the offer. */
export function upsellTriggered(upsell: Upsell, offeredProductId: string, items: Pick<MinimalCartItem, 'quantity' | 'totalPrice'>[], catalog: CatalogPriceLine[], standardPrices: number[]): boolean {
  return matchingUpsellQuantities(upsell, offeredProductId, items, catalog, standardPrices).length > 0;
}
function matchingUpsellQuantities(upsell: Upsell, offeredProductId: string, items: Pick<MinimalCartItem, 'quantity' | 'totalPrice'>[], catalog: CatalogPriceLine[], standardPrices: number[]): number[] {
  const others = catalog.map((record,i)=>({record,i})).filter(x=>x.record.id !== offeredProductId);
  return upsell.triggerConditions.flatMap(t => {
    if(t.type === 'cart_value_over') {
      if (typeof t.referenceId !== 'string' || !t.referenceId.trim()) return [];
      const threshold = Number(t.referenceId);
      if (!Number.isFinite(threshold) || threshold < 0 || threshold > Number.MAX_SAFE_INTEGER / 100) return [];
      // Recommendation and checkout use this one rule. Options do not inflate
      // eligibility; each line is capped by standard-discounted unit price.
      const eligibleOre = others.reduce((sum,{i}) => sum + Math.min(
        Math.max(0,ore(items[i].totalPrice)), ore(standardPrices[i]) * items[i].quantity,
      ), 0);
      return eligibleOre > ore(threshold) ? [others.reduce((n,{i})=>n+items[i].quantity,0)] : [];
    }
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

/** Follow-up discounts require a qualifying accepted parent line still in this basket. */
export function upsellParentEligible(offer: Upsell, campaigns: Upsell[], items: (Pick<MinimalCartItem,'quantity'|'totalPrice'> & {upsellId?:string})[], catalog: CatalogPriceLine[], standardPrices: number[]): boolean {
  if (!offer.afterUpsellId) return true;
  const parent=campaigns.find(c=>c.id===offer.afterUpsellId && !c.afterUpsellId && c.brandId===offer.brandId);
  if (!parent) return false;
  return catalog.some((line,i)=>!line.isCombo && items[i].upsellId===parent.id && (parent.offerType==='product'?parent.offerProductIds.includes(line.id):!!line.categoryId && parent.offerCategoryIds.includes(line.categoryId)) && upsellTriggered(parent,line.id,items,catalog,standardPrices));
}
