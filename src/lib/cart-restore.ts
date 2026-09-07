import type { CartItem, ComboMenu, Product, StandardDiscount, Topping, ToppingGroup, Upsell } from '@/types';
import type { CartChoice } from './cart-snapshot';
import { minimumCheckoutPrices } from './checkout-price-validation';
import { restaurantClock } from './promotion-rules';

export type RestoreCatalog = { products: Product[]; combos: ComboMenu[]; toppings: Topping[]; groups: ToppingGroup[]; discounts: StandardDiscount[]; upsells: Upsell[] };
function date(value: unknown): Date {
  return typeof (value as { toDate?: unknown })?.toDate === 'function'
    ? (value as { toDate: () => Date }).toDate() : new Date(value as string);
}
export function restoreCartItems(choices: CartChoice[], catalog: RestoreCatalog, scope: { brandId: string; locationId: string; deliveryType: 'pickup' | 'delivery'; now?: Date }) {
  const now = scope.now || new Date(), clock = restaurantClock(now);
  const scoped = (record: { brandId: string; locationIds?: string[]; isActive: boolean }) => record.isActive && record.brandId === scope.brandId && (!record.locationIds?.length || record.locationIds.includes(scope.locationId));
  const activeCombo = (combo: ComboMenu) => scoped(combo) && combo.orderTypes.includes(scope.deliveryType)
    && (!combo.startDate || date(combo.startDate) <= now) && (!combo.endDate || date(combo.endDate) >= now)
    && (!combo.activeDays?.length || combo.activeDays.includes(clock.day))
    && (!combo.activeTimeSlots?.length || combo.activeTimeSlots.some(slot => clock.time >= slot.start && clock.time <= slot.end));
  let removed = 0;
  const items: CartItem[] = [];
  for (const choice of choices) {
    const product = choice.itemType === 'product' ? catalog.products.find(p => p.id === choice.id || `${p.id}-offer` === choice.id) : undefined;
    const combo = choice.itemType === 'combo' ? catalog.combos.find(c => c.id === choice.id) : undefined;
    const record = product || combo;
    if (!record || !scoped(record) || (combo && !activeCombo(combo))) { removed++; continue; }
    const basePrice = product ? (scope.deliveryType === 'delivery' ? product.priceDelivery ?? product.price : product.price)
      : scope.deliveryType === 'delivery' ? combo!.deliveryPrice : combo!.pickupPrice;
    if (typeof basePrice !== 'number' || !Number.isFinite(basePrice) || basePrice < 0) { removed++; continue; }
    const toppings: CartItem['toppings'] = [];
    let valid = new Set(choice.toppings).size === choice.toppings.length;
    if (product) {
      const allowed = catalog.toppings.filter(t => t.isActive && t.locationIds.includes(scope.locationId) && product.toppingGroupIds?.includes(t.groupId));
      for (const name of choice.toppings) {
        const matches = allowed.filter(t => t.toppingName === name);
        if (matches.length !== 1 || !Number.isFinite(matches[0].price) || matches[0].price < 0) { valid = false; break; }
        toppings.push({ name, price: matches[0].price });
      }
      for (const groupId of product.toppingGroupIds || []) {
        const group = catalog.groups.find(g => g.id === groupId && g.locationIds.includes(scope.locationId));
        if (!group) { valid = false; break; }
        const count = allowed.filter(t => t.groupId === groupId && choice.toppings.includes(t.toppingName)).length;
        if (count < group.minSelection || (group.maxSelection > 0 && count > group.maxSelection)) valid = false;
      }
    }
    let comboSelections: CartItem['comboSelections'];
    if (combo) {
      if (choice.toppings.length) valid = false;
      const selected = choice.comboSelections || [];
      if (selected.length !== combo.productGroups.length || new Set(selected.map(g => g.groupName)).size !== selected.length) valid = false;
      comboSelections = combo.productGroups.map(group => {
        const ids = selected.find(s => s.groupName === group.groupName)?.products.map(p => p.id) || [];
        if (ids.length < group.minSelection || (group.maxSelection > 0 && ids.length > group.maxSelection) || new Set(ids).size !== ids.length) valid = false;
        const products = ids.flatMap(id => {
          const selectedProduct = catalog.products.find(p => p.id === id && scoped(p) && group.productIds.includes(id));
          if (!selectedProduct) { valid = false; return []; }
          return [{ id, name: selectedProduct.productName }];
        });
        return { groupName: group.groupName, products };
      });
    }
    if (!valid) { removed++; continue; }
    items.push({ id: record.id, cartItemId: choice.cartItemId, itemType: choice.itemType,
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
    item.itemTotal = item.price + item.toppings.reduce((sum, topping) => sum + topping.price, 0);
  });
  return { items, removed };
}
