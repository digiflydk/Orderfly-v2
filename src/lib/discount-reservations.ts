import { createHash } from 'node:crypto';
import { checkoutSignupMode, clubDiscountEligible, discountApplicationType, isSignupDiscount, signupModeAllows } from './promotion-rules';
import { db, doc, runTransaction, serverTimestamp, type Transaction } from '@/lib/server/firestore-compat';

/** Private order metadata, captured before a Worldline cancellation starts.
 * This is reservation ownership, not a client-selected payment authority. */
export type ReservationReleaseIdentity = {
  version: 1; orderId: string; brandId: string; locationId: string;
  customerId: string; discountId: string | null; firstTimeReservation: boolean;
};
const identityId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const capacityId = (value: unknown): value is string => typeof value === 'string' && value.length > 0
  && Buffer.byteLength(value, 'utf8') <= 1500 && !value.includes('/') && value !== '.' && value !== '..';
export function reservationReleaseIdentity(orderId: string, order: any): ReservationReleaseIdentity {
  const discountId = order?.appliedDiscountId || null, firstTime = order?.firstTimeReservation ?? false;
  if (!identityId(orderId) || !identityId(order?.brandId) || !identityId(order?.locationId)
    || !capacityId(order?.customerDetails?.id) || discountId !== null && !capacityId(discountId)
    || typeof firstTime !== 'boolean') throw new Error('Reservation identity requires reconciliation');
  return {version:1,orderId,brandId:order.brandId,locationId:order.locationId,customerId:order.customerDetails.id,discountId,firstTimeReservation:firstTime};
}
export function sameReservationReleaseIdentity(left: unknown, right: ReservationReleaseIdentity): left is ReservationReleaseIdentity {
  const value = left as ReservationReleaseIdentity | null;
  return !!value && value.version === 1 && value.orderId === right.orderId && value.brandId === right.brandId
    && value.locationId === right.locationId && value.customerId === right.customerId
    && value.discountId === right.discountId && value.firstTimeReservation === right.firstTimeReservation;
}

function refs(brandId: string, customerId: string, discountId: string | null) {
  const key = (parts: string[]) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
  return {
    customer: doc(db, 'checkout_customer_capacity', key([brandId, customerId])),
    discount: discountId ? doc(db, 'checkout_discount_capacity', key([brandId, discountId])) : null,
    pair: discountId ? doc(db, 'checkout_customer_discount_capacity', key([brandId, customerId, discountId])) : null,
  };
}

// Every document contains fixed-size counters, never a growing map of customers/orders.
export async function reserveDiscount(orderId: string, discountId: string | null, customerId: string, brandId: string) {
  return runTransaction(db, async tx => {
    const orderRef = doc(db, 'orders', orderId), customerRef = doc(db, 'customers', customerId);
    const r = refs(brandId, customerId, discountId);
    const [orderSnap, customerSnap, discountSnap, cSnap, dSnap, pSnap, campaignSnap] = await Promise.all([
      tx.get(orderRef), tx.get(customerRef), discountId ? tx.get(doc(db, 'discounts', discountId)) : null,
      tx.get(r.customer), r.discount ? tx.get(r.discount) : null, r.pair ? tx.get(r.pair) : null, tx.get(doc(db, 'loyaltyCampaigns', brandId)),
    ]);
    if (!orderSnap.exists() || orderSnap.data().brandId !== brandId || orderSnap.data().customerDetails.id !== customerId || orderSnap.data().appliedDiscountId !== discountId) throw new Error('Reservation scope mismatch');
    if (orderSnap.data().discountReservation === 'held') return;
    if (orderSnap.data().discountReservation) throw new Error('Checkout reservation already finalized');
    if (!customerSnap.exists() || (discountId && !discountSnap?.exists())) throw new Error('Discount or customer no longer exists');
    const customer = customerSnap.data(), discount = discountSnap?.data();
    if (customer.brandId !== brandId || (discount && (discount.brandId !== brandId || !discount.isActive))) throw new Error('Discount no longer available');
    const c = cSnap.data() || {}, d = dSnap?.data() || {}, p = pSnap?.data() || {};
    const firstTime = !!discount?.firstTimeCustomerOnly;
    // A new first-order claim needs an unused, unreserved customer. Ordinary
    // purchases do not claim that offer and must not be blocked by an older hold.
    if (firstTime && (c.firstTimeHeld || (c.held || 0) > 0 || Math.max(c.paid || 0, customer.totalOrders || 0) > 0)) throw new Error('First-order promotion already used or reserved');
    if (discount) {
      const applicationType = discountApplicationType(discount);
      if (applicationType !== 'club_signup' && !signupModeAllows(applicationType, checkoutSignupMode(campaignSnap.data(), brandId))) throw new Error('Checkout signup campaign changed');
      if (applicationType === 'club_signup' && !clubDiscountEligible(customer.pendingClubDiscountId, discountId!, customer.discountUsage?.[discountId!] || 0)) throw new Error('Club signup discount is not available for this customer');
      const usage = Math.max(discount.usedCount || 0, d.paid || 0);
      const personalUsage = Math.max(customer.discountUsage?.[discountId!] || 0, p.paid || 0);
      if (discount.usageLimit > 0 && usage + (d.held || 0) >= discount.usageLimit) throw new Error('Discount usage limit reached or reserved by another checkout');
      const personalLimit = isSignupDiscount(discount) ? 1 : discount.perCustomerLimit;
      if (personalLimit > 0 && personalUsage + (p.held || 0) >= personalLimit) throw new Error('Discount already used or reserved for this customer');
      tx.set(r.discount!, { paid: usage, held: (d.held || 0) + 1 });
      tx.set(r.pair!, { paid: personalUsage, held: (p.held || 0) + 1 });
    }
    tx.set(r.customer, { paid: Math.max(c.paid || 0, customer.totalOrders || 0), held: (c.held || 0) + 1, firstTimeHeld: !!c.firstTimeHeld || firstTime });
    tx.update(orderRef, { discountReservation: 'held', firstTimeReservation: firstTime });
  });
}

