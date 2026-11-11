/* The homepage Club promotion's measurement before and after GTM-PK4J8ZFD took over Google
 * Analytics (2026-11-11). Shared by scripts/preview-gtm-orderfly.cjs and the baseline tests, so
 * only this exact, reviewed change can be applied to or reversed from the pinned homepage. */
const GA_LINE = "  var GA = 'G-F9XCDW2586'; // Existing website property; never the Orderfly commerce property.\n";
const OLD_MEASURE = `    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    gtag('event', name, {send_to: GA, promotion_id:'esmeralda_pizza_club', promotion_name:'Esmeralda Pizza Club',
      creative_slot:slot, page_location:'https://www.esmeraldapizza.dk/', page_referrer:''});`;
const NEW_MEASURE = `    // GTM-PK4J8ZFD owns Google Analytics and Ads (2026-11-11): a standard GA4 ecommerce
    // promotion event for its triggers, without a hard-coded measurement id.
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ecommerce: null});
    window.dataLayer.push({event: name, ecommerce: {promotion_id:'esmeralda_pizza_club', promotion_name:'Esmeralda Pizza Club', creative_slot:slot}});`;
function applyClubPromoGtm(html) {
  if (html.split(GA_LINE).length !== 2 || html.split(OLD_MEASURE).length !== 2) throw Error('Unexpected Club promotion measurement');
  return html.replace(GA_LINE, '').replace(OLD_MEASURE, () => NEW_MEASURE);
}
function reverseClubPromoGtm(html) {
  if (html.split(NEW_MEASURE).length !== 2 || html.includes(GA_LINE)) throw Error('Club promotion is not the GTM version');
  const marker = "  var BASE = 'https://esmeralda.orderfly.dk';\n";
  if (html.split(marker).length !== 2) throw Error('Club promotion anchor missing');
  return html.replace(NEW_MEASURE, () => OLD_MEASURE).replace(marker, () => GA_LINE + marker);
}
module.exports = { applyClubPromoGtm, reverseClubPromoGtm };
