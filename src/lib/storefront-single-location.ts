// A brand with exactly one orderable restaurant skips the "Vælg restaurant" page: the brand root
// sends customers straight to that menu, and the sitemap lists only the menu. With a second
// active restaurant the picker returns automatically.
const RESERVED = new Set(['club', 'checkout', 'confirmation', 'cancel']);

type Listed = { brandId?: string; isActive?: boolean; slug: string };

/** Restaurants the storefront offers for ordering (same rule as the sitemap). */
export function orderableLocations<T extends Listed>(brandId: string, locations: T[]): T[] {
  return locations.filter(location => location.brandId === brandId && location.isActive !== false
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(location.slug) && !RESERVED.has(location.slug));
}

/** The only orderable restaurant, or null when there are none or several. */
export function singleOrderableLocation<T extends Listed>(brandId: string, locations: T[]): T | null {
  const orderable = orderableLocations(brandId, locations);
  return orderable.length === 1 ? orderable[0] : null;
}

/** Query string of the incoming request, kept on the redirect (campaign parameters). */
export function forwardedQuery(searchParams: Record<string, string | string[] | undefined> | undefined): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    for (const entry of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, entry);
  }
  const text = query.toString();
  return text ? `?${text}` : '';
}
