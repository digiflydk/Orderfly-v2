
'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import type { Brand, Location, FunnelFilters, FunnelOutput, FunnelCounting, FunnelDeviceFilter } from '@/types';
import type { SACommonFilters } from '@/types/superadmin';
import { runAggregationForDates } from '@/app/superadmin/analytics/cust-funnel/actions';
import { BarChart3, CheckCircle2 } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Button } from '../ui/button';
import { Tooltip as TooltipUI, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { FiltersBar } from './FiltersBar';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { formatPrice } from '@/lib/storefront-format';

type Props = {
  initialData: FunnelOutput;
  brands?: Brand[];
  locations: Location[];
  searchParams: FunnelFilters;
};

function KpiCard({ title, value, tooltipText }: { title: string; value: string | number, tooltipText?: string }) {
    const cardContent = (
         <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{typeof value === 'number' ? value.toLocaleString('da-DK') : value}</div>

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
  const data = initialData;
  const [currentFilters, setCurrentFilters] = useState<FunnelFilters>(searchParams);
  useEffect(() => setCurrentFilters(searchParams), [searchParams]);
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
    if (next.utmSource) params.set('utmSource', next.utmSource);
    
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

  const totalCR = totals.sessions > 0 ? (((totals.measuredPurchasingSessions || 0) / totals.sessions) * 100).toFixed(2) + '%' : 'Ikke målbart';
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
                <div className="w-full sm:w-auto">
                    <Label htmlFor="device-select" className="text-xs text-muted-foreground">Enhed</Label>
                    <Select value={currentFilters.device || 'all'} onValueChange={(v) => handleFilterChange({...currentFilters, device: v as FunnelDeviceFilter})}>
                        <SelectTrigger className="w-full sm:w-[180px]" id="device-select"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="all">Alle enheder</SelectItem><SelectItem value="mobile">Mobil</SelectItem><SelectItem value="desktop">Desktop</SelectItem></SelectContent>
                    </Select>
                </div>
                <div className="w-full sm:w-[220px]">
                    <Label htmlFor="source-filter" className="text-xs text-muted-foreground">Kilde (utm_source)</Label>
                    <Input id="source-filter" value={currentFilters.utmSource || ''} onChange={event => setCurrentFilters({...currentFilters, utmSource: event.target.value})} placeholder="fx google eller meta" onBlur={event => handleFilterChange({...currentFilters, utmSource: event.currentTarget.value.trim() || undefined})} />
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
      {data.dataQualityWarnings.map(warning => <Alert key={warning} variant="destructive"><AlertTitle>Datakvalitet</AlertTitle><AlertDescription>{warning}</AlertDescription></Alert>)}
      <p className="text-sm text-muted-foreground">Browserhændelser kræver statistik-samtykke. Tallene nedenfor tælles hver for sig og er ikke en sammenhængende salgstragt. Samlet salg omfatter også ordrer uden et målt besøg.</p>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <KpiCard title="Sessions" value={totals.sessions} tooltipText={tooltipText} />
            <KpiCard title="View Menu" value={totals.view_menu} tooltipText={tooltipText} />
            <KpiCard title="View Product" value={totals.view_product} tooltipText={tooltipText} />
            <KpiCard title="Add to Cart" value={totals.add_to_cart} tooltipText={tooltipText} />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <KpiCard title="Start Checkout" value={totals.start_checkout} tooltipText={tooltipText} />
            <KpiCard title="Click Purchase" value={totals.click_purchase} tooltipText={tooltipText} />
            <KpiCard title="Alle betalte ordrer" value={totals.paidOrders ?? totals.payment_succeeded} tooltipText="Betalte ordrer fra serveren. Indeholder også køb uden analytics-samtykke." />
            <KpiCard title="Målt konvertering" value={totalCR} tooltipText="Andel målte sessions med en betalt ordre i perioden. Køb uden en matchende målt session indgår kun i salgstallet." />
       </div>
       <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
        <Card>
          <CardHeader><CardTitle>Målte handlinger</CardTitle><p className="text-sm text-muted-foreground">{isUniqueCount ? "Unikke sessions pr. handling" : "Antal hændelser pr. handling"}. Gentagne besøg og genoptagne kurve kan give flere checkout-hændelser end tilføjelser til kurven. Produktvisning kan springes over ved hurtig tilføjelse.</p></CardHeader>
          <CardContent className="space-y-3">
            {([
              ['Menuvisning', totals.view_menu], ['Produktvisning', totals.view_product], ['Tilføjet til kurv', totals.add_to_cart],
              ['Checkout startet', totals.start_checkout], ['Klik på betaling', totals.click_purchase],
            ] as Array<[string, number]>).map(([label, value], _index, rows) => {
              const max = Math.max(1, ...rows.map(([, count]) => count));
              return <div key={label}>
                <div className="mb-1 flex justify-between gap-3 text-sm"><span>{label}</span><span className="font-medium tabular-nums">{value.toLocaleString('da-DK')}</span></div>
                <div className="h-8 overflow-hidden rounded bg-muted"><div className="h-full bg-primary text-xs font-semibold text-primary-foreground" style={{width:`${value / max * 100}%`}} /></div>
              </div>;
            })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Verificeret salg</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Betalte ordrer fra serveren i det valgte udsnit. Dette tal dokumenterer salg, ikke modtagelse hos Google eller Meta.</p>
            <div><p className="text-sm text-muted-foreground">Verificerede ordrer</p><p className="text-2xl font-semibold tabular-nums">{totals.paidOrders ?? totals.payment_succeeded}</p></div>
            <div><p className="text-sm text-muted-foreground">Køb med målt besøg</p><p className="text-2xl font-semibold tabular-nums">{totals.measuredPaidOrders ?? 0} / {totals.paidOrders ?? totals.payment_succeeded}</p><p className="text-xs text-muted-foreground">{totals.paidOrders ? `${((totals.measuredPaidOrders || 0) / totals.paidOrders * 100).toFixed(1)} % måledækning` : 'Ingen køb i det valgte udsnit'}</p></div>
            <div><p className="text-sm text-muted-foreground">Omsætning</p><p className="text-3xl font-bold tabular-nums">{formatPrice(totals.revenue_paid)}</p></div>
            <div><p className="text-sm text-muted-foreground">Gennemsnitsordre</p><p className="text-2xl font-semibold tabular-nums">{formatPrice((totals.paidOrders ?? totals.payment_succeeded) ? totals.revenue_paid / (totals.paidOrders ?? totals.payment_succeeded) : 0)}</p></div>
            <p className="text-xs text-muted-foreground">Alle serververificerede betalte ordrer tæller som salg. Besøg og trin før køb kræver analytics-samtykke. Målt konvertering omfatter kun sessions, der kan matches til et køb.</p>
          </CardContent>
        </Card>
       </div>
       <Card>
        <CardHeader><CardTitle>Kampagner og kanaler</CardTitle></CardHeader>
        <CardContent>
          <Table><TableHeader><TableRow><TableHead>Kilde / medie</TableHead><TableHead>Kampagne</TableHead><TableHead className="text-right">Køb</TableHead><TableHead className="text-right">Omsætning</TableHead></TableRow></TableHeader>
          <TableBody>{data.attribution.length ? data.attribution.map(row => <TableRow key={`${row.source}/${row.medium}/${row.campaign}`}><TableCell>{row.source} / {row.medium}</TableCell><TableCell>{row.campaign}</TableCell><TableCell className="text-right tabular-nums">{row.purchases}</TableCell><TableCell className="text-right tabular-nums">{formatPrice(row.revenue)}</TableCell></TableRow>) : <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Ingen betalte ordrer i perioden.</TableCell></TableRow>}</TableBody></Table>
        </CardContent>
       </Card>
       <Card>
        <CardHeader><CardTitle>Resultat pr. lokation</CardTitle></CardHeader>
        <CardContent><Table><TableHeader><TableRow><TableHead>Lokation</TableHead><TableHead className="text-right">Sessions</TableHead><TableHead className="text-right">Køb</TableHead><TableHead className="text-right">Konvertering</TableHead><TableHead className="text-right">Omsætning</TableHead></TableRow></TableHeader>
        <TableBody>{data.byLocation.map(row => <TableRow key={row.locationId}><TableCell>{row.locationName}</TableCell><TableCell className="text-right">{row.sessions}</TableCell><TableCell className="text-right">{row.purchases}</TableCell><TableCell className="text-right">{row.convSessionsToPurchase.toFixed(1)}%</TableCell><TableCell className="text-right">{formatPrice(row.revenue || 0)}</TableCell></TableRow>)}</TableBody></Table></CardContent>
       </Card>
    </div>
  );
}
