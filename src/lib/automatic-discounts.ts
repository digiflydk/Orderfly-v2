import type { StandardDiscount } from '@/types';

export type OfferLine = { id: string; categoryId?: string; quantity: number; unitPrice: number };

// Callers pass only eligible, non-combo, non-discounted lines. Extras are excluded.
export function quantityDiscount(discount: StandardDiscount, lines: OfferLine[]): number {
  const { buyQuantity: buy, payQuantity: pay } = discount;
  if (discount.discountMethod !== 'buy_x_pay_y' || !buy || !pay ||
      !Number.isInteger(buy) || !Number.isInteger(pay) || buy <= pay || pay < 1 || buy > 1000 ||
      !['product', 'category'].includes(discount.discountType)) return 0;
  const eligible = lines.filter(line => Number.isSafeInteger(line.quantity) && line.quantity > 0 &&
    Number.isFinite(line.unitPrice) && line.unitPrice > 0 &&
    (discount.discountType === 'product' ? discount.referenceIds.includes(line.id) :
      !!line.categoryId && discount.referenceIds.includes(line.categoryId)))
    .sort((a,b) => a.unitPrice - b.unitPrice);
  let freeUnits = Math.floor(eligible.reduce((sum,line) => sum + line.quantity, 0) / buy) * (buy - pay);
  let cents = 0;
  for (const line of eligible) {
    const count = Math.min(freeUnits, line.quantity);
    cents += count * Math.round(line.unitPrice * 100);
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
    if (discount.discountMethod === 'buy_x_pay_y') amount = quantityDiscount(discount, lines);
    else if (discount.discountType === 'cart') {
      amount = discount.discountMethod === 'percentage'
        ? eligibleSubtotal * (Math.min(100, discount.discountValue || 0) / 100)
        : discount.discountValue || 0;
    }
    amount = Math.round(Math.max(0, Math.min(eligibleSubtotal, amount)) * 100) / 100;
    if (amount > (best?.amount || 0)) best = { name: discount.discountName, amount };
  }
  return best;
}
