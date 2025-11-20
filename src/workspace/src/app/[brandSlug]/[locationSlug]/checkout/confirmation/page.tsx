

import type { AsyncPageProps } from "@/types/next-async-props";
import { resolveParams, resolveSearchParams } from "@/lib/next/resolve-props";
import ConfirmationClient from './confirmation-client';
import { getBrandBySlug } from '@/app/superadmin/brands/actions';
import { getLocationBySlug } from '@/lib/data/brand-location';
import { getOrderById } from '@/app/checkout/order-actions';
import type { OrderDetail } from '@/types';


export const runtime = "nodejs";

function serializeOrder(order: OrderDetail | null): any {
    if (!order) return null;
    return {
        ...order,
        createdAt: order.createdAt instanceof Date ? order.createdAt.toISOString() : new Date().toISOString(),
        paidAt: order.paidAt instanceof Date ? order.paidAt.toISOString() : undefined,
        updatedAt: order.updatedAt instanceof Date ? order.updatedAt.toISOString() : undefined,
    }
}


export default async function ConfirmationPage({ params, searchParams }: AsyncPageProps<{brandSlug: string; locationSlug: string}, {order_id?: string}>) {
  const routeParams = await resolveParams(params);
  const query = await resolveSearchParams(searchParams);

  const { brandSlug, locationSlug } = routeParams;
  const orderId = query?.order_id;
  
  const brand = await getBrandBySlug(brandSlug);
  const location = brand ? await getLocationBySlug(brand.id, locationSlug) : null;
  const order = orderId ? await getOrderById(orderId) : null;


  return (
    <ConfirmationClient
      order={serializeOrder(order)}
      brand={brand}
      location={location}
    />
  );
}
