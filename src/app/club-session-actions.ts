'use server';
import { cookies } from 'next/headers';
import { getAdminDb } from '@/lib/firebase-admin';
import { SESSION_COOKIE } from '@/lib/loyalty/stamp-card/portal-http';

/**
 * Whether this browser has a valid Club session for the brand. Read-only; answers only
 * yes/no so the storefront can say "Min Club" instead of "Log ind" (no member data leaves).
 */
export async function getClubSessionStatusAction(brandSlug: string): Promise<{ signedIn: boolean }> {
  if (typeof brandSlug !== 'string' || !/^[a-z0-9-]{1,64}$/.test(brandSlug)) return { signedIn: false };
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return { signedIn: false };
  try {
    const { resolveBrand, readSession } = await import('@/lib/loyalty/stamp-card/membership');
    const db = getAdminDb();
    await readSession(db, await resolveBrand(db, brandSlug), token, Date.now());
    return { signedIn: true };
  } catch {
    return { signedIn: false };
  }
}
