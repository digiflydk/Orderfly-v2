import type { Product, Topping, ToppingGroup, CartItemTopping } from '@/types';
import { activeToppingGroupIds } from './topping-conditions';
import { money } from './money';
import { MAX_TOPPINGS_PER_ITEM } from './commerce-limits';
import { isSyntheticProduct } from './synthetic-product';

export type OptionProduct = Pick<Product, 'toppingGroupIds' | 'toppingGroupConditions' | 'toppingOverrides'> & Partial<Pick<Product, 'id' | 'brandId' | 'locationIds'>>;
export type OptionScope = { brandId: string; locationId: string; deliveryType: 'pickup' | 'delivery' };
export type EffectiveTopping = Topping & { kind: 'addition' | 'removal'; maxQuantity: number; defaultQuantity: number };
export type ToppingQuantities = Record<string, number>;
const own = (object: object, key: string) => Object.hasOwn(object, key);
const validQuantity = (n: unknown): n is number => Number.isSafeInteger(n) && Number(n) >= 1 && Number(n) <= MAX_TOPPINGS_PER_ITEM;
const validPrice = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && Number.isSafeInteger(Math.round(n * 100));

/** Resolve product-specific options before both display and server validation. */
export function resolveToppingOptions(product: OptionProduct, groups: ToppingGroup[], toppings: Topping[], products: Partial<Product>[] = [], scope?: OptionScope): EffectiveTopping[] {
  const attached = new Set(product.toppingGroupIds || []);
  return toppings.flatMap(option => {
    const group = groups.find(g => g.id === option.groupId && attached.has(g.id));
    if (!group || !option.isActive || (scope && (!group.locationIds?.includes(scope.locationId) || !option.locationIds?.includes(scope.locationId)))) return [];
    if (group.kind !== undefined && group.kind !== 'addition' && group.kind !== 'removal') return [];
    const override = product.toppingOverrides && own(product.toppingOverrides, option.id) ? product.toppingOverrides[option.id] : undefined;
    if (override && (typeof override !== 'object' || Array.isArray(override))) return [];
    if (override?.isAvailable === false) return [];
    if (override?.isAvailable !== undefined && typeof override.isAvailable !== 'boolean') return [];
    if (override?.isDefault !== undefined && typeof override.isDefault !== 'boolean') return [];
    let name = option.toppingName, price = option.price;
    if (option.productId !== undefined) {
      const matches = products.filter(p => p.id === option.productId);
      const linked = matches[0];
      const brandId = scope?.brandId ?? product.brandId;
      if (matches.length !== 1 || !linked || !brandId || linked.brandId !== brandId || !linked.isActive || isSyntheticProduct(linked) ||
          linked.id === product.id || linked.toppingGroupIds?.length ||
          (!Array.isArray(linked.locationIds) || (linked.locationIds.length > 0 &&
            (scope ? !linked.locationIds.includes(scope.locationId) : !product.locationIds?.every(id => linked.locationIds!.includes(id)))))) return [];
      const linkedPrice = scope?.deliveryType === 'delivery' ? linked.priceDelivery ?? linked.price : linked.price;
      if (typeof linked.productName !== 'string' || !validPrice(linkedPrice)) return [];
      name = linked.productName;
      price = linkedPrice;
    }
    if (typeof name !== 'string' || !name.trim() || name.length > 200 || /[\u0000-\u001f\u007f]/u.test(name)) return [];
    if (override?.price !== undefined) price = override.price;
    const kind = group.kind ?? 'addition';
    const maxQuantity = option.maxQuantity ?? 1;
    if (!validQuantity(maxQuantity) || !validPrice(price) || toppingLabel({toppingName:name,kind},maxQuantity).length > 200) return [];
    const isDefault = override?.isDefault ?? option.isDefault ?? false;
    const defaultQuantity = override?.defaultQuantity ?? 1;
    if (!validQuantity(defaultQuantity) || defaultQuantity > maxQuantity) return [];
    // Removing an ingredient can never charge the customer or silently remove it.
    if (kind === 'removal' && (price !== 0 || maxQuantity !== 1 || isDefault || defaultQuantity !== 1)) return [];
    return [{...option, toppingName: name, price: money(price), kind, maxQuantity, isDefault, defaultQuantity}];
  });
}

