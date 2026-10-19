import { createHash } from 'node:crypto';

export const description = 'Delete the five Esmeralda test orders from the live Stripe test of 2026-10-18 (PO-approved) and undo their customer totals, checkout capacity and upsell conversions.';

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
  `orderNotificationJobs/${hashId(['pickup-received', BRAND_ID, orderId])}`,
  `marketingOrderOutbox/${hashId(['omnisend-paid-order', BRAND_ID, orderId])}`,
  `gameConversions/${hashId(['orderfly', BRAND_ID, orderId])}`,
];
// Same counter documents as discount-reservations.ts; the customer counter comes first.
const capacityPaths = (customerId, discountId) => [
  `checkout_customer_capacity/${hashId([BRAND_ID, customerId])}`,
  ...(discountId ? [`checkout_discount_capacity/${hashId([BRAND_ID, discountId])}`, `checkout_customer_discount_capacity/${hashId([BRAND_ID, customerId, discountId])}`] : []),
];

function millis(value) {
  const ms = value?.toMillis ? value.toMillis() : value instanceof Date ? value.getTime() : typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(ms) ? ms : null;
}
// Same scope settlement used when it counted the conversion (settle-checkout.ts).
const upsellCounts = (offer, locationId) => !!offer && offer.brandId === BRAND_ID && Array.isArray(offer.locationIds) && offer.locationIds.includes(locationId);
const isTestOrder = (orderId, order) => order?.brandId === BRAND_ID && order?.customerName === TEST_CUSTOMERS[orderId];

