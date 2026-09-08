import type { StandardDiscount } from '@/types';
import { isQuantityMethod, quantityOfferLabel } from './automatic-discounts';
export type PromotionTile = {id: string; title: string; description: string; imageUrl?: string};
export function promotionTile(discount: StandardDiscount): PromotionTile {
  const offer = isQuantityMethod(discount.discountMethod) ? quantityOfferLabel(discount)
    : discount.discountType === 'free_delivery' ? 'Gratis levering'
    : `${discount.discountValue || 0}${discount.discountMethod === 'percentage' ? '%' : ' kr.'} rabat`;
  const scope = discount.discountType === 'product' || discount.discountType === 'category' ? 'på udvalgte varer' : 'på din ordre';
  const methods = discount.orderTypes.map(mode => mode === 'delivery' ? 'levering' : 'afhentning').join(' og ');
  return {id: discount.id, title: discount.discountName, description: `${offer} ${scope}. Gælder ${methods}.${discount.minOrderValue ? ` Ved køb for mindst ${discount.minOrderValue} kr.` : ''} Se de gældende priser i menuen.`};
}
