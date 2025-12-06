
'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import type { Brand, Location, FunnelFilters, FunnelOutput, FunnelCounting, FunnelDeviceFilter } from '@/types';
import type { SACommonFilters } from '@/types/superadmin';
import { runAggregationForDates } from '@/app/superadmin/analytics/cust-funnel/actions';
import { BarChart3, CheckCircle2 } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { ChartContainer } from '../ui/chart';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Tooltip as TooltipUI, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { FiltersBar } from './FiltersBar';
import { Label } from '../ui/label';

type Props = {
  initialData: FunnelOutput;
  brands?: Brand[];
  locations: Location[];
  searchParams: FunnelFilters;
};

function KpiCard({ title, value, rate, tooltipText }: { title: string; value: string | number, rate?: number, tooltipText?: string }) {
    const cardContent = (
         <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{typeof value === 'number' ? value.toLocaleString('da-DK') : value}</div>
                {rate !== undefined && (
                    <p className="text-xs text-muted-foreground">
                        {rate.toFixed(1)}% from previous step
                    </p>
                )}
            </CardContent>
        </Card>
    );

    if (tooltipText) {
        return (
            <TooltipProvider>
                <TooltipUI>
                    <TooltipTrigger asChild>{cardContent}</TooltipTrigger>
                    <TooltipContent><p>{tooltipText}</p></TooltipContent>
                </TooltipUI>
            </TooltipProvider>
        )
    }

    return cardContent;
}

const mapFunnelToCommon = (filters: FunnelFilters): SACommonFilters => ({
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    brandId: (filters.brandId as string | 'all') ?? 'all',
    locationIds:
      filters.locationId && filters.locationId !== 'all'
        ? [filters.locationId]
        : undefined,
});

const mapCommonToFunnel = (
    common: SACommonFilters,
    prev: FunnelFilters,
): FunnelFilters => ({
    ...prev,
    dateFrom: common.dateFrom,
    dateTo: common.dateTo,
    brandId: common.brandId ?? 'all',
    locationId:
      common.locationIds && common.locationIds.length > 0
        ? common.locationIds[0]
        : 'all',
});


export function AnalyticsDashboardClient({ initialData, brands, locations, searchParams }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [data, setData] = useState<FunnelOutput>(initialData);
  const [currentFilters, setCurrentFilters] = useState<FunnelFilters>(searchParams);
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  
  const handleFilterChange = (next: FunnelFilters) => {
    setCurrentFilters(next);
    const params = new URLSearchParams();
    params.set('dateFrom', next.dateFrom);
    params.set('dateTo', next.dateTo);

    if (next.brandId && next.brandId !== 'all') {
      params.set('brandId', next.brandId);
    }
    if (next.locationId && next.locationId !== 'all') {
        params.set('locationId', next.locationId);
    }
    if (next.device && next.device !== 'all') {
      params.set('device', next.device);
    }
    if (next.counting && next.counting !== 'events') {
      params.set('counting', next.counting);
    }
    
    router.push(`${pathname}?${params.toString()}`);
  };

  async function aggregate() {
    setStatus(null);
    start(async () => {
      const r = await runAggregationForDates(currentFilters.dateFrom, currentFilters.dateTo);
      setStatus(r.message || (r.success ? 'OK' : 'Fejl'));
      router.refresh();
    });
  }

  const { totals } = data;
  const isUniqueCount = currentFilters.counting === 'unique';

  const totalCR = totals.sessions > 0 ? ((totals.payment_succeeded / totals.sessions) * 100).toFixed(2) + '%' : '0.00%';
  const tooltipText = isUniqueCount ? "Antal unikke sessions der nåede dette trin." : "Samlet antal hændelser for dette trin.";

  const currentSAFilters = mapFunnelToCommon(currentFilters);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-4 flex flex-col gap-4">
             <FiltersBar 
                filters={currentSAFilters}
                onChange={(common) => {
                    const next = mapCommonToFunnel(common, currentFilters);
                    handleFilterChange(next);
                }}
                brands={brands || []}
                locations={locations}
            />
             <div className="flex flex-col sm:flex-row items-center gap-4">
                <div className="w-full sm:w-auto">
                    <Label htmlFor="counting-select" className="text-xs text-muted-foreground">Counting</Label>
                     <Select value={currentFilters.counting || 'events'} onValueChange={(v) => handleFilterChange({...currentFilters, counting: v as FunnelCounting})}>
                        <SelectTrigger className="w-full sm:w-[180px]" id="counting-select">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="events">All Events</SelectItem>
                            <SelectItem value="unique">Unique Sessions</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
             </div>
        </CardContent>
        {brands && (
            <CardFooter className="flex-col sm:flex-row items-center justify-between gap-4 border-t p-4">
                 <div className="w-full sm:w-auto">
                    {status && (
                        <Alert variant="default" className="w-full">
                            <CheckCircle2 className="h-4 w-4" />
                            <AlertTitle>Aggregation Complete</AlertTitle>
                            <AlertDescription className="text-xs">{status}</AlertDescription>
                        </Alert>
                    )}
                 </div>
                 <div className="flex w-full sm:w-auto justify-end">
                    <Button onClick={aggregate} disabled={pending} title="Genberegn dagsaggregeringer i Firestore">
                        {pending ? 'Kører…' : 'Aggreger data'}
                    </Button>
                 </div>
            </CardFooter>
        )}
      </Card>
      
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <KpiCard title="Sessions" value={totals.sessions} tooltipText={tooltipText} />
            <KpiCard title="View Menu" value={totals.view_menu} rate={totals.sessions > 0 ? (totals.view_menu / totals.sessions) * 100 : 0} tooltipText={tooltipText} />
            <KpiCard title="View Product" value={totals.view_product} rate={totals.view_menu > 0 ? (totals.view_product / totals.view_menu) * 100 : 0} tooltipText={tooltipText} />
            <KpiCard title="Add to Cart" value={totals.add_to_cart} rate={totals.view_product > 0 ? (totals.add_to_cart / totals.view_product) * 100 : 0} tooltipText={tooltipText} />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <KpiCard title="Start Checkout" value={totals.start_checkout} rate={totals.add_to_cart > 0 ? (totals.start_checkout / totals.add_to_cart) * 100 : 0} tooltipText={tooltipText} />
            <KpiCard title="Click Purchase" value={totals.click_purchase} rate={totals.start_checkout > 0 ? (totals.click_purchase / totals.start_checkout) * 100 : 0} tooltipText={tooltipText} />
            <KpiCard title="Purchase" value={totals.payment_succeeded} rate={totals.click_purchase > 0 ? (totals.payment_succeeded / totals.click_purchase) * 100 : 0} tooltipText={tooltipText} />
            <KpiCard title="Total CR" value={totalCR} tooltipText="Total konverteringsrate fra Session til Purchase." />
       </div>
    </div>
  );
}
