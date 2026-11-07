import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import type { MemberSession, ProgramBrand } from './membership';
import { COLLECTIONS, hashKey } from './model';

// Read the committed award, never infer or grant stamps from a receipt or browser event.
export async function orderCelebration(db: Firestore, brand: ProgramBrand, session: MemberSession, orderId: string, now: number) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(orderId) || session.member.brandId !== brand.brandId
    || session.member.companyId !== brand.companyId || session.member.status !== 'active') return null;
  const eventId = hashKey('order-stamp', brand.brandId, orderId);
  const event = (await db.collection(COLLECTIONS.events).doc(eventId).get()).data();
  if (!event || event.memberId !== session.memberId || event.brandId !== brand.brandId || event.companyId !== brand.companyId
    || event.type !== 'stamp_added' || event.source !== 'order' || event.orderId !== orderId
    || !Number.isFinite(event.createdAt) || event.createdAt > now || now - event.createdAt > 24 * 60 * 60 * 1000) return null;
  const order = (await db.collection('orders').doc(orderId).get()).data();
  if (!order || order.brandId !== brand.brandId || order.customerDetails?.id !== session.member.customerId
    || (order.customerId !== undefined && order.customerId !== session.member.customerId)
    || order.paymentStatus !== 'Paid' || order.status === 'Canceled' || Number(order.refundedAmountOre || 0) > 0) return null;
  const result = event.result;
  if (!result || !Number.isInteger(event.quantity) || event.quantity < 1
    || !Number.isInteger(result.stamps) || !Number.isInteger(result.stampsRequired) || result.stampsRequired < 1 || result.stampsRequired > 50
    || result.stamps < 0 || result.stamps >= result.stampsRequired || !Number.isInteger(result.rewardsEarned) || result.rewardsEarned < 0) return null;
  let completedTarget = 0;
  if (result.rewardsEarned > 0) {
    if (typeof event.cardId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(event.cardId)) return null;
    const completed = (await db.collection(COLLECTIONS.cards).doc(event.cardId).get()).data();
    if (!completed || completed.memberId !== session.memberId || completed.brandId !== brand.brandId || completed.companyId !== brand.companyId
      || !Number.isInteger(completed.stampsRequired) || completed.stampsRequired < 1 || completed.stampsRequired > 50) return null;
    completedTarget = completed.stampsRequired;
  }
  return { id: eventId, completedTarget, quantity: event.quantity, stamps: result.stamps, stampsRequired: result.stampsRequired, rewardsEarned: result.rewardsEarned };
}
