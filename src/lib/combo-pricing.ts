import type { ComboMenu, ComboSelection, ProductGroup } from '@/types';
import { money, sumMoney } from './money';

/** Catalog amounts only. Never accept a supplement from the basket payload. */
export function comboProductAdjustment(group: ProductGroup, productId: string): number {
  if (!group.productIds.includes(productId)) throw new Error('Product is not in this combo group');
  const value = Object.hasOwn(group.productPriceAdjustments || {}, productId) ? group.productPriceAdjustments![productId] : 0;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('Invalid combo supplement');
  return money(value);
}

/** May price incomplete builder selections; cardinality is validated at checkout. */
export function comboSelectionAdjustments(combo: Pick<ComboMenu, 'productGroups'>, selections: ComboSelection[]): number {
  const seen = new Set<string>();
  return sumMoney(selections.map(selection => {
    const groups = combo.productGroups.filter(group => selection.groupId ? group.id === selection.groupId : group.groupName === selection.groupName);
    if (groups.length !== 1 || seen.has(groups[0].id)) throw new Error('Invalid combo group');
    const group = groups[0]; seen.add(group.id);
    const ids = selection.products.map(product => product.id);
    if (new Set(ids).size !== ids.length) throw new Error('Duplicate combo product');
    return sumMoney(ids.map(id => comboProductAdjustment(group, id)));
  }));
}

/** Minimum completion amount including the product retained by an upgrade. */
export function comboMinimumAdjustments(combo: Pick<ComboMenu, 'productGroups'>, preselectedProductId?: string): number {
  const preselectedGroup = preselectedProductId ? combo.productGroups.find(group => group.productIds.includes(preselectedProductId)) : undefined;
  return sumMoney(combo.productGroups.map(group => {
    const selected = group === preselectedGroup ? preselectedProductId : undefined;
    const count = Math.max(0, group.minSelection - (selected ? 1 : 0));
    const available = [...new Set(group.productIds)].filter(id => id !== selected).map(id => comboProductAdjustment(group, id)).sort((a, b) => a - b);
    if (available.length < count) throw new Error('Combo cannot be completed');
    return sumMoney([selected ? comboProductAdjustment(group, selected) : 0, ...available.slice(0, count)]);
  }));
}
