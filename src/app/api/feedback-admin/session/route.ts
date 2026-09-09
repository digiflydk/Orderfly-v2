import { NextResponse } from 'next/server';
import { getAdminApp } from '@/lib/firebase-admin';
import { feedbackAccessForUid } from '@/lib/feedback/access';
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
    await feedbackAccessForUid(decoded.uid);
    const expiresIn = 8 * 60 * 60 * 1000;
    const session = await auth.createSessionCookie(idToken, { expiresIn });
    const response = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set('__session', session, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: expiresIn / 1000 });
    return response;
  } catch { return NextResponse.json({ error: 'Login blev afvist. Kontrollér din konto og feedbackadgang.' }, { status: 403 }); }
}
export async function DELETE(request: Request) {
  if (request.headers.get('origin') !== await getOrigin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const response = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  response.cookies.set('__session', '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
  return response;
}
