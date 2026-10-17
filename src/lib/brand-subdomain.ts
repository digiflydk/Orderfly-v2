// Brand subdomains under orderfly.dk (#12). The existing unique brand `slug`
// is the subdomain label, so `esmeralda` serves https://esmeralda.orderfly.dk.
// Pure helpers: safe to import from edge middleware, server and client code.

export const ROOT_DOMAIN = 'orderfly.dk';
export const BRAND_SLUG_MIN = 2;
export const BRAND_SLUG_MAX = 40;

// Infrastructure names from #12, plus first-level app routes and middleware
// aliases (`/m3pizza`), which a brand
// slug must never shadow on the apex domain (/{slug}) or as a subdomain.
export const RESERVED_BRAND_SLUGS = new Set([
  'www', 'api', 'admin', 'app', 'staging', 'mail', 'support',
  'superadmin', 'superadmin-safe', 'merchant', 'admin-login', 'feedback', 'feedback-admin',
  'games', 'tracking', 'checkout', 'verify', 'brand-safe', 'brand-site', 'm3', 'm3pizza', 'env-debug',
  'features', 'pricing', 'contact', 'ok', 'health', 'static', 'assets', 'cdn',
]);

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Suggest a slug from a brand name: lower case, Danish letters spelled out, hyphens only. */
export function slugifyBrandName(name: string): string {
  return name.toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, BRAND_SLUG_MAX).replace(/-+$/g, '');
}

/** Returns a Danish explanation when the slug cannot be used, otherwise null. */
export function brandSlugError(slug: string): string | null {
  if (slug.length < BRAND_SLUG_MIN || slug.length > BRAND_SLUG_MAX)
    return `Slug skal være ${BRAND_SLUG_MIN}–${BRAND_SLUG_MAX} tegn.`;
  if (!SLUG_PATTERN.test(slug))
    return 'Slug må kun indeholde små bogstaver a–z, tal og bindestreg, og skal starte og slutte med et bogstav eller tal.';
  if (RESERVED_BRAND_SLUGS.has(slug)) return `"${slug}" er reserveret og kan ikke bruges.`;
  return null;
}

// Fixed pages under /{brand}/ that a location with the same slug would be hidden behind.
export const RESERVED_LOCATION_SLUGS = new Set(['club']);

/** Returns a Danish explanation when a location slug is reserved, otherwise null. */
export function locationSlugError(slug: string): string | null {
  return RESERVED_LOCATION_SLUGS.has(slug.trim().toLowerCase()) ? `"${slug.trim()}" er reserveret og kan ikke bruges som adresse.` : null;
}

export function brandSubdomainUrl(slug: string): string {
  return `https://${slug}.${ROOT_DOMAIN}`;
}

/** Free alternatives for a taken slug, e.g. esmeralda-2, esmeralda-3. */
export function brandSlugAlternatives(slug: string, taken: (candidate: string) => boolean, count = 3): string[] {
  const result: string[] = [];
  for (let n = 2; result.length < count && n < 100; n++) {
    const suffix = `-${n}`;
    const candidate = `${slug.slice(0, BRAND_SLUG_MAX - suffix.length).replace(/-+$/g, '')}${suffix}`;
    if (!brandSlugError(candidate) && !taken(candidate)) result.push(candidate);
  }
  return result;
}

/**
 * The brand slug addressed by a request host, or null for the apex domain,
 * www, reserved names, nested subdomains and other hosts. `{slug}.localhost`
 * is accepted for local testing, since browsers resolve *.localhost locally.
 */
export function brandSlugFromHost(hostHeader: string | null | undefined): string | null {
  const host = (hostHeader ?? '').split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');
  for (const root of [ROOT_DOMAIN, 'localhost']) {
    if (!host.endsWith(`.${root}`)) continue;
    const label = host.slice(0, -root.length - 1);
    if (!label || label.includes('.')) return null;
    return brandSlugError(label) ? null : label;
  }
  return null;
}

// App-wide paths keep their own routes on a brand subdomain.
const PASSTHROUGH = ['/_next', '/api', '/feedback', '/games', '/tracking', '/admin-login', '/superadmin', '/merchant', '/verify'];
const PASSTHROUGH_FILES = new Set(['/favicon.ico', '/icon.png', '/robots.txt', '/sitemap.xml', '/openapi.json']);

/**
 * Internal path for a request on a brand subdomain, or null when no rewrite is
 * needed. `/` shows the brand; `/{location}` shows that brand's location. A
 * path already starting with the brand slug is kept, so existing absolute
 * links keep working. Any other first segment is scoped under this brand, so
 * one subdomain can never render another brand's pages.
 */
export function brandSubdomainRewrite(pathname: string, slug: string): string | null {
  if (PASSTHROUGH_FILES.has(pathname) || PASSTHROUGH.some(p => pathname === p || pathname.startsWith(`${p}/`))) return null;
  if (pathname === `/${slug}` || pathname.startsWith(`/${slug}/`)) return null;
  return pathname === '/' ? `/${slug}` : `/${slug}${pathname}`;
}
