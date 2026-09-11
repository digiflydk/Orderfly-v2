import { ore, money, sumMoney, lineMoney } from './money';
import type { CartItem, MinimalCartItem } from '@/types';
import type { RestoreCatalog } from './cart-restore';
import { restoreCartItems } from './cart-restore';

export function checkoutItems(items: CartItem[]): MinimalCartItem[] {
  return items.map(item => ({
    id: item.id, itemType: item.itemType, name: item.productName,
    quantity: item.quantity, unitPrice: money(item.price),
    totalPrice: lineMoney(item.price, item.quantity, item.toppings.map(topping => topping.price)),
    toppings: item.toppings.map(topping => topping.name),
    ...(item.toppings.every(topping => topping.id) ? { toppingIds: item.toppings.map(topping => topping.id!) } : {}),
    ...(item.comboSelections ? { comboSelections: item.comboSelections.map(group => ({
      groupId: group.groupId, groupName: group.groupName,
      products: group.products.map(product => ({ id: product.id, name: product.name })),
    })) } : {}),
  }));
}

// Reuse restore's catalog eligibility and option rules, but reject invalid lines
// at checkout. Never silently delete/change the basket while creating payment.
export function validateCheckoutItems(items: MinimalCartItem[], catalog: RestoreCatalog,
  scope: { brandId: string; locationId: string; deliveryType: 'pickup' | 'delivery'; now?: Date }) {
  const choices = items.map((item, index) => {
    const product = catalog.products.find(product => product.id === item.id || `${product.id}-offer` === item.id);
    const combo = catalog.combos.find(combo => combo.id === item.id);
    if ((product && combo) || (item.itemType && item.itemType !== (combo ? 'combo' : 'product')) ||
        (product && item.comboSelections?.length)) throw new Error('Basket selections have changed. Please review your basket.');
    return {
      id: item.id || '', cartItemId: `line-${index}`, itemType: combo ? 'combo' as const : 'product' as const,
      quantity: item.quantity, toppings: item.toppings || [], toppingIds: item.toppingIds,
      comboSelections: item.comboSelections, offered: false,
    };
  });
  const restored = restoreCartItems(choices, { ...catalog, discounts: [], upsells: [] }, scope);
  if (restored.removed || restored.items.length !== items.length) throw new Error('A product, combo or option is no longer available. Please review your basket.');
  let subtotal = 0;
  const validated = restored.items.map((line, index) => {
    const item = items[index];
    const toppingPrices = line.toppings.map(topping => topping.price);
    if (ore(item.totalPrice) !== ore(lineMoney(item.unitPrice, item.quantity, toppingPrices))) {
      throw new Error('Option prices have changed. Please refresh your basket.');
    }
    subtotal = sumMoney([subtotal, lineMoney(line.basePrice, item.quantity, toppingPrices)]);
    return { ...item, unitPrice: money(item.unitPrice), totalPrice: lineMoney(item.unitPrice, item.quantity, toppingPrices),
      listUnitPrice: money(line.basePrice), listTotalPrice: lineMoney(line.basePrice, item.quantity, toppingPrices),
      id: line.id, itemType: line.itemType, name: line.productName,
      toppings: line.toppings.map(topping => topping.name), toppingIds: line.toppings.map(topping => topping.id!),
      ...(line.comboSelections ? { comboSelections: line.comboSelections } : {}),
    };
  });
  return { items: validated, subtotal };
}
