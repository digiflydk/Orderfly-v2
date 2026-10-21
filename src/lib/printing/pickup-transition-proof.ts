import 'server-only';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { orderflySession } from '@/lib/access/orderfly-session';
import { principalKey } from '@/lib/access/authority';
import { authorizeTransaction } from '@/lib/access/scoped-data';
import type { NativeTransactionContext } from '@/lib/server/firestore-compat';
import type { RestaurantPaymentForm } from '@/lib/merchant-payment-methods';
import type { KitchenOrder } from './domain';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
// Bound selected raw text before Zod regex/date refinements. Unknown order fields
// are ignored without serializing/traversing customer/provider payloads.
function boundedTextFields(input: unknown, fields: Record<string, number>): boolean {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  for (const [field, limit] of Object.entries(fields)) {
    const descriptor = Object.getOwnPropertyDescriptor(input, field);
    if (descriptor && (!('value' in descriptor) || typeof descriptor.value === 'string' && descriptor.value.length > limit)) return false;
  }
  return true;
}
const request = z.object({ orderId: id, method: z.enum(['cash', 'card']) }).strict();
const liveMarkers = { deletedAt: z.null().optional(), deleted: z.literal(false).optional(), isDeleted: z.literal(false).optional() };
const orderSchema = z.object({
  id: id.optional(), brandId: id, locationId: id,
  status: z.enum(['Received', 'In Progress', 'Ready']),
  paymentStatus: z.enum(['Pending', 'Paid']), paymentMethod: z.literal('PayAtPickup'), deliveryType: z.literal('Pickup'),
  psp: z.null().optional(), discountReservation: z.enum(['held', 'consumed', 'none']).optional(),
  refundedAmountOre: z.literal(0).optional(), refundedAmount: z.literal(0).optional(), refundedAt: z.null().optional(),
  paymentCollection: z.object({
    method: z.enum(['cash', 'card']), employeeId: z.string().regex(/^[a-f0-9]{64}$/),
    receivedAt: z.string().max(40).datetime(),
  }).nullable().optional(),
  ...liveMarkers,
});
const brandSchema = z.object({ id: id.optional(), ...liveMarkers });
const locationSchema = z.object({ id: id.optional(), brandId: id, ...liveMarkers });
const TTL_MS = 300_000;
type Origin = { orderId: string; method: RestaurantPaymentForm; actorKey: string;
  issuedAt: number; lastObservedAt: number; invalidated: boolean };
/** Runtime provenance only. No payment was written or committed by issuing this handle. */
export type PickupPrintPaymentProof = Readonly<{ readonly pickupPrintPaymentProof: unique symbol }>;
export type PickupPrintTransition = Readonly<{ readonly pickupPrintTransition: unique symbol }>;
type Projection = Readonly<{ order: Readonly<KitchenOrder>; previousPaymentStatus: 'Pending' | 'Paid';
  replay: boolean; collectionMethod: RestaurantPaymentForm }>;
const origins = new WeakMap<object, Origin>();
const transitions = new WeakMap<object, { context: NativeTransactionContext; origin: Origin; projection: Projection }>();
export class PickupPrintProofError extends Error {
  constructor(readonly code: 'invalid_pickup_reference' | 'pickup_unverified' | 'proof_unavailable' | 'proof_expired' | 'transition_unverified') { super(code); }
}
function serverTime(): number {
  const time = Date.now();
  if (!Number.isSafeInteger(time) || time <= 0) throw new PickupPrintProofError('proof_unavailable');
  return time;
}
function assertCurrent(origin: Origin): void {
  if (origin.invalidated) throw new PickupPrintProofError('proof_expired');
  let time: number;
  try { time = serverTime(); } catch (error) { origin.invalidated = true; throw error; }
  if (time < origin.lastObservedAt || time - origin.issuedAt >= TTL_MS) {
    origin.invalidated = true;
    throw new PickupPrintProofError('proof_expired');
  }
  origin.lastObservedAt = time;
}
async function currentActor() {
  try {
    const actor = await orderflySession();
    const key = principalKey(actor.identity);
    if (actor.actorId !== key) throw new Error('actor mismatch');
    return { identity: actor.identity, key };
  } catch { throw new PickupPrintProofError('pickup_unverified'); }
}

/** Reads the trusted server session. A supplied identity/session/grant is never accepted.
 * This captures the staff's settlement request, not evidence of a payment collection.
 */
export async function verifyPickupPrintPayment(input: unknown): Promise<PickupPrintPaymentProof> {
  if (!boundedTextFields(input, { orderId: 128, method: 4 })) throw new PickupPrintProofError('invalid_pickup_reference');
  const parsed = request.safeParse(input);
  if (!parsed.success) throw new PickupPrintProofError('invalid_pickup_reference');
  const actor = await currentActor();
  const time = serverTime();
  const handle = Object.freeze({}) as PickupPrintPaymentProof;
  origins.set(handle, { ...parsed.data, actorKey: actor.key, issuedAt: time, lastObservedAt: time, invalidated: false });
  return handle;
}