export function toppingLabel(option: Pick<EffectiveTopping, 'toppingName' | 'kind'>, quantity = 1): string {
  return option.kind === 'removal' ? `Uden ${option.toppingName}` : quantity > 1 ? `${quantity} × ${option.toppingName}` : option.toppingName;
}

export function cartTopping(option: EffectiveTopping, quantity = 1): CartItemTopping {
  if (!validQuantity(quantity) || quantity > option.maxQuantity) throw new Error('Invalid topping quantity.');
  return { id: option.id, name: toppingLabel(option, quantity), quantity, unitPrice: option.price, price: money(option.price * quantity) };
}

/** Minimum/maximum are totals; selectionMode=single limits distinct choices separately. */
export function toppingSelectionError(product: OptionProduct, groups: ToppingGroup[], options: EffectiveTopping[], quantities: ToppingQuantities, limit = MAX_TOPPINGS_PER_ITEM): string | null {
  const ids = Object.keys(quantities);
  if (ids.length > limit || ids.some(id => !validQuantity(quantities[id]))) return 'Ugyldigt antal tilvalg.';
  const active = activeToppingGroupIds(product, groups, options, ids);
  let total = 0;
  for (const id of ids) {
    const matches = options.filter(option => option.id === id);
    const option = matches[0];
    if (matches.length !== 1 || !active.has(option.groupId) || quantities[id] > option.maxQuantity) return 'Et tilvalg er ikke tilgængeligt i det valgte antal.';
    total += quantities[id];
  }
  if (total > limit) return 'Der er valgt for mange tilvalg.';
  for (const group of groups.filter(group => active.has(group.id))) {
    if (!Number.isSafeInteger(group.minSelection) || group.minSelection < 0 || !Number.isSafeInteger(group.maxSelection) || group.maxSelection < 0 || (group.maxSelection > 0 && group.minSelection > group.maxSelection) ||
        (group.selectionMode !== undefined && group.selectionMode !== 'single' && group.selectionMode !== 'multiple')) return 'Tilvalgsgruppens regler er ugyldige.';
    const selected = options.filter(option => option.groupId === group.id && own(quantities, option.id));
    const count = selected.reduce((sum, option) => sum + quantities[option.id], 0);
    if (count < group.minSelection || (group.maxSelection > 0 && count > group.maxSelection) || (group.selectionMode === 'single' && selected.length > 1)) return 'Kontrollér antallet i tilvalgsgruppen.';
  }
  return null;
}

/** Remove hidden options, adding defaults only when a group first becomes visible. */
export function reconcileToppingQuantities(product: OptionProduct, groups: ToppingGroup[], options: EffectiveTopping[], quantities: ToppingQuantities, limit = MAX_TOPPINGS_PER_ITEM, previousQuantities?: ToppingQuantities): ToppingQuantities {
  const next: ToppingQuantities = Object.create(null);
  const active = activeToppingGroupIds(product, groups, options, Object.keys(quantities));
  const previous = previousQuantities === undefined ? new Set<string>() : activeToppingGroupIds(product, groups, options, Object.keys(previousQuantities));
  for (const [id, count] of Object.entries(quantities)) {
    const option = options.find(option => option.id === id && active.has(option.groupId));
    if (option && validQuantity(count) && count <= option.maxQuantity) next[id] = count;
  }
  // A default in a root group may activate a dependent group in this same pass.
  // Conditions deliberately support only one level, so two passes suffice.
  for (let pass = 0; pass < 2; pass++) {
   const visible = activeToppingGroupIds(product, groups, options, Object.keys(next));
   for (const group of groups.filter(group => visible.has(group.id))) {
    if (previous.has(group.id) || options.some(option => option.groupId === group.id && own(next, option.id))) continue;
    let count = 0, choices = 0;
    for (const option of options.filter(option => option.groupId === group.id && option.isDefault && option.kind !== 'removal')) {
      const quantity = option.defaultQuantity;
      const total = Object.values(next).reduce((sum, value) => sum + value, 0);
      if (total + quantity > limit || (group.maxSelection > 0 && count + quantity > group.maxSelection) || (group.selectionMode === 'single' && choices > 0)) continue;
      next[option.id] = quantity; count += quantity; choices++;
    }
  }
  }
  return next;
}
