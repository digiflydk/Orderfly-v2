import { resolveToppingOptions, cartTopping, toppingSelectionError } from './topping-options';
import { money, sumMoney } from './money';
import type { CartItem, ComboMenu, Product, StandardDiscount, Topping, ToppingGroup, Upsell } from '@/types';
import type { CartChoice } from './cart-snapshot';
import { minimumCheckoutPrices } from './checkout-price-validation';
import { comboEligible } from './combo-eligibility';
import { isSyntheticProduct } from './synthetic-product';

export type RestoreCatalog = { products: Product[]; combos: ComboMenu[]; toppings: Topping[]; groups: ToppingGroup[]; discounts: StandardDiscount[]; upsells: Upsell[] };
export function restoreCartItems(choices: CartChoice[], catalog: RestoreCatalog, scope: { brandId: string; locationId: string; deliveryType: 'pickup' | 'delivery'; now?: Date }) {
  const now = scope.now || new Date();
  const scoped = (record: { brandId: string; locationIds?: string[]; isActive: boolean; isTestData?: boolean; productName?: string; description?: string }) => record.isActive && !isSyntheticProduct(record) && record.brandId === scope.brandId && (!record.locationIds?.length || record.locationIds.includes(scope.locationId));
  let removed = 0;
  const items: CartItem[] = [];
  for (const choice of choices) {
    const quantities = (choice as CartChoice & { toppingQuantities?: number[] }).toppingQuantities;
    const product = choice.itemType === 'product' ? catalog.products.find(p => p.id === choice.id || `${p.id}-offer` === choice.id) : undefined;
    const combo = choice.itemType === 'combo' ? catalog.combos.find(c => c.id === choice.id) : undefined;
    const record = product || combo;
    if (!record || !scoped(record) || (combo && !comboEligible(combo, {...scope, now}))) { removed++; continue; }
    const rawPrice = product ? (scope.deliveryType === 'delivery' ? product.priceDelivery ?? product.price : product.price)
      : scope.deliveryType === 'delivery' ? combo!.deliveryPrice : combo!.pickupPrice;
    if (typeof rawPrice !== 'number' || !Number.isFinite(rawPrice) || rawPrice < 0) { removed++; continue; }
    const basePrice = money(rawPrice);
    const toppings: CartItem['toppings'] = [];
    const identities = choice.toppingIds;
    let valid = identities
      ? identities.length === choice.toppings.length && new Set(identities).size === identities.length
      : new Set(choice.toppings).size === choice.toppings.length;
    if (quantities !== undefined && (!Array.isArray(quantities) || !identities || quantities.length !== identities.length || quantities.some(n => !Number.isSafeInteger(n) || n < 1))) valid = false;
    if (product) {
      const groups = catalog.groups.filter(g => product.toppingGroupIds?.includes(g.id) && g.locationIds.includes(scope.locationId));
      const allowed = resolveToppingOptions(product, groups, catalog.toppings, catalog.products, scope);
      const selected: Record<string, number> = Object.create(null);
      for (const [index, name] of choice.toppings.entries()) {
        // Legacy labels resolve only when unambiguous. New quantity/removal labels use stable IDs.
        const matches = allowed.filter(t => identities ? t.id === identities[index] : t.toppingName === name);
        const quantity = quantities?.[index] ?? 1;
        if (matches.length !== 1 || Object.hasOwn(selected, matches[0].id) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > matches[0].maxQuantity) { valid = false; break; }
        selected[matches[0].id] = quantity;
        toppings.push(cartTopping(matches[0], quantity));
      }
      if (toppingSelectionError(product, groups, allowed, selected)) valid = false;
    }
    let comboSelections: CartItem['comboSelections'];
    if (combo) {
      if (choice.toppings.length || quantities?.length) valid = false;
      const selected = choice.comboSelections || [];
      const matchesGroup = (selection: typeof selected[number], group: typeof combo.productGroups[number]) =>
        selection.groupId ? selection.groupId === group.id : selection.groupName === group.groupName;
      // Each submitted group must resolve exactly once, including optional groups.
      // Do not silently discard unknown groups merely because minSelection is zero.
      if (selected.length !== combo.productGroups.length || selected.some(selection =>
        combo.productGroups.filter(group => matchesGroup(selection, group)).length !== 1)) valid = false;
      comboSelections = combo.productGroups.map(group => {
        const matches = selected.filter(selection => matchesGroup(selection, group));
        if (matches.length !== 1) valid = false;
        const ids = matches[0]?.products.map(p => p.id) || [];
        if (ids.length < group.minSelection || (group.maxSelection > 0 && ids.length > group.maxSelection) || new Set(ids).size !== ids.length) valid = false;
        const products = ids.flatMap(id => {
          const selectedProduct = catalog.products.find(p => p.id === id && scoped(p) && group.productIds.includes(id));
          if (!selectedProduct) { valid = false; return []; }
          return [{ id, name: selectedProduct.productName }];
        });
        return { groupId: group.id, groupName: group.groupName, products };
      });
    }
    if (!valid) { removed++; continue; }
    items.push({ ...(choice.upsellId ? {upsellId:choice.upsellId} : {}), id: record.id, cartItemId: choice.cartItemId, itemType: choice.itemType,
      productName: product ? product.productName : combo!.comboName, description: record.description,
      imageUrl: record.imageUrl || undefined, quantity: choice.quantity, basePrice, price: basePrice,
      itemTotal: basePrice, toppings, brandId: scope.brandId, categoryId: product?.categoryId,
      tags: product ? [...(product.isPopular ? ['Popular'] : []), ...(product.isFeatured ? ['Recommended'] : []), ...(product.isNew ? ['Campaign'] : [])] : [],
      ...(comboSelections ? { comboSelections } : {}),
    });
  }
  const lines = items.map(item => ({ id: item.id, categoryId: item.categoryId, tags: item.tags || [], isCombo: item.itemType === 'combo', price: item.basePrice }));
  const minimal = items.map(item => ({ name: item.productName, quantity: item.quantity, unitPrice: item.basePrice, totalPrice: item.basePrice * item.quantity }));
  const standard = minimumCheckoutPrices(minimal, lines, catalog.discounts, [], scope);
  const offered = minimumCheckoutPrices(minimal.map((item, i) => ({ ...item, unitPrice: standard[i], totalPrice: standard[i] * item.quantity })), lines, catalog.discounts, catalog.upsells, scope);
  items.forEach((item, i) => {
    item.price = choices.find(c => c.cartItemId === item.cartItemId)?.offered ? offered[i] : standard[i];
    item.itemTotal = sumMoney([item.price, ...item.toppings.map(topping => topping.price)]);
  });
  return { items, removed };
}
