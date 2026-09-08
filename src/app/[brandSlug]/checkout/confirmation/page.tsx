import { redirect } from 'next/navigation';
import { readGuestReceipt } from '@/lib/server/guest-receipt';
import { getBrandBySlug } from '@/app/superadmin/brands/actions';
import { getLocationById } from '@/app/superadmin/locations/actions';
import type { AsyncPageProps } from '@/types/next-async-props';
import { resolveParams, resolveSearchParams } from '@/lib/next/resolve-props';
export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false }, referrer: 'no-referrer' };
export default async function LegacyConfirmationPage({ params, searchParams }: AsyncPageProps<{brandSlug: string}, {session_id?: string; order_id?: string; receipt_token?: string}>) {
  const { brandSlug } = await resolveParams(params);
  const { session_id: sessionId, order_id: orderId, receipt_token: receiptToken } = await resolveSearchParams(searchParams);
  const brand = await getBrandBySlug(brandSlug);
  const order = brand && sessionId ? await readGuestReceipt({ sessionId, receiptToken, orderId, brandId: brand.id }).catch(() => null) : null;
  if (!order) redirect(`/${brandSlug}`);
  const location = await getLocationById(order.locationId);
  if (!location || location.brandId !== brand?.id) redirect(`/${brandSlug}`);
  const query = new URLSearchParams({ order_id: order.id, session_id: sessionId! });
  if (receiptToken) query.set('receipt_token', receiptToken);
  redirect(`/${brandSlug}/${location.slug}/checkout/confirmation?${query}`);
}
