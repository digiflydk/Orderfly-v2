import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { marketingConfigurationStatus } from '@/lib/marketing/config';
import { checkoutSignupMode, discountApplicationType, signupModeAllows, type CheckoutSignupMode } from '@/lib/promotion-rules';
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
  discountsCreate: 'orderfly.discounts:create',
} as const;
export type ClubAdminPermission = keyof typeof CLUB_ADMIN_PERMISSIONS;

export type OmnisendStatus = 'connected' | 'disabled' | 'not_configured' | 'invalid';
// Why checkout does not offer a listed signup discount right now.
export type DiscountInactiveReason = 'mode_none' | 'mode_newsletter' | 'mode_club' | 'newsletter_service_pending';
export type SignupDiscountSummary = {
  id: string; applicationType: 'newsletter_signup' | 'club_signup'; description: string;
  discountType: 'percentage' | 'fixed_amount'; discountValue: number; endsAt: number | null;
  usedInCheckout: boolean; inactiveReason: DiscountInactiveReason | null;
};
export type BonusSummary = { enabled: boolean; activeNow: boolean; stamps: number; startsAt: number | null; endsAt: number | null };
// Club checkout is suppressed when the programme cannot be shown, exactly as getCheckoutSignupAction does.
export type ClubSuppressedReason = 'program_missing' | 'program_inactive' | 'texts_not_ready' | 'brand_unavailable';
export type ClubAdminSummary = {
  brandId: string; brandName: string;
  permissions: Record<ClubAdminPermission, boolean>;
  // null means the administrator lacks the permission for that card.
  campaign: { checkoutMode: CheckoutSignupMode; clubSuppressed: ClubSuppressedReason | null; saved: boolean; invalid: boolean;
    welcome: BonusSummary; profile: BonusSummary & { requiredFields: CampaignSettings['profile']['requiredFields'] } } | null;
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
  const [settings, discountsView, discountsEdit, discountsCreate] = await Promise.all([
    adminBrands(db, actor, CLUB_ADMIN_PERMISSIONS.settings),
    adminBrands(db, actor, CLUB_ADMIN_PERMISSIONS.discountsView),
    adminBrands(db, actor, CLUB_ADMIN_PERMISSIONS.discountsEdit),
    adminBrands(db, actor, CLUB_ADMIN_PERMISSIONS.discountsCreate),
  ]);
  return { settings, discountsView, discountsEdit, discountsCreate };
}

// Brands where the administrator holds the stamp-card settings or a discount permission the page uses.
export async function clubAdminBrands(db: Firestore, actor: AdminActor) {
  const all = await grants(db, actor);
  const byId = new Map([...all.settings, ...all.discountsView, ...all.discountsEdit].map(brand => [brand.brandId, brand]));
  return [...byId.values()].sort((a, b) => a.brandName.localeCompare(b.brandName, 'da'));
}

const bonus = (value: CampaignSettings['welcome'], programLive: boolean, now: number): BonusSummary =>
  ({ enabled: value.enabled, activeNow: programLive && campaignInPeriod(value, now) && value.stamps > 0,
    stamps: value.stamps, startsAt: value.startsAt, endsAt: value.endsAt });

const idList = (value: unknown) => Array.isArray(value) && value.length > 0 && value.every(item => typeof item === 'string');

// Mirrors the static checks checkout applies to a newsletter signup discount (validateDiscountEligibility).
function newsletterOffer(id: string, value: Record<string, unknown>, brandId: string, now: number) {
  if (value.brandId !== brandId || discountApplicationType(value) !== 'newsletter_signup' || value.isActive !== true || value.assignedToCustomerId) return null;
  if (!idList(value.locationIds) || !idList(value.orderTypes)) return null;
  const start = promotionDate(value.startDate), end = promotionDate(value.endDate);
  if ((value.startDate && !start) || (value.endDate && !end) || (start && now < start.getTime()) || (end && now > end.getTime())) return null;
  if (Number(value.usageLimit) > 0 && Number(value.usedCount || 0) >= Number(value.usageLimit)) return null;
  const amount = Number(value.discountValue), type = value.discountType === 'fixed_amount' ? 'fixed_amount' as const : 'percentage' as const;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { id, applicationType: 'newsletter_signup' as const, description: typeof value.description === 'string' ? value.description : '',
    discountType: type, discountValue: amount, endsAt: end?.getTime() ?? null };
}

