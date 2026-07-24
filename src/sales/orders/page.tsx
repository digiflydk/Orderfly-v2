

import type { AsyncPageProps } from "@/types/next-async-props";
import { resolveParams, resolveSearchParams } from "@/lib/next/resolve-props";
import { getOrders } from "@/lib/superadmin/getOrders";
import { OrdersClientPage, type ClientOrderSummary } from "@/components/superadmin/sales/orders-client-page";
import { SACommonFilters } from "@/types/superadmin";
import { redirect } from 'next/navigation';

export const revalidate = 0; // Force dynamic rendering

export default async function OrdersPage({ params, searchParams }: AsyncPageProps) {
    const routeParams = await resolveParams(params);
    const query = await resolveSearchParams(searchParams);
    
    if (!query.from || !query.to) {
        const today = new Date().toISOString().slice(0, 10);
        redirect(`/superadmin/sales/orders?from=${today}&to=${today}`);
    }

    const filters: SACommonFilters = {
        dateFrom: (query.from as string),
        dateTo: (query.to as string),
        brandId: (query.brand as string) || 'all',
        locationIds: query.loc ? (Array.isArray(query.loc) ? query.loc : [query.loc as string]) : [],
    };
    
    const orders = await getOrders(filters);

    const serializedOrders: ClientOrderSummary[] = orders.map(order => ({
        id: order.id,
        total: order.totalAmount,
        createdAt: order.createdAt.toISOString(),
    }));

    return <OrdersClientPage data={serializedOrders} />;
}
