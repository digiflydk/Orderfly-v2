

import { getBrandBySlug } from '@/app/superadmin/brands/actions';
import { getLocationBySlug } from '@/lib/data/brand-location';
import { getOrderById, getOrderByCheckoutSessionId } from '@/app/checkout/order-actions';
import { ConfirmationClient } from './confirmation-client';
import { OrderDetail } from '@/types';
import type { AsyncPageProps } from '@/types/next-async-props';
import { resolveParams, resolveSearchParams } from '@/lib/next/resolve-props';

function serializeOrder(order: OrderDetail | null): any {
    if (!order) return null;
    return {
        ...order,
        createdAt: order.createdAt instanceof Date ? order.createdAt.toISOString() : new Date().toISOString(),
        paidAt: order.paidAt instanceof Date ? order.paidAt.toISOString() : undefined,
    }
}

type ConfirmationParams = { brandSlug: string; locationSlug: string };
type ConfirmationQuery = { order_id?: string; session_id?: string };

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

  // Attempt to fetch the order.
  let order = orderId ? await getOrderById(orderId) : null;
  if (!order && sessionId) {
    order = await getOrderByCheckoutSessionId(sessionId);
  }

  const orderMatchesStore = Boolean(
    order &&
    brand &&
    location &&
    order.brandId === brand.id &&
    order.locationId === location.id,
  );

  // We pass serialized dates to avoid hydration errors.
  // The client component handles cases where any data is not found.
  return (
    <ConfirmationClient
      order={serializeOrder(orderMatchesStore ? order : null)}
      brand={brand}
      location={location}
    />
  );
}