// Read before any transaction writes; caller commits these counters with order status.
export async function prepareCapacitySettlement(tx: Transaction, order: any, paid: boolean) {
  const r = refs(order.brandId, order.customerDetails.id, order.appliedDiscountId || null);
  const [cSnap, dSnap, pSnap] = await Promise.all([
    tx.get(r.customer), r.discount ? tx.get(r.discount) : null, r.pair ? tx.get(r.pair) : null,
  ]);
  const held = order.discountReservation === 'held' ? 1 : 0;
  const values = (snapshot: any) => ({ paid: (snapshot?.data()?.paid || 0) + (paid ? 1 : 0), held: Math.max(0, (snapshot?.data()?.held || 0) - held) });
  return () => {
    tx.set(r.customer, { ...values(cSnap), firstTimeHeld: order.firstTimeReservation && held ? false : !!cSnap.data()?.firstTimeHeld });
    if (r.discount) tx.set(r.discount, values(dSnap));
    if (r.pair) tx.set(r.pair, values(pSnap));
  };
}

export async function releaseDiscount(orderId: string, brandId: string, sessionId?: string, locationId?: string, expectedIdentity?: ReservationReleaseIdentity) {
  await runTransaction(db, async tx => {
    const orderRef = doc(db, 'orders', orderId), orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists()) return;
    const order = orderSnap.data();
    if (sessionId && order.paymentMethod === 'PayAtPickup') throw new Error('Reservation scope mismatch');
    if (order.brandId !== brandId || (locationId && order.locationId !== locationId) || (sessionId && order.psp?.checkoutSessionId && order.psp.checkoutSessionId !== sessionId)) throw new Error('Reservation scope mismatch');
    if (order.paymentStatus === 'Paid') return;
    const originalIdentity = order.psp?.cancellationCapacity;
    const verifiedWorldlineCancellation = order.paymentMethod === 'Worldline' && order.psp?.provider === 'worldline'
      && (order.psp.sessionExpired === true || order.psp.voided === true);
    if ((expectedIdentity || originalIdentity || verifiedWorldlineCancellation) && order.discountReservation === 'released' && order.status === 'Canceled' && order.paymentStatus === 'Failed') return;
    if (expectedIdentity || originalIdentity || verifiedWorldlineCancellation && order.discountReservation === 'held') {
      const actual = reservationReleaseIdentity(orderId, order);
      // The optional argument cannot select another reservation: it must match
      // the original private snapshot AND the current order inside this same
      // transaction, before reading or writing any capacity counter.
      if (!sameReservationReleaseIdentity(originalIdentity, actual)
        || expectedIdentity && !sameReservationReleaseIdentity(expectedIdentity, actual)
        || order.paymentMethod !== 'Worldline' || order.psp?.provider !== 'worldline'
        || order.status !== 'Canceled' || order.paymentOperation
        || order.psp?.captured === true || !(order.psp?.sessionExpired === true || order.psp?.voided === true))
        throw new Error('Reservation identity requires reconciliation');
    }
    if (order.discountReservation === 'held') {
      const settle = await prepareCapacitySettlement(tx, order, false);
      settle();
    }
    // Called after verified expiration, signed asynchronous payment failure, or
    // definitively failed session creation. Preserve the attempt for audit.
    tx.update(orderRef, {
      discountReservation: 'released', status: 'Canceled', paymentStatus: 'Failed',
      cancellationComment: order.cancellationComment || 'Betalingen blev ikke gennemført, og checkout-sessionen blev lukket.',
      canceledAt: order.canceledAt || serverTimestamp(),
    });
  });
}
