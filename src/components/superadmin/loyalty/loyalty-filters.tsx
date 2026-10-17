'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AdminDateRange } from '@/components/superadmin/admin-date-range';
import { AdminSelectField } from '@/components/superadmin/admin-select-field';
import { MultiSelect } from '@/components/ui/multi-select';
import { filterQuery, presetRange, type LoyaltyFilters, type PeriodPreset } from '@/lib/loyalty/stamp-card/filters';

export type FilterBrand = { brandId: string; brandName: string; companyId: string; companyName: string };
const STORAGE_KEY = 'orderfly-loyalty-filters';
const PERIODS: Array<[PeriodPreset, string]> = [['today', 'I dag'], ['7d', '7 dage'], ['30d', '30 dage'], ['thisMonth', 'Denne måned'], ['lastMonth', 'Sidste måned'], ['custom', 'Valgfri periode']];

// Filter bar for every page under Loyalitet. Tenant is shown only to users
// with access to several tenants; a single permitted brand is preselected.
export function LoyaltyFiltersBar({ filters, brands, showPeriod = true, showChannel = true, actors, extraParams = {} }: {
  filters: LoyaltyFilters; brands: FilterBrand[]; showPeriod?: boolean; showChannel?: boolean;
  actors?: Array<{ id: string; name: string }>; extraParams?: Record<string, string>;
}) {
  const router = useRouter(), pathname = usePathname(), params = useSearchParams();
  const companies = [...new Map(brands.map(b => [b.companyId, b.companyName])).entries()];
  const visibleBrands = brands.filter(b => !filters.company || b.companyId === filters.company);

  // Restore the previous choice when a Loyalitet page is opened without filters.
  useEffect(() => {
    try {
      if (!params.has('period') && !params.has('brand')) {
        const saved = sessionStorage.getItem(STORAGE_KEY);
        if (saved) router.replace(`${pathname}?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(saved)), ...extraParams })}`, { scroll: false });
      } else sessionStorage.setItem(STORAGE_KEY, filterQuery(filters));
    } catch { /* storage unavailable: the URL still carries the filters */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const apply = (next: Partial<LoyaltyFilters>) => {
    const merged = { ...filters, ...next };
    router.replace(`${pathname}?${filterQuery(merged, extraParams)}`, { scroll: false });
  };

  return (
    <section aria-label="Filtre" className="flex flex-wrap items-end gap-3 rounded-lg border bg-white p-4">
      {companies.length > 1 && (
        <AdminSelectField label="Kunde (tenant)" value={filters.company || ''} onChange={e => apply({ company: e.target.value || null, brands: [] })}>
          <option value="">Alle kunder</option>
          {companies.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </AdminSelectField>
      )}
      <div className="grid min-w-[220px] gap-1.5 text-sm font-medium">
        <span id="loyalty-brand-label">Brand</span>
        {visibleBrands.length === 1
          ? <p aria-labelledby="loyalty-brand-label" className="flex h-10 items-center rounded-md border bg-muted/40 px-3">{visibleBrands[0].brandName}</p>
          : <MultiSelect options={visibleBrands.map(b => ({ value: b.brandId, label: b.brandName }))} selected={filters.brands}
              onChange={selected => apply({ brands: selected })} placeholder="Alle brands" />}
      </div>
      {showPeriod && (
        <>
          <AdminSelectField label="Periode" value={filters.period} onChange={e => {
            const period = e.target.value as PeriodPreset;
            apply(period === 'custom' ? { period } : { period, ...presetRange(period, Date.now()) });
          }}>
            {PERIODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </AdminSelectField>
          {filters.period === 'custom' && (
            <AdminDateRange from={filters.from} to={filters.to} onFromChange={from => from && apply({ from })} onToChange={to => to && apply({ to })} />
          )}
        </>
      )}
      {showChannel && (
        <AdminSelectField label="Kanal" value={filters.channel || ''} onChange={e => apply({ channel: e.target.value || null })}>
          <option value="">Alle kanaler</option>
          <option value="dine_in">Dine-in</option>
          <option value="takeaway">Takeaway</option>
        </AdminSelectField>
      )}
      {actors && (
        <AdminSelectField label="Medarbejder" value={filters.actor || ''} onChange={e => apply({ actor: e.target.value || null })}>
          <option value="">Alle medarbejdere</option>
          {actors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </AdminSelectField>
      )}
    </section>
  );
}
