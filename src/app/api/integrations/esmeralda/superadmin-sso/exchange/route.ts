import { NextResponse } from 'next/server';

import {
  redeemLaunchCode,
  SUPERADMIN_COOKIE,
  superadminCookieOptions,
} from '@/lib/auth/mpanel-superadmin-sso';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const type = request.headers.get('content-type') ?? '';
  if (!type.toLowerCase().startsWith('application/x-www-form-urlencoded')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  let code = '';
  try {
    const form = await request.formData();
    code = String(form.get('code') ?? '');
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const session = await redeemLaunchCode(code);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const response = NextResponse.redirect(new URL('/superadmin/dashboard', request.url), 303);
  response.cookies.set(SUPERADMIN_COOKIE, session, superadminCookieOptions);
  return response;
}
