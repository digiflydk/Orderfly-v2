import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getAdminDb } from '@/lib/firebase-admin';
import { brandSlugFromHost } from '@/lib/brand-subdomain';
import { clubBase } from '@/lib/loyalty/portal-path';
import { LoyaltyError } from '@/lib/loyalty/stamp-card/counter';
import { memberView, programForPortal, readSession, resolveBrand } from '@/lib/loyalty/stamp-card/membership';
import { SESSION_COOKIE } from '@/lib/loyalty/stamp-card/portal-http';
import { memberOrderHistory } from '@/lib/loyalty/stamp-card/order-history';
import { memberDiscountCard } from '@/lib/loyalty/discount-card/portal';

// Server-side reads for the customer portal. They use the same phase 1 functions
// as /api/loyalty/{brandSlug}/* and never write; every change goes through those APIs.

// The brand and its public program, or null for an unknown or suspended brand.
export const findPortal = cache(async (slug: string) => {
  const db = getAdminDb();
  const brand = await resolveBrand(db, slug).catch(error => {
    if (error instanceof LoyaltyError) return null;
    throw error;
  });
  return brand ? { brand, program: await programForPortal(db, brand) } : null;
});

export const loadPortal = cache(async (slug: string) => (await findPortal(slug)) ?? notFound());

// The signed-in member's card, or null when there is no valid session.
export const loadMember = cache(async (slug: string) => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = getAdminDb(), { brand } = await loadPortal(slug), now = Date.now();
  try {
    const session = await readSession(db, brand, token, now);
    const [view, discountCard] = await Promise.all([memberView(db, brand, session, now), memberDiscountCard(db, brand, session, now)]);
    return { ...view, discountCard };
  } catch (error) {
    if (error instanceof LoyaltyError) return null;
    throw error;
  }
});

// Order history is authenticated independently and loaded only on its own page.
export const loadOrderHistory = cache(async (slug: string) => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return [];
  const db = getAdminDb(), { brand } = await loadPortal(slug), now = Date.now();
  try {
    const session = await readSession(db, brand, token, now);
    return await memberOrderHistory(db, brand, session, now);
  } catch (error) {
    if (error instanceof LoyaltyError) return [];
    throw error;
  }
});

// Links stay on the address the customer uses, so the host-only session cookie applies.
export async function portalBase(slug: string) {
  const host = (await headers()).get('x-forwarded-host') ?? (await headers()).get('host');
  return clubBase(brandSlugFromHost(host) === slug, slug);
}

export type PortalProgram = Awaited<ReturnType<typeof programForPortal>>;
export type PortalMember = NonNullable<Awaited<ReturnType<typeof loadMember>>>;
