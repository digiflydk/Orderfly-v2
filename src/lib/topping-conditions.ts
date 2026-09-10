import type { Product, Topping, ToppingGroup } from '@/types';

type Config = Pick<Product, 'toppingGroupIds' | 'toppingGroupConditions'>;

// Conditions reference options in unconditional groups on this same product.
// Nested/circular rules and unrelated catalog options cannot activate a group.
export function activeToppingGroupIds(product: Config, groups: ToppingGroup[], toppings: Topping[], selectedIds: Iterable<string>) {
  const selected = new Set(selectedIds);
  const attached = new Set(product.toppingGroupIds || []);
  const conditions = product.toppingGroupConditions || {};
  const roots = new Set(groups.filter(g => attached.has(g.id) && !Object.hasOwn(conditions, g.id)).map(g => g.id));
  const triggers = new Set(toppings.filter(t => t.isActive && roots.has(t.groupId) && selected.has(t.id)).map(t => t.id));
  return new Set(groups.filter(g => attached.has(g.id) && (roots.has(g.id) ||
    (Array.isArray(conditions[g.id]) && conditions[g.id].some(id => triggers.has(id))))).map(g => g.id));
}

export function reconcileToppingIds(product: Config, groups: ToppingGroup[], toppings: Topping[], selectedIds: Iterable<string>, limit: number, previousSelectedIds?: Iterable<string>) {
  const selected = new Set(selectedIds);
  const active = activeToppingGroupIds(product, groups, toppings, selected);
  const previouslyActive = previousSelectedIds === undefined ? new Set<string>()
    : activeToppingGroupIds(product, groups, toppings, previousSelectedIds);
  const allowed = toppings.filter(t => t.isActive && active.has(t.groupId));
  for (const id of selected) if (!allowed.some(t => t.id === id)) selected.delete(id);
  for (const group of groups.filter(g => active.has(g.id))) {
    // Preserve explicit deselection and saved empty choices in already visible groups.
    if (previouslyActive.has(group.id)) continue;
    const options = allowed.filter(t => t.groupId === group.id);
    // Never replace an explicit choice with a default when its parent changes.
    if (options.some(t => selected.has(t.id))) continue;
    for (const option of options.filter(t => t.isDefault)) {
      if (selected.size >= limit) break;
      if (group.maxSelection > 0 && options.filter(t => selected.has(t.id)).length >= group.maxSelection) break;
      selected.add(option.id);
    }
  }
  return selected;
}
