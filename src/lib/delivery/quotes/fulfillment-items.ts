import { ore } from '@/lib/money';
import type { MinimalCartItem } from '@/types';
import { DELIVERY_ITEM_MAX_OPTIONS, DELIVERY_ITEM_OPTION_MAX_LENGTH, type DeliveryItem } from '../provider-contract';

const optionLabel = (value: unknown) => typeof value === 'string' ? value.trim().slice(0, DELIVERY_ITEM_OPTION_MAX_LENGTH).trim() : '';

/**
 * Maps the server-validated checkout cart (names, options and prices resolved
 * from the catalog by validateCheckoutItems) to delivery parcel items.
 * Never call this with browser cart data that has not passed that validation.
 *
 * options: chosen combo products, then selected toppings/modifiers (combo
 * component modifiers are already labelled "Product: Option" by the catalog).
 * unitPriceMinor: the charged value of ONE unit including its options, before
 * cart-wide discounts and fees (line total / quantity). It is omitted when the
 * line total is not an exact whole number of minor units per unit.
 */
export function deliveryFulfillmentItems(cartItems: readonly MinimalCartItem[]): DeliveryItem[] {
  return cartItems.map(item => {
    const options = [
      ...(item.comboSelections ?? []).flatMap(group => group.products.map(product => optionLabel(product.name))),
      ...(item.toppings ?? []).map(optionLabel),
    ].filter(Boolean).slice(0, DELIVERY_ITEM_MAX_OPTIONS);
    const lineMinor = ore(item.totalPrice);
    const unitPriceMinor = Number.isSafeInteger(item.quantity) && item.quantity > 0 && Number.isSafeInteger(lineMinor) && lineMinor >= 0 && lineMinor % item.quantity === 0
      ? lineMinor / item.quantity : undefined;
    return {
      name: item.name, quantity: item.quantity,
      ...(options.length ? { options } : {}),
      ...(unitPriceMinor === undefined ? {} : { unitPriceMinor }),
    };
  });
}
