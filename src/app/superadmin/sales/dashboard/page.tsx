
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, ShoppingCart, Users, Activity, Percent, Ban, Truck, Store, Tags, Banknote, Clock } from "lucide-react";
import type { OrderSummary } from "@/types";
import { getSalesDashboardData } from "@/lib/superadmin/getSalesSummary";
import { getBrands } from "@/app/superadmin/brands/actions";
import { getAllLocations } from "@/app/superadmin/locations/actions";
import { FiltersBar } from "@/components/superadmin/FiltersBar";
import { ReadonlyURLSearchParams } from "next/navigation";
import { SACommonFilters } from "@/types/superadmin";
import { redirect } from "next/navigation";

export const revalidate = 0; // Force dynamic rendering

export default async function SalesDashboardPage({ searchParams }: { searchParams: { [key: string]: string | string[] | undefined } }) {
    if (!searchParams.from || !searchParams.to) {
        const today = new Date().toISOString().slice(0, 10);
        redirect(`/superadmin/sales/dashboard?from=${today}&to=${today}`);
    }

    const filters: SACommonFilters = {
        dateFrom: (searchParams.from as string),
        dateTo: (searchParams.to as string),
        brandId: (searchParams.brand as string) || 'all',
        locationIds: searchParams.loc ? (Array.isArray(searchParams.loc) ? searchParams.loc : [searchParams.loc]) : [],
    };

    const { kpis: kpiData } = await getSalesDashboardData(filters);
    const [brands, locations] = await Promise.all([getBrands(), getAllLocations()]);
    
    const kpis = [
        // Line 1
        { title: "Total Sales", value: `kr. ${kpiData.totalSales.toFixed(2)}`, icon: DollarSign },
        { title: "Average Order Value", value: `kr. ${kpiData.avgOrderValue.toFixed(2)}`, icon: Activity },
        { title: "Total Discounts", value: `kr. ${kpiData.totalDiscounts.toFixed(2)}`, icon: Tags },
        
        // Line 2
        { title: "Total Paid Orders", value: kpiData.totalOrders.toLocaleString(), icon: ShoppingCart },
        { title: "Pending Orders", value: kpiData.pendingOrders.toLocaleString(), icon: Clock },
        { title: "Canceled Orders", value: kpiData.canceledOrders.toLocaleString(), icon: Ban },

        // Line 3
        { title: "Total Pickup Orders", value: kpiData.pickupOrdersCount.toLocaleString(), icon: Store },
        { title: "Total Delivery Orders", value: kpiData.deliveryOrdersCount.toLocaleString(), icon: Truck },
        { title: "Pickup vs. Delivery Ratio", value: kpiData.deliveryPickupRatio, icon: Percent },
    ];

    const handleFilterChange = async (newFilters: SACommonFilters) => {
        'use server';
         const params = new URLSearchParams({
           from: newFilters.dateFrom,
           to: newFilters.dateTo,
           brand: newFilters.brandId || 'all',
           loc: newFilters.locationIds?.join(',') || '',
         });
         redirect(`/superadmin/sales/dashboard?${params.toString()}`);
    }
    
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Sales & Orders Dashboard</h1>
                <p className="text-muted-foreground">
                   An overview of sales metrics and order statistics across the platform.
                </p>
            </div>
            
            <FiltersBar value={filters} brands={brands} locations={locations} onFilterChange={handleFilterChange as any}/>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {kpis.map((kpi) => (
                    <Card key={kpi.title}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                {kpi.title}
                            </CardTitle>
                            <kpi.icon className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{kpi.value}</div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
