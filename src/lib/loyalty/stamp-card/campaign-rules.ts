import { z } from 'zod';
import { copenhagenDay } from './day';
import { normalizeCustomerPhone } from '@/lib/customer-phone';

export const CHECKOUT_SIGNUP_MODES = ['none', 'newsletter', 'club'] as const;
export const PROFILE_BONUS_FIELDS = ['phone', 'birthDate', 'gender'] as const;
export type BonusKind = 'welcome' | 'profile';
export type BonusProfile = { phone?: unknown; birthDate?: unknown; gender?: unknown };
const epoch = z.number().int().min(0).max(8_640_000_000_000_000).nullable();
const period = { startsAt: epoch, endsAt: epoch };
const validPeriod = (value: { startsAt: number | null; endsAt: number | null }) =>
  value.startsAt === null || value.endsAt === null || value.startsAt < value.endsAt;
const welcomeSchema = z.object({ enabled: z.boolean(), stamps: z.number().int().min(0).max(8), ...period }).strict().refine(validPeriod, 'Invalid campaign period');
const profileSchema = z.object({ enabled: z.boolean(), stamps: z.number().int().min(1).max(8),
  requiredFields: z.array(z.enum(PROFILE_BONUS_FIELDS)).min(1).max(3).refine(fields => new Set(fields).size === fields.length, 'Duplicate profile field'),
  ...period }).strict().refine(validPeriod, 'Invalid campaign period');

export const campaignSettingsSchema = z.object({
  checkoutMode: z.enum(CHECKOUT_SIGNUP_MODES), welcome: welcomeSchema, profile: profileSchema,
}).strict();
export type CampaignSettings = z.infer<typeof campaignSettingsSchema>;
export type CampaignDoc = { brandId: string; version: number; updatedAt: number | null; settings: CampaignSettings };
export const campaignDocSchema = z.object({ brandId: z.string().min(1), version: z.number().int().min(1), updatedAt: epoch,
  settings: campaignSettingsSchema }).strict();

export function defaultCampaignSettings(): CampaignSettings {
  return { checkoutMode: 'none', welcome: { enabled: false, stamps: 1, startsAt: null, endsAt: null },
    profile: { enabled: false, stamps: 1, requiredFields: ['phone', 'birthDate', 'gender'], startsAt: null, endsAt: null } };
}

// Missing, corrupt or foreign configuration fails closed. Nothing is activated by deployment.
export function readCampaign(brandId: string, value: unknown): CampaignDoc {
  const parsed = campaignDocSchema.safeParse(value);
  return parsed.success && parsed.data.brandId === brandId ? parsed.data
    : { brandId, version: 0, updatedAt: null, settings: defaultCampaignSettings() };
}
export const campaignInPeriod = (campaign: { enabled: boolean; startsAt: number | null; endsAt: number | null }, now: number) =>
  Number.isFinite(now) && campaign.enabled && (campaign.startsAt === null || now >= campaign.startsAt) && (campaign.endsAt === null || now < campaign.endsAt);

function validBirthDate(value: unknown, now: number): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && value <= copenhagenDay(now) && new Date(parsed).toISOString().slice(0, 10) === value;
}
export function profileBonusComplete(profile: BonusProfile, fields: CampaignSettings['profile']['requiredFields'], now: number) {
  return fields.every(field => field === 'phone'
    ? typeof profile.phone === 'string' && !!normalizeCustomerPhone(profile.phone)
    : field === 'birthDate' ? validBirthDate(profile.birthDate, now)
      : typeof profile.gender === 'string' && ['male', 'female', 'other', 'prefer_not_to_say'].includes(profile.gender));
}
