import 'server-only';
import type Stripe from 'stripe';
import { getAdminDb, getAdminFieldValue } from '@/lib/firebase-admin';
import { prepareAdminCapacitySettlement } from '@/lib/server/discount-capacity';
import { trackServerEvent } from '@/lib/analytics-server';
import { createHash, randomUUID } from 'node:crypto';
import type { Brand, Location, OrderDetail } from '@/types';
import { buildOrderInvoice, invoiceCounterId } from '@/lib/order-invoice';
import { paidOrderMarketingEnabled } from '@/lib/marketing/config';

// Only call with a signed webhook or a session retrieved server-to-server from Stripe.
export async function settlePaidCheckoutSession(session: Stripe.Checkout.Session) {
  const metadata = session.metadata;
  if (!metadata?.orderId || !metadata.brandId || !metadata.locationId) throw new Error('Missing payment scope');
  const db = getAdminDb();
  const marketingEnabled = paidOrderMarketingEnabled();
  const serverTimestamp = () => getAdminFieldValue().serverTimestamp();
  const orderRef = db.collection('orders').doc(metadata.orderId);
  if (session.payment_status !== 'paid') return false;
  const piId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
  let analytics: OrderDetail['analytics'];
  const issuedAt = new Date().toISOString();
  const fulfilled = await db.runTransaction(async transaction => {
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists) throw new Error('Order not found');
    const order = orderSnap.data()!;
    analytics = order.analytics;
    if (order.brandId !== metadata.brandId || order.locationId !== metadata.locationId || (order.psp?.checkoutSessionId && order.psp.checkoutSessionId !== session.id)) throw new Error('Payment scope mismatch');
    const confirmationRef = db.collection('orderNotificationJobs').doc(createHash('sha256').update(JSON.stringify(['order-confirmation', order.brandId, metadata.orderId])).digest('hex'));
    const marketingOrderRef = db.collection('marketingOrderOutbox').doc(createHash('sha256').update(JSON.stringify(['omnisend-paid-order', order.brandId, metadata.orderId])).digest('hex'));
    const customerRef = db.collection('customers').doc(order.customerDetails.id);
    const [confirmation, marketingOrder, customerSnap] = await Promise.all([
      transaction.get(confirmationRef), marketingEnabled ? transaction.get(marketingOrderRef) : null, transaction.get(customerRef),
    ]);
    if (confirmation.exists) {
      const job = confirmation.data()!;
      if (job.orderId !== metadata.orderId || job.brandId !== order.brandId || job.locationId !== order.locationId || job.kind !== 'orderConfirmation') throw new Error('Confirmation scope mismatch');
    }
    if (marketingOrder?.exists) {
      const job = marketingOrder.data()!;
      if (job.orderId !== metadata.orderId || job.brandId !== order.brandId || job.locationId !== order.locationId || job.customerId !== order.customerDetails.id || job.kind !== 'paidOrder') throw new Error('Marketing order scope mismatch');
    }
    const ensureConfirmation = () => {
      if (!confirmation.exists && order.status !== 'Canceled') transaction.set(confirmationRef, {
        orderId: metadata.orderId, brandId: order.brandId, locationId: order.locationId,
        kind: 'orderConfirmation', state: 'pending', eventId: randomUUID(), nextAttemptAt: Date.now(), attempts: 0, createdAt: Date.now(), updatedAt: Date.now(),
      });
    };
    const ensureMarketingOrder = (eventTime: string) => {
      if (!marketingEnabled) return;
      const customer = customerSnap.data();
      const customerEmail = typeof customer?.email === 'string' ? customer.email.trim().toLowerCase() : '';
      if (!marketingOrder?.exists && order.status !== 'Canceled' && customerSnap.exists && customer?.brandId === order.brandId && customer?.marketingConsent === true && customerEmail && customerEmail === String(order.customerContact || '').trim().toLowerCase()) transaction.set(marketingOrderRef, {
        orderId: metadata.orderId, brandId: order.brandId, locationId: order.locationId, customerId: order.customerDetails.id,
        kind: 'paidOrder', state: 'pending', eventId: randomUUID(), eventTime, nextAttemptAt: Date.now(), attempts: 0, createdAt: Date.now(), updatedAt: Date.now(),
      });
    };
    // A legacy path could mark Paid without the outbox job. Repair only this
    // verified session's missing job, without replaying financial accounting.
    if (order.paymentStatus === 'Paid') {
      if (order.psp?.checkoutSessionId !== session.id) throw new Error('Payment scope mismatch');
      ensureConfirmation();
      if (order.invoice) ensureMarketingOrder(order.invoice.issuedAt);
      return false;
    }
    const year = Number(issuedAt.slice(0, 4));
    const counterRef = db.collection('invoiceCounters').doc(invoiceCounterId(order.brandId, year));
    const brandRef = db.collection('brands').doc(order.brandId);
    const locationRef = db.collection('locations').doc(order.locationId);
    const [counterSnap, brandSnap, locationSnap] = await Promise.all([
      transaction.get(counterRef), transaction.get(brandRef), transaction.get(locationRef),
    ]);
    if (!brandSnap.exists || !locationSnap.exists) throw new Error('Invoice seller configuration missing');
    const brand = { ...brandSnap.data(), id: order.brandId } as Brand;
    const location = { ...locationSnap.data(), id: order.locationId } as Location;
    if (location.brandId !== order.brandId) throw new Error('Invoice location scope mismatch');
    const sequence = Number(counterSnap.data()?.lastNumber || 0) + 1;
    const invoice = buildOrderInvoice({ order: { ...order, id: orderSnap.id } as OrderDetail, brand, location, sequence, issuedAt, paymentReference: piId || undefined });
    if (customerSnap.exists && customerSnap.data()?.brandId !== order.brandId) throw new Error('Customer scope mismatch');
    const discountId = order.appliedDiscountId;
    const discountRef = discountId ? db.collection('discounts').doc(discountId) : null;
    const discountSnap = discountRef ? await transaction.get(discountRef) : null;
    if (discountSnap?.exists && discountSnap.data()?.brandId !== order.brandId) throw new Error('Discount scope mismatch');
    const settleCapacity = await prepareAdminCapacitySettlement(db, transaction, order, true);
    settleCapacity();
    const customer = customerSnap.data() || {};
    const usage = { ...(customer.discountUsage || {}) };
    if (discountRef && discountSnap?.exists) {
      usage[discountId] = (usage[discountId] || 0) + 1;
      transaction.update(discountRef, { usedCount: (discountSnap.data()?.usedCount || 0) + 1 });
    }
    if (customerSnap.exists) transaction.update(customerRef, {
      totalOrders: (customer.totalOrders || 0) + 1,
      totalSpend: (customer.totalSpend || 0) + order.totalAmount,
      lastOrderDate: serverTimestamp(),
      discountUsage: usage,
    });
    transaction.update(orderRef, {
      discountReservation: discountId ? 'consumed' : 'none',
      fulfillmentWarnings: [!customerSnap.exists ? 'customer_deleted' : '', discountId && !discountSnap?.exists ? 'discount_deleted' : ''].filter(Boolean),
      'psp.checkoutSessionId': session.id,
      paymentStatus: 'Paid', paidAt: serverTimestamp(),
      'psp.paymentIntentId': piId || null, updatedAt: serverTimestamp(),
      invoice,
    });
    transaction.set(counterRef, { brandId: order.brandId, year, lastNumber: sequence, updatedAt: serverTimestamp() }, { merge: true });
    ensureConfirmation();
    ensureMarketingOrder(invoice.issuedAt);
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
