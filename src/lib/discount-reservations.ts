import { db } from '@/lib/firebase';
import { doc, runTransaction } from 'firebase/firestore';

// A durable ledger is independent of editable/deletable customer and discount records.
export async function reserveDiscount(orderId: string, discountId: string, customerId: string, brandId: string) {
  return runTransaction(db, async tx => {
    const orderRef = doc(db, 'orders', orderId);
    const discountRef = doc(db, 'discounts', discountId);
    const customerRef = doc(db, 'customers', customerId);
    const ledgerRef = doc(db, 'discount_reservations', brandId);
    const [orderSnap, discountSnap, customerSnap, ledgerSnap] = await Promise.all([
      tx.get(orderRef), tx.get(discountRef), tx.get(customerRef), tx.get(ledgerRef),
    ]);
    if (!orderSnap.exists() || orderSnap.data().brandId !== brandId || orderSnap.data().customerDetails.id !== customerId || orderSnap.data().appliedDiscountId !== discountId) throw new Error('Reservation scope mismatch');
    if (orderSnap.data().discountReservation) return;
    if (!discountSnap.exists() || !customerSnap.exists()) throw new Error('Discount or customer no longer exists');
    const discount = discountSnap.data(), customer = customerSnap.data();
    if (discount.brandId !== brandId || customer.brandId !== brandId || !discount.isActive) throw new Error('Discount no longer available');
    const ledger = ledgerSnap.data() || {};
    const holds = { ...(ledger.holds || {}) };
    const paid = ledger.paid || {};
    const customerPaid = ledger.customerPaid || {};
    const customerOrders = ledger.customerOrders || {};
    const active = Object.values(holds) as {discountId:string; customerId:string; firstTime:boolean}[];
    const usage = Math.max(discount.usedCount || 0, paid[discountId] || 0);
    const personalUsage = Math.max(customer.discountUsage?.[discountId] || 0, customerPaid[customerId]?.[discountId] || 0);
    if (discount.usageLimit > 0 && usage + active.filter(h => h.discountId === discountId).length >= discount.usageLimit) throw new Error('Discount usage limit reached or reserved by another checkout');
    const personalLimit = discount.applicationType === 'newsletter_signup' ? 1 : discount.perCustomerLimit;
    if (personalLimit > 0 && personalUsage + active.filter(h => h.discountId === discountId && h.customerId === customerId).length >= personalLimit) throw new Error('Discount already used or reserved for this customer');
    if (discount.firstTimeCustomerOnly && ((customer.totalOrders || 0) > 0 || (customerOrders[customerId] || 0) > 0 || active.some(h => h.customerId === customerId && h.firstTime))) throw new Error('First-order promotion already used or reserved');
    holds[orderId] = { discountId, customerId, firstTime: !!discount.firstTimeCustomerOnly };
    tx.set(ledgerRef, { ...ledger, holds });
    tx.update(orderRef, { discountReservation: 'held' });
  });
}

export async function releaseDiscount(orderId: string, brandId: string, sessionId?: string) {
  await runTransaction(db, async tx => {
    const orderRef = doc(db, 'orders', orderId), ledgerRef = doc(db, 'discount_reservations', brandId);
    const [orderSnap, ledgerSnap] = await Promise.all([tx.get(orderRef), tx.get(ledgerRef)]);
    if (!orderSnap.exists()) return;
    const order = orderSnap.data();
    if (order.brandId !== brandId || (sessionId && order.psp?.checkoutSessionId && order.psp.checkoutSessionId !== sessionId)) throw new Error('Reservation scope mismatch');
    if (order.paymentStatus === 'Paid' || order.discountReservation !== 'held') return;
    const ledger = ledgerSnap.data() || {}, holds = { ...(ledger.holds || {}) };
    delete holds[orderId];
    tx.set(ledgerRef, { ...ledger, holds });
    tx.update(orderRef, { discountReservation: 'released' });
  });
}
