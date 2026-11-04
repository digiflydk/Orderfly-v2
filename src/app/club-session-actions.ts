'use server';
import { cookies } from 'next/headers';
import { getAdminDb } from '@/lib/firebase-admin';
import { SESSION_COOKIE } from '@/lib/loyalty/stamp-card/portal-http';
import { customerHasEmail } from '@/lib/customer-identity';

export type ClubSessionProfile = { signedIn: false } | { signedIn: true; firstName: string; name: string; email: string; phone: string };

/**
 * The signed-in Club member's own contact details, for the storefront header and checkout prefill.
 * Read-only. The host-only HttpOnly session cookie authenticates the caller; without a valid session
 * for this brand nothing but { signedIn: false } is returned. Same fields the Club portal already shows.
 */
export async function getClubSessionProfileAction(brandSlug: string): Promise<ClubSessionProfile> {
  if (typeof brandSlug !== 'string' || !/^[a-z0-9-]{1,64}$/.test(brandSlug)) return { signedIn: false };
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return { signedIn: false };
  try {
    const { resolveBrand, readSession } = await import('@/lib/loyalty/stamp-card/membership');
    const { profileFromCustomer } = await import('@/lib/loyalty/stamp-card/profile-rules');
    const db = getAdminDb(), brand = await resolveBrand(db, brandSlug);
    const { member } = await readSession(db, brand, token, Date.now());
    const customer = (await db.collection('customers').doc(member.customerId).get()).data();
    // Phone only from this brand's customer record for the member's own e-mail.
    const ownCustomer = customer && customer.brandId === brand.brandId && customerHasEmail(customer as never, member.normalizedEmail) ? customer : undefined;
    const name = typeof member.name === 'string' ? member.name.trim() : '';
    return { signedIn: true, name, firstName: name.split(/\s+/)[0] || '', email: member.normalizedEmail, phone: profileFromCustomer(ownCustomer).phone };
  } catch {
    return { signedIn: false };
  }
}

/** Yes/no only; kept for callers that just need the signed-in state. */
export async function getClubSessionStatusAction(brandSlug: string): Promise<{ signedIn: boolean }> {
  return { signedIn: (await getClubSessionProfileAction(brandSlug)).signedIn };
}
