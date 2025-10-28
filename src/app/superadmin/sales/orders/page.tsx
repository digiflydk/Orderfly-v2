
import type { AsyncPageProps } from "@/types/next-async-props";
import { resolveParams, resolveSearchParams } from "@/lib/next/resolve-props";
import { getOrders } from "@/lib/superadmin/getOrders";
import { getBrands } from "@/app/superadmin/brands/actions";
import { getAllLocations } from "@/app/superadmin/locations/actions";
import OrdersClientPage, { type ClientOrderSummary } from "@components/superadmin/sales/orders-client-page";
import type { OrderSummary } from "@/types";
import { fromQuery } from "@/lib/utils/url";
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
    
    const [orders, brands, locations] = await Promise.all([
        getOrders(filters),
        getBrands(),
        getAllLocations(),
    ]);
    
    const serializedOrders: ClientOrderSummary[] = orders.map(order => ({
        ...order,
        createdAt: order.createdAt.toISOString(),
        paidAt: order.paidAt?.toISOString(),
        updatedAt: order.updatedAt?.toISOString(),
    }));

    return (
        <OrdersClientPage 
            initialOrders={serializedOrders}
            brands={brands}
            locations={locations}
            initialFilters={filters}
        />
    );
}
