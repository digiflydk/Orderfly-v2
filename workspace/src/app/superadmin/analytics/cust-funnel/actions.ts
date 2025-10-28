
'use server';

import type { FunnelFilters, FunnelOutput } from '@/types';
import { getFunnelData } from '@/lib/analytics/getFunnelData';
import { aggregateDailyData } from '@/lib/analytics/aggregateDaily';
import { revalidatePath } from 'next/cache';

// Placeholder for a real SuperAdmin user object from auth
const MOCK_SUPER_ADMIN_USER = { role: 'superadmin' };

export async function getFunnelDataForSuperAdmin(filters: FunnelFilters): Promise<FunnelOutput> {
  // Pass the mock superadmin user to indicate elevated permissions
  // @ts-ignore
  return getFunnelData(filters, MOCK_SUPER_ADMIN_USER);
}

export async function runAggregationForDates(startDate: string, endDate: string) {
  const res = await aggregateDailyData(startDate, endDate);
  revalidatePath('/superadmin/analytics/cust-funnel');
  return {
    success: true,
    message: `OK – aggregated ${res.daysProcessed} day(s), ${res.eventsProcessed} events, wrote ${res.docsWritten} document(s).`,
  };
}
