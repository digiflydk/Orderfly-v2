// Shareable product links on the storefront menu: /{location}?produkt={slug}.
// Pure helpers, safe on the server and in the browser.

export const PRODUCT_LINK_PARAM = 'produkt';
const MAX_LINK_LENGTH = 120;

/** "1. Margherita (V)" → "1-margherita-v"; Danish letters are spelled out. */
export function productLinkSlug(name: string | undefined | null): string {
  return (name ?? '').toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 80).replace(/-+$/g, '');
}

type Linkable = { id: string; productName?: string | null; comboOnly?: boolean | null };

/**
 * One link per product id. A name shared by two different products, an empty
 * name, or a name equal to another product's id is ambiguous, so those
 * products use their id instead; a link therefore never opens a different
 * product than the one it was made for.
 */
export function productLinkSlugs(products: Linkable[]): Map<string, string> {
  const byId = new Map<string, Linkable>();
  for (const product of products) if (product.id && product.comboOnly !== true && !byId.has(product.id)) byId.set(product.id, product);
  const owners = new Map<string, Set<string>>();
  for (const product of byId.values()) {
    const slug = productLinkSlug(product.productName);
    if (!slug) continue;
    const set = owners.get(slug) ?? new Set<string>();
    set.add(product.id); owners.set(slug, set);
  }
  const links = new Map<string, string>();
  for (const product of byId.values()) {
    const slug = productLinkSlug(product.productName);
    // Ids are reserved: a slug that is another product's id would resolve to either product.
    const unique = slug && owners.get(slug)!.size === 1 && (slug === product.id || !byId.has(slug));
    links.set(product.id, unique ? slug : product.id);
  }
  return links;
}

/** The product id a link value refers to, or null for an unknown, stale or unsafe value. */
export function productIdForLink(links: Map<string, string>, value: string | null | undefined): string | null {
  const wanted = (value ?? '').trim();
  if (!wanted || wanted.length > MAX_LINK_LENGTH) return null;
  for (const [id, slug] of links) if (slug === wanted) return id;
  // Ids are accepted as a fallback, so a link survives a later rename only when made from the id.
  return links.has(wanted) ? wanted : null;
}

/** The current address with the product parameter set (or removed), keeping every other parameter. */
export function withProductLink(href: string, slug: string | null): string {
  const url = new URL(href);
  if (slug) url.searchParams.set(PRODUCT_LINK_PARAM, slug); else url.searchParams.delete(PRODUCT_LINK_PARAM);
  return url.pathname + url.search + url.hash;
}
