
import type { CartItem } from '@/types';

/**
 * Checks if a cart item's price is "locked", meaning it cannot be
 * further discounted by cart-level promotions. This is true for
 * combo items or products that already have a standard discount applied.
 */
export const isLockedItem = (item: CartItem) => {
  return item.itemType === 'combo' || (item.basePrice && item.price < item.basePrice);
};

/**
 * What the customer pays for, independent of property order or display-only
 * fields: two baskets with the same signature cost the same. Category and tags
 * decide which promotions apply, so they belong to the price.
 */
export const cartPriceSignature = (items: CartItem[]) => JSON.stringify(items.map(item => [
  item.cartItemId, item.id, item.itemType, item.quantity, item.basePrice, item.price, item.itemTotal,
  item.categoryId ?? null, [...(item.tags || [])].sort(),
  item.toppings.map(topping => [topping.id ?? topping.name, topping.price, topping.quantity ?? 1]),
  (item.comboSelections || []).map(group => [group.groupId ?? group.groupName, group.products.map(product => product.id)]),
]));
