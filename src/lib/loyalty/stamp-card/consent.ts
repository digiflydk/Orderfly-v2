import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { COLLECTIONS, hashKey, memberIdentityKey, type LoyaltyEvent, type MemberDoc } from './model';

// Called from the marketing worker transactions when a provider opt-out
// suppresses a customer's primary e-mail. Membership, stamps and rewards stay;
// only the member's consent state changes and the withdrawal is logged once.
// Reads now; the returned writer must run after the caller's remaining reads.
export async function stageProviderConsentWithdrawal(tx: Transaction, db: Firestore, brandId: string, email: string, now: number, consentEventId: string) {
  const identity = (await tx.get(db.collection(COLLECTIONS.identities).doc(memberIdentityKey(brandId, email)))).data();
  if (!identity || identity.brandId !== brandId) return () => {};
  const memberRef = db.collection(COLLECTIONS.members).doc(String(identity.memberId));
  const member = (await tx.get(memberRef)).data() as MemberDoc | undefined;
  if (!member || member.brandId !== brandId || member.status !== 'active' || member.consent?.status !== 'given') return () => {};
  return () => {
    tx.update(memberRef, { consent: { status: 'withdrawn', at: now, source: 'omnisend', eventId: consentEventId } });
    const event: LoyaltyEvent = { companyId: member.companyId, brandId, memberId: memberRef.id, type: 'consent_withdrawn', quantity: 0,
      amountOre: null, channel: 'email', source: 'job', locationId: null, actorId: null, actorName: null, reason: 'omnisend_unsubscribed',
      idempotencyKey: null, requestHash: null, cardId: null, rewardId: null, createdAt: now };
    tx.create(db.collection(COLLECTIONS.events).doc(hashKey('consent-withdrawn', memberRef.id, consentEventId, String(now))), event);
  };
}
