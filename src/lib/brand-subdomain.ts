import { isEsmeraldaV2Host } from './esmeralda-v2-host';
import { ESMERALDA_MENU_IMAGE_PATHS } from './esmeralda-menu-images';

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
  'web', 'internal-web-preview', 'internal-mpanel-host', 'www', 'api', 'admin', 'app', 'staging', 'mail', 'support',
  'superadmin', 'superadmin-safe', 'merchant', 'terminal', 'mapp', 'admin-login', 'feedback', 'feedback-admin',
  'games', 'tracking', 'checkout', 'verify', 'brand-safe', 'brand-site', 'm3', 'm3pizza', 'env-debug',
  // The stamp card portal path (/club on a brand subdomain) must never read as a brand.
  'club',
  // Explicit V2 presentation alias belongs to the existing Esmeralda brand.
  'esmeralda2',
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
  if (isEsmeraldaV2Host(hostHeader)) return 'esmeralda';
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
const PASSTHROUGH = ['/_next', '/api', '/feedback', '/games', '/tracking', '/admin-login', '/superadmin', '/merchant', '/terminal', '/mapp', '/verify'];
const PASSTHROUGH_FILES = new Set(['/favicon.ico', '/icon.png', '/robots.txt', '/sitemap.xml', '/openapi.json', '/fonts/inter/inter-latin-wght-normal.woff2']);
for (const path of ESMERALDA_MENU_IMAGE_PATHS) PASSTHROUGH_FILES.add(path);

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

/**
 * Storefront address for a brand (#282): /{slug}/… on orderfly.dk, /… on the
 * brand's own subdomain, like clubBase. The short form is used only when the
 * middleware rewrites it back to the same page, so a location slug equal to the
 * brand slug or to an app-wide path (/feedback, /api, …) keeps the long form.
 */
export function storefrontPath(slug: string, onBrandSubdomain: boolean, ...segments: string[]): string {
  const long = [slug, ...segments].map(part => `/${part}`).join('');
  const short = segments.map(part => `/${part}`).join('') || '/';
  return onBrandSubdomain && brandSubdomainRewrite(short, slug) === long ? short : long;
}

/** Path segments after the brand, the same for /{slug}/x on the apex and /x on the subdomain. */
export function storefrontSegments(pathname: string | null | undefined, slug: string): string[] {
  const segments = (pathname ?? '').split('/').filter(Boolean);
  return segments[0] === slug ? segments.slice(1) : segments;
}

/**
 * Where "Bestil nu" sends the customer (#282 follow-up). On orderfly.dk the
 * storefront continues on the brand's own subdomain, so the address shows the
 * short form from then on; every other host keeps the in-app path.
 */
export function orderEntryUrl(host: string | null | undefined, slug: string, ...segments: string[]): string {
  const current = (host ?? '').trim().toLowerCase().replace(/:\d+$/, '');
  const onApex = current === ROOT_DOMAIN || current === `www.${ROOT_DOMAIN}`;
  if (!onApex || brandSlugError(slug)) return storefrontPath(slug, brandSlugFromHost(host) === slug, ...segments);
  return `${brandSubdomainUrl(slug)}${storefrontPath(slug, true, ...segments)}`;
}
