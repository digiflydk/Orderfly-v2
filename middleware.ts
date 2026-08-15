import { NextRequest, NextResponse } from 'next/server';

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

  if (!redirectTarget) {
    return NextResponse.next();
  }
  
  return NextResponse.redirect(redirectTarget, 308);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
