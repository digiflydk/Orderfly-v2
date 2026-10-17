import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { COLLECTIONS, hashKey, type CardDoc, type LoyaltyEvent, type RewardDoc } from './model';

const BATCH = 100;
const expiryEvent = (row: { companyId: string; brandId: string; memberId: string }, now: number, fields: Partial<LoyaltyEvent>): LoyaltyEvent => ({
  companyId: row.companyId, brandId: row.brandId, memberId: row.memberId, type: 'stamps_expired', quantity: 0, amountOre: null,
  channel: null, source: 'job', locationId: null, actorId: null, actorName: null, reason: null, idempotencyKey: null,
  requestHash: null, cardId: null, rewardId: null, createdAt: now, ...fields,
});

// Runs inside the existing authenticated worker heartbeat. Each expiry is its own
// transaction that rechecks state, so a concurrent stamp or redemption wins and
// nothing is expired twice. Expired records are kept; nothing is deleted.
export async function runLoyaltyExpiry(db: Firestore, now = Date.now(), deadline = Date.now() + 30_000) {
  const counts = { cards: 0, rewards: 0 };
  const cards = await db.collection(COLLECTIONS.cards).where('status', '==', 'active').where('expiresAt', '<=', now).limit(BATCH).get();
  for (const doc of cards.docs) {
    if (Date.now() > deadline) return counts;
    const expired = await db.runTransaction(async tx => {
      const card = (await tx.get(doc.ref)).data() as CardDoc | undefined;
      if (!card || card.status !== 'active' || card.expiresAt === null || card.expiresAt > now) return false;
      tx.update(doc.ref, { status: 'expired' });
      tx.create(db.collection(COLLECTIONS.events).doc(hashKey('expired-card', doc.id)),
        expiryEvent(card, now, { type: 'stamps_expired', quantity: card.stamps, cardId: doc.id, locationId: card.locationId }));
      return true;
    });
    if (expired) counts.cards++;
  }
  const rewards = await db.collection(COLLECTIONS.rewards).where('status', '==', 'available').where('expiresAt', '<=', now).limit(BATCH).get();
  for (const doc of rewards.docs) {
    if (Date.now() > deadline) return counts;
    const expired = await db.runTransaction(async tx => {
      const reward = (await tx.get(doc.ref)).data() as RewardDoc | undefined;
      if (!reward || reward.status !== 'available' || reward.expiresAt > now) return false;
      tx.update(doc.ref, { status: 'expired' });
      tx.create(db.collection(COLLECTIONS.events).doc(hashKey('expired-reward', doc.id, String(reward.expiresAt))),
        expiryEvent(reward, now, { type: 'reward_expired', quantity: 1, rewardId: doc.id, cardId: reward.cardId, locationId: reward.locationId }));
      return true;
    });
    if (expired) counts.rewards++;
  }
  return counts;
}
