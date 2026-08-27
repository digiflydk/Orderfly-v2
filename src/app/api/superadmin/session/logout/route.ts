import { NextResponse } from 'next/server';

import {
  revokeRawSuperadminSession,
  SUPERADMIN_COOKIE,
} from '@/lib/auth/mpanel-superadmin-sso';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const raw = request.headers.get('cookie')
    ?.split(';')
    .map(value => value.trim())
    .find(value => value.startsWith(`${SUPERADMIN_COOKIE}=`))
    ?.slice(SUPERADMIN_COOKIE.length + 1) ?? '';
  await revokeRawSuperadminSession(decodeURIComponent(raw));
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SUPERADMIN_COOKIE, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}
