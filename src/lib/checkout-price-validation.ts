import { upsellTriggered, upsellParentEligible } from './upsell-rules';
import { discountedUnit, ore } from './money';
import type { MinimalCartItem, StandardDiscount, Upsell } from '@/types';
import { restaurantClock } from './promotion-rules';

export type CatalogPriceLine = {
  id: string; categoryId?: string; tags: string[]; isCombo: boolean; price: number;
};

function date(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (typeof (value as any).toDate === 'function') return (value as any).toDate();
  return value instanceof Date ? value : new Date(value as string);
}

// Catalog records and campaign rows are loaded by the server, never from the request.
export function minimumCheckoutPrices(items: MinimalCartItem[], catalog: CatalogPriceLine[], discounts: StandardDiscount[], upsells: Upsell[], scope: { brandId: string; locationId: string; deliveryType: 'pickup' | 'delivery'; now?: Date }, verifiedUpsellIds?: Set<string>, verifiedLines?: Set<number>) {
  const now = scope.now || new Date();
  const clock = restaurantClock(now);
  const active = (d: StandardDiscount | Upsell) => {
    const start = date(d.startDate), end = date(d.endDate);
    return d.isActive && d.brandId === scope.brandId && d.locationIds.includes(scope.locationId) && d.orderTypes.includes(scope.deliveryType) &&
      (!start || (Number.isFinite(start.getTime()) && now >= start)) && (!end || (Number.isFinite(end.getTime()) && now <= end)) &&
      (!d.activeDays?.length || d.activeDays.includes(clock.day)) &&
      (!d.activeTimeSlots?.length || d.activeTimeSlots.some(t => clock.time >= t.start && clock.time <= t.end));
  };
  const standardPrices = catalog.map(line => discounts.filter(d => active(d) && !line.isCombo &&
    ((d.discountType === 'product' && d.referenceIds.includes(line.id)) || (d.discountType === 'category' && !!line.categoryId && d.referenceIds.includes(line.categoryId))))
    .reduce((price,d) => Math.min(price,discountedUnit(line.price,d.discountMethod,d.discountValue)),line.price));

  return items.map((item,index) => {
    const line = catalog[index];
    if (!line || !Number.isFinite(line.price) || line.price < 0 || !Number.isSafeInteger(item.quantity) || item.quantity <= 0 ||
        !Number.isFinite(item.unitPrice) || item.unitPrice < 0 || !Number.isFinite(item.totalPrice) || item.totalPrice < 0) throw new Error('Invalid basket price or quantity.');
    let minimum = standardPrices[index];
    if (!line.isCombo) for (const upsell of upsells) {
      if (!active(upsell) || !upsellParentEligible(upsell, upsells.filter(active), items, catalog, standardPrices)) continue;
      const offered = upsell.offerType === 'product' ? upsell.offerProductIds.includes(line.id) : !!line.categoryId && upsell.offerCategoryIds.includes(line.categoryId);
      if (!offered) continue;
      const triggered = upsellTriggered(upsell, line.id, items, catalog, standardPrices);
      if (triggered) {
        minimum = Math.min(minimum,discountedUnit(line.price,upsell.discountType,upsell.discountValue));
        if (item.upsellId === upsell.id) { verifiedUpsellIds?.add(upsell.id); verifiedLines?.add(index); }
      }
    }
    return ore(minimum) / 100;
  });
}

export function validateCheckoutPrices(items: MinimalCartItem[], catalog: CatalogPriceLine[], discounts: StandardDiscount[], upsells: Upsell[], scope: { brandId: string; locationId: string; deliveryType: 'pickup' | 'delivery'; now?: Date }, verifiedLines?: Set<number>) {
  const verifiedUpsellIds = new Set<string>();
  const minimums = minimumCheckoutPrices(items, catalog, discounts, upsells, scope, verifiedUpsellIds, verifiedLines);
  const currentStandardPrices = minimumCheckoutPrices(items, catalog, discounts, [], scope);
  items.forEach((item, index) => {
    const minimum = minimums[index];
    // A newly activated/better item offer must also invalidate an older, higher quote.
    if (!catalog[index].isCombo && ore(item.unitPrice) > ore(currentStandardPrices[index])) {
      throw new Error('Priser eller tilbud er ændret. Opdatér kurven, før du fortsætter.');
    }
    // Round a unit once, before quantity. Eligibility never bypasses this floor.
    if (ore(item.unitPrice) < ore(minimum) ||
        ore(item.totalPrice) < ore(item.unitPrice) * item.quantity) {
      throw new Error('Priser eller tilbud er ændret. Opdatér kurven, før du fortsætter.');
    }
  });
  return [...verifiedUpsellIds];
}

/** Verified upsell merchandise after item discounts, before order-wide discounts and fees. */
export function verifiedUpsellAmount(items: MinimalCartItem[], verifiedLines: Set<number>): number {
  return items.reduce((sum, item, index) => sum + (verifiedLines.has(index) ? ore(item.totalPrice) : 0), 0) / 100;
}
