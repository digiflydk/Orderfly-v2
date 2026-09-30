import 'server-only';
import { createHash } from 'node:crypto';
import { getAdminDb, getAdminFieldValue } from '@/lib/firebase-admin';
import { orderflySession } from '@/lib/access/orderfly-session';
import { authorizeTransaction } from '@/lib/access/scoped-data';
import { prepareAdminCapacitySettlement } from './discount-capacity';

export async function cancelUnpaidPickupOrder(orderId: string) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(orderId)) throw new Error('Ugyldigt ordrenummer.');
  const actor = await orderflySession(), db = getAdminDb();
  const ref = db.collection('orders').doc(orderId);
  return db.runTransaction(async tx => {
    const order = (await tx.get(ref)).data();
    if (!order) throw new Error('Ordren findes ikke.');
    await authorizeTransaction(tx, actor.identity, order, 'orderfly.orders:edit', 'location');
    if (order.paymentMethod !== 'PayAtPickup' || order.deliveryType !== 'Pickup' || order.psp) throw new Error('Denne handling gælder kun betaling ved afhentning.');
    if (order.paymentStatus === 'Paid') throw new Error('En betalt ordre kan ikke annulleres som ubetalt.');
    if (order.status === 'Canceled') return false;
    const release = order.discountReservation === 'held' ? await prepareAdminCapacitySettlement(db, tx, order, false) : null;
    release?.();
    const now = getAdminFieldValue().serverTimestamp();
    tx.update(ref, { status: 'Canceled', paymentStatus: 'Failed', discountReservation: 'released', canceledAt: now, canceledBy: actor.actorId, updatedAt: now });
    tx.create(db.collection('auditLogs').doc(createHash('sha256').update(JSON.stringify(['pickup-cancel', order.brandId, orderId])).digest('hex')), {
      action: 'pickup_order_canceled', orderId, brandId: order.brandId, locationId: order.locationId, actorId: actor.actorId, actorName: actor.name, createdAt: now,
    });
    return true;
  });
}
