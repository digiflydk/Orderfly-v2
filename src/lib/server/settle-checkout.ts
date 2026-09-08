import 'server-only';
import type Stripe from 'stripe';
import { db } from '@/lib/firebase';
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { prepareCapacitySettlement } from '@/lib/discount-reservations';
import { trackServerEvent } from '@/lib/analytics-server';

// Only call with a signed webhook or a session retrieved server-to-server from Stripe.
export async function settlePaidCheckoutSession(session: Stripe.Checkout.Session) {
  const metadata = session.metadata;
  if (!metadata?.orderId || !metadata.brandId || !metadata.locationId) throw new Error('Missing payment scope');
  const orderRef = doc(db, 'orders', metadata.orderId);
  if (session.payment_status !== 'paid') return false;
  const piId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
  const fulfilled = await runTransaction(db, async transaction => {
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists()) throw new Error('Order not found');
    const order = orderSnap.data();
    if (order.brandId !== metadata.brandId || order.locationId !== metadata.locationId || (order.psp?.checkoutSessionId && order.psp.checkoutSessionId !== session.id)) throw new Error('Payment scope mismatch');
    if (order.paymentStatus === 'Paid') return false;
    const customerRef = doc(db, 'customers', order.customerDetails.id);
    const customerSnap = await transaction.get(customerRef);
    if (customerSnap.exists() && customerSnap.data().brandId !== order.brandId) throw new Error('Customer scope mismatch');
    const discountId = order.appliedDiscountId;
    const discountRef = discountId ? doc(db, 'discounts', discountId) : null;
    const discountSnap = discountRef ? await transaction.get(discountRef) : null;
    if (discountSnap?.exists() && discountSnap.data().brandId !== order.brandId) throw new Error('Discount scope mismatch');
    const settleCapacity = await prepareCapacitySettlement(transaction, order, true);
    settleCapacity();
    const customer = customerSnap.data() || {};
    const usage = { ...(customer.discountUsage || {}) };
    if (discountRef && discountSnap?.exists()) {
      usage[discountId] = (usage[discountId] || 0) + 1;
      transaction.update(discountRef, { usedCount: (discountSnap.data().usedCount || 0) + 1 });
    }
    if (customerSnap.exists()) transaction.update(customerRef, {
      totalOrders: (customer.totalOrders || 0) + 1,
      totalSpend: (customer.totalSpend || 0) + order.totalAmount,
      lastOrderDate: serverTimestamp(),
      discountUsage: usage,
    });
    transaction.update(orderRef, {
      discountReservation: discountId ? 'consumed' : 'none',
      fulfillmentWarnings: [!customerSnap.exists() ? 'customer_deleted' : '', discountId && !discountSnap?.exists() ? 'discount_deleted' : ''].filter(Boolean),
      'psp.checkoutSessionId': session.id,
      paymentStatus: 'Paid', paidAt: serverTimestamp(),
      'psp.paymentIntentId': piId || null, updatedAt: serverTimestamp(),
    });
    return true;
  });
  if (fulfilled) {
    // Analytics are optional after an authoritative, idempotent settlement.
    try { await trackServerEvent('payment_succeeded', {
      brandId: metadata.brandId, locationId: metadata.locationId,
      sessionId: metadata.anonymousConsentId || 'unknown-session',
      orderId: metadata.orderId, cartValue: (session.amount_total || 0) / 100,
      paymentIntentId: piId,
    }); } catch { /* Never report a successful payment as failed due to telemetry. */ }
  }
  return fulfilled;
}
