import 'server-only';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { LoyaltyError } from './counter';
import { campaignDocSchema, campaignSettingsSchema, readCampaign, type CampaignSettings } from './campaign-rules';

export const CAMPAIGN_COLLECTION = 'loyaltyCampaigns';
export const BONUS_GRANTS_COLLECTION = 'loyaltyBonusGrants';
export async function loadCampaign(db: Firestore, brandId: string) {
  return readCampaign(brandId, (await db.collection(CAMPAIGN_COLLECTION).doc(brandId).get()).data());
}

// Internal staging API. The caller must authorize the administrator for this brand
// in the same transaction before applying this change. All reads finish before apply.
export async function stageCampaignSettings(input: { db: Firestore; tx: Transaction; brandId: string;
  settings: CampaignSettings; expectedVersion: number; now: number }) {
  const { db, tx, brandId, expectedVersion, now } = input;
  const parsed = campaignSettingsSchema.safeParse(input.settings);
  if (!parsed.success || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0 || !Number.isSafeInteger(now) || now < 0)
    throw new LoyaltyError('invalid_request', 400);
  const ref = db.collection(CAMPAIGN_COLLECTION).doc(brandId), known = await tx.get(ref);
  const current = known.exists ? campaignDocSchema.safeParse(known.data()) : null;
  if (known.exists && (!current?.success || current.data.brandId !== brandId)) throw new LoyaltyError('campaign_invalid', 409);
  const version = current?.success ? current.data.version : 0;
  if (version !== expectedVersion) throw new LoyaltyError('campaign_changed', 409);
  const campaign = { brandId, version: version + 1, updatedAt: now, settings: parsed.data };
  return { campaign, apply: () => tx.set(ref, campaign) };
}
