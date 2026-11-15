// Permanent redirects for www.esmeraldapizza.dk pages that were removed from the site but stay in the
// pinned payload (scripts/website-content-fixes.cjs). Exact paths only; the query string is kept.
// A redirected page is left out of the sitemap, so search engines index only its target.
export const WEBSITE_REDIRECTS: Readonly<Record<string, string>> = Object.freeze({
  // Duplicate of the same dessert (2026-11-15); the dessert menu lists only the original.
  '/dishes/hjemmelavet-tiramisu-2': '/dishes/hjemmelavet-tiramisu',
});
