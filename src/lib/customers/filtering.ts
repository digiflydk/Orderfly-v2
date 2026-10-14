export type CustomerTypeFilter = 'all' | 'no-orders' | 'first-order' | 'returning' | 'booking' | 'omnisend' | 'game-only';

export type FilterableCustomerSource = {
  kind: 'customer' | 'game';
  totalOrders?: number;
  hasBookingSource?: boolean;
  hasOmnisendSource?: boolean;
};

function dateOnly(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  if (!match) return null;
  const date = new Date(`${match[1]}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === match[1]
    ? match[1]
    : null;
}

/** Inclusive yyyy-mm-dd range. Missing/invalid record dates do not match an active range. */
export function matchesDateRange(value: string | null | undefined, from = '', to = ''): boolean {
  const start = from ? dateOnly(from) : null;
  const end = to ? dateOnly(to) : null;
  if ((from && !start) || (to && !end) || (start && end && start > end)) return false;
  if (!start && !end) return true;
  const date = dateOnly(value);
  return !!date && (!start || date >= start) && (!end || date <= end);
}

export function matchesCustomerSearch(query: string, values: Array<string | null | undefined>): boolean {
  const needle = query.trim().toLocaleLowerCase('da-DK');
  return !needle || values.some(value => (value || '').toLocaleLowerCase('da-DK').includes(needle));
}

/**
 * Segments are based on the sources passed in by the caller, so a brand-scoped
 * view can classify the same email differently for each brand.
 */
export function matchesCustomerType(type: CustomerTypeFilter, sources: FilterableCustomerSource[]): boolean {
  if (type === 'all') return true;
  const customers = sources.filter(source => source.kind === 'customer');
  if (type === 'game-only') return customers.length === 0 && sources.some(source => source.kind === 'game');
  if (type === 'booking') return customers.some(source => source.hasBookingSource === true);
  if (type === 'omnisend') return customers.some(source => source.hasOmnisendSource === true);
  if (!customers.length) return false;
  if (type === 'no-orders') return customers.some(source => (source.totalOrders || 0) === 0);
  if (type === 'first-order') return customers.some(source => source.totalOrders === 1);
  return customers.some(source => (source.totalOrders || 0) >= 2);
}
