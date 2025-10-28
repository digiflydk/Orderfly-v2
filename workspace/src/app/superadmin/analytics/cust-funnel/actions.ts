

'use server';

import type { FunnelFilters, FunnelOutput } from '@/types';
import { getFunnelData } from '@/lib/analytics/getFunnelData';
import { aggregateDailyData } from '@/lib/analytics/aggregateDaily';
import { revalidatePath } from 'next/cache';

const SUPER = { role: 'superadmin' as const };

export async function getFunnelDataForSuperAdmin(filters: FunnelFilters): Promise<FunnelOutput> {
  // @ts-ignore
  return getFunnelData(filters, SUPER);
}

export async function runAggregationForDates(startDate: string, endDate: string) {
  const res = await aggregateDailyData(startDate, endDate);
  revalidatePath('/superadmin/analytics/cust-funnel');
  return {
    success: true,
    message: `OK – aggregated ${res.daysProcessed} day(s), ${res.eventsProcessed} events, wrote ${res.docsWritten} document(s).`,
  };
}
