import { NextRequest, NextResponse } from 'next/server';

import {
  SUPERADMIN_COOKIE,
  validateRawSuperadminSession,
} from '@/lib/auth/mpanel-superadmin-sso';
import { resolveProductionRedirect } from '@/lib/production-redirect';

export { resolveProductionRedirect } from '@/lib/production-redirect';

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
  runtime: 'nodejs',
};

export async function middleware(request: NextRequest) {
  const canonicalRedirect = resolveProductionRedirect(
    new URL(request.url),
    request.headers.get('x-forwarded-host') ?? request.headers.get('host'),
    request.headers.get('x-forwarded-proto'),
  );
  if (canonicalRedirect) return NextResponse.redirect(canonicalRedirect, 308);

  const isProtected = request.nextUrl.pathname.startsWith('/superadmin/') ||
    request.nextUrl.pathname === '/superadmin' ||
    request.nextUrl.pathname.startsWith('/api/superadmin/');
  if (!isProtected) return NextResponse.next();

  const isLogout = request.nextUrl.pathname === '/api/superadmin/session/logout';
  if (isLogout) return NextResponse.next();

  const session = await validateRawSuperadminSession(
    request.cookies.get(SUPERADMIN_COOKIE)?.value ?? '',
  );
  if (session) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return NextResponse.redirect(new URL('/?orderfly_login=required', request.url));
}
