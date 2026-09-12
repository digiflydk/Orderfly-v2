import { BRAND_TRACKING_DOCUMENT } from '@/lib/brand-tracking-frame';

// Inert until initialized by the consent-gated parent. No identifiers in the URL.
export function GET() {
  return new Response(BRAND_TRACKING_DOCUMENT, { headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'SAMEORIGIN',
    'Content-Security-Policy': "frame-ancestors 'self'",
    'X-Robots-Tag': 'noindex, nofollow',
  } });
}
