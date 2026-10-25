import 'server-only';
import { createHash } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import { deliveryIdSchema, managedDeliveryBindingSchema, verifiedDeliveryEventSchema, type VerifiedDeliveryEvent } from '../provider-contract';
import { bookingIntentSchema } from '../booking/state';
import { originalAttemptReference } from '../booking/server';
import { planVerifiedDeliveryEvent, type DeliveryEventSnapshot } from './state';
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Internal adapter boundary, never a server action. Caller supplies trusted authentication and
 * native binding resolution, not a JSON "verified" flag. Verification runs before DB access. */
export async function ingestDeliveryProviderEvent(verifyAndResolve: () => Promise<{ orderId: string; event: VerifiedDeliveryEvent }>): Promise<{ duplicate: boolean; applied: boolean; reconcile: boolean }> {
  const verified = await verifyAndResolve();
  const orderId = deliveryIdSchema.parse(verified.orderId), event = verifiedDeliveryEventSchema.parse(verified.event);
  const scope = { ...event.scope, orderId }, db = getAdminDb(), orderRef = db.collection('orders').doc(orderId);
  const attemptRef = orderRef.collection('deliveryAttempts').doc('original'), stateRef = orderRef.collection('deliveryState').doc('current');
  const inboxRef = orderRef.collection('deliveryEvents').doc(hash([event.providerId, event.providerDeliveryId, event.eventRef]));
  const { receivedAt: _receivedAt, ...immutableEvent } = event;
  const fingerprint = hash(immutableEvent);
  return db.runTransaction(async tx => {
    const [orderSnap, attemptSnap, stateSnap, inboxSnap] = await Promise.all([tx.get(orderRef), tx.get(attemptRef), tx.get(stateRef), tx.get(inboxRef)]);
    const order = orderSnap.data(), managed = managedDeliveryBindingSchema.parse(order?.managedDelivery), attempt = bookingIntentSchema.parse(attemptSnap.data());
    if (!order || order.brandId !== scope.brandId || order.locationId !== scope.locationId || order.deliveryType !== 'Delivery'
      || managed.providerId !== event.providerId || attempt.provider !== event.providerId || attempt.providerDeliveryId !== event.providerDeliveryId
      || attempt.state !== 'booked' || attempt.reference !== originalAttemptReference(scope) || attempt.requestDigest !== managed.requestDigest
      || attempt.scope.brandId !== scope.brandId || attempt.scope.locationId !== scope.locationId || attempt.scope.orderId !== orderId) throw new Error('delivery_event_binding');
    if (inboxSnap.exists) {
      const previous = inboxSnap.data();
      if (previous?.fingerprint !== fingerprint) throw new Error('delivery_event_identity_conflict');
      return { duplicate: true, applied: false, reconcile: previous.reconcile === true };
    }
    const current: DeliveryEventSnapshot = stateSnap.exists ? stateSnap.data() as DeliveryEventSnapshot : {
      ...scope, provider: event.providerId, providerDeliveryId: event.providerDeliveryId, status: 'booked', occurredAt: 0, sequence: null, nativeStatus: 'booking_accepted',
    };
    // ETA-only messages retain their complete estimates/provenance in the inbox.
    // A transport dispatch timestamp must never become a status occurrence time.
    const decision = event.status === null ? { action: 'ignore' as const, reason: 'eta_only_retained', snapshot: current }
      : event.occurredAt === null ? { action: 'reconcile' as const, reason: 'missing_occurrence', snapshot: current }
      : planVerifiedDeliveryEvent(current, { ...scope, provider: event.providerId, providerDeliveryId: event.providerDeliveryId,
        eventId: event.eventRef, receivedAt: Date.parse(event.receivedAt), occurredAt: Date.parse(event.occurredAt), sequence: event.sequence, status: event.status, nativeStatus: event.nativeStatus });
    tx.create(inboxRef, { version: 1, fingerprint, event, decision: decision.action, reason: decision.reason, reconcile: decision.action === 'reconcile', recordedAt: Date.now() });
    if (decision.action === 'apply') tx.set(stateRef, decision.snapshot);
    return { duplicate: false, applied: decision.action === 'apply', reconcile: decision.action === 'reconcile' };
  });
}
