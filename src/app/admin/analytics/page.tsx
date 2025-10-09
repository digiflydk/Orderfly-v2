
import type { AppTypes } from "@/types/next-async-props";
import { resolveParams, resolveSearchParams } from "@/lib/next/resolve-props";
import { Suspense } from 'react';
import { getFunnelDataForBrand } from "@/app/admin/analytics/actions";
import { AnalyticsDashboardClient } from '@/components/superadmin/analytics-dashboard-client';
import { getBrandById } from '@/app/superadmin/brands/actions';
import { getLocationsForBrand } from '@/app/superadmin/locations/actions';
import type { FunnelFilters } from '@/types';

export const revalidate = 0;

// Placeholder for brand admin authentication
const MOCK_BRAND_ID = 'brand-gourmet';

async function AnalyticsData({ searchParams }: { searchParams: { [key: string]: string | string[] | undefined } }) {
  const [brand, locations] = await Promise.all([
    getBrandById(MOCK_BRAND_ID),
    getLocationsForBrand(MOCK_BRAND_ID)
  ]);

  const plainSearchParams: { [key: string]: string } = {};
  for (const key in searchParams) {
    const value = searchParams[key];
    if (typeof value === 'string') {
      plainSearchParams[key] = value;
    }
  }

  const dateFrom = plainSearchParams.dateFrom || new Date(new Date().setDate(new Date().getDate() - 7)).toISOString();
  const dateTo = plainSearchParams.dateTo || new Date().toISOString();

  const filters = {
    ...plainSearchParams,
    dateFrom,
    dateTo,
  };
  
  // Fetch initial data based on the mock brand
  const initialData = await getFunnelDataForBrand(MOCK_BRAND_ID, filters);

  return (
      <AnalyticsDashboardClient
          initialData={initialData}
          locations={locations}
          searchParams={filters}
          // No brands prop for brand admin view
      />
  );
}


export default async function BrandAnalyticsPage({ params, searchParams }: AppTypes.AsyncPageProps) {
  const routeParams = await resolveParams(params);
  const query = await resolveSearchParams(searchParams);

  return (
    <Suspense>
        <div className="space-y-6">
        <div>
            <h1 className="text-2xl font-bold tracking-tight">Analytics Dashboard</h1>
            <p className="text-muted-foreground">
            Track the customer journey and key metrics for your brand.
            </p>
        </div>
        <Suspense fallback={<p>Loading dashboard...</p>}>
            <AnalyticsData searchParams={query} />
        </Suspense>
        </div>
    </Suspense>
  );
}
