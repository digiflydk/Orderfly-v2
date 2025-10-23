
import type { CartItem } from '@/types';

/**
 * Checks if a cart item's price is "locked", meaning it cannot be
 * further discounted by cart-level promotions. This is true for
 * combo items or products that already have a standard discount applied.
 */
export const isLockedItem = (item: CartItem) => {
  return item.itemType === 'combo' || (item.basePrice && item.price < item.basePrice);
};
