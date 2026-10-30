import type { CartItem, ProductForMenu } from '@/types';

/** Keep configured offer order and authoritative menu records; never invent recommendations. */
export function relevantUpsellProducts(offered: ProductForMenu[], catalog: ProductForMenu[], cart: CartItem[], limit = 3): ProductForMenu[] {
  const included = new Set(cart.flatMap(item => item.itemType === 'product'
    ? [item.id]
    : (item.comboSelections || []).flatMap(group => group.products.map(product => product.id))));
  const known = new Map(catalog.map(product => [product.id, product]));
  const seen = new Set<string>();
  return offered.flatMap(candidate => {
    const product = known.get(candidate.id);
    if (!product || product.comboOnly === true || product.isActive === false || included.has(product.id) || seen.has(product.id)) return [];
    seen.add(product.id);
    return [product];
  }).slice(0, limit);
}
