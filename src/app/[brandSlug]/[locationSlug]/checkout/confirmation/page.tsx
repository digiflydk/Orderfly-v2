

import { getBrandBySlug } from '@/app/superadmin/brands/actions';
import { getLocationBySlug } from '@/lib/data/brand-location';
import { readGuestReceipt } from '@/lib/server/guest-receipt';
import { ConfirmationClient } from './confirmation-client';
import type { AsyncPageProps } from '@/types/next-async-props';
import { resolveParams, resolveSearchParams } from '@/lib/next/resolve-props';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false }, referrer: 'no-referrer' };

type ConfirmationParams = { brandSlug: string; locationSlug: string };
type ConfirmationQuery = { order_id?: string; session_id?: string; receipt_token?: string };

export default async function ConfirmationPage({
  params,
  searchParams,
}: AsyncPageProps<ConfirmationParams, ConfirmationQuery>) {
  const { brandSlug, locationSlug } = await resolveParams(params);
  const query = await resolveSearchParams(searchParams);
  const orderId = query.order_id;
  const sessionId = query.session_id;

  // Fetch brand and location, but don't call notFound().
  // The client component will handle null values gracefully.
  const brand = await getBrandBySlug(brandSlug);
  const location = brand ? await getLocationBySlug(brand.id, locationSlug) : null;

  const order = brand && location && sessionId ? await readGuestReceipt({
    orderId, sessionId, receiptToken: query.receipt_token, brandId: brand.id, locationId: location.id,
  }).catch(() => null) : null;

  return <ConfirmationClient order={order} brand={brand} location={location} sessionId={sessionId} orderId={orderId} receiptToken={query.receipt_token} />;
}
