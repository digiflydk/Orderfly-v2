import { NextRequest, NextResponse } from 'next/server';
import { getM3PizzaOrderEntryUrl } from '@/lib/m3pizza-order-flow';
import { brandSlugFromHost, brandSubdomainRewrite } from '@/lib/brand-subdomain';

import { isWebDesignPreviewHost, WEB_PREVIEW_INTERNAL, WEB_PREVIEW_HEADERS } from '@/lib/web-design-preview';

import { isEsmeraldaPublicHost, esmeraldaPublicEnabled, esmeraldaPublicHeaders, ESMERALDA_UNAVAILABLE_HEADERS } from '@/lib/esmeralda-public-host';

import { isMpanelHost, MPANEL_INTERNAL, MPANEL_HEADERS } from '@/lib/mpanel-host';

const CANONICAL_HOST = 'orderfly.dk';
const WWW_HOST = `www.${CANONICAL_HOST}`;

function normalizeHost(host: string | null): string {
  return (host ?? '').split(':')[0].trim().toLowerCase();
}

function normalizeProto(proto: string | null): string {
  return (proto ?? '').split(',')[0].trim().toLowerCase();
}

export function resolveProductionRedirect(url: URL, hostHeader: string | null, forwardedProto: string | null): string | null {
  const host = normalizeHost(hostHeader);
  const proto = normalizeProto(forwardedProto) || url.protocol.replace(':', '');

  const shouldRedirectToCanonicalHost = host === WWW_HOST;
  // Brand subdomains (#12) are HTTPS-only like the apex domain.
  const isBrandSubdomain = host.endsWith(`.${CANONICAL_HOST}`) && host !== WWW_HOST;
  const shouldRedirectToHttps = (host === CANONICAL_HOST || isBrandSubdomain) && proto === 'http';

  if (!shouldRedirectToCanonicalHost && !shouldRedirectToHttps) {
    return null;
  }

  const redirectUrl = new URL(url.toString());
  redirectUrl.protocol = 'https:';
  redirectUrl.host = shouldRedirectToCanonicalHost ? CANONICAL_HOST : host;
  return redirectUrl.toString();
}

export function middleware(request: NextRequest) {
  const incomingPath = request.nextUrl.pathname;
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const previewHost = isWebDesignPreviewHost(host);
  // This endpoint is reachable only through our rewrite, never by its public URL.
  if ([WEB_PREVIEW_INTERNAL, MPANEL_INTERNAL].some(path => incomingPath === path || incomingPath.startsWith(`${path}/`))) {
    return new NextResponse('Not found', {status:404, headers: previewHost ? WEB_PREVIEW_HEADERS : ESMERALDA_UNAVAILABLE_HEADERS});
  }
  if (isMpanelHost(host)) {
    if (!esmeraldaPublicEnabled()) return new NextResponse('Website unavailable', {status:503, headers:ESMERALDA_UNAVAILABLE_HEADERS});
    if (!['GET','HEAD'].includes(request.method)) return new NextResponse('Method not allowed', {status:405, headers:{...MPANEL_HEADERS, Allow:'GET, HEAD'}});
    const rewritten = request.nextUrl.clone();
    rewritten.pathname = MPANEL_INTERNAL;
    rewritten.search = '';
    return NextResponse.rewrite(rewritten, {headers:MPANEL_HEADERS});
  }
  if (isEsmeraldaPublicHost(host)) {
    if (!esmeraldaPublicEnabled()) return new NextResponse('Website unavailable', {status:503, headers:ESMERALDA_UNAVAILABLE_HEADERS});
    const headers = esmeraldaPublicHeaders(incomingPath);
    if (!['GET','HEAD'].includes(request.method)) return new NextResponse('Method not allowed', {status:405, headers:{...headers, ...ESMERALDA_UNAVAILABLE_HEADERS, Allow:'GET, HEAD'}});
    const rewritten = request.nextUrl.clone();
    rewritten.pathname = WEB_PREVIEW_INTERNAL;
    rewritten.search = '';
    return NextResponse.rewrite(rewritten, {headers});
  }
  if (previewHost) {
    if (!['GET', 'HEAD'].includes(request.method)) return new NextResponse('Method not allowed', {
      status:405, headers: {...WEB_PREVIEW_HEADERS, Allow:'GET, HEAD'},
    });
    const redirect = resolveProductionRedirect(new URL(request.url), host, request.headers.get('x-forwarded-proto'));
    if (redirect) return NextResponse.redirect(redirect, 308);
    const rewritten = request.nextUrl.clone();
    rewritten.pathname = WEB_PREVIEW_INTERNAL;
    rewritten.search = '';
    return NextResponse.rewrite(rewritten, {headers:WEB_PREVIEW_HEADERS});
  }
  // Preserve the previous matcher exclusions on every non-preview host.
  if (/^\/(?:_next\/(?:static|image)|favicon\.ico)/.test(incomingPath)) return NextResponse.next();
  const redirectTarget = resolveProductionRedirect(
    new URL(request.url),
    request.headers.get('x-forwarded-host') ?? request.headers.get('host'),
    request.headers.get('x-forwarded-proto')
  );

  if (redirectTarget) {
    return NextResponse.redirect(redirectTarget, 308);
  }

  const pathname = request.nextUrl.pathname.replace(/\/$/, '') || '/';

  // {slug}.orderfly.dk serves that brand's storefront (#12). The brand pages
  // resolve the slug themselves: unknown brands 404, suspended ones show a
  // status page, and no path can fall back to another brand.
  const brandSlug = brandSlugFromHost(request.headers.get('x-forwarded-host') ?? request.headers.get('host'));
  if (brandSlug) {
    const target = brandSubdomainRewrite(pathname, brandSlug);
    if (!target) return NextResponse.next();
    const rewritten = request.nextUrl.clone();
    rewritten.pathname = target;
    return NextResponse.rewrite(rewritten);
  }

  if (pathname === '/m3pizza/order') {
    const requestedMethod = request.nextUrl.searchParams.get('deliveryMethod');
    return NextResponse.redirect(
      new URL(getM3PizzaOrderEntryUrl(request.headers.get('x-forwarded-host') ?? request.headers.get('host'), requestedMethod), request.url),
      308,
    );
  }

  if (pathname === '/m3pizza') {
    const websiteUrl = request.nextUrl.clone();
    websiteUrl.pathname = '/brand-site/m3pizza';
    return NextResponse.rewrite(websiteUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/:path*'],
};
