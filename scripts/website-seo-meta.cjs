/* Unique titles, descriptions and share previews for the 91 website pages that still carried the
 * exported generic title "Esmeralda Pizza & Restaurant" and no description (2026-11-15).
 * Shared by scripts/preview-seo-meta.cjs (apply) and the baseline tests (reverse). Text comes
 * only from each page's own heading, description and image, so nothing is invented. */
const GENERIC_TITLE = '<title>Esmeralda Pizza &amp; Restaurant</title>';
const ORIGIN = 'https://www.esmeraldapizza.dk';
const BRAND = 'Esmeralda Pizza Amager';
const INSERTED = /<title>[^<]*<\/title>((?:<meta [^>]*data-es-seo="v1"[^>]*>)+)/;

const decode = s => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const text = s => decode(s.replace(/<[^>]+>/g, ' ')).replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').trim();
const attr = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function clip(s, max) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1), space = cut.lastIndexOf(' ');
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, '') + '…';
}
function sentence(s) { s = s.trim(); return /[.!?…]$/.test(s) ? s : s + '.'; }
function body(html) { return html.slice(html.indexOf('<body')); }
function h1(html) { const m = body(html).match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/); return m ? text(m[1]) : ''; }
// The first image of a class that actually has a source (Webflow left empty w-dyn-bind-empty slots).
function imageAfter(html, cls) {
  for (const tag of body(html).match(new RegExp(`<img\\b[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>`, 'g')) || []) {
    const src = tag.match(/\bsrc="(\/_assets\/[^"]+)"/);
    if (src) return ORIGIN + src[1];
  }
  return '';
}
// A content image on product and overview pages: never the logos, footer brand or icons.
function contentImage(html) {
  for (const tag of body(html).match(/<img\b[^>]*>/g) || []) {
    const cls = (tag.match(/\bclass="([^"]*)"/) || [, ''])[1], src = tag.match(/\bsrc="(\/_assets\/[^"]+\.(?:avif|webp|jpe?g|png))"/);
    if (src && !/logo|brand|social_icon|flowappz|icon/.test(cls)) return ORIGIN + src[1];
  }
  return '';
}
const CTA = ' Bestil takeaway eller book bord hos Esmeralda på Amager.';
// The page's own text first; the call to action only when it fits whole.
function describe(about) {
  const s = sentence(about);
  return s.length + CTA.length <= 160 ? s + CTA : clip(s, 160);
}
// Collapse an accidental repeated word in exported headings ("Stenovnspizza Stenovnspizza").
const tidy = s => s.replace(/\b(\p{L}+)(\s+\1\b)+/giu, '$1');
function paragraphs(html) {
  return [...body(html).matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map(m => text(m[1]))
    .filter(t => t.length > 40 && !/cookie|©|Alle rettigheder|En bid af det italienske/i.test(t));
}

/** The metadata for one page, or null when the page is not one of the generic-title pages. */
function seoMeta(route, html) {
  if (!html.includes(GENERIC_TITLE)) return null;
  if (route.startsWith('/dishes/')) {
    const name = tidy(h1(html).replace(/^\d+\.?\s+/, ''));
    const b = body(html), start = b.search(/<h1\b/);
    const after = b.slice(start, start + 6000);
    const long = after.match(/<(?:p|div)\b[^>]*class="[^"]*text-size-regular text-color-primary[^"]*"[^>]*>([^<]{30,600})</);
    const short = after.match(/<(?:p|div)\b[^>]*class="[^"]*heading-style-h5[^"]*"[^>]*>([^<]{10,400})</);
    const about = text((long || short || [, ''])[1]);
    if (!name || !about) throw Error('Missing dish name or description on ' + route);
    return { title: `${name} | ${BRAND}`, description: describe(about), image: imageAfter(html, 'product_template-image') };
  }
  if (route.startsWith('/menu/')) {
    const name = h1(html);
    if (!name) throw Error('Missing category heading on ' + route);
    return { title: `${name} – menukort | ${BRAND}`, description: `Se ${name.toLowerCase()} på menukortet hos Esmeralda Pizza & Restaurant på Albaniensgade 6, Amager. Bestil takeaway eller book bord online.`, image: imageAfter(html, 'menu-product-image') };
  }
  const heading = h1(html) || text((body(html).match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/) || [, ''])[1]);
  const lead = paragraphs(html)[0];
  if (!heading || !lead) throw Error('Missing heading or lead paragraph on ' + route);
  const name = heading.charAt(0) + heading.slice(1).toLowerCase().replace(/esmeralda/g, 'Esmeralda');
  return { title: `${heading === heading.toUpperCase() ? name : heading} | ${BRAND}`, description: clip(lead, 160), image: contentImage(html) };
}

function tags(meta) {
  const t = [`<meta name="description" content="${attr(meta.description)}" data-es-seo="v1"/>`,
    `<meta property="og:title" content="${attr(meta.title)}" data-es-seo="v1"/>`,
    `<meta property="og:description" content="${attr(meta.description)}" data-es-seo="v1"/>`,
    `<meta property="og:type" content="website" data-es-seo="v1"/>`,
    `<meta name="twitter:card" content="${meta.image ? 'summary_large_image' : 'summary'}" data-es-seo="v1"/>`];
  if (meta.image) t.push(`<meta property="og:image" content="${attr(meta.image)}" data-es-seo="v1"/>`, `<meta name="twitter:image" content="${attr(meta.image)}" data-es-seo="v1"/>`);
  return t.join('');
}
function applySeoMeta(route, html) {
  const meta = seoMeta(route, html);
  if (!meta) return html;
  if (html.split(GENERIC_TITLE).length !== 2 || /<meta[^>]+name="description"|property="og:/.test(html.slice(0, html.indexOf('</head>')))) throw Error('Unexpected head on ' + route);
  return html.replace(GENERIC_TITLE, () => `<title>${attr(meta.title)}</title>` + tags(meta));
}
function reverseSeoMeta(route, html) {
  return INSERTED.test(html) ? html.replace(INSERTED, () => GENERIC_TITLE) : html;
}
module.exports = { seoMeta, applySeoMeta, reverseSeoMeta, GENERIC_TITLE };
