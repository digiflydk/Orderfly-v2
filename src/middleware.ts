import { NextRequest, NextResponse } from 'next/server';
import { getM3PizzaMenuHref } from '@/lib/m3pizza-order-flow';

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
  const shouldRedirectToHttps = host === CANONICAL_HOST && proto === 'http';

  if (!shouldRedirectToCanonicalHost && !shouldRedirectToHttps) {
    return null;
  }

  const redirectUrl = new URL(url.toString());
  redirectUrl.protocol = 'https:';
  redirectUrl.host = CANONICAL_HOST;
  return redirectUrl.toString();
}

export function middleware(request: NextRequest) {
  const redirectTarget = resolveProductionRedirect(
    new URL(request.url),
    request.headers.get('x-forwarded-host') ?? request.headers.get('host'),
    request.headers.get('x-forwarded-proto')
  );

  if (redirectTarget) {
    return NextResponse.redirect(redirectTarget, 308);
  }

  const pathname = request.nextUrl.pathname.replace(/\/$/, '') || '/';

  if (pathname === '/m3pizza/order') {
    const requestedMethod = request.nextUrl.searchParams.get('deliveryMethod');
    return NextResponse.redirect(
      new URL(getM3PizzaMenuHref(requestedMethod), request.url),
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
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
