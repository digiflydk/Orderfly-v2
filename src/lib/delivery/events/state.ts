import { z } from 'zod';
const id = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const time = z.number().int().nonnegative().safe();
const status = z.enum(['booked', 'courier_assigned', 'courier_to_pickup', 'picked_up', 'delivered', 'cancelled', 'failed']);
const binding = { brandId: id, locationId: id, orderId: id, provider: id, providerDeliveryId: z.string().min(1).max(300) };
const snapshotSchema = z.object({ ...binding, status, occurredAt: time, sequence: time.nullable(), nativeStatus: z.string().min(1).max(128) }).strict();
const eventSchema = snapshotSchema.extend({ eventId: z.string().min(1).max(300), receivedAt: time }).strict();
export type DeliveryEventSnapshot = z.infer<typeof snapshotSchema>;
export type DeliveryEventDecision = { action: 'apply' | 'ignore' | 'reconcile'; reason: string; snapshot: DeliveryEventSnapshot };
const allowed: Record<DeliveryEventSnapshot['status'], readonly DeliveryEventSnapshot['status'][]> = {
  booked: ['courier_assigned', 'courier_to_pickup', 'picked_up', 'delivered', 'cancelled', 'failed'],
  courier_assigned: ['courier_to_pickup', 'picked_up', 'delivered', 'cancelled', 'failed'],
  courier_to_pickup: ['picked_up', 'delivered', 'cancelled', 'failed'],
  picked_up: ['delivered', 'failed'], delivered: [], cancelled: [], failed: [],
};
/** Pure policy only. Authenticity, binding resolution and durable inbox dedupe are caller obligations. */
export function planVerifiedDeliveryEvent(rawSnapshot: unknown, rawEvent: unknown): DeliveryEventDecision {
  const current = snapshotSchema.parse(rawSnapshot), event = eventSchema.parse(rawEvent);
  for (const key of ['brandId', 'locationId', 'orderId', 'provider', 'providerDeliveryId'] as const) {
    if (current[key] !== event[key]) throw new Error('delivery_event_scope');
  }
  const result = (action: DeliveryEventDecision['action'], reason: string, snapshot = current): DeliveryEventDecision => ({ action, reason, snapshot });
  const sequenced = current.sequence !== null && event.sequence !== null;
  if (sequenced && event.sequence! < current.sequence! || !sequenced && event.occurredAt < current.occurredAt) return result('ignore', 'older_event');
  if (sequenced && event.sequence === current.sequence) {
    return result(event.status === current.status && event.nativeStatus === current.nativeStatus ? 'ignore' : 'reconcile', 'same_sequence');
  }
  if (!sequenced && event.occurredAt === current.occurredAt && event.status !== current.status) return result('reconcile', 'ambiguous_order');
  if (current.sequence !== null && event.sequence === null) return result('reconcile', 'missing_sequence');
  if (current.status !== event.status && !allowed[current.status].includes(event.status)) return result('reconcile', 'unsupported_transition');
  // Preserve the authority's ordering fields but never store reception time as occurrence time.
  const { eventId: _eventId, receivedAt: _receivedAt, ...next } = event;
  return result('apply', 'permitted_transition', next);
}
