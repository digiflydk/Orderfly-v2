/* Content fixes on the website pages (2026-11-15); the pages have no CMS, so content is corrected
 * here. Shared by scripts/preview-content-fixes.cjs (apply) and the baseline tests (reverse).
 *  1. "15. Stenovnspizza Stenovnspizza Pastrami Speciale" loses its repeated word wherever it is shown.
 *  2. /menu/desserter listed "Hjemmelavet Tiramisu" twice; the duplicate card (/dishes/hjemmelavet-tiramisu-2)
 *     is removed. The server redirects that address to /dishes/hjemmelavet-tiramisu
 *     (src/lib/website-redirects.ts). Each change is matched by its exact surrounding text. */
const TEXT_FIXES = [
 [
  "/dishes/15-pastrami-speciale",
  "ading-style-h1\">15. Stenovnspizza Stenovnspizza Pastrami Speciale</h1><di",
  "ading-style-h1\">15. Stenovnspizza Pastrami Speciale</h1><di"
 ],
 [
  "/dishes/15-pastrami-speciale",
  "shes-text-left\">15. Stenovnspizza Stenovnspizza Pastrami Speciale</h2><di",
  "shes-text-left\">15. Stenovnspizza Pastrami Speciale</h2><di"
 ],
 [
  "/menu",
  "e-h3 menu-card\">15. Stenovnspizza Stenovnspizza Pastrami Speciale</div><p",
  "e-h3 menu-card\">15. Stenovnspizza Pastrami Speciale</div><p"
 ],
 [
  "/menu/pizza",
  "ing=\"lazy\" alt=\"15. Stenovnspizza Stenovnspizza Pastrami Speciale\" class=",
  "ing=\"lazy\" alt=\"15. Stenovnspizza Pastrami Speciale\" class="
 ],
 [
  "/menu/pizza",
  "-product-title\">15. Stenovnspizza Stenovnspizza Pastrami Speciale</h3><p ",
  "-product-title\">15. Stenovnspizza Pastrami Speciale</h3><p "
 ]
];
const DUPLICATE_TIRAMISU_CARD = "<div role=\"listitem\" class=\"menu-product-item w-dyn-item\"><a href=\"/dishes/hjemmelavet-tiramisu-2\" class=\"menu-product-card w-inline-block\"><div class=\"menu-product-image-wrap\"><img data-es-variant=\"1\" srcset=\"/_assets/724d9c49c1fc73490957d51e.avif 760w, /_assets/a5e894437d23a7eee9e19b02.avif 1200w\" sizes=\"(max-width: 767px) calc(100vw - 32px), (max-width: 1440px) 400px, 490px\" src=\"/_assets/a5e894437d23a7eee9e19b02.avif\" loading=\"lazy\" alt=\"Hjemmelavet Tiramisu\" class=\"menu-product-image\"/><div class=\"menu-product-tag w-dyn-bind-empty\"></div></div><h3 class=\"menu-product-title\">Hjemmelavet Tiramisu</h3><p class=\"menu-product-description\">Hjemmelavet tiramisu.</p><div class=\"menu-product-price\">65</div><div class=\"menu-cms-helper\">desserter</div><div class=\"menu-dish-slug-helper\">hjemmelavet-tiramisu-2</div></a><a href=\"#\" class=\"menu-cms-helper w-inline-block\"></a></div>";
const CARD_MARKER = '<!--es-content-v1:duplicate-tiramisu-removed-->';
function once(html, find, label) { if (html.split(find).length !== 2) throw Error(`Expected exactly one ${label}`); }
function applyContentFixes(route, html) {
  for (const [page, from, to] of TEXT_FIXES) if (page === route) { once(html, from, 'text to fix on ' + route); html = html.replace(from, () => to); }
  if (route === '/menu/desserter') { once(html, DUPLICATE_TIRAMISU_CARD, 'duplicate tiramisu card'); html = html.replace(DUPLICATE_TIRAMISU_CARD, () => CARD_MARKER); }
  return html;
}
function reverseContentFixes(route, html) {
  if (route === '/menu/desserter' && html.includes(CARD_MARKER)) html = html.replace(CARD_MARKER, () => DUPLICATE_TIRAMISU_CARD);
  for (const [page, from, to] of [...TEXT_FIXES].reverse()) if (page === route && html.includes(to)) { once(html, to, 'fixed text on ' + route); html = html.replace(to, () => from); }
  return html;
}
module.exports = { applyContentFixes, reverseContentFixes, CARD_MARKER };
