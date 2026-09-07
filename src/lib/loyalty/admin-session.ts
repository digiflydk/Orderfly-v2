import 'server-only';
import { cookies } from 'next/headers';
import { getAdminApp } from '@/lib/firebase-admin';

export const FINANCIAL_ADMIN_COOKIE = 'orderfly_financial_admin';

export async function financialAdminSession() {
  const session = (await cookies()).get(FINANCIAL_ADMIN_COOKIE)?.value;
  if (!session) return null;
  try {
    const claims = await getAdminApp().auth().verifySessionCookie(session, true);
    const allowed = (process.env.LOYALTY_ADMIN_UIDS || '').split(',').map(s => s.trim()).filter(Boolean);
    return claims.email_verified && allowed.includes(claims.uid) ? { uid: claims.uid } : null;
  } catch {
    return null;
  }
}

export async function requireFinancialAdmin() {
  const actor = await financialAdminSession();
  if (!actor) throw new Error('Log ind med den godkendte administratorkonto øverst på siden.');
  return actor;
}
