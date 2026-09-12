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
    ...event, id, ts: new Date(), instrumentationSource: 'commerce-v1',
    verifiedPayment: trusted && name === 'payment_succeeded',
    provenance: trusted && name === 'payment_succeeded' ? 'server-verified-payment-v1' : 'client-commerce-v1',
  }), undefined, 1500);
  // Internal operational metrics never forward to a global advertising/analytics destination.
}
