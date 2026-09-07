'use server';
import { cookies } from 'next/headers';
import { getAdminApp } from '@/lib/firebase-admin';
import { requireLoyaltyAdmin } from '@/lib/loyalty/identity';
import { FINANCIAL_ADMIN_COOKIE } from '@/lib/loyalty/admin-session';

export async function openFinancialAdminSession(token: string) {
  await requireLoyaltyAdmin(token);
  const auth = getAdminApp().auth();
  const claims = await auth.verifyIdToken(token, true);
  if (Date.now() / 1000 - claims.auth_time > 300) throw new Error('Log ud og ind igen for at bekræfte administratoradgangen.');
  const expiresIn = 15 * 60 * 1000;
  const session = await auth.createSessionCookie(token, { expiresIn });
  (await cookies()).set(FINANCIAL_ADMIN_COOKIE, session, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict',
    path: '/', maxAge: expiresIn / 1000,
  });
}

export async function closeFinancialAdminSession() {
  (await cookies()).delete(FINANCIAL_ADMIN_COOKIE);
}
