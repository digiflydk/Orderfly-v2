'use server';

import { subDays } from 'date-fns';
import { getSalesDashboardData } from '@/lib/superadmin/getSalesSummary';

export async function getKpis() {
  const endDate = new Date();
  const startDate = subDays(endDate, 30);

  const data = await getSalesDashboardData({
    dateFrom: startDate.toISOString(),
    dateTo: endDate.toISOString(),
  });

  return data;
}
