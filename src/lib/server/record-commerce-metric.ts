import 'server-only';
import { createHash } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import { metricPayload } from '@/lib/commerce-metrics';
import { optionalCheckoutValue } from '@/lib/optional-checkout';
export async function recordCommerceMetric(name: unknown, props: Record<string, unknown>, trusted = false) {
  const event = metricPayload(name, props, trusted);
  if (!event) return;
  const key = trusted ? `${name}/${event.brandId}/${event.orderId}` : name === 'web_vital'
    ? `${event.release}/${event.sessionId}/${event.metricId}/${event.metricName}` : `${event.sessionId}/${event.eventId}`;
  if (!trusted && !event.eventId) return;
  const id = 'commerce-' + createHash('sha256').update(key).digest('hex');
  await optionalCheckoutValue(() => getAdminDb().collection('analytics_events').doc(id).set({
    ...event, id, ts: new Date(), source: 'commerce-v1',
    verifiedPayment: trusted && name === 'payment_succeeded',
    provenance: trusted && name === 'payment_succeeded' ? 'server-verified-payment-v1' : 'client-commerce-v1',
  }), undefined, 1500);
  const measurementId = process.env.GA_MEASUREMENT_ID || process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const apiSecret = process.env.GA_API_SECRET;
  if (measurementId && apiSecret && event.sessionId) {
    const paid = trusted && name === 'payment_succeeded';
    await optionalCheckoutValue(() => fetch(`https://www.google-analytics.com/mp/collect?${new URLSearchParams({measurement_id: measurementId, api_secret: apiSecret})}`, {
      method: 'POST', headers: {'Content-Type': 'application/json'}, signal: AbortSignal.timeout(1500),
      body: JSON.stringify({client_id: event.sessionId, events: [{name: paid ? 'purchase' : name,
        params: {...event, ...(event.cartValue !== undefined ? {value: event.cartValue, currency: 'DKK'} : {}), ...(paid ? {transaction_id: event.orderId} : {})}}]}),
    }), undefined, 1500);
  }
}
