import { ore } from '@/lib/money';
import type { MinimalCartItem } from '@/types';
import type { CheckoutLineOptions, CheckoutOption } from '@/lib/checkout-items';
import { DELIVERY_ITEM_MAX_OPTIONS, DELIVERY_ITEM_OPTION_MAX_LENGTH, type DeliveryItem } from '../provider-contract';

const optionLabel = (value: unknown) => typeof value === 'string' ? value.trim().slice(0, DELIVERY_ITEM_OPTION_MAX_LENGTH).trim() : '';

const chosen = (options: readonly CheckoutOption[]) => options.filter(option => !option.includedDefault).map(option => optionLabel(option.label)).filter(Boolean);

/**
 * Maps the server-validated checkout cart (names, options and prices resolved
 * from the catalog by validateCheckoutItems) to delivery parcel items.
 * Never call this with browser cart data that has not passed that validation.
 * lineOptions is validateCheckoutItems' `options`, parallel to cartItems.
 *
 * options: each chosen combo product, followed by its own modifiers
 * ("4. Pepperoni: Rucola + Ekstra ost"), then a product's toppings/modifiers.
 * Included defaults (free, unchanged catalog defaults such as the standard base)
 * are left out; only what the customer chose or paid for is listed.
 * unitPriceMinor: the charged value of ONE unit including its options, before
 * cart-wide discounts and fees (line total / quantity). It is omitted when the
 * line total is not an exact whole number of minor units per unit.
 */
export function deliveryFulfillmentItems(cartItems: readonly MinimalCartItem[], lineOptions: readonly CheckoutLineOptions[]): DeliveryItem[] {
  if (lineOptions.length !== cartItems.length) throw new Error('delivery_items_options_mismatch');
  return cartItems.map((item, index) => {
    const line = lineOptions[index];
    const options = [
      ...line.components.map(component => {
        const name = optionLabel(component.name), modifiers = chosen(component.modifiers);
        return name && modifiers.length ? `${name}: ${modifiers.join(' + ')}` : name;
      }),
      ...chosen(line.toppings),
    ].map(optionLabel).filter(Boolean).slice(0, DELIVERY_ITEM_MAX_OPTIONS);
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
