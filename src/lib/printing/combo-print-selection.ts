/** Map server-saved component choices to their historical, checkout-ordered labels.
 * Never reconstruct ingredient names/prices from today's catalog. */
export function comboPrintSelections(item: {
  name: string; toppings?: string[];
  comboSelections?: { groupName: string; products: { id: string; name: string; modifiers?: { id: string; quantity: number }[] }[] }[];
}) {
  let offset = 0;
  const labels = item.toppings ?? [];
  const selections = (item.comboSelections ?? []).flatMap((group, groupIndex) => group.products.map((product, productIndex) => {
    const count = product.modifiers?.length ?? 0;
    const modifiers = labels.slice(offset, offset + count); offset += count;
    if (modifiers.length !== count || modifiers.some(label => !label.startsWith(`${product.name}: `))) throw new Error('invalid_combo_modifiers');
    return { groupIndex, productIndex, product, groupName: group.groupName, modifiers };
  }));
  if (offset !== labels.length || !selections.length) throw new Error('invalid_combo_modifiers');
  return selections;
}
