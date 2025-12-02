
import type { AsyncPageProps } from "@/types/next-async-props";
import { resolveSearchParams } from "@/lib/next/resolve-props";
import { getOrders } from "@/lib/superadmin/getOrders";
import { OrdersClientPage, type ClientOrderSummary } from "@/components/superadmin/sales/orders-client-page";
import type { OrderSummary } from "@/types";
import type { SACommonFilters } from "@/types/superadmin";

export const revalidate = 0; // Force dynamic rendering

export default async function OrdersPage({ searchParams }: AsyncPageProps) {
  // Læs evt. filtrering fra querystring, typed som SACommonFilters (partial)
  const filters = await resolveSearchParams<Partial<SACommonFilters>>(searchParams);

  // Hent ordrer via admin-API
  const orders: OrderSummary[] = await getOrders(filters);

  // Map til ClientOrderSummary, som OrdersClientPage forventer:
  //   id: string;
  //   total: number;
  //   createdAt?: string;
  const serializedOrders: ClientOrderSummary[] = orders.map((order) => ({
    id: order.id,
    total: order.totalAmount,
    createdAt: order.createdAt.toISOString(),
  }));

  return <OrdersClientPage data={serializedOrders} />;
}
