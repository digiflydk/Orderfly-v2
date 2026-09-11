import 'server-only';
import { createHash } from 'node:crypto';
import type { Firestore, Transaction } from 'firebase-admin/firestore';

// Same bounded counters and document IDs as checkout reservations, committed
// atomically with verified payment using server-authorized references.
export async function prepareAdminCapacitySettlement(db: Firestore, tx: Transaction, order: any, paid: boolean) {
  const key = (parts: string[]) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
  const brandId = order.brandId, customerId = order.customerDetails.id, discountId = order.appliedDiscountId || null;
  const r = {
    customer: db.collection('checkout_customer_capacity').doc(key([brandId, customerId])),
    discount: discountId ? db.collection('checkout_discount_capacity').doc(key([brandId, discountId])) : null,
    pair: discountId ? db.collection('checkout_customer_discount_capacity').doc(key([brandId, customerId, discountId])) : null,
  };
  const [cSnap, dSnap, pSnap] = await Promise.all([tx.get(r.customer), r.discount ? tx.get(r.discount) : null, r.pair ? tx.get(r.pair) : null]);
  const held = order.discountReservation === 'held' ? 1 : 0;
  const values = (snapshot: any) => ({ paid: (snapshot?.data()?.paid || 0) + (paid ? 1 : 0), held: Math.max(0, (snapshot?.data()?.held || 0) - held) });
  return () => {
    tx.set(r.customer, { ...values(cSnap), firstTimeHeld: order.firstTimeReservation && held ? false : !!cSnap.data()?.firstTimeHeld });
    if (r.discount) tx.set(r.discount, values(dSnap));
    if (r.pair) tx.set(r.pair, values(pSnap));
  };
}
