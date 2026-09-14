import { NextResponse } from 'next/server';
import { getAdminApp } from '@/lib/firebase-admin';
import { executeAuthority, type VerifiedIdentity } from '@/lib/access/authority';
import { getAdminDb } from '@/lib/firebase-admin';
import { getOrigin } from '@/lib/url';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  if (request.headers.get('origin') !== await getOrigin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const raw = await request.text();
    if (raw.length > 12000) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    const { idToken } = JSON.parse(raw);
    if (typeof idToken !== 'string' || idToken.length > 10000) throw new Error();
    const auth = getAdminApp().auth();
    const decoded = await auth.verifyIdToken(idToken, true);
    if (typeof decoded.auth_time !== 'number' || Math.abs(Date.now() / 1000 - decoded.auth_time) > 300) throw new Error();
    const bootstrap:VerifiedIdentity={provider:'opsfly',subject:process.env.MPANEL_PLATFORM_ADMIN_EMPLOYEE_ID||'',organizationId:process.env.MPANEL_PLATFORM_ADMIN_ORGANIZATION_ID||''};
    const access=await executeAuthority(getAdminDb(),{provider:'firebase',subject:decoded.uid},{action:'session'},bootstrap);
    if(!('permissions' in access)||!('superuser' in access)||(!access.superuser&&!access.permissions.some((p:string)=>p.startsWith('orderfly.'))))throw new Error();
    const expiresIn = 8 * 60 * 60 * 1000;
    const session = await auth.createSessionCookie(idToken, { expiresIn });
    const response = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set('__session', session, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: expiresIn / 1000 });
    return response;
  } catch { return NextResponse.json({ error: 'Login blev afvist. Kontrollér din konto og din adgang i mPanel.' }, { status: 403 }); }
}
export async function DELETE(request: Request) {
  if (request.headers.get('origin') !== await getOrigin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const response = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  response.cookies.set('__session', '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
  return response;
}
