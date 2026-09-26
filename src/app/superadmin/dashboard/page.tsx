
import type { AsyncPageProps } from "@/types/next-async-props";
import { resolveSearchParams } from "@/lib/next/resolve-props";
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { getAnalyticsFiltersData } from '@/app/superadmin/_analytics-filters-data';
import { FiltersBar } from '@/components/superadmin/FiltersBar';
import type { SACommonFilters } from '@/types/superadmin';
import { getSalesDashboardData } from '@/lib/superadmin/getSalesSummary';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, ShoppingCart, Activity, Clock, Tag, Package, BarChart3 } from 'lucide-react';
import { redirect } from 'next/navigation';

async function handleFilterChange(newFilters: SACommonFilters) {
    'use server';
     const params = new URLSearchParams({
       from: newFilters.dateFrom,
       to: newFilters.dateTo,
       brand: newFilters.brandId || 'all',
       loc: newFilters.locationIds?.join(',') || '',
     });
     redirect(`/superadmin/dashboard?${params.toString()}`);
}

export default async function SuperadminDashboardPage({ searchParams }: AsyncPageProps) {
  const query = await resolveSearchParams(searchParams);
  
  if (!query.from || !query.to) {
    const today = new Date().toISOString().slice(0, 10);
    redirect(`/superadmin/dashboard?from=${today}&to=${today}`);
  }

  const filters: SACommonFilters = {
    dateFrom: (query.from as string),
    dateTo: (query.to as string),
    brandId: (query.brand as string) || 'all',
    locationIds: query.loc ? (Array.isArray(query.loc) ? query.loc : [query.loc as string]).flatMap(value => value.split(',')).filter(Boolean) : [],
  };

  const [{ kpis }, { brands, locations }] = await Promise.all([
    getSalesDashboardData(filters), getAnalyticsFiltersData(),
  ]);

  const fmt = (n: number) => n.toLocaleString('da-DK');
  const kr = (n: number) => (n).toLocaleString('da-DK', { style: 'currency', currency: 'DKK' });

  const cardsL1 = [
    { label: 'Total Sales', value: kr(kpis.totalSales), icon: DollarSign },
    { label: 'AOV', value: kr(kpis.avgOrderValue), icon: Activity },
    { label: 'Total Orders', value: fmt(kpis.totalOrders) , icon: ShoppingCart },
    { label: 'Pending Orders', value: fmt(kpis.pendingOrders), icon: Clock },
  ];
  
  const cardsL2 = [
    { label: 'Total Upsells', value: kr(kpis.totalUpsellsAmount), icon: BarChart3 },
    { label: 'Total Combo Deals (kr.)', value: kr(kpis.totalComboDealsAmount), icon: Package },
    { label: 'Total Combo Deals (qty)', value: fmt(kpis.totalComboDealsOrders), icon: Package },
    { label: 'Total Discount', value: kr(kpis.totalDiscounts), icon: Tag },
  ];

  const renderKpiCards = (cards: {label:string, value:string, icon:any}[]) => (
     <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c,i)=>(
          <Card key={i}>
             <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{c.label}</CardTitle>
                <c.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
  );
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sales overview</h1>
        <p className="text-sm text-muted-foreground">Orders and revenue in the selected date, brand and locations. Current brand and location counts are on Overview; customer, feedback and consent reporting have their own pages.</p>
      </div>
      
      <FiltersBar filters={filters} brands={brands} locations={locations} onChange={handleFilterChange} />

      {!kpis && (
        <div style={{marginBottom:12,padding:12,border:'1px solid #f0c',background:'#fff0fa',borderRadius:8}}>
          Could not fetch KPI data. Displaying empty cards.
        </div>
      )}

      {renderKpiCards(cardsL1)}
      {renderKpiCards(cardsL2)}
      
    </div>
  );
}
