

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { getBrands } from '@/app/superadmin/brands/actions';
import { getAllLocations } from '@/app/superadmin/locations/actions';
import { FiltersBar } from '@/components/superadmin/FiltersBar';
import type { SACommonFilters } from '@/types/superadmin';
import { getSalesDashboardData } from '@/lib/superadmin/getSalesSummary';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, ShoppingCart, Users, Activity, Clock, Store, Percent, Tag, Package, BarChart3, MessageSquareQuote, Cookie, UserCheck, MapPin } from 'lucide-react';
import { redirect } from 'next/navigation';

export default async function SuperadminDashboardPage({ searchParams }: { searchParams: { [key: string]: string | string[] | undefined } }) {
  
  if (!searchParams.from || !searchParams.to) {
    const today = new Date().toISOString().slice(0, 10);
    redirect(`/superadmin/dashboard?from=${today}&to=${today}`);
  }

  const filters: SACommonFilters = {
    dateFrom: (searchParams.from as string),
    dateTo: (searchParams.to as string),
    brandId: (searchParams.brand as string) || 'all',
    locationIds: searchParams.loc ? (Array.isArray(searchParams.loc) ? searchParams.loc : [searchParams.loc as string]) : [],
  };

  const { kpis, totalActiveBrands, totalActiveLocations } = await getSalesDashboardData(filters);
  const [brands, locations] = await Promise.all([getBrands(), getAllLocations()]);

  const fmt = (n: number) => n.toLocaleString('da-DK');
  const kr = (n: number) => (n).toLocaleString('da-DK', { style: 'currency', currency: 'DKK' });
  const pct = (n: number) => `${n.toFixed(2)}%`;

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

  const cardsL3 = [
     { label: 'Active Brands', value: fmt(totalActiveBrands), icon: Store },
     { label: 'Total Locations', value: fmt(totalActiveLocations), icon: MapPin },
     { label: 'Total Unique Customers', value: fmt(kpis.totalUniqueCustomers), icon: Users },
     { label: 'Retention Rate (60d)', value: pct(kpis.totalRetentionRate), icon: UserCheck },
  ];
  
  const cardsL4 = [
     { label: 'Total Feedbacks', value: fmt(kpis.totalFeedbacks), icon: MessageSquareQuote },
     { label: 'Total Cookies Consent', value: fmt(kpis.totalCookieConsents), icon: Cookie },
  ]


  const handleFilterChange = async (newFilters: SACommonFilters) => {
    'use server';
     const params = new URLSearchParams({
       from: newFilters.dateFrom,
       to: newFilters.dateTo,
       brand: newFilters.brandId || 'all',
       loc: newFilters.locationIds?.join(',') || '',
     });
     redirect(`/superadmin/dashboard?${params.toString()}`);
  }

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
      <h1 className="text-2xl font-bold tracking-tight">Superadmin Dashboard</h1>
      
      <FiltersBar value={filters} brands={brands} locations={locations} onFilterChange={handleFilterChange as any}/>

      {!kpis && (
        <div style={{marginBottom:12,padding:12,border:'1px solid #f0c',background:'#fff0fa',borderRadius:8}}>
          Kunne ikke hente KPI-data. Viser tomme felter midlertidigt.
        </div>
      )}

      {renderKpiCards(cardsL1)}
      {renderKpiCards(cardsL2)}
      {renderKpiCards(cardsL3)}
      {renderKpiCards(cardsL4)}
      
    </div>
  );
}