/** Rechecks the current server actor and native grants inside EACH attempt.
 * No mutation, outbox insertion or dispatch. A fresh context per retry is required.
 */
export async function preparePickupPrintTransition(context: NativeTransactionContext, proof: PickupPrintPaymentProof): Promise<PickupPrintTransition> {
  const origin = proof && typeof proof === 'object' ? origins.get(proof) : undefined;
  if (!origin) throw new PickupPrintProofError('pickup_unverified');
  assertCurrent(origin);
  if (!context || context.db !== getAdminDb() || !context.transaction) throw new PickupPrintProofError('transition_unverified');
  const actor = await currentActor();
  if (actor.key !== origin.actorKey) throw new PickupPrintProofError('pickup_unverified');
  assertCurrent(origin);
  const { db, transaction } = context;
  const snapshot = await transaction.get(db.collection('orders').doc(origin.orderId));
  const data = snapshot.data();
  if (!boundedTextFields(data, { id: 128, brandId: 128, locationId: 128, status: 32, paymentStatus: 16, paymentMethod: 16, deliveryType: 16, discountReservation: 16 })) throw new PickupPrintProofError('transition_unverified');
  const collection = Object.getOwnPropertyDescriptor(data, 'paymentCollection');
  if (collection && (!('value' in collection) || collection.value != null && !boundedTextFields(collection.value, { method: 4, employeeId: 64, receivedAt: 40 }))) throw new PickupPrintProofError('transition_unverified');
  const parsed = orderSchema.safeParse(data);
  if (!snapshot.exists || snapshot.id !== origin.orderId || !parsed.success
    || (parsed.data.id !== undefined && parsed.data.id !== origin.orderId)) throw new PickupPrintProofError('transition_unverified');
  const order = parsed.data;
  if (order.paymentStatus === 'Pending' ? order.discountReservation !== 'held' || order.paymentCollection != null
    : !['consumed', 'none'].includes(order.discountReservation || '') || !order.paymentCollection || order.paymentCollection.method !== origin.method) throw new PickupPrintProofError('transition_unverified');
  // Current stored policy/native scope are transaction reads, not captured session permissions.
  try { await authorizeTransaction(transaction, actor.identity, order, 'orderfly.orders:edit', 'location'); }
  catch { throw new PickupPrintProofError('pickup_unverified'); }
  const [brandSnapshot, locationSnapshot] = await Promise.all([
    transaction.get(db.collection('brands').doc(order.brandId)),
    transaction.get(db.collection('locations').doc(order.locationId)),
  ]);
  const brandData = brandSnapshot.data(), locationData = locationSnapshot.data();
  if (!boundedTextFields(brandData, { id: 128 }) || !boundedTextFields(locationData, { id: 128, brandId: 128 })) throw new PickupPrintProofError('transition_unverified');
  const brand = brandSchema.safeParse(brandData), location = locationSchema.safeParse(locationData);
  if (!brandSnapshot.exists || brandSnapshot.id !== order.brandId || !brand.success
    || (brand.data.id !== undefined && brand.data.id !== order.brandId)
    || !locationSnapshot.exists || locationSnapshot.id !== order.locationId || !location.success
    || location.data.brandId !== order.brandId || (location.data.id !== undefined && location.data.id !== order.locationId)) {
    throw new PickupPrintProofError('transition_unverified');
  }
  assertCurrent(origin);
  const projection: Projection = Object.freeze({
    order: Object.freeze({ id: origin.orderId, brandId: order.brandId, locationId: order.locationId, status: order.status,
      paymentStatus: 'Paid', paymentMethod: 'PayAtPickup', deliveryType: 'Pickup' }),
    previousPaymentStatus: order.paymentStatus, replay: order.paymentStatus === 'Paid', collectionMethod: origin.method,
  });
  const handle = Object.freeze({}) as PickupPrintTransition;
  transitions.set(handle, { context, origin, projection });
  return handle;
}

/** Context identity/lifetime only: NOT fresh authorization, write authority or commit proof.
 * Never retain across attempts; future atomic adapter must prepare again on retry.
 */
export function pickupPrintTransitionProjection(context: NativeTransactionContext, handle: PickupPrintTransition): Projection {
  const entry = handle && typeof handle === 'object' ? transitions.get(handle) : undefined;
  if (!entry || entry.context !== context) throw new PickupPrintProofError('transition_unverified');
  assertCurrent(entry.origin);
  return entry.projection;
}
