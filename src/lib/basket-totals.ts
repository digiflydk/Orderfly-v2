import type { CartItem, Brand, Location, Discount, StandardDiscount } from '@/types';
import { bestAutomaticDiscount } from './automatic-discounts';
import { isLockedItem } from './cart-utils';
import { money, sumMoney, lineMoney, percentageMoney } from './money';
export function basketTotals({cartItems, appliedDiscount, standardDiscounts, deliveryType, location, brand, includeBagFee}: {
  cartItems: CartItem[]; appliedDiscount: Discount | null; standardDiscounts: StandardDiscount[];
  deliveryType: 'pickup' | 'delivery' | null; location: Location | null; brand: Brand | null; includeBagFee: boolean;
}) {
    const currentItemCount = cartItems.reduce((count, item) => count + item.quantity, 0);
    const currentSubtotal = sumMoney(cartItems.map(item => lineMoney(item.basePrice, item.quantity, item.toppings.map(t => t.price))));
    const currentItemDiscount = sumMoney(cartItems.map(item => lineMoney(item.basePrice - item.price, item.quantity)));
    const unlockedItems = cartItems.filter(item => !isLockedItem(item));
    const discountableSubtotal = sumMoney(unlockedItems.map(item => lineMoney(item.basePrice, item.quantity, item.toppings.map(t => t.price))));

    const bestAutoDiscount = bestAutomaticDiscount(standardDiscounts, discountableSubtotal,
      unlockedItems.map(item => ({ id: item.id, categoryId: item.categoryId, quantity: item.quantity, unitPrice: item.basePrice })));

    let calculatedVoucher: { name: string; amount: number } | null = null;
    if (appliedDiscount && discountableSubtotal >= (appliedDiscount.minOrderValue || 0)) {
        let voucherAmount = 0;
        if (appliedDiscount.discountType === 'percentage') {
            voucherAmount = percentageMoney(discountableSubtotal, Math.min(100, appliedDiscount.discountValue));
        } else {
            voucherAmount = money(Math.min(discountableSubtotal, appliedDiscount.discountValue));
        }
        if (voucherAmount > 0) {
            calculatedVoucher = { name: appliedDiscount.code, amount: voucherAmount };
        }
    }

    const finalCartDiscount = (calculatedVoucher && (!bestAutoDiscount || calculatedVoucher.amount > bestAutoDiscount.amount))
        ? null
        : bestAutoDiscount;
    const finalVoucherDiscount = (calculatedVoucher && (!bestAutoDiscount || calculatedVoucher.amount > bestAutoDiscount.amount))
        ? calculatedVoucher
        : null;

    let currentDeliveryFee = 0;
    let isFreeDelivery = false;
    if (deliveryType === 'delivery' && location) {
      currentDeliveryFee = money(location.deliveryFee);
      const freeDeliveryDiscount = standardDiscounts.find(d =>
        d.discountType === 'free_delivery' && (currentSubtotal - currentItemDiscount) >= (d.minOrderValue || 0)
      );
      if (freeDeliveryDiscount) {
        isFreeDelivery = true;
      }
    }

    const totalCartLevelDiscount = sumMoney([finalCartDiscount?.amount || 0, finalVoucherDiscount?.amount || 0]);
    const calculatedCartTotal = sumMoney([currentSubtotal, -currentItemDiscount, -totalCartLevelDiscount]);

    const currentBagFee = includeBagFee && brand?.bagFee ? money(brand.bagFee) : 0;
    let currentAdminFee = 0;
    if (brand?.adminFee && brand.adminFee > 0) {
        if (brand.adminFeeType === 'fixed') {
            currentAdminFee = money(brand.adminFee);
        } else if (brand.adminFeeType === 'percentage') {
            currentAdminFee = percentageMoney(Math.max(0, calculatedCartTotal), brand.adminFee);
        }
    }

    const calculatedCheckoutTotal = sumMoney([calculatedCartTotal, isFreeDelivery ? 0 : currentDeliveryFee, currentBagFee, currentAdminFee]);
    const vatRate = brand?.vatPercentage || 25;

    const allDiscountNames = [
        ...(currentItemDiscount > 0 ? ['Item Offers'] : []),
        ...(finalCartDiscount ? [finalCartDiscount.name] : []),
        ...(finalVoucherDiscount ? [`Code: ${finalVoucherDiscount.name}`] : []),
        ...(isFreeDelivery ? ['Free Delivery'] : []),
    ];
    return {
      subtotal: currentSubtotal, itemCount: currentItemCount, itemDiscount: currentItemDiscount,
      automaticCartDiscount: finalCartDiscount, voucherDiscount: finalVoucherDiscount,
      deliveryFee: currentDeliveryFee, freeDeliveryDiscountApplied: isFreeDelivery,
      bagFee: currentBagFee, adminFee: currentAdminFee,
      cartTotal: Math.max(0, calculatedCartTotal), checkoutTotal: Math.max(0, calculatedCheckoutTotal),
      vatAmount: money((calculatedCheckoutTotal * vatRate) / (100 + vatRate)),
      finalDiscount: allDiscountNames.length > 0 ? { name: allDiscountNames.join(' + '), amount: sumMoney([currentItemDiscount, totalCartLevelDiscount, isFreeDelivery ? currentDeliveryFee : 0]) } : null,
    };

}
