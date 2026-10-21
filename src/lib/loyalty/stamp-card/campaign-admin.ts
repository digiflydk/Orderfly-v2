import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { authorizeTransaction } from '@/lib/access/scoped-data';
import { principalKey } from '@/lib/access/authority';
import { adminBrands, ADMIN_PERMISSION, type AdminActor } from './admin';
import { LoyaltyError } from './counter';
import { CAMPAIGN_COLLECTION, stageCampaignSettings } from './campaigns';
import { campaignSettingsSchema, readCampaign } from './campaign-rules';

const DISCOUNT_EDIT = 'orderfly.discounts:edit';
const brandIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const saveClubCampaignSchema = z.object({ brandId: brandIdSchema, version: z.number().int().min(0), settings: campaignSettingsSchema }).strict();

// Bonus settings affect the whole Club, so both permissions must cover the whole
// brand. Merely viewing discounts or holding one location grant is insufficient.
async function authorizedBrand(db: Firestore, actor: AdminActor, brandId: string) {
  if (!brandIdSchema.safeParse(brandId).success) throw new LoyaltyError('invalid_request', 400);
  const [loyalty, discounts] = await Promise.all([
    adminBrands(db, actor, ADMIN_PERMISSION.settings), adminBrands(db, actor, DISCOUNT_EDIT),
  ]);
  const brand = loyalty.find(row => row.brandId === brandId && discounts.some(d => d.brandId === brandId));
  if (!brand) throw new LoyaltyError('forbidden', 403);
  return brand;
}

export async function readClubCampaign(db: Firestore, actor: AdminActor, brandId: string) {
  await authorizedBrand(db, actor, brandId);
  const saved = await db.collection(CAMPAIGN_COLLECTION).doc(brandId).get();
  const campaign = readCampaign(brandId, saved.data());
  // Absence keeps the old newsletter checkout. A malformed saved record must
  // never be interpreted as a request to activate that legacy offer.
  return !saved.exists ? { ...campaign, settings: { ...campaign.settings, checkoutMode: 'newsletter' as const } } : campaign;
}

export async function saveClubCampaign(db: Firestore, actor: AdminActor, input: unknown, now: number) {
  const parsed = saveClubCampaignSchema.safeParse(input);
  if (!parsed.success) throw new LoyaltyError('invalid_request', 400);
  const { brandId, version, settings } = parsed.data;
  await authorizedBrand(db, actor, brandId);
  return db.runTransaction(async tx => {
    // Recheck current grants in this transaction, so concurrent revocation or
    // brand reassignment cannot race the configuration write.
    await authorizeTransaction(tx, actor.identity, { brandId }, ADMIN_PERMISSION.settings, 'company');
    await authorizeTransaction(tx, actor.identity, { brandId }, DISCOUNT_EDIT, 'company');
    const staged = await stageCampaignSettings({ db, tx, brandId, settings, expectedVersion: version, now });
    const auditRef = db.collection('loyaltyCampaignAudit').doc();
    staged.apply();
    tx.create(auditRef, { brandId, actorId: principalKey(actor.identity), at: now, version: staged.campaign.version,
      checkoutMode: settings.checkoutMode, welcomeEnabled: settings.welcome.enabled, profileEnabled: settings.profile.enabled });
    return staged.campaign;
  });
}