function inactiveReason(applicationType: SignupDiscountSummary['applicationType'], mode: CheckoutSignupMode, clubSuppressed: boolean, brandId: string): DiscountInactiveReason | null {
  if (!signupModeAllows(applicationType, mode)) return mode === 'none' ? 'mode_none' : mode === 'newsletter' ? 'mode_newsletter' : 'mode_club';
  if (applicationType === 'club_signup' && clubSuppressed) return 'mode_none';
  if (applicationType === 'newsletter_signup' && marketingConfigurationStatus(brandId).reason !== null) return 'newsletter_service_pending';
  return null;
}

// Read-only overview. Each card is loaded only when the administrator holds its
// permission for the whole brand; the brand itself must be covered by at least one.
export async function readClubAdminSummary(db: Firestore, actor: AdminActor, brandId: string, options: { superuser: boolean; now: number }): Promise<ClubAdminSummary> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(brandId)) throw new LoyaltyError('invalid_request', 400);
  const all = await grants(db, actor);
  const has = (list: typeof all.settings) => list.find(brand => brand.brandId === brandId);
  const brand = has(all.settings) ?? has(all.discountsEdit) ?? has(all.discountsView);
  if (!brand) throw new LoyaltyError('forbidden', 403);
  // Each discount permission stands on its own, as in the central policy.
  const permissions = { settings: !!has(all.settings), discountsView: !!has(all.discountsView), discountsEdit: !!has(all.discountsEdit), discountsCreate: !!has(all.discountsCreate) };
  const { now } = options;
  const showCampaign = permissions.settings && permissions.discountsEdit;

  // The checkout mode is what customers see; it is not secret configuration.
  const [savedCampaign, brandSnap, programSnap, ctx] = await Promise.all([
    db.collection(CAMPAIGN_COLLECTION).doc(brandId).get(),
    db.collection('brands').doc(brandId).get(),
    db.collection(COLLECTIONS.programs).doc(brandId).get(),
    loadTextContext(db, brandId),
  ]);
  const mode = checkoutSignupMode(savedCampaign.exists ? savedCampaign.data() : undefined, brandId);
  const program = readProgram(brandId, programSnap.data()), rendered = renderForProgram(program.settings, program.texts, ctx);
  const textsReady = !rendered.missing.length && !rendered.invalid.length;
  const brandData = brandSnap.data() ?? {};
  const brandUsable = typeof brandData.slug === 'string' && !!brandData.slug && brandData.status !== 'suspended';
  const clubSuppressed: ClubSuppressedReason | null = !brandUsable ? 'brand_unavailable' : !programSnap.exists ? 'program_missing'
    : !program.settings.active ? 'program_inactive' : !textsReady ? 'texts_not_ready' : null;
  const programLive = program.settings.active && textsReady;

  const campaign = showCampaign ? (() => {
    const parsed = readCampaign(brandId, savedCampaign.data()), s = parsed.settings;
    return { checkoutMode: mode, clubSuppressed: mode === 'club' ? clubSuppressed : null, saved: savedCampaign.exists,
      invalid: savedCampaign.exists && parsed.version === 0, welcome: bonus(s.welcome, programLive, now),
      profile: { ...bonus(s.profile, programLive, now), requiredFields: s.profile.requiredFields } };
  })() : null;

  const discounts = permissions.discountsView ? await (async () => {
    const [rows, club] = await Promise.all([db.collection('discounts').where('brandId', '==', brandId).get(), listClubDiscountOffers(db, brandId, now)]);
    const newsletter = rows.docs.sort((a, b) => a.id.localeCompare(b.id))
      .map(doc => newsletterOffer(doc.id, doc.data(), brandId, now)).filter(row => row !== null);
    const offers = [...newsletter, ...club.map(offer => ({ id: offer.id, applicationType: 'club_signup' as const, description: offer.description,
      discountType: offer.discountType, discountValue: offer.discountValue, endsAt: offer.endsAt }))];
    return offers.map(offer => {
      const reason = inactiveReason(offer.applicationType, mode, clubSuppressed !== null, brandId);
      return { ...offer, usedInCheckout: reason === null, inactiveReason: reason };
    });
  })() : null;

  const texts = permissions.settings ? { programExists: programSnap.exists, programActive: program.settings.active, ready: textsReady,
    missingPlaceholders: rendered.missing.map(row => row.placeholder), invalidFields: rendered.invalid } : null;

  return { brandId, brandName: brand.brandName, permissions, campaign, discounts, texts,
    omnisend: options.superuser ? omnisendStatus(brandId) : null };
}
