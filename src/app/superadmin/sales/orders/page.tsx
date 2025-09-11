

import { getOrders } from "@/lib/superadmin/getOrders";
import { getBrands } from "@/app/superadmin/brands/actions";
import { getAllLocations } from "@/app/superadmin/locations/actions";
import { OrdersClientPage, type ClientOrderSummary } from "./client-page";
import type { OrderSummary } from "@/types";
import { fromQuery } from "@/lib/utils/url";
import { SACommonFilters } from "@/types/superadmin";
import { redirect } from 'next/navigation';

export const revalidate = 0; // Force dynamic rendering

export default async function OrdersPage({ searchParams }: { searchParams: { [key: string]: string | string[] | undefined } }) {
    
    if (!searchParams.from || !searchParams.to) {
        const today = new Date().toISOString().slice(0, 10);
        redirect(`/superadmin/sales/orders?from=${today}&to=${today}`);
    }

    const filters: SACommonFilters = {
        dateFrom: (searchParams.from as string),
        dateTo: (searchParams.to as string),
        brandId: (searchParams.brand as string) || 'all',
        locationIds: searchParams.loc ? (Array.isArray(searchParams.loc) ? searchParams.loc : [searchParams.loc]) : [],
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
        <OrdersClientPage 
            initialOrders={serializedOrders}
            brands={brands}
            locations={locations}
            initialFilters={filters}
            onFilterChange={handleFilterChange as any}
        />
    );
}
