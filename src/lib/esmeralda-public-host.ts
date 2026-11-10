import { websiteBookingStep } from '@/lib/website-booking-routes';
// Public website routing is additive to the existing merchant application.
export const ESMERALDA_PUBLIC_ORIGIN = 'https://www.esmeraldapizza.dk';
export function isEsmeraldaPublicHost(host: string | null): boolean {
  return /^(?:www\.)?esmeraldapizza\.dk(?::443)?$/i.test((host ?? '').trim());
}
export function esmeraldaPublicEnabled(): boolean {
  return process.env.ESMERALDA_PUBLIC_ENABLED === 'true';
}
export const ESMERALDA_UNAVAILABLE_HEADERS = {
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};
export function esmeraldaCanonicalRedirect(url: URL, host: string | null, proto: string | null): string | null {
  if (!isEsmeraldaPublicHost(host)) return null;
  const name = (host ?? '').trim().toLowerCase().replace(/:443$/, '');
  const scheme = (proto ?? url.protocol.replace(':', '')).split(',')[0].trim().toLowerCase();
  return name !== 'www.esmeraldapizza.dk' || scheme !== 'https'
    ? ESMERALDA_PUBLIC_ORIGIN + url.pathname + (url.href.includes('?') ? url.href.slice(url.href.indexOf('?')).split('#')[0] : '') : null;
}
// Exact Google profile-photo hosts for homepage review avatars; no wildcard origin.
// preview/esmeralda/adapters/website-reviews.js renders photos only from these hosts.
export const REVIEW_PHOTO_HOSTS = ['https://lh3.googleusercontent.com', 'https://lh4.googleusercontent.com', 'https://lh5.googleusercontent.com', 'https://lh6.googleusercontent.com'];
// Meta pixel 773544982454626 and Meta's Event Setup Tool (Events Manager → Hændelsesadministrator).
// PO decision 2026-11-10: the tool loads its own scripts, an overlay iframe and API calls from Meta,
// so Meta's exact origins are allowed rather than the earlier loader/config/beacon paths. Exact hosts
// only, no wildcard. Consent still gates the pixel: nothing loads before a marketing choice.
const META_SCRIPTS = 'https://connect.facebook.net https://www.facebook.com';
const META_CONNECT = 'https://www.facebook.com https://graph.facebook.com https://connect.facebook.net';
const META_IMAGES = 'https://www.facebook.com https://static.xx.fbcdn.net';
const META_STYLES = 'https://static.xx.fbcdn.net';
const META_FRAMES = 'https://www.facebook.com';
export function esmeraldaPublicHeaders(pathname: string): Record<string, string> {
  // Website-only provider sources verified against captured IDs, public SDKs and
  // Google's CSP guide; see docs/website-tracking-policy.md. This is not consent
  // enforcement or proof of provider delivery. Preview and merchant policies are separate.
  const trackingScripts = 'https://omnisnippet1.com/inshop/launcher-v2.js https://omnisnippet1.com/forms/main.js ' + META_SCRIPTS + ' https://www.googletagmanager.com';
  const trackingImages = META_IMAGES + ' https://www.googletagmanager.com https://www.google-analytics.com/g/collect https://region1.google-analytics.com/g/collect';
  const trackingConnect = META_CONNECT + ' https://www.googletagmanager.com https://www.google.com https://www.google-analytics.com/g/collect https://region1.google-analytics.com/g/collect';
  const newsletterConnect = ' https://wt.omnisendlink.com/REST/inShop/v1/getSettings https://forms.soundestlink.com/REST/forms/v1/renderedForms https://forms.soundestlink.com/REST/forms/v1/renderedForms/ https://forms.soundestlink.com/REST/forms/v2/subscribe';
  const booking = websiteBookingStep(pathname) !== null ? ' https://bdemvarwpfcxyczunchx.supabase.co/functions/v1/booking-api' : '';
  const map = pathname === '/kontakt' ? ' https://www.google.com/maps/embed' : '';
  const contactScript = pathname === '/kontakt' ? ' https://challenges.cloudflare.com/turnstile/v0/api.js' : '';
  const contactFrame = pathname === '/kontakt' ? ' https://challenges.cloudflare.com' : '';
  const contactConnect = pathname === '/kontakt' ? ' https://challenges.cloudflare.com https://bdemvarwpfcxyczunchx.supabase.co/functions/v1/website-contact' : '';
  return {
    'Cache-Control': 'public, max-age=0, must-revalidate',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' " + trackingScripts + contactScript + "; style-src 'self' 'unsafe-inline' https://fonts.soundestlink.com/fonts/css/ " + META_STYLES + "; img-src 'self' data: " + trackingImages + (pathname === '/' ? ' ' + REVIEW_PHOTO_HOSTS.join(' ') : '') + "; font-src 'self' data: https://fonts.soundestlink.com/fonts/static/; connect-src 'self' " + trackingConnect + newsletterConnect + booking + contactConnect + "; form-action 'none'; frame-src 'self' " + META_FRAMES + map + contactFrame + "; object-src 'none'; base-uri 'self'; frame-ancestors 'self'",
  };
}
