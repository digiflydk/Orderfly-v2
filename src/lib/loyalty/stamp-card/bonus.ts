import 'server-only';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { addStampsToCard, LoyaltyError, type StampOutcome } from './counter';
import { campaignInPeriod, profileBonusComplete, readCampaign, type BonusKind, type BonusProfile } from './campaign-rules';
import { BONUS_GRANTS_COLLECTION, CAMPAIGN_COLLECTION } from './campaigns';
import { COLLECTIONS, hashKey, memberIdentityKey, readProgram, type CardDoc, type MemberDoc } from './model';

export const bonusGrantId = (brandId: string, email: string, kind: BonusKind) => hashKey('club-bonus', memberIdentityKey(brandId, email), kind);
export const bonusCustomerGrantId = (brandId: string, customerId: string, kind: BonusKind) => hashKey('club-customer-bonus', brandId, customerId, kind);
export type StagedBonus = {
  eligible: boolean; alreadyGranted: boolean; reason: string;
  apply: () => StampOutcome | null;
};
const skipped = (reason: string, alreadyGranted = false): StagedBonus => ({ eligible: false, alreadyGranted, reason, apply: () => null });

// Internal trusted-server API, not an authorization boundary. The caller first
// authenticates the member (or validates a new signup) and supplies its trusted
// snapshot. This performs reads only; call apply after every other stage is read.
// Stage at most one grant per transaction, so both stages cannot mutate a stale card.
export async function stageBonusGrant(input: {
  db: Firestore; tx: Transaction; brand: { brandId: string; companyId: string | null };
  memberId: string; member: MemberDoc; kind: BonusKind; now: number;
  profile?: BonusProfile; welcomeEligible?: boolean;
}): Promise<StagedBonus> {
  const { db, tx, brand, memberId, member, kind, now } = input;
  if (!brand.companyId || member.brandId !== brand.brandId || member.companyId !== brand.companyId || member.status !== 'active'
    || !member.normalizedEmail || !member.customerId || !Number.isSafeInteger(now) || now < 0) throw new LoyaltyError('unauthorized', 401);
  if (kind !== 'welcome' && kind !== 'profile') throw new LoyaltyError('invalid_request', 400);
  const [campaignSnap, programSnap] = await Promise.all([
    tx.get(db.collection(CAMPAIGN_COLLECTION).doc(brand.brandId)), tx.get(db.collection(COLLECTIONS.programs).doc(brand.brandId)),
  ]);
  const campaign = readCampaign(brand.brandId, campaignSnap.data()), config = campaign.settings[kind];
  const program = readProgram(brand.brandId, programSnap.data());
  if (!program.settings.active) return skipped('program_inactive');
  if (!campaignInPeriod(config, now) || config.stamps === 0) return skipped('campaign_inactive');
  // Never infer welcome eligibility from an old membership or a config toggle.
  // Only trusted signup code may set this after capturing the active welcome offer.
  if (kind === 'welcome' && input.welcomeEligible !== true) return skipped('not_new_signup');
  if (kind === 'profile' && !profileBonusComplete(input.profile ?? {}, campaign.settings.profile.requiredFields, now)) return skipped('profile_incomplete');
  const grantId = bonusGrantId(brand.brandId, member.normalizedEmail, kind), grantRef = db.collection(BONUS_GRANTS_COLLECTION).doc(grantId);
  const customerGrantRef = db.collection(BONUS_GRANTS_COLLECTION).doc(bonusCustomerGrantId(brand.brandId, member.customerId, kind));
  const known = await Promise.all([tx.get(grantRef), tx.get(customerGrantRef)]);
  if (known.some(row => row.exists)) return skipped('already_granted', true);
  let entry: { id: string; card: CardDoc } | null = null;
  if (member.currentCardId) {
    const card = (await tx.get(db.collection(COLLECTIONS.cards).doc(member.currentCardId))).data() as CardDoc | undefined;
    if (!card || card.brandId !== brand.brandId || card.companyId !== brand.companyId || card.memberId !== memberId)
      throw new LoyaltyError('card_conflict', 409);
    entry = { id: member.currentCardId, card };
  }
  let applied: StampOutcome | null = null;
  return { eligible: true, alreadyGranted: false, reason: 'eligible', apply: () => {
    if (applied) return applied;
    const eventId = hashKey('bonus-event', grantId), identityHash = memberIdentityKey(brand.brandId, member.normalizedEmail);
    applied = addStampsToCard({ db, tx }, { companyId: brand.companyId!, brandId: brand.brandId, memberId, member, program, entry,
      count: config.stamps, locationId: null, now, eventId, hash: hashKey('bonus-request', grantId), idempotencyKey: grantId,
      base: { source: 'portal', channel: `bonus_${kind}`, reason: kind === 'welcome' ? 'Velkomststempel' : 'Profilbonus' } });
    // This ledger is intentionally independent of the member record. Deleting a
    // membership or recreating it cannot repeat a welcome/profile grant.
    const receipt = { brandId: brand.brandId, kind, grantedAt: now, campaignVersion: campaign.version, stamps: config.stamps, eventId };
    tx.create(grantRef, { ...receipt, scope: 'email', identityHash });
    tx.create(customerGrantRef, { ...receipt, scope: 'customer', customerHash: hashKey('club-customer', brand.brandId, member.customerId) });
    return applied;
  } };
}
