import { ore, money, percentageMoney } from './money';
import type { StandardDiscount } from '@/types';

export type OfferLine = { id: string; categoryId?: string; quantity: number; unitPrice: number };

export function isQuantityMethod(method: string) {
  return ['buy_x_pay_y', 'bundle_price', 'quantity_tiers'].includes(method);
}

export function quantityOfferLabel(d: StandardDiscount): string {
  if (d.discountMethod === 'bundle_price') return `${d.buyQuantity} for ${d.bundlePrice} kr.`;
  if (d.discountMethod === 'quantity_tiers') return (d.quantityTiers || []).slice().sort((a,b) => a.minQuantity - b.minQuantity)
    .map(t => `${t.minQuantity}+ stk.: ${t.value}${t.method === 'percentage' ? '%' : ' kr.'} rabat`).join(' · ');
  return `${d.buyQuantity} for ${d.payQuantity}`;
}

// Callers pass only eligible, non-combo, non-discounted lines. Extras are excluded.
export function quantityDiscount(discount: StandardDiscount, lines: OfferLine[]): number {
  const { buyQuantity: buy, payQuantity: pay } = discount;
  if (!isQuantityMethod(discount.discountMethod) || !['product', 'category'].includes(discount.discountType)) return 0;
  const eligible = lines.filter(line => Number.isSafeInteger(line.quantity) && line.quantity > 0 &&
    Number.isFinite(line.unitPrice) && line.unitPrice > 0 &&
    (discount.discountType === 'product' ? discount.referenceIds.includes(line.id) :
      !!line.categoryId && discount.referenceIds.includes(line.categoryId)))
    .sort((a,b) => a.unitPrice - b.unitPrice);
  const totalQuantity = eligible.reduce((sum,line) => sum + line.quantity, 0);
  if (!Number.isSafeInteger(totalQuantity)) return 0;
  if (discount.discountMethod === 'quantity_tiers') {
    const tier = (discount.quantityTiers || []).filter(t => Number.isInteger(t.minQuantity) && t.minQuantity >= 2 && t.minQuantity <= totalQuantity && Number.isFinite(t.value) && t.value > 0)
      .sort((a,b) => b.minQuantity - a.minQuantity)[0];
    if (!tier) return 0;
    return eligible.reduce((cents,line) => {
      const price = ore(line.unitPrice);
      const reduction = tier.method === 'percentage' ? Math.round(price * Math.min(100,tier.value) / 100) : ore(tier.value);
      return cents + Math.min(price,reduction) * line.quantity;
    },0) / 100;
  }
  if (!buy || !Number.isInteger(buy) || buy < 2 || buy > 1000) return 0;
  if (discount.discountMethod === 'bundle_price') {
    if (!discount.bundlePrice || !Number.isFinite(discount.bundlePrice) || discount.bundlePrice <= 0) return 0;
    // Most expensive eligible units form bundles first; leftovers remain full price.
    let remaining = Math.floor(totalQuantity / buy) * buy, count = 0, groupCost = 0, savings = 0;
    const bundleCents = ore(discount.bundlePrice);
    for (const line of [...eligible].reverse()) {
      let units = Math.min(line.quantity, remaining);
      remaining -= units;
      const price = ore(line.unitPrice);
      if (count && units) {
        const take = Math.min(buy - count, units);
        count += take; groupCost += take * price; units -= take;
        if (count === buy) { savings += Math.max(0,groupCost - bundleCents); count = 0; groupCost = 0; }
      }
      const groups = Math.floor(units / buy);
      savings += groups * Math.max(0, buy * price - bundleCents);
      units -= groups * buy;
      count += units; groupCost += units * price;
      if (!remaining) break;
    }
    return savings / 100;
  }
  if (!pay || !Number.isInteger(pay) || pay < 1 || pay >= buy) return 0;
  let freeUnits = Math.floor(eligible.reduce((sum,line) => sum + line.quantity, 0) / buy) * (buy - pay);
  let cents = 0;
  for (const line of eligible) {
    const count = Math.min(freeUnits, line.quantity);
    cents += count * ore(line.unitPrice);
    freeUnits -= count;
    if (!freeUnits) break;
  }
  return cents / 100;
}

export function bestAutomaticDiscount(discounts: StandardDiscount[], eligibleSubtotal: number, lines: OfferLine[]) {
  let best: { name: string; amount: number } | null = null;
  for (const discount of discounts) {
    if (!discount.isActive || eligibleSubtotal < (discount.minOrderValue || 0)) continue;
    let amount = 0;
    if (isQuantityMethod(discount.discountMethod)) amount = quantityDiscount(discount, lines);
    else if (discount.discountType === 'cart') {
      amount = discount.discountMethod === 'percentage'
        ? percentageMoney(eligibleSubtotal, Math.min(100, discount.discountValue || 0))
        : discount.discountValue || 0;
    }
    amount = money(Math.max(0, Math.min(eligibleSubtotal, amount)));
    if (amount > (best?.amount || 0)) best = { name: discount.discountName, amount };
  }
  return best;
}
