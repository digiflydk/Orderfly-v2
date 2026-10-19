import { createHash } from 'node:crypto';

export const description = 'Delete the five Esmeralda test orders from the live Stripe test of 2026-10-18 (PO-approved) and undo their customer totals.';

// Only these orders, only on Esmeralda, and only when they still carry the exact name typed in the test.
const BRAND_ID = 'oeypKaMyYcQjIwaa1PtV';
// ORD-859925 was the focus-stability check, which retyped the name after ticking the terms.
const TEST_CUSTOMERS = {
  'ORD-385369': 'TEST E2E-kunde', 'ORD-389910': 'TEST E2E-kunde', 'ORD-244989': 'TEST E2E-kunde',
  'ORD-489552': 'TEST E2E-kunde', 'ORD-859925': 'TEST E2E-kunde 2',
};
export const ORDER_IDS = Object.keys(TEST_CUSTOMERS);

const hashId = parts => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
// Documents keyed by the order that settlement may have created (see settle-checkout.ts).
const linkedPaths = orderId => [
  `orderNotificationJobs/${hashId(['order-confirmation', BRAND_ID, orderId])}`,
  `marketingOrderOutbox/${hashId(['omnisend-paid-order', BRAND_ID, orderId])}`,
  `gameConversions/${hashId(['orderfly', BRAND_ID, orderId])}`,
];

function isTestOrder(orderId, order) {
  return order?.brandId === BRAND_ID && order?.customerName === TEST_CUSTOMERS[orderId];
}

export async function plan(db) {
  const items = [];
  for (const orderId of ORDER_IDS) {
    const snap = await db.collection('orders').doc(orderId).get();
    if (snap.exists) {
      const order = snap.data();
      if (!isTestOrder(orderId, order)) throw new Error(`${orderId} is not the Esmeralda test order; nothing is planned.`);
      const linked = [];
      for (const path of linkedPaths(orderId)) {
        const [collection, id] = path.split('/');
        if ((await db.collection(collection).doc(id).get()).exists) linked.push(path);
      }
      const paid = order.paymentStatus === 'Paid';
      items.push({
        kind: 'order', orderId, linked,
        customerId: paid ? order.customerDetails?.id || null : null,
        paidAmount: paid ? Number(order.totalAmount) : 0,
      });
    }
    const events = await db.collection('analytics_events').where('orderId', '==', orderId).get();
    for (const event of events.docs) items.push({ kind: 'metric', orderId, path: `analytics_events/${event.id}` });
  }
  return items;
}

// One order, its linked jobs and its customer totals change together, so a rerun never counts twice.
export async function applyItem(db, item) {
  if (item.kind === 'metric') {
    const [collection, id] = item.path.split('/');
    const ref = db.collection(collection).doc(id);
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (snap.exists && snap.data().orderId === item.orderId) tx.delete(ref);
    });
    return;
  }
  if (item.kind !== 'order' || !ORDER_IDS.includes(item.orderId)) throw new Error(`Unexpected item ${JSON.stringify(item)}`);
  const orderRef = db.collection('orders').doc(item.orderId);
  const customerRef = item.customerId ? db.collection('customers').doc(item.customerId) : null;
  await db.runTransaction(async tx => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) throw new Error(`${item.orderId} no longer exists; rerun the preview.`);
    const order = orderSnap.data();
    if (!isTestOrder(item.orderId, order)) throw new Error(`${item.orderId} changed since the preview.`);
    const paidAmount = order.paymentStatus === 'Paid' ? Number(order.totalAmount) : 0;
    if (paidAmount !== item.paidAmount) throw new Error(`${item.orderId} payment changed since the preview.`);
    const customerSnap = customerRef ? await tx.get(customerRef) : null;
    for (const path of item.linked) {
      const [collection, id] = path.split('/');
      tx.delete(db.collection(collection).doc(id));
    }
    if (customerSnap?.exists) {
      const customer = customerSnap.data();
      tx.update(customerRef, {
        totalOrders: Math.max(0, (customer.totalOrders || 0) - 1),
        totalSpend: Math.max(0, Math.round(((customer.totalSpend || 0) - paidAmount) * 100) / 100),
      });
    }
    tx.delete(orderRef);
  });
}
