import type { MinimalCartItem, StandardDiscount, Upsell } from '@/types';
import { restaurantClock } from './promotion-rules';

export type CatalogPriceLine = {
  id: string; categoryId?: string; tags: string[]; isCombo: boolean; price: number;
};

function reducedPrice(price: number, method: string, value?: number) {
  if (!Number.isFinite(value) || !value || value < 0) return price;
  if (method === 'percentage') return Math.max(0, price * (1 - Math.min(100,value) / 100));
  return method === 'fixed_amount' ? Math.max(0,price - value) : price;
}

function date(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (typeof (value as any).toDate === 'function') return (value as any).toDate();
  return value instanceof Date ? value : new Date(value as string);
}

// Catalog records and campaign rows are loaded by the server, never from the request.
export function validateCheckoutPrices(items: MinimalCartItem[], catalog: CatalogPriceLine[], discounts: StandardDiscount[], upsells: Upsell[], scope: { brandId: string; locationId: string; deliveryType: 'pickup' | 'delivery'; now?: Date }) {
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
    .reduce((price,d) => Math.min(price,reducedPrice(line.price,d.discountMethod,d.discountValue)),line.price));

  items.forEach((item,index) => {
    const line = catalog[index];
    if (!line || !Number.isFinite(line.price) || line.price < 0 || !Number.isSafeInteger(item.quantity) || item.quantity <= 0 ||
        !Number.isFinite(item.unitPrice) || item.unitPrice < 0 || !Number.isFinite(item.totalPrice) || item.totalPrice < 0) throw new Error('Invalid basket price or quantity.');
    let minimum = standardPrices[index];
    if (!line.isCombo) for (const upsell of upsells) {
      if (!active(upsell)) continue;
      const offered = upsell.offerType === 'product' ? upsell.offerProductIds.includes(line.id) : !!line.categoryId && upsell.offerCategoryIds.includes(line.categoryId);
      if (!offered) continue;
      // The offered product cannot supply its own trigger. Thresholds use server
      // catalog prices capped by submitted totals, not an inflated browser subtotal.
      const others = catalog.map((record,i) => ({record,i})).filter(x => x.record.id !== line.id);
      const triggered = upsell.triggerConditions.some(t => {
        if (t.type === 'cart_value_over') return others.reduce((sum,{i}) => sum + Math.max(0,Math.min(items[i].totalPrice,standardPrices[i]*items[i].quantity)),0) > Number(t.referenceId);
        return others.some(({record}) => t.type === 'product_in_cart' ? !record.isCombo && record.id === t.referenceId :
          t.type === 'category_in_cart' ? record.categoryId === t.referenceId :
          t.type === 'combo_in_cart' ? record.isCombo && record.id === t.referenceId :
          t.type === 'product_tag_in_cart' && record.tags.includes(t.referenceId));
      });
      if (triggered) minimum = Math.min(minimum,reducedPrice(line.price,upsell.discountType,upsell.discountValue));
    }
    // Compare rounded line amounts, accommodating legitimate fractional-cent
    // percentage unit prices while rejecting a whole-cent shortfall.
    if (Math.round(item.unitPrice * item.quantity * 100) < Math.round(minimum * item.quantity * 100) ||
        Math.round(item.totalPrice * 100) < Math.round(item.unitPrice * item.quantity * 100)) {
      throw new Error('Basket prices have changed. Please refresh your basket.');
    }
  });
}
