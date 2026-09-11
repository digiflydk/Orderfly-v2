import { analyticsOriginAllowed } from '@/lib/analytics-origin';
import { metricPayload } from '@/lib/commerce-metrics';
import { recordCommerceMetric } from '@/lib/server/record-commerce-metric';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  if (Number(request.headers.get('content-length') || 0) > 8192) return new Response(null, {status: 413});
  if (!analyticsOriginAllowed(request)) return new Response(null, {status: 403});
  try {
    const raw = await request.text();
    if (raw.length > 8192) return new Response(null, {status: 413});
    const {name, params} = JSON.parse(raw);
    const event = metricPayload(name, params);
    if (!event?.eventId || !event.sessionId) return new Response(null, {status: 400});
    await recordCommerceMetric(name, event);
  } catch { /* Optional diagnostics never affect orders. */ }
  return new Response(null, {status: 204});
}
