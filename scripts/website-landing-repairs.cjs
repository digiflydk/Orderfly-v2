/* Landing-page repairs for www.esmeraldapizza.dk before the Google Ads launch (2026-11-15).
 * Shared by scripts/preview-landing-repairs.cjs (apply) and the baseline tests (reverse), so only
 * these exact, reviewed changes are made to, or removed from, the pinned pages:
 *  1. /kontakt: the disabled contact form becomes direct phone and e-mail actions.
 *  2. /menu: the category filter scrolls sideways inside the screen instead of widening the page
 *     (position:relative also contains its visually hidden, absolutely positioned radio inputs).
 *  3. All pages: dish and product images offer 760 px AVIF variants (srcset), and the unused Webflow CDN
 *     preconnect is removed. */
const PRECONNECTS = [
  ['<link href="https://cdn.prod.website-files.com" rel="preconnect" crossorigin="anonymous"/>', '<!--es-landing-v1:preconnect-a-->'],
  ['<link rel="preconnect" href="https://cdn.prod.website-files.com" crossorigin>', '<!--es-landing-v1:preconnect-b-->'],
];
const CONTACT_FORM = "<div class=\"form_block w-form\"><form id=\"email-form\" name=\"email-form\" data-name=\"Email Form\" class=\"form-2 contact-form-fields\" method=\"post\" data-website-contact=\"\"><label for=\"First-name\" class=\"form_field-label contact-form-label\">Navn</label><input class=\"contact-form-input-dark w-input\" maxlength=\"256\" name=\"First-name\" data-name=\"First name\" placeholder=\"Indtast dit navn\" type=\"text\" id=\"First-name\" required=\"\"/><label for=\"Last-name\" class=\"form_field-label contact-form-label\">Telefonnummer</label><input class=\"contact-form-input-dark w-input\" maxlength=\"256\" name=\"Last-name\" data-name=\"Last name\" placeholder=\"Indtast dit telefonnummer\" type=\"tel\" id=\"Last-name\"/><label for=\"Email\" class=\"form_field-label contact-form-label\">Email-adresse </label><input class=\"contact-form-input-dark w-input\" maxlength=\"256\" name=\"Email\" data-name=\"Email\" placeholder=\"Indtast din email-adresse\" type=\"email\" id=\"Email\" required=\"\"/><label for=\"contact-message\" class=\"form_field-label contact-form-label\">Besked</label><textarea required=\"\" placeholder=\"Skriv din besked her\" maxlength=\"5000\" id=\"contact-message\" name=\"Besked\" data-name=\"Besked\" class=\"contact-form-input-dark contact-form-message w-input\"></textarea><input type=\"submit\" data-wait=\"Vent venligst...\" class=\"contact-form-submit w-button\" value=\"Send besked\" disabled/></form><div class=\"form_success-message w-form-done\"><div>Thank you! Your submission has been received!</div></div><div class=\"form_error-message w-form-fail\"><div>Oops! Something went wrong while submitting the form.</div></div></div>";
const CONTACT_DIRECT = '<div class="form_block contact-direct" data-es-contact-direct="v1" style="display:flex;flex-direction:column;gap:12px">'
  + '<a class="contact-form-submit" href="tel:+4532505040" style="display:flex;align-items:center;justify-content:center;text-align:center;text-decoration:none;padding:0 16px">Ring 32 50 50 40</a>'
  + '<a class="contact-form-submit" href="mailto:info@esmeraldapizza.dk" style="display:flex;align-items:center;justify-content:center;text-align:center;text-decoration:none;padding:0 16px">Skriv til info@esmeraldapizza.dk</a>'
  + '</div>';
const CONTACT_TEXT = [
  ['<p class="contact-form-kicker">SEND EN BESKED</p>', '<p class="contact-form-kicker">KONTAKT OS</p>'],
  ['<p class="contact-form-lead">Udfyld formularen, så vender vi tilbage hurtigst muligt.</p>', '<p class="contact-form-lead">Ring eller skriv til os, så hjælper vi dig hurtigst muligt.</p>'],
];
const MENU_STYLE = '<style data-es-landing="v1">#wf-form-Dish-category .collection-list-wrapper{position:relative;max-width:100%;overflow-x:auto;overscroll-behavior-x:contain;-webkit-overflow-scrolling:touch;scrollbar-width:thin}</style>';
// Rendered widths measured live (390/1280/1600 px viewports): list, menu and recommendation images
// at most ~490 CSS px; the dish page's main image up to ~675 CSS px.
const SIZES = [
  [/\bproduct_template-image\b/, '(max-width: 767px) calc(100vw - 32px), 680px'],
  [/\b(?:dishes_image|menu-product-image|recommend-image)\b/, '(max-width: 767px) calc(100vw - 32px), (max-width: 1440px) 400px, 490px'],
];
const VARIANT_ATTR = /<img data-es-variant="1" srcset="[^"]*" sizes="[^"]*" /g;

function once(html, find, label) {
  if (html.split(find).length !== 2) throw Error(`Expected exactly one ${label}`);
}
function applyLandingRepairs(route, html, variants) {
  for (const [tag, marker] of PRECONNECTS) if (html.includes(tag)) { once(html, tag, 'preconnect'); html = html.replace(tag, () => marker); }
  if (html.includes('cdn.prod.website-files.com')) throw Error('Unexpected Webflow CDN reference on ' + route);
  if (route === '/kontakt') {
    once(html, CONTACT_FORM, 'contact form');
    html = html.replace(CONTACT_FORM, () => CONTACT_DIRECT);
    for (const [from, to] of CONTACT_TEXT) { once(html, from, 'contact text'); html = html.replace(from, () => to); }
  }
  if (route === '/menu') { once(html, '</head>', 'head'); html = html.replace('</head>', () => MENU_STYLE + '</head>'); }
  const bySource = new Map(Object.entries(variants).map(([route, v]) => [v.source, {route, ...v}]));
  html = html.replace(/<img\b[^>]*>/g, tag => {
    const cls = (tag.match(/\bclass="([^"]*)"/) || [])[1] || '';
    const sizes = SIZES.find(([pattern]) => pattern.test(cls));
    if (!sizes || !tag.startsWith('<img ')) return tag;
    const src = tag.match(/\bsrc="(\/_assets\/[^"]+)"/);
    const variant = src && bySource.get(src[1]);
    if (!variant || /\bsrcset=/.test(tag)) return tag;
    return `<img data-es-variant="1" srcset="${variant.route} ${variant.width}w, ${src[1]} ${variant.sourceWidth}w" sizes="${sizes[1]}" ` + tag.slice(5);
  });
  return html;
}
function reverseLandingRepairs(route, html) {
  html = html.replace(VARIANT_ATTR, '<img ');
  if (route === '/menu') { once(html, MENU_STYLE, 'menu repair style'); html = html.replace(MENU_STYLE, ''); }
  if (route === '/kontakt') {
    once(html, CONTACT_DIRECT, 'direct contact actions');
    html = html.replace(CONTACT_DIRECT, () => CONTACT_FORM);
    for (const [from, to] of CONTACT_TEXT) { once(html, to, 'repaired contact text'); html = html.replace(to, () => from); }
  }
  for (const [tag, marker] of PRECONNECTS) if (html.includes(marker)) html = html.replace(marker, () => tag);
  return html;
}
module.exports = { applyLandingRepairs, reverseLandingRepairs, CONTACT_DIRECT, MENU_STYLE };
