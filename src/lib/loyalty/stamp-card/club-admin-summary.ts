import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { marketingConfigurationStatus } from '@/lib/marketing/config';
import { checkoutSignupMode, discountApplicationType, type CheckoutSignupMode } from '@/lib/promotion-rules';
import { promotionDate } from '@/lib/promotion-date';
import { ADMIN_PERMISSION, adminBrands, type AdminActor } from './admin';
import { campaignInPeriod, readCampaign, type CampaignSettings } from './campaign-rules';
import { CAMPAIGN_COLLECTION } from './campaigns';
import { listClubDiscountOffers } from './club-discount';
import { LoyaltyError } from './counter';
import { COLLECTIONS, readProgram } from './model';
import { renderForProgram, loadTextContext } from './program-texts';

export const CLUB_ADMIN_PERMISSIONS = {
  settings: ADMIN_PERMISSION.settings,
  discountsView: 'orderfly.discounts:view',
  discountsEdit: 'orderfly.discounts:edit',
} as const;
export type ClubAdminPermission = keyof typeof CLUB_ADMIN_PERMISSIONS;

export type OmnisendStatus = 'connected' | 'disabled' | 'not_configured' | 'invalid';
export type SignupDiscountSummary = {
  id: string; applicationType: 'newsletter_signup' | 'club_signup'; description: string;
  discountType: 'percentage' | 'fixed_amount'; discountValue: number; endsAt: number | null;
};
export type BonusSummary = { enabled: boolean; activeNow: boolean; stamps: number; startsAt: number | null; endsAt: number | null };
export type ClubAdminSummary = {
  brandId: string; brandName: string;
  permissions: Record<ClubAdminPermission, boolean>;
  // null means the administrator lacks the permission for that card.
  campaign: { checkoutMode: CheckoutSignupMode; saved: boolean; invalid: boolean; welcome: BonusSummary;
    profile: BonusSummary & { requiredFields: CampaignSettings['profile']['requiredFields'] } } | null;
  discounts: SignupDiscountSummary[] | null;
  texts: { programExists: boolean; programActive: boolean; ready: boolean; missingPlaceholders: string[]; invalidFields: string[] } | null;
  omnisend: OmnisendStatus | null;
};

export function omnisendStatus(brandId: string): OmnisendStatus {
  const reason = marketingConfigurationStatus(brandId).reason;
  if (reason === null) return 'connected';
  if (reason === 'brand_disabled') return 'disabled';
  if (reason === 'invalid_mapping' || reason === 'duplicate_mapping') return 'invalid';
  return 'not_configured';
}

async function grants(db: Firestore, actor: AdminActor) {
  const [settings, discountsView, discountsEdit] = await Promise.all([
    adminBrands(db, actor, CLUB_ADMIN_PERMISSIONS.settings),
    adminBrands(db, actor, CLUB_ADMIN_PERMISSIONS.discountsView),
    adminBrands(db, actor, CLUB_ADMIN_PERMISSIONS.discountsEdit),
  ]);
  return { settings, discountsView, discountsEdit };
}

// Brands where the administrator holds at least one of the page's full-brand permissions.
export async function clubAdminBrands(db: Firestore, actor: AdminActor) {
  const all = await grants(db, actor);
  const byId = new Map([...all.settings, ...all.discountsView, ...all.discountsEdit].map(brand => [brand.brandId, brand]));
  return [...byId.values()].sort((a, b) => a.brandName.localeCompare(b.brandName, 'da'));
}

const bonus = (value: CampaignSettings['welcome'], now: number): BonusSummary =>
  ({ enabled: value.enabled, activeNow: campaignInPeriod(value, now) && value.stamps > 0, stamps: value.stamps, startsAt: value.startsAt, endsAt: value.endsAt });

function newsletterOffer(id: string, value: Record<string, unknown>, brandId: string, now: number): SignupDiscountSummary | null {
  if (value.brandId !== brandId || discountApplicationType(value) !== 'newsletter_signup' || value.isActive !== true || value.assignedToCustomerId) return null;
  const start = promotionDate(value.startDate), end = promotionDate(value.endDate);
  if ((start && now < start.getTime()) || (end && now > end.getTime())) return null;
  if (Number(value.usageLimit) > 0 && Number(value.usedCount || 0) >= Number(value.usageLimit)) return null;
  const amount = Number(value.discountValue), type = value.discountType === 'fixed_amount' ? 'fixed_amount' : 'percentage';
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { id, applicationType: 'newsletter_signup', description: typeof value.description === 'string' ? value.description : '',
    discountType: type, discountValue: amount, endsAt: end?.getTime() ?? null };
}

// Read-only overview. Each card is loaded only when the administrator holds its
// permission for the whole brand; the brand itself must be covered by at least one.
export async function readClubAdminSummary(db: Firestore, actor: AdminActor, brandId: string, options: { superuser: boolean; now: number }): Promise<ClubAdminSummary> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(brandId)) throw new LoyaltyError('invalid_request', 400);
  const all = await grants(db, actor);
  const has = (list: typeof all.settings) => list.find(brand => brand.brandId === brandId);
  const brand = has(all.settings) ?? has(all.discountsEdit) ?? has(all.discountsView);
  if (!brand) throw new LoyaltyError('forbidden', 403);
  const permissions = { settings: !!has(all.settings), discountsEdit: !!has(all.discountsEdit), discountsView: !!has(all.discountsView) || !!has(all.discountsEdit) };
  const { now } = options;

  const campaign = permissions.settings && permissions.discountsEdit ? await (async () => {
    const saved = await db.collection(CAMPAIGN_COLLECTION).doc(brandId).get();
    const parsed = readCampaign(brandId, saved.data());
    const s = parsed.settings;
    return { checkoutMode: checkoutSignupMode(saved.exists ? saved.data() : undefined, brandId), saved: saved.exists,
      invalid: saved.exists && parsed.version === 0, welcome: bonus(s.welcome, now),
      profile: { ...bonus(s.profile, now), requiredFields: s.profile.requiredFields } };
  })() : null;

  const discounts = permissions.discountsView ? await (async () => {
    const [rows, club] = await Promise.all([db.collection('discounts').where('brandId', '==', brandId).get(), listClubDiscountOffers(db, brandId, now)]);
    const newsletter = rows.docs.sort((a, b) => a.id.localeCompare(b.id))
      .map(doc => newsletterOffer(doc.id, doc.data(), brandId, now)).filter((row): row is SignupDiscountSummary => row !== null);
    return [...newsletter, ...club.map(offer => ({ id: offer.id, applicationType: 'club_signup' as const, description: offer.description,
      discountType: offer.discountType, discountValue: offer.discountValue, endsAt: offer.endsAt }))];
  })() : null;

  const texts = permissions.settings ? await (async () => {
    const [snap, ctx] = await Promise.all([db.collection(COLLECTIONS.programs).doc(brandId).get(), loadTextContext(db, brandId)]);
    const program = readProgram(brandId, snap.data()), rendered = renderForProgram(program.settings, program.texts, ctx);
    return { programExists: snap.exists, programActive: program.settings.active, ready: !rendered.missing.length && !rendered.invalid.length,
      missingPlaceholders: rendered.missing.map(row => row.placeholder), invalidFields: rendered.invalid };
  })() : null;

  return { brandId, brandName: brand.brandName, permissions, campaign, discounts, texts,
    omnisend: options.superuser ? omnisendStatus(brandId) : null };
}
