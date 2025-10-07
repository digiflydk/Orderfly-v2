
import type { AppTypes } from "@/types/next-async-props";
import { resolveParams, resolveSearchParams } from "@/lib/next/resolve-props";
import { Suspense } from 'react';
import { getFunnelDataForSuperAdmin } from "@/app/superadmin/analytics/cust-funnel/actions";
import { AnalyticsDashboardClient } from '@/components/superadmin/analytics-dashboard-client';
import { getBrands } from '../../brands/actions';
import { getAllLocations } from '../../locations/actions';
import type { FunnelFilters } from '@/types';

export const revalidate = 0;

async function AnalyticsData({ searchParams }: { searchParams: { [key: string]: string | string[] | undefined } }) {
  const [brands, locations] = await Promise.all([
    getBrands(),
    getAllLocations()
  ]);

  // Explicitly create a plain object from searchParams
  const plainSearchParams: { [key: string]: string } = {};
  for (const key in searchParams) {
    const value = searchParams[key];
    if (typeof value === 'string') {
      plainSearchParams[key] = value;
    }
  }

  // Set default date range to today if not provided
  const today = new Date().toISOString().slice(0, 10);
  const dateFrom = plainSearchParams.dateFrom || today;
  const dateTo = plainSearchParams.dateTo || today;

  const filters = {
    ...plainSearchParams,
    dateFrom,
    dateTo,
  };

  const initialData = await getFunnelDataForSuperAdmin(filters as FunnelFilters);

  return (
    <AnalyticsDashboardClient
      initialData={initialData}
      brands={brands}
      locations={locations}
      searchParams={filters}
    />
  );
}

export default async function CustomerFunnelPage({ params, searchParams }: AppTypes.AsyncPageProps) {
  const routeParams = await resolveParams(params);
  const query = await resolveSearchParams(searchParams);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Customer Funnel Analytics</h1>
        <p className="text-muted-foreground">
          Analyze the customer journey from first visit to final purchase across all brands.
        </p>
      </div>
      <Suspense fallback={<p>Loading dashboard...</p>}>
        <AnalyticsData searchParams={query} />
      </Suspense>
    </div>
  );
}
