import { ReadonlyURLSearchParams } from "next/navigation";
import type { SACommonFilters } from "@/types/superadmin";

export function toQuery(f: SACommonFilters){
  const q = new URLSearchParams();
  q.set('from', f.dateFrom);
  q.set('to', f.dateTo);
  if (f.brandId && f.brandId !== 'all') q.set('brand', f.brandId);
  if (f.locationIds?.length) q.set('loc', f.locationIds.join(','));
  return q.toString();
}

export function fromQuery(sp: ReadonlyURLSearchParams): SACommonFilters{
  const loc = sp.get('loc')?.split(',').filter(Boolean) || undefined;
  const today = new Date().toISOString().slice(0,10);
  return {
    dateFrom: sp.get('from') || today,
    dateTo:   sp.get('to')   || today,
    brandId:  sp.get('brand') || 'all',
    locationIds: loc,
  };
}
