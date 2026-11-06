import 'server-only';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { policySchema } from '@/lib/access/policy';
import { addStampsToCard } from './counter';
import { COLLECTIONS, cardIsExpired, copenhagenDay, hashKey, newCard, readProgram, type CardDoc, type MemberDoc } from './model';
import { applyStamps, evaluatePurchase, stampLocation } from './rules';

type SettlingOrder = {
  brandId: string; locationId: string; customerDetails?: { id?: string }; customerId?: string;
  paymentStatus?: string; status?: string; deliveryType?: string; totalAmount?: number;
  discountCard?: unknown; appliedDiscountId?: string | null; paymentDetails?: { discountTotal?: number };
};
const empty = () => ({ writeCount: 0, apply: () => {} });

// Internal settlement plan only: the caller has verified payment and owns the
// Paid transition. All reads occur here; apply joins that same transaction's
// write phase. Never call this from a client route or on a Paid replay.
export async function prepareOrderStamps(db: Firestore, tx: Transaction, orderId: string, order: SettlingOrder, now: number) {
  if (order.paymentStatus === 'Paid' || order.paymentStatus === 'Refunded' || order.status === 'Canceled'
    || order.discountCard != null || !['Pickup', 'Delivery'].includes(order.deliveryType ?? '')) return empty();
  const customerId = order.customerDetails?.id;
  if (!customerId || (order.customerId !== undefined && order.customerId !== customerId)) return empty();
  const program = readProgram(order.brandId, (await tx.get(db.collection(COLLECTIONS.programs).doc(order.brandId))).data());
  if (!program.settings.active) return empty();
  const [members, customer, location, policySnap, prior] = await Promise.all([
    tx.get(db.collection(COLLECTIONS.members).where('customerId', '==', customerId)),
    tx.get(db.collection('customers').doc(customerId)),
    tx.get(db.collection('locations').doc(order.locationId)),
    tx.get(db.collection('platformAdminControl').doc('access-v1')),
    tx.get(db.collection(COLLECTIONS.events).doc(hashKey('order-stamp', order.brandId, orderId))),
  ]);
  if (prior.exists) return empty();
  const policy = policySchema.safeParse(policySnap.data());
  const companies = policy.success ? policy.data.companies.filter(c => c.active && c.orderflyBrandIds.includes(order.brandId) && c.locationIds.includes(order.locationId)) : [];
  const c = customer.data(), l = location.data();
  if (companies.length !== 1 || !c || c.brandId !== order.brandId || c.deletedAt || ['deleted', 'inactive'].includes(c.status)
    || !l || l.brandId !== order.brandId || l.deletedAt || l.status === 'deleted') return empty();
  const matches = members.docs.filter(doc => {
    const m = doc.data() as MemberDoc;
    return m.brandId === order.brandId && m.companyId === companies[0].id && m.status === 'active' && m.customerId === customerId;
  });
  // Ambiguous memberships must never credit an arbitrary customer/card.
  if (matches.length !== 1) return empty();
  const memberId = matches[0].id, member = matches[0].data() as MemberDoc;
  const day = copenhagenDay(now), stampsToday = member.stampDay === day ? member.stampsOnDay : 0;
  const amountOre = typeof order.totalAmount === 'number' ? Math.round(order.totalAmount * 100) : NaN;
  const channel = order.deliveryType === 'Delivery' ? 'delivery' : 'pickup';
  const decision = evaluatePurchase(program.settings, { channel: { source: 'order', channel }, amountOre,
    discountUsed: !!order.appliedDiscountId || Number(order.paymentDetails?.discountTotal || 0) > 0, stampsToday });
  if (!decision.qualifies) return empty();
  const card = member.currentCardId ? (await tx.get(db.collection(COLLECTIONS.cards).doc(member.currentCardId))).data() as CardDoc | undefined : undefined;
  if (card && (card.memberId !== memberId || card.brandId !== order.brandId || card.companyId !== member.companyId)) return empty();
  const entry = card && member.currentCardId ? { id: member.currentCardId, card } : null;
  const expired = !!card && cardIsExpired(card, now);
  const effective = card && !expired && card.status === 'active' ? card : newCard(program, member.companyId, memberId, now);
  if (!stampLocation(effective.crossLocation, effective, order.locationId).allowed) return empty();
  const result = applyStamps(effective, decision.stamps, program.settings.stampsRequired);
  // Card + member + primary event; optionally expiry events, rewards and next card.
  const writeCount = 3 + (expired ? 2 : 0) + (result.newCard ? 1 + result.rewards * 2 : 0);
  const eventId = hashKey('order-stamp', order.brandId, orderId);
  return { writeCount, apply: () => {
    addStampsToCard({ db, tx }, { companyId: member.companyId, brandId: order.brandId, memberId, member, program, entry,
      count: decision.stamps, locationId: order.locationId, now, eventId, hash: eventId, idempotencyKey: eventId,
      base: { source: 'order', channel, amountOre, orderId, orderNumber: orderId, customerId },
      memberPatch: { stampDay: day, stampsOnDay: stampsToday + decision.stamps } });
  } };
}