// The facts apply must find unchanged; the plan holds ids, amounts and times only.
function factsOf(order) {
  const paid = order.paymentStatus === 'Paid';
  return {
    customerId: order.customerDetails?.id || null,
    discountId: order.appliedDiscountId || null,
    held: order.discountReservation === 'held',
    firstTime: order.firstTimeReservation === true,
    paidAmount: paid ? Number(order.totalAmount) : 0,
    paidAt: paid ? millis(order.paidAt) : null,
    // Settlement counted a conversion on each verified upsell of a paid order.
    upsellIds: paid ? [...new Set((Array.isArray(order.verifiedUpsellIds) ? order.verifiedUpsellIds : []).filter(id => typeof id === 'string' && /^[^/\\?#]{1,160}$/.test(id)))].slice(0, 97).sort() : [],
  };
}

export async function plan(db) {
  const items = [];
  // A customer's last order date falls back to their latest paid order that is not a test order.
  const restoreFor = new Map();
  for (const orderId of ORDER_IDS) {
    const snap = await db.collection('orders').doc(orderId).get();
    if (snap.exists) {
      const order = snap.data();
      if (!isTestOrder(orderId, order)) throw new Error(`${orderId} is not the Esmeralda test order; nothing is planned.`);
      const facts = factsOf(order);
      if (facts.discountId?.startsWith('game_')) throw new Error(`${orderId} used a game voucher; this migration does not reverse vouchers.`);
      if (facts.discountId) {
        const discount = await db.collection('discounts').doc(facts.discountId).get();
        if (discount.exists && discount.data().brandId !== BRAND_ID) throw new Error(`${orderId} points to a discount outside Esmeralda.`);
      }
      if (facts.customerId && !restoreFor.has(facts.customerId)) {
        const customer = await db.collection('customers').doc(facts.customerId).get();
        if (customer.exists && customer.data().brandId !== BRAND_ID) throw new Error(`${orderId} points to a customer outside Esmeralda.`);
        const others = await db.collection('orders').where('brandId', '==', BRAND_ID).where('customerDetails.id', '==', facts.customerId).get();
        const latest = others.docs
          .filter(doc => !ORDER_IDS.includes(doc.id) && doc.data().brandId === BRAND_ID && doc.data().paymentStatus === 'Paid')
          .map(doc => millis(doc.data().paidAt)).filter(ms => ms !== null);
        restoreFor.set(facts.customerId, latest.length ? Math.max(...latest) : null);
      }
      const linked = [];
      for (const path of linkedPaths(orderId)) {
        const [collection, id] = path.split('/');
        if ((await db.collection(collection).doc(id).get()).exists) linked.push(path);
      }
      // Pin which offers are in scope now; apply stops if an offer's scope changes before it runs.
      const upsellsCounted = [];
      for (const id of facts.upsellIds) if (upsellCounts((await db.collection('upsells').doc(id).get()).data(), order.locationId)) upsellsCounted.push(id);
      items.push({ kind: 'order', orderId, linked, ...facts, upsellsCounted, restoreLastOrderDate: facts.customerId ? restoreFor.get(facts.customerId) : null });
    }
    // Order references can repeat across brands; only Esmeralda's events belong to these orders.
    const events = await db.collection('analytics_events').where('brandId', '==', BRAND_ID).where('orderId', '==', orderId).get();
    for (const event of events.docs) if (event.data().brandId === BRAND_ID) items.push({ kind: 'metric', orderId, path: `analytics_events/${event.id}` });
  }
  return items;
}

// One order, its linked jobs, its capacity counters and its customer totals change together, so a rerun never counts twice.
export async function applyItem(db, item) {
  if (item.kind === 'metric') {
    const [collection, id] = item.path.split('/');
    const ref = db.collection(collection).doc(id);
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (snap.exists && snap.data().orderId === item.orderId && snap.data().brandId === BRAND_ID) tx.delete(ref);
    });
    return;
  }
  if (item.kind !== 'order' || !ORDER_IDS.includes(item.orderId)) throw new Error(`Unexpected item ${JSON.stringify(item)}`);
  const doc = path => db.collection(path.split('/')[0]).doc(path.split('/')[1]);
  const orderRef = doc(`orders/${item.orderId}`);
  const customerRef = item.customerId ? doc(`customers/${item.customerId}`) : null;
  const capacityRefs = item.customerId && (item.held || item.paidAmount) ? capacityPaths(item.customerId, item.discountId).map(doc) : [];
  const discountRef = item.discountId && item.paidAmount ? doc(`discounts/${item.discountId}`) : null;
  await db.runTransaction(async tx => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) throw new Error(`${item.orderId} no longer exists; rerun the preview.`);
    const order = orderSnap.data();
    if (!isTestOrder(item.orderId, order)) throw new Error(`${item.orderId} changed since the preview.`);
    const facts = factsOf(order);
    if (Object.keys(facts).some(key => JSON.stringify(facts[key]) !== JSON.stringify(item[key]))) throw new Error(`${item.orderId} changed since the preview.`);
    const upsellRefs = item.upsellIds.map(id => doc(`upsells/${id}`));
    const linkedRefs = item.linked.map(doc);
    const [customerSnap, discountSnap, ...rest] = await Promise.all([
      customerRef ? tx.get(customerRef) : null, discountRef ? tx.get(discountRef) : null,
      ...capacityRefs.map(ref => tx.get(ref)), ...upsellRefs.map(ref => tx.get(ref)), ...linkedRefs.map(ref => tx.get(ref)),
    ]);
    const capacitySnaps = rest.slice(0, capacityRefs.length);
    const upsellSnaps = rest.slice(capacityRefs.length, capacityRefs.length + upsellRefs.length);
    const linkedSnaps = rest.slice(capacityRefs.length + upsellRefs.length);
    // A linked job or conversion is only deleted when it still belongs to this Esmeralda test order.
    linkedSnaps.forEach((snap, index) => {
      if (snap.exists && (snap.data().brandId !== BRAND_ID || snap.data().orderId !== item.orderId)) throw new Error(`${item.linked[index]} does not belong to ${item.orderId}.`);
    });
    const counted = item.upsellIds.filter((id, index) => upsellCounts(upsellSnaps[index].exists ? upsellSnaps[index].data() : null, order.locationId));
    if (JSON.stringify(counted) !== JSON.stringify(item.upsellsCounted)) throw new Error(`${item.orderId} upsell scope changed since the preview.`);
    const customer = customerSnap?.exists ? customerSnap.data() : null;
    if (customer && customer.brandId !== BRAND_ID) throw new Error(`${item.orderId} points to a customer outside Esmeralda.`);
    if (discountSnap?.exists && discountSnap.data().brandId !== BRAND_ID) throw new Error(`${item.orderId} points to a discount outside Esmeralda.`);

    linkedRefs.forEach((ref, index) => { if (linkedSnaps[index].exists) tx.delete(ref); });
    const paid = item.paidAmount ? 1 : 0, held = item.held ? 1 : 0;
    capacityRefs.forEach((ref, index) => {
      if (!capacitySnaps[index].exists) return;
      const values = capacitySnaps[index].data();
      tx.set(ref, {
        ...values, paid: Math.max(0, (values.paid || 0) - paid), held: Math.max(0, (values.held || 0) - held),
        ...(index === 0 ? { firstTimeHeld: item.firstTime && held ? false : !!values.firstTimeHeld } : {}),
      });
    });
    // Undo exactly the conversions settlement counted: same brand and location scope as settle-checkout.ts.
    upsellRefs.forEach((ref, index) => {
      if (counted.includes(item.upsellIds[index])) tx.update(ref, { conversions: Math.max(0, (Number(upsellSnaps[index].data().conversions) || 0) - 1) });
    });
    if (discountSnap?.exists) tx.update(discountRef, { usedCount: Math.max(0, (discountSnap.data().usedCount || 0) - 1) });
    if (customer && paid) {
      const usage = { ...(customer.discountUsage || {}) };
      if (item.discountId && usage[item.discountId]) usage[item.discountId] = Math.max(0, usage[item.discountId] - 1);
      tx.update(customerRef, {
        totalOrders: Math.max(0, (customer.totalOrders || 0) - 1),
        totalSpend: Math.max(0, Math.round(((customer.totalSpend || 0) - item.paidAmount) * 100) / 100),
        ...(item.discountId ? { discountUsage: usage } : {}),
        // Only a date that still points at this test purchase is rolled back; a newer real order keeps its date.
        ...(item.paidAt !== null && millis(customer.lastOrderDate) === item.paidAt
          ? { lastOrderDate: item.restoreLastOrderDate === null ? null : new Date(item.restoreLastOrderDate) } : {}),
      });
    }
    tx.delete(orderRef);
  });
}
