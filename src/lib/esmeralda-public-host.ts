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
export function esmeraldaPublicHeaders(pathname: string): Record<string, string> {
  // Only origins actually present in the reviewed source. No service-wide wildcard.
  // Provider dynamic dependencies must pass browser QA before the release switch.
  const booking = pathname === '/bordbooking' ? ' https://bdemvarwpfcxyczunchx.supabase.co/functions/v1/booking-api' : '';
  const map = pathname === '/kontakt' ? ' https://www.google.com/maps/embed' : '';
  const contactScript = pathname === '/kontakt' ? ' https://challenges.cloudflare.com/turnstile/v0/api.js' : '';
  const contactFrame = pathname === '/kontakt' ? ' https://challenges.cloudflare.com' : '';
  const contactConnect = pathname === '/kontakt' ? ' https://challenges.cloudflare.com https://bdemvarwpfcxyczunchx.supabase.co/functions/v1/website-contact' : '';
  return {
    'Cache-Control': 'public, max-age=0, must-revalidate',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://omnisnippet1.com/inshop/launcher-v2.js https://connect.facebook.net/en_US/fbevents.js https://www.googletagmanager.com/gtm.js" + contactScript + "; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://www.facebook.com/tr; font-src 'self' data:; connect-src 'self'" + booking + contactConnect + "; form-action 'none'; frame-src 'self'" + map + contactFrame + "; object-src 'none'; base-uri 'self'; frame-ancestors 'self'",
  };
}
