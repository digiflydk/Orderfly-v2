import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { verifiedOrderflyIdentity } from '@/lib/access/orderfly-session';
import { authorizeTransaction } from '@/lib/access/scoped-data';
import { managedDeliveryBindingSchema } from '../provider-contract';
import { bookingIntentSchema, transitionBookingIntent, type BookingIntent } from './state';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const scopeSchema = z.object({ brandId: id, locationId: id, orderId: id }).strict();
const managedSchema = managedDeliveryBindingSchema;
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const originalAttemptReference = (scope: z.infer<typeof scopeSchema>) => digest(['delivery-original-v1', scope.brandId, scope.locationId, scope.orderId]);
function checkOrder(order: FirebaseFirestore.DocumentData | undefined, scope: z.infer<typeof scopeSchema>) {
  if (!order || order.brandId !== scope.brandId || order.locationId !== scope.locationId || order.deliveryType !== 'Delivery') throw new Error('delivery_order_ineligible');
  return managedSchema.parse(order.managedDelivery);
}
/** Scoped staff preparation. Worker dispatch must separately claim submitting before network I/O. */
export async function ensureOriginalDeliveryAttempt(rawScope: unknown): Promise<{intent: BookingIntent; existing: boolean}> {
  const scope = scopeSchema.parse(rawScope), identity = await verifiedOrderflyIdentity(), db = getAdminDb();
  const orderRef = db.collection('orders').doc(scope.orderId), attemptRef = orderRef.collection('deliveryAttempts').doc('original');
  return db.runTransaction(async tx => {
    const order = (await tx.get(orderRef)).data(), managed = checkOrder(order, scope);
    await authorizeTransaction(tx, identity, order!, 'orderfly.orders:edit', 'location');
    const previous = await tx.get(attemptRef), reference = originalAttemptReference(scope);
    if (previous.exists) {
      const intent = bookingIntentSchema.parse(previous.data());
      if (intent.scope.brandId !== scope.brandId || intent.scope.locationId !== scope.locationId || intent.scope.orderId !== scope.orderId
        || intent.provider !== managed.providerId || intent.requestDigest !== managed.requestDigest || intent.reference !== reference || intent.intentId !== reference) throw new Error('delivery_attempt_conflict');
      return { intent, existing: true };
    }
    if (order!.paymentStatus !== 'Paid') throw new Error('delivery_order_ineligible');
    const now = Date.now();
    const intent: BookingIntent = { schemaVersion: 1, scope, provider: managed.providerId, intentId: reference, reference,
      requestDigest: managed.requestDigest, revision: 0, state: 'pending', providerDeliveryId: null, createdAt: now, updatedAt: now };
    tx.create(attemptRef, intent);
    return { intent, existing: false };
  });
}
/** Scoped staff transition; no raw provider webhook is exposed here. */
export async function transitionOriginalDeliveryAttempt(rawScope: unknown, rawCommand: unknown): Promise<BookingIntent> {
  const scope = scopeSchema.parse(rawScope), identity = await verifiedOrderflyIdentity(), db = getAdminDb();
  const orderRef = db.collection('orders').doc(scope.orderId), attemptRef = orderRef.collection('deliveryAttempts').doc('original');
  return db.runTransaction(async tx => {
    const order = (await tx.get(orderRef)).data(), managed = checkOrder(order, scope);
    await authorizeTransaction(tx, identity, order!, 'orderfly.orders:edit', 'location');
    const previous = bookingIntentSchema.parse((await tx.get(attemptRef)).data());
    if (previous.provider !== managed.providerId || previous.requestDigest !== managed.requestDigest
      || previous.reference !== originalAttemptReference(scope) || previous.scope.brandId !== scope.brandId || previous.scope.locationId !== scope.locationId || previous.scope.orderId !== scope.orderId) throw new Error('delivery_attempt_conflict');
    const command = rawCommand && typeof rawCommand === 'object' && !Array.isArray(rawCommand)
      ? { ...rawCommand, now: Date.now() } : rawCommand;
    const next = transitionBookingIntent(previous, command);
    // Financial eligibility gates new dispatch, not recording a provider outcome
    // for a request which may already have created a courier before compensation.
    if (next.state === 'submitting' && order!.paymentStatus !== 'Paid') throw new Error('delivery_order_ineligible');
    if (next.revision !== previous.revision) tx.set(attemptRef, next);
    return next;
  });
}
