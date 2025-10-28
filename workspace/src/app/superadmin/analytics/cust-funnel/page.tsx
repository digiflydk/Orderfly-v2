

import type { AsyncPageProps } from "@/types/next-async-props";
import { resolveParams, resolveSearchParams } from "@/lib/next/resolve-props";
import { Suspense } from 'react';
import { getFunnelDataForSuperAdmin, runAggregationForDates } from "./actions";
import { AnalyticsDashboardClient } from '@/components/superadmin/analytics-dashboard-client';
import { getBrands } from '@/app/superadmin/brands/actions';
import { getAllLocations } from '@/app/superadmin/locations/actions';
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

  // Set default date range if not provided
  const dateFrom = plainSearchParams.dateFrom || new Date(new Date().setDate(new Date().getDate() - 7)).toISOString();
  const dateTo = plainSearchParams.dateTo || new Date().toISOString();

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

export default async function CustomerFunnelPage({ params, searchParams }: AsyncPageProps) {
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
        <AnalyticsData searchParams={query as FunnelFilters} />
      </Suspense>
    </div>
  );
}
