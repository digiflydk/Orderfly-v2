import type { EffectiveTopping } from './topping-options';

const collator = new Intl.Collator('da', { sensitivity: 'base', numeric: true });
const searchKey = (value: string) => value.trim().toLocaleLowerCase('da');

/** Explicit catalog ranks win. Unranked defaults precede alphabetical discovery. */
export function orderPresentedOptions<T extends Pick<EffectiveTopping, 'sortOrder' | 'isDefault' | 'toppingName'>>(options: T[]): T[] {
  const rank = (option: T) => typeof option.sortOrder === 'number' && Number.isFinite(option.sortOrder) ? option.sortOrder : Infinity;
  return [...options].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    // Equal explicit ranks retain the catalog order.
    if (rank(a) !== Infinity) return 0;
    return Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)) || collator.compare(a.toppingName, b.toppingName);
  });
}

/** Search changes presentation only; selected identities are always retained. */
export function presentOptionChoices<T extends Pick<EffectiveTopping, 'id' | 'toppingName'>>(options: T[], selectedIds: Set<string>, search: string, showAll: boolean, label: (option: T) => string = option => option.toppingName) {
  const query = searchKey(search);
  const relevance = (option: T) => {
    const name = searchKey(label(option));
    return name === query ? 0 : name.startsWith(query) ? 1 : 2;
  };
  const matches = options.filter(option => searchKey(label(option)).includes(query));
  if (query) matches.sort((a, b) => relevance(a) - relevance(b));
  const candidates = query || showAll ? matches : matches.slice(0, 6);
  const ids = new Set(candidates.map(option => option.id));
  const retained = options.filter(option => selectedIds.has(option.id) && !ids.has(option.id));
  return { matches, visible: [...candidates, ...retained] };
}
