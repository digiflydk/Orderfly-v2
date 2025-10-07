
import type { AppTypes } from "@/types/next-async-props";
import { resolveParams, resolveSearchParams } from "@/lib/next/resolve-props";
import { Suspense } from "react";
import { getOrders } from "@/lib/superadmin/getOrders";
import { getBrands } from "@/app/superadmin/brands/actions";
import { getAllLocations } from "@/app/superadmin/locations/actions";
import { OrdersClientPage, type ClientOrderSummary } from "./client-page";
import type { OrderSummary } from "@/types";
import { fromQuery } from "@/lib/utils/url";
import { SACommonFilters } from "@/types/superadmin";
import { redirect } from 'next/navigation';

export const revalidate = 0; // Force dynamic rendering

export default async function OrdersPage({ params, searchParams }: AppTypes.AsyncPageProps) {
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
        locationIds: query.loc ? (Array.isArray(query.loc) ? query.loc : [query.loc]) : [],
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
    
    const handleFilterChange = async (newFilters: SACommonFilters) => {
        'use server';
        const params = new URLSearchParams({
            from: newFilters.dateFrom,
            to: newFilters.dateTo,
            brand: newFilters.brandId || 'all',
            loc: newFilters.locationIds?.join(',') || '',
        });
        redirect(`/superadmin/sales/orders?${params.toString()}`);
    }

    return (
        <Suspense>
            <OrdersClientPage 
                initialOrders={serializedOrders}
                brands={brands}
                locations={locations}
                initialFilters={filters}
                onFilterChange={handleFilterChange as any}
            />
        </Suspense>
    );
}
