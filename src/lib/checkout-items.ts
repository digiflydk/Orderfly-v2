import { ore, money, sumMoney, lineMoney } from './money';
import type { CartItem, CartItemTopping, MinimalCartItem, Product } from '@/types';
import type { RestoreCatalog } from './cart-restore';
import { restoreCartItems } from './cart-restore';
import { resolveComboProductModifiers } from './combo-modifiers';
import { resolveToppingOptions, type EffectiveTopping, type OptionScope } from './topping-options';

/** A chosen option label and whether it is the catalog's free, unchanged default. */
export type CheckoutOption = { label: string; includedDefault: boolean };
/** Structured options of one validated line: combo components with their own modifiers, or product toppings. */
export type CheckoutLineOptions = { components: { name: string; modifiers: CheckoutOption[] }[]; toppings: CheckoutOption[] };

/**
 * Included default: an addition the catalog pre-selects (isDefault, incl. the
 * product override) at its default quantity and at no extra cost, e.g. the
 * standard base of a required group. Anything charged, changed or removed is not.
 */
function includedDefault(option: EffectiveTopping | undefined, quantity: number): boolean {
  return !!option && option.kind !== 'removal' && option.isDefault === true && quantity === option.defaultQuantity && option.price === 0;
}
function describeOptions(product: Product, toppings: CartItemTopping[], catalog: RestoreCatalog, scope: OptionScope): CheckoutOption[] {
  const groups = catalog.groups.filter(g => product.toppingGroupIds?.includes(g.id) && g.locationIds.includes(scope.locationId));
  const options = resolveToppingOptions(product, groups, catalog.toppings, catalog.products, scope);
  return toppings.map(topping => {
    const matches = options.filter(option => option.id === topping.id);
    return { label: topping.name, includedDefault: matches.length === 1 && includedDefault(matches[0], topping.quantity ?? 1) };
  });
}
function lineOptions(line: CartItem, catalog: RestoreCatalog, scope: OptionScope): CheckoutLineOptions {
  if (line.itemType !== 'combo') {
    const product = catalog.products.find(p => p.id === line.id);
    return { components: [], toppings: product ? describeOptions(product, line.toppings, catalog, scope) : line.toppings.map(t => ({ label: t.name, includedDefault: false })) };
  }
  const components = (line.comboSelections ?? []).flatMap(group => group.products.map(selected => {
    const product = catalog.products.find(p => p.id === selected.id);
    // restoreCartItems already validated these modifiers; resolve them again for their unprefixed labels.
    const modifiers = product && selected.modifiers?.length ? resolveComboProductModifiers(product, selected.modifiers, catalog, scope) : [];
    if (modifiers === null) throw new Error('A product, combo or option is no longer available. Please review your basket.');
    return { name: selected.name, modifiers: product ? describeOptions(product, modifiers, catalog, scope) : [] };
  }));
  return { components, toppings: [] };
}

export function checkoutItems(items: CartItem[]): MinimalCartItem[] {
  return items.map(item => ({
    id: item.id, itemType: item.itemType, name: item.productName,
    ...(item.upsellId ? {upsellId:item.upsellId} : {}),
    quantity: item.quantity, unitPrice: money(item.price),
    totalPrice: lineMoney(item.price, item.quantity, item.toppings.map(topping => topping.price)),
    toppings: item.itemType === 'combo' ? [] : item.toppings.map(topping => topping.name),
    ...(item.itemType !== 'combo' && item.toppings.every(topping => topping.id) ? { toppingIds: item.toppings.map(topping => topping.id!), toppingQuantities: item.toppings.map(topping => topping.quantity ?? 1) } : {}),
    ...(item.comboSelections ? { comboSelections: item.comboSelections.map(group => ({
      groupId: group.groupId, groupName: group.groupName,
      products: group.products.map(product => ({ id: product.id, name: product.name, ...(product.modifiers ? {modifiers: product.modifiers} : {}) })),
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
      quantity: item.quantity, toppings: item.toppings || [], toppingIds: item.toppingIds, toppingQuantities: item.toppingQuantities,
      comboSelections: item.comboSelections, offered: false,
    };
  });
  const restored = restoreCartItems(choices, { ...catalog, discounts: [], upsells: [] }, scope);
  if (restored.removed || restored.items.length !== items.length) throw new Error('A product, combo or option is no longer available. Please review your basket.');
  let subtotal = 0;
  const validated = restored.items.map((line, index) => {
    const item = items[index];
    if (line.itemType === 'combo' && ore(item.unitPrice) !== ore(line.basePrice)) throw new Error('Combo prices have changed. Please refresh your basket.');
    const toppingPrices = line.toppings.map(topping => topping.price);
    if (ore(item.totalPrice) !== ore(lineMoney(item.unitPrice, item.quantity, toppingPrices))) {
      throw new Error('Option prices have changed. Please refresh your basket.');
    }
    subtotal = sumMoney([subtotal, lineMoney(line.basePrice, item.quantity, toppingPrices)]);
    return { ...item, unitPrice: money(item.unitPrice), totalPrice: lineMoney(item.unitPrice, item.quantity, toppingPrices),
      listUnitPrice: money(line.basePrice), listTotalPrice: lineMoney(line.basePrice, item.quantity, toppingPrices),
      id: line.id, itemType: line.itemType, name: line.productName,
      toppings: line.toppings.map(topping => topping.name), toppingIds: line.toppings.map(topping => topping.id!),
      toppingQuantities: line.toppings.map(topping => topping.quantity ?? 1),
      ...(line.comboSelections ? { comboSelections: line.comboSelections } : {}),
    };
  });
  const optionScope = { brandId: scope.brandId, locationId: scope.locationId, deliveryType: scope.deliveryType };
  // Parallel to items. Not persisted on the order; used for courier parcel descriptions.
  const options = restored.items.map(line => lineOptions(line, catalog, optionScope));
  return { items: validated, subtotal, options };
}
