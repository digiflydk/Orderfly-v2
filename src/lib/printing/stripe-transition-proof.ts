import 'server-only';
import Stripe from 'stripe';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { getActiveStripeSecretKey } from '@/lib/server/payment-settings';
import type { NativeTransactionContext } from '@/lib/server/firestore-compat';
import type { KitchenOrder } from './domain';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const sessionId = z.string().regex(/^cs_(?:test_|live_)?[A-Za-z0-9_]{8,250}$/);
const scope = z.object({ orderId: id, brandId: id, locationId: id });
const persistedOrder = z.object({
  brandId: id, locationId: id, status: z.enum(['Pending', 'Received', 'In Progress', 'Ready']),
  paymentStatus: z.enum(['Pending', 'Paid']), paymentMethod: z.literal('Stripe'),
  deliveryType: z.enum(['Pickup', 'Delivery']), totalAmount: z.number().finite().positive(),
  // Legacy orders may omit this field; any recorded or malformed refund fails closed.
  refundedAmountOre: z.literal(0).optional(),
  psp: z.object({ checkoutSessionId: sessionId }),
});
const PROOF_TTL_MS = 300_000;
type Origin = z.infer<typeof scope> & { sessionId: string; amountMinor: number; verifiedAt: number };
/** Opaque, nonserializable process-local evidence. Never persist or send to a browser. */
export type StripePrintPaymentProof = Readonly<{ readonly stripePrintPaymentProof: unique symbol }>;
export type StripePrintTransition = Readonly<{ readonly stripePrintTransition: unique symbol }>;
type Projection = Readonly<{ order: Readonly<KitchenOrder>; previousPaymentStatus: 'Pending' | 'Paid'; replay: boolean }>;
const origins = new WeakMap<object, Origin>();
const transitions = new WeakMap<object, { context: NativeTransactionContext; value: Projection; verifiedAt: number }>();
export class PrintTransitionProofError extends Error {
  constructor(readonly code: 'invalid_payment_reference' | 'payment_unverified' | 'proof_unavailable'
    | 'proof_expired' | 'transition_unverified') { super(code); }
}
const now = () => { const value = Date.now(); if (!Number.isSafeInteger(value) || value <= 0) throw new PrintTransitionProofError('proof_unavailable'); return value; };

/** Retrieves independently from Stripe. A raw webhook/session object is NOT accepted.
 * Existing settlement entrypoints are unchanged; this origin boundary is unwired.
 */
export async function verifyStripePrintPayment(input: unknown): Promise<StripePrintPaymentProof> {
  const parsed = sessionId.safeParse(input);
  if (!parsed.success) throw new PrintTransitionProofError('invalid_payment_reference');
  try {
    const key = await getActiveStripeSecretKey();
    if (!key) throw new PrintTransitionProofError('proof_unavailable');
    const stripe = new Stripe(key, { timeout: 5000, maxNetworkRetries: 0 });
    const session = await stripe.checkout.sessions.retrieve(parsed.data);
    const native = scope.safeParse(session.metadata);
    if (session.id !== parsed.data || session.mode !== 'payment' || session.status !== 'complete'
      || session.payment_status !== 'paid' || session.currency?.toLowerCase() !== 'dkk'
      || !Number.isSafeInteger(session.amount_total) || session.amount_total! <= 0 || !native.success) {
      throw new PrintTransitionProofError('payment_unverified');
    }
    const proof = Object.freeze({}) as StripePrintPaymentProof;
    origins.set(proof, { ...native.data, sessionId: session.id, amountMinor: session.amount_total!, verifiedAt: now() });
    return proof;
  } catch (error) {
    if (error instanceof PrintTransitionProofError) throw error;
    throw new PrintTransitionProofError('proof_unavailable');
  }
}

/** Reads the persisted order AND native scope in the caller's current transaction.
 * Does not enqueue, modify an order, or authorize output. Future adapter must use
 * one fresh context per retry and commit its entire order/outbox mutation together.
 */
export async function prepareStripePrintTransition(context: NativeTransactionContext, proof: StripePrintPaymentProof): Promise<StripePrintTransition> {
  const origin = proof && typeof proof === 'object' ? origins.get(proof) : undefined;
  if (!origin) throw new PrintTransitionProofError('payment_unverified');
  const time = now();
  if (time < origin.verifiedAt || time - origin.verifiedAt >= PROOF_TTL_MS) throw new PrintTransitionProofError('proof_expired');
  if (!context || context.db !== getAdminDb() || !context.transaction) throw new PrintTransitionProofError('transition_unverified');
  const { db, transaction } = context;
  const [order, brand, location] = await Promise.all([
    transaction.get(db.collection('orders').doc(origin.orderId)),
    transaction.get(db.collection('brands').doc(origin.brandId)),
    transaction.get(db.collection('locations').doc(origin.locationId)),
  ]);
  const current = persistedOrder.safeParse(order.data());
  if (!order.exists || order.id !== origin.orderId || !brand.exists || !location.exists
    || location.data()?.brandId !== origin.brandId || !current.success
    || current.data.brandId !== origin.brandId || current.data.locationId !== origin.locationId
    || current.data.psp.checkoutSessionId !== origin.sessionId
    || Math.round(current.data.totalAmount * 100) !== origin.amountMinor) {
    throw new PrintTransitionProofError('transition_unverified');
  }
  // A Paid/Pending combination is inconsistent and must never invent acceptance.
  if (current.data.paymentStatus === 'Paid' && current.data.status === 'Pending') throw new PrintTransitionProofError('transition_unverified');
  const preparedAt = now();
  if (preparedAt < origin.verifiedAt || preparedAt - origin.verifiedAt >= PROOF_TTL_MS) throw new PrintTransitionProofError('proof_expired');
  const value: Projection = Object.freeze({
    order: Object.freeze({ id: origin.orderId, brandId: origin.brandId, locationId: origin.locationId,
      status: current.data.status === 'Pending' ? 'Received' : current.data.status,
      paymentStatus: 'Paid', paymentMethod: 'Stripe', deliveryType: current.data.deliveryType }),
    previousPaymentStatus: current.data.paymentStatus, replay: current.data.paymentStatus === 'Paid',
  });
  const handle = Object.freeze({}) as StripePrintTransition;
  transitions.set(handle, { context, value, verifiedAt: origin.verifiedAt });
  return handle;
}

/** Context identity check only, not a write/commit permit or a freshness guarantee.
 * Future mutation code must revalidate inside its own callback; no current outbox
 * helper accepts this projection or treats it as already-persisted order state.
 */
export function stripePrintTransitionProjection(context: NativeTransactionContext, handle: StripePrintTransition): Projection {
  const entry = handle && typeof handle === 'object' ? transitions.get(handle) : undefined;
  if (!entry || entry.context !== context) throw new PrintTransitionProofError('transition_unverified');
  const time = now();
  if (time < entry.verifiedAt || time - entry.verifiedAt >= PROOF_TTL_MS) throw new PrintTransitionProofError('proof_expired');
  return entry.value;
}
