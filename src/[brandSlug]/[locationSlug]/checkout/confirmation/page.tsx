
import { getBrandBySlug } from '@/app/superadmin/brands/actions';
import { getLocationBySlug } from '@/app/superadmin/locations/actions';
import { getOrderById } from '@/app/checkout/order-actions';
import { ConfirmationClient } from './confirmation-client';

export default async function ConfirmationPage({ params, searchParams }: any) {
  const { brandSlug, locationSlug } = params;
  const orderId = searchParams?.order_id as string | undefined;

  // Fetch brand and location, but don't call notFound().
  // The client component will handle null values gracefully.
  const brand = await getBrandBySlug(brandSlug);
  const location = brand ? await getLocationBySlug(locationSlug, brand.id) : null;

  // Attempt to fetch the order.
  const order = orderId ? await getOrderById(orderId) : null;

  // We pass serialized dates to avoid hydration errors.
  // The client component handles cases where any data is not found.
  return (
    <ConfirmationClient
      order={order ? {
        ...order,
        createdAt: order.createdAt ? new Date(order.createdAt).toISOString() : new Date().toISOString(),
        paidAt: order.paidAt ? new Date(order.paidAt).toISOString() : undefined,
      } : null}
      brand={brand}
      location={location}
    />
  );
}
