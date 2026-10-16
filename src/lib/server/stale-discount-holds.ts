import 'server-only';
import Stripe from 'stripe';
import { getAdminDb } from '@/lib/firebase-admin';
import { releaseDiscount } from '@/lib/discount-reservations';
import { getActiveStripeSecretKey } from '@/lib/server/payment-settings';
import { settlePaidCheckoutSession } from '@/lib/server/settle-checkout';

// Stripe sessions are created with a 31 minute expiry. A hold younger than this
// can still be paid, so it is never inspected here.
const SESSION_LIFETIME_MS = 31 * 60 * 1000;
const MAX_INSPECTED_HOLDS = 10;

type Dependencies = {
  db?: FirebaseFirestore.Firestore;
  stripeKey?: () => Promise<string | null>;
  stripe?: (key: string) => Pick<Stripe, 'checkout'>;
  release?: typeof releaseDiscount;
  settle?: typeof settlePaidCheckoutSession;
  now?: () => number;
};

function createdAtMs(value: unknown): number | null {
  if (value && typeof (value as { toMillis?: unknown }).toMillis === 'function') return (value as { toMillis: () => number }).toMillis();
  if (value instanceof Date) return value.getTime();
  return null;
}

// A missed checkout.session.expired webhook leaves an online order Pending with
// a held discount, which keeps consuming a limited code (#210). Before checkout
// rejects a code, ask Stripe about old holds for that code. Only Stripe's own
// verified state changes anything: an expired, unpaid session releases its
// hold, a paid one is settled. Elapsed time alone never releases capacity, and
// any Stripe or Firestore failure leaves the hold untouched.
export async function reconcileStaleDiscountHolds(brandId: string, discountId: string, deps: Dependencies = {}) {
  const result = { inspected: 0, released: 0, settled: 0 };
  try { return await reconcile(brandId, discountId, deps, result); }
  catch { return result; } // Reconciliation is best effort; reservation still enforces capacity.
}

async function reconcile(brandId: string, discountId: string, deps: Dependencies, result: { inspected: number; released: number; settled: number }) {
  const db = deps.db ?? getAdminDb();
  const now = (deps.now ?? Date.now)();
  let held: FirebaseFirestore.QuerySnapshot;
  try {
    held = await db.collection('orders')
      .where('brandId', '==', brandId)
      .where('appliedDiscountId', '==', discountId)
      .where('discountReservation', '==', 'held')
      .limit(50).get();
  } catch { return result; }
  const candidates = held.docs.filter(doc => {
    const order = doc.data();
    const created = createdAtMs(order.createdAt);
    return order.paymentMethod !== 'PayAtPickup' && typeof order.psp?.checkoutSessionId === 'string' &&
      order.paymentStatus !== 'Paid' && created !== null && now - created > SESSION_LIFETIME_MS;
  }).slice(0, MAX_INSPECTED_HOLDS);
  if (!candidates.length) return result;
  const key = await (deps.stripeKey ?? getActiveStripeSecretKey)().catch(() => null);
  if (!key) return result;
  const stripe = (deps.stripe ?? (k => new Stripe(k)))(key);
  for (const doc of candidates) {
    const order = doc.data();
    result.inspected++;
    try {
      const session = await stripe.checkout.sessions.retrieve(order.psp.checkoutSessionId);
      if (session.id !== order.psp.checkoutSessionId || session.metadata?.orderId !== doc.id ||
          session.metadata?.brandId !== brandId || session.metadata?.locationId !== order.locationId) continue;
      if (session.payment_status === 'paid') {
        await (deps.settle ?? settlePaidCheckoutSession)(session);
        result.settled++;
      } else if (session.status === 'expired') {
        await (deps.release ?? releaseDiscount)(doc.id, brandId, session.id, order.locationId);
        result.released++;
      }
    } catch { /* Leave the hold for the webhook or an operator to reconcile. */ }
  }
  if (result.released || result.settled) console.info('checkout_stale_holds_reconciled', { brandId, discountId, ...result });
  return result;
}
