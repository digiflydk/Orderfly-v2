import 'server-only';
import { createHash } from 'node:crypto';
import type { VerifiedWoltPayload } from './webhook-verify';

export type WoltFulfillmentStatus = 'booked' | 'courier_to_pickup' | 'picked_up' | 'delivered' | 'failed';
export const WOLT_LIFECYCLE_EVENTS = [
  'order.received', 'order.rejected', 'order.pickup_eta_updated', 'order.pickup_started',
  'order.picked_up', 'order.pickup_arrival', 'order.dropoff_started', 'order.dropoff_arrival',
  'order.dropoff_completed', 'order.delivered', 'order.not_delivered', 'order.customer_no_show',
  'order.dropoff_eta_updated',
] as const;
const statuses: Record<string, WoltFulfillmentStatus> = {
  'order.received': 'booked', 'order.rejected': 'failed',
  'order.pickup_started': 'courier_to_pickup', 'order.pickup_arrival': 'courier_to_pickup',
  'order.picked_up': 'picked_up', 'order.dropoff_started': 'picked_up', 'order.dropoff_arrival': 'picked_up',
  'order.delivered': 'delivered', 'order.not_delivered': 'failed', 'order.customer_no_show': 'failed',
};
export function normalizeWoltEvent(event: VerifiedWoltPayload, merchantId: string, receivedAt: string) {
  const d = event.details;
  // details.id is documented as the event ID. Include type/order to tolerate providers
  // reusing an ID across lifecycle event types without dropping real transitions.
  const dedupeIdentity = createHash('sha256').update(JSON.stringify([merchantId, d.wolt_order_reference_id, event.type, d.id])).digest('hex');
  const known = (WOLT_LIFECYCLE_EVENTS as readonly string[]).includes(event.type);
  return {
    provider: 'wolt' as const,
    nativeEventId: d.id, dedupeIdentity,
    nativeOrderReference: d.wolt_order_reference_id,
    nativeVenueId: d.venue_id ?? null,
    merchantOrderReference: d.merchant_order_reference_id ?? null,
    occurredAt: null as string | null, dispatchedAt: event.dispatched_at, receivedAt,
    rawStatus: event.type,
    status: statuses[event.type] ?? null,
    requiresReconciliation: event.type === 'order.dropoff_completed',
    supported: known,
    // No raw payload, courier coordinates, handshake PIN, address or phone is retained.
    pickupEstimate: d.pickup?.eta ? { earliest: d.pickup.eta, latest: d.pickup.eta } : null,
    pickupEstimateReliable: event.type === 'order.pickup_eta_updated' ? true : null,
    dropoffEstimate: d.dropoff?.eta ? { earliest: d.dropoff.eta.min, latest: d.dropoff.eta.max } : null,
    nativeFailureCode: d.purchase_rejected_reason ?? d.not_delivered_details?.reason ?? null,
    nativeFailureOutcome: d.not_delivered_details?.outcome ?? null,
  };
}
export type NormalizedWoltEvent = ReturnType<typeof normalizeWoltEvent>;
