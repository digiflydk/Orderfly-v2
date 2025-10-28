
"use server";

import type { FunnelFilters } from '@/types';

export async function getFunnelSummary() {
  return { total: 0, steps: [] as Array<{ name: string; count: number }> };
}

export async function getFunnelDataForSuperAdmin(filters: FunnelFilters) {
  return {
    summary: { total: 0, steps: [] },
    daily: [],
    byLocation: [],
  };
}

export async function runAggregationForDates(dateFrom: string, dateTo: string) {
  return { success: true, message: 'Aggregation completed' };
}
