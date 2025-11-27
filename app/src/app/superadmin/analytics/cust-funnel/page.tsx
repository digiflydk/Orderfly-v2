
import { Suspense } from 'react';
import { getFunnelDataForSuperAdmin } from "./actions";
import { AnalyticsDashboardClient } from '@/components/superadmin/analytics-dashboard-client';
import { getBrands } from '@/app/superadmin/brands/actions';
import { getAllLocations } from '@/app/superadmin/locations/actions';
import type { FunnelFilters } from '@/types';

export const revalidate = 0;

type PageProps = {
  searchParams: { [key: string]: string | string[] | undefined };
};

async function AnalyticsData({ searchParams }: { searchParams: FunnelFilters }) {
  const [brands, locations] = await Promise.all([
    getBrands(),
    getAllLocations()
  ]);

  const dateFrom = searchParams.dateFrom || new Date(new Date().setDate(new Date().getDate() - 7)).toISOString();
  const dateTo = searchParams.dateTo || new Date().toISOString();

  const filters = {
    ...searchParams,
    dateFrom,
    dateTo,
  };

  const initialData = await getFunnelDataForSuperAdmin(filters);

  return (
    <AnalyticsDashboardClient
      initialData={initialData}
      brands={brands}
      locations={locations}
      searchParams={filters}
    />
  );
}

export default async function CustomerFunnelPage({ searchParams }: PageProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Customer Funnel Analytics</h1>
        <p className="text-muted-foreground">
          Analyze the customer journey from first visit to final purchase across all brands.
        </p>
      </div>
      <Suspense fallback={<p>Loading dashboard...</p>}>
        <AnalyticsData searchParams={searchParams as FunnelFilters} />
      </Suspense>
    </div>
  );
}
