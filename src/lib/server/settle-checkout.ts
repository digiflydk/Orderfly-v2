import 'server-only';
import type Stripe from 'stripe';
import { db } from '@/lib/firebase';
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { prepareCapacitySettlement } from '@/lib/discount-reservations';
import { trackServerEvent } from '@/lib/analytics-server';
import { createHash, randomUUID } from 'node:crypto';
import type { Brand, Location, OrderDetail } from '@/types';
import { buildOrderInvoice, invoiceCounterId } from '@/lib/order-invoice';

// Only call with a signed webhook or a session retrieved server-to-server from Stripe.
export async function settlePaidCheckoutSession(session: Stripe.Checkout.Session) {
  const metadata = session.metadata;
  if (!metadata?.orderId || !metadata.brandId || !metadata.locationId) throw new Error('Missing payment scope');
  const orderRef = doc(db, 'orders', metadata.orderId);
  if (session.payment_status !== 'paid') return false;
  const piId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
  let analytics: OrderDetail['analytics'];
  const issuedAt = new Date().toISOString();
  const fulfilled = await runTransaction(db, async transaction => {
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists()) throw new Error('Order not found');
    const order = orderSnap.data();
    analytics = order.analytics;
    if (order.brandId !== metadata.brandId || order.locationId !== metadata.locationId || (order.psp?.checkoutSessionId && order.psp.checkoutSessionId !== session.id)) throw new Error('Payment scope mismatch');
    const confirmationRef = doc(db, 'orderNotificationJobs', createHash('sha256').update(JSON.stringify(['order-confirmation', order.brandId, metadata.orderId])).digest('hex'));
    const confirmation = await transaction.get(confirmationRef);
    if (confirmation.exists()) {
      const job = confirmation.data();
      if (job.orderId !== metadata.orderId || job.brandId !== order.brandId || job.locationId !== order.locationId || job.kind !== 'orderConfirmation') throw new Error('Confirmation scope mismatch');
    }
    const ensureConfirmation = () => {
      if (!confirmation.exists() && order.status !== 'Canceled') transaction.set(confirmationRef, {
        orderId: metadata.orderId, brandId: order.brandId, locationId: order.locationId,
        kind: 'orderConfirmation', state: 'pending', eventId: randomUUID(), nextAttemptAt: Date.now(), attempts: 0, createdAt: Date.now(), updatedAt: Date.now(),
      });
    };
    // A legacy path could mark Paid without the outbox job. Repair only this
    // verified session's missing job, without replaying financial accounting.
    if (order.paymentStatus === 'Paid') {
      if (order.psp?.checkoutSessionId !== session.id) throw new Error('Payment scope mismatch');
      ensureConfirmation();
      return false;
    }
    const year = Number(issuedAt.slice(0, 4));
    const counterRef = doc(db, 'invoiceCounters', invoiceCounterId(order.brandId, year));
    const brandRef = doc(db, 'brands', order.brandId);
    const locationRef = doc(db, 'locations', order.locationId);
    const [counterSnap, brandSnap, locationSnap] = await Promise.all([
      transaction.get(counterRef), transaction.get(brandRef), transaction.get(locationRef),
    ]);
    if (!brandSnap.exists() || !locationSnap.exists()) throw new Error('Invoice seller configuration missing');
    const brand = { ...brandSnap.data(), id: order.brandId } as Brand;
    const location = { ...locationSnap.data(), id: order.locationId } as Location;
    if (location.brandId !== order.brandId) throw new Error('Invoice location scope mismatch');
    const sequence = Number(counterSnap.data()?.lastNumber || 0) + 1;
    const invoice = buildOrderInvoice({ order: { ...order, id: orderSnap.id } as OrderDetail, brand, location, sequence, issuedAt, paymentReference: piId || undefined });
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
      invoice,
    });
    transaction.set(counterRef, { brandId: order.brandId, year, lastNumber: sequence, updatedAt: serverTimestamp() }, { merge: true });
    ensureConfirmation();
    return true;
  });
  if (fulfilled) {
    // Analytics are optional after an authoritative, idempotent settlement.
    try { await trackServerEvent('payment_succeeded', {
      brandId: metadata.brandId, locationId: metadata.locationId,
      ...(analytics?.sessionId ? {sessionId: analytics.sessionId, deviceType: analytics.deviceType, ...(analytics.attribution || {})} : {}),
      orderId: metadata.orderId, cartValue: (session.amount_total || 0) / 100,
    }); } catch { /* Never report a successful payment as failed due to telemetry. */ }
  }
  return fulfilled;
}
