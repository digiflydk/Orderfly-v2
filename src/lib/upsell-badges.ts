export type UpsellBadge = 'popular' | 'recommended' | 'none';
export const upsellBadgeLabels = { popular: 'Populær', recommended: 'Vi anbefaler', none: '' };
/** Stable campaign order resolves positive-sales ties; manual choices win, including none. */
export function upsellBadges(ids: string[], sales: Record<string, number>, overrides: Record<string, UpsellBadge> = {}) {
    const unique = [...new Set(ids)];
    const max = Math.max(0, ...unique.map(id => sales[id] || 0));
    const leaders = max > 0 ? unique.filter(id => sales[id] === max) : [];
    return Object.fromEntries(unique.map(id => [id, overrides[id] ?? (id === leaders[0] ? 'popular' : id === leaders[1] ? 'recommended' : 'none')])) as Record<string, UpsellBadge>;
}
