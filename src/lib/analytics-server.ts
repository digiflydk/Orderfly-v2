// NO 'use client' here
import type { AnalyticsEventName } from '@/types';

export async function trackServerEvent(eventName: AnalyticsEventName, props: Record<string, any>) {
  // Minimal server logger (kan senere kobles til Sentry/BigQuery)
  console.log(`[SERVER EVENT]: ${eventName}`, props);
  // evt. fremtidig server-side tracking kan tilføjes her
}
