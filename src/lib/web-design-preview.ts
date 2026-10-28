// The existing App Hosting proxy supplies x-forwarded-host before Host.
export function isWebDesignPreviewHost(host: string | null): boolean {
  return /^web\.orderfly\.dk(?::443)?$/i.test((host ?? '').trim());
}
export const WEB_PREVIEW_INTERNAL = '/internal-web-preview';
export const WEB_PREVIEW_HEADERS = {
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; form-action 'none'; frame-src 'none'; object-src 'none'; base-uri 'self'",
};
