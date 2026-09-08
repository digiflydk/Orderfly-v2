import type { ProductForMenu, StandardDiscount } from '@/types';
import { isQuantityMethod } from '@/lib/automatic-discounts';
import { discountedUnit, money } from '@/lib/money';

type PricedProduct = ProductForMenu & { basePrice?: number };

export function productPriceData(product: PricedProduct, activeDiscounts: StandardDiscount[], deliveryType?: 'pickup' | 'delivery' | null) {
    const catalogPrice = money(deliveryType === 'delivery' ? product.priceDelivery ?? product.price : product.price);
    const hasSuppliedOffer = typeof product.basePrice === 'number';
    const basePrice = hasSuppliedOffer ? money(product.basePrice!) : catalogPrice;
    const suppliedPrice = hasSuppliedOffer ? money(product.price) : catalogPrice;

    const applicableDiscount = activeDiscounts
        .filter(discount => !isQuantityMethod(discount.discountMethod) && (
            (discount.discountType === 'product' && discount.referenceIds.includes(product.id)) ||
            (discount.discountType === 'category' && !!product.categoryId && discount.referenceIds.includes(product.categoryId))
        ))
        .reduce<StandardDiscount | null>((best, current) => {
            if (!best)
                return current;
            return discountedUnit(basePrice, current.discountMethod, current.discountValue) < discountedUnit(basePrice, best.discountMethod, best.discountValue) ? current : best;
        }, null);

    const standardPrice = applicableDiscount ? discountedUnit(basePrice, applicableDiscount.discountMethod, applicableDiscount.discountValue) : basePrice;
    const finalPrice = Math.min(basePrice, suppliedPrice, standardPrice);
    return {
        basePrice,
        finalPrice,
        hasOffer: finalPrice < basePrice,
        applicableDiscount: standardPrice <= suppliedPrice && standardPrice < basePrice ? applicableDiscount : null,
    };
}
