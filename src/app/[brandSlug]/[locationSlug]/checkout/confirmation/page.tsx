
import { getBrandBySlug } from '@/app/superadmin/brands/actions';
import { getLocationBySlug } from '@/app/superadmin/locations/actions';
import { getOrderById } from '@/app/checkout/order-actions';
import { ConfirmationClient } from './confirmation-client';
import { OrderDetail } from '@/types';

function serializeOrder(order: OrderDetail | null): any {
    if (!order) return null;
    return {
        ...order,
        createdAt: order.createdAt instanceof Date ? order.createdAt.toISOString() : new Date().toISOString(),
        paidAt: order.paidAt instanceof Date ? order.paidAt.toISOString() : undefined,
        updatedAt: order.updatedAt instanceof Date ? order.updatedAt.toISOString() : undefined,
    }
}

export default async function ConfirmationPage({ params, searchParams }: any) {
  const { brandSlug, locationSlug } = params;
  const orderId = searchParams?.order_id as string | undefined;

  // Fetch brand and location, but don't call notFound().
  // The client component will handle null values gracefully.
  const brand = await getBrandBySlug(brandSlug);
  const location = brand ? await getLocationBySlug(brand.id, locationSlug) : null;

  // Attempt to fetch the order.
  const order = orderId ? await getOrderById(orderId) : null;

  // We pass serialized dates to avoid hydration errors.
  // The client component handles cases where any data is not found.
  return (
    <ConfirmationClient
      order={serializeOrder(order)}
      brand={brand}
      location={location}
    />
  );
}
