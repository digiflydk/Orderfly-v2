import { createHash } from 'node:crypto';
import { settleRewards } from '@/lib/loyalty/rewards';
import { db } from '@/lib/firebase';
import { doc, runTransaction, type Transaction } from 'firebase/firestore';

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
    const [orderSnap, customerSnap, discountSnap, cSnap, dSnap, pSnap] = await Promise.all([
      tx.get(orderRef), tx.get(customerRef), discountId ? tx.get(doc(db, 'discounts', discountId)) : null,
      tx.get(r.customer), r.discount ? tx.get(r.discount) : null, r.pair ? tx.get(r.pair) : null,
    ]);
    if (!orderSnap.exists() || orderSnap.data().brandId !== brandId || orderSnap.data().customerDetails.id !== customerId || orderSnap.data().appliedDiscountId !== discountId) throw new Error('Reservation scope mismatch');
    if (orderSnap.data().discountReservation === 'held') return;
    if (orderSnap.data().discountReservation) throw new Error('Checkout reservation already finalized');
    if (!customerSnap.exists() || (discountId && !discountSnap?.exists())) throw new Error('Discount or customer no longer exists');
    const customer = customerSnap.data(), discount = discountSnap?.data();
    if (customer.brandId !== brandId || (discount && (discount.brandId !== brandId || !discount.isActive))) throw new Error('Discount no longer available');
    const c = cSnap.data() || {}, d = dSnap?.data() || {}, p = pSnap?.data() || {};
    const firstTime = !!discount?.firstTimeCustomerOnly;
    // A first-order session and ANY other session cannot coexist for this customer.
    if (c.firstTimeHeld || (firstTime && ((c.held || 0) > 0 || Math.max(c.paid || 0, customer.totalOrders || 0) > 0))) throw new Error('First-order promotion already used or reserved');
    if (discount) {
      const usage = Math.max(discount.usedCount || 0, d.paid || 0);
      const personalUsage = Math.max(customer.discountUsage?.[discountId!] || 0, p.paid || 0);
      if (discount.usageLimit > 0 && usage + (d.held || 0) >= discount.usageLimit) throw new Error('Discount usage limit reached or reserved by another checkout');
      const personalLimit = discount.applicationType === 'newsletter_signup' ? 1 : discount.perCustomerLimit;
      if (personalLimit > 0 && personalUsage + (p.held || 0) >= personalLimit) throw new Error('Discount already used or reserved for this customer');
      tx.set(r.discount!, { paid: usage, held: (d.held || 0) + 1 });
      tx.set(r.pair!, { paid: personalUsage, held: (p.held || 0) + 1 });
    }
    tx.set(r.customer, { paid: Math.max(c.paid || 0, customer.totalOrders || 0), held: (c.held || 0) + 1, firstTimeHeld: firstTime });
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

export async function releaseDiscount(orderId: string, brandId: string, sessionId?: string) {
  const released = await runTransaction(db, async tx => {
    const orderRef = doc(db, 'orders', orderId), orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists()) return;
    const order = orderSnap.data();
    if (order.brandId !== brandId || (sessionId && order.psp?.checkoutSessionId && order.psp.checkoutSessionId !== sessionId)) throw new Error('Reservation scope mismatch');
    if (order.paymentStatus === 'Paid') return false;
    if (order.discountReservation !== 'held') return true;
    const settle = await prepareCapacitySettlement(tx, order, false);
    settle();
    tx.update(orderRef, { discountReservation: 'released' });
    return true;
  });
  if (released) await settleRewards(orderId,brandId,false);
}
