import 'server-only';
import { after } from 'next/server';
import type { AnalyticsEventName } from '@/types';
import { recordCommerceMetric } from './server/record-commerce-metric';
export async function trackServerEvent(name: AnalyticsEventName, props: Record<string, any>) {
  try {
    after(() => recordCommerceMetric(name, {...props, release: process.env.NEXT_PUBLIC_RELEASE_SHA || 'unknown'}, true).catch(() => {}));
  } catch { /* No request context or failed optional telemetry must not block payment. */ }
}
