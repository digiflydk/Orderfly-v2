import type { Product, ProductForMenu, Topping, ToppingGroup, CartItemTopping } from '@/types';
import { resolveToppingOptions, toppingSelectionError, cartTopping, type OptionScope } from './topping-options';

/** Only stable choices cross the trust boundary. Prices and labels are catalog-derived. */
export function resolveComboProductModifiers(product: Product | ProductForMenu,
  modifiers: {id: string; quantity: number}[],
  catalog: {groups: ToppingGroup[]; toppings: Topping[]; products: (Product | ProductForMenu)[]}, scope: OptionScope): CartItemTopping[] | null {
  const groups = catalog.groups.filter(g => product.toppingGroupIds?.includes(g.id) && g.locationIds.includes(scope.locationId));
  const options = resolveToppingOptions(product, groups, catalog.toppings, catalog.products, scope);
  if (new Set(modifiers.map(m => m.id)).size !== modifiers.length) return null;
  const quantities = Object.fromEntries(modifiers.map(m => [m.id, m.quantity]));
  if (toppingSelectionError(product, groups, options, quantities)) return null;
  return modifiers.map(m => cartTopping(options.find(o => o.id === m.id)!, m.quantity));
}
