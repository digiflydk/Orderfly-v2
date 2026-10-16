import { z } from 'zod';

// Pure stamp-card rules. No I/O: callers load the program version that applies
// to the card, authorize the actor and persist the outcome in one transaction.

// Closed channel sets. Third-party channels (Wolt, Uber Eats, ...) are not a
// value of either type, so they can neither be configured nor submitted.
export const COUNTER_CHANNELS = ['dine_in', 'takeaway'] as const;
export const ORDER_TYPES = ['pickup', 'delivery'] as const;
export type CounterChannel = typeof COUNTER_CHANNELS[number];
export type OrderType = typeof ORDER_TYPES[number];
export const REWARD_TYPES = ['free_product', 'fixed_amount', 'percentage'] as const;

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const count = (min: number, max: number) => z.number().int().min(min).max(max);
const text = (max: number) => z.string().trim().max(max);
const subset = <T extends readonly [string, ...string[]]>(values: T) =>
  z.array(z.enum(values)).max(values.length).refine(v => new Set(v).size === v.length, 'Duplicate channel');

export const rewardSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('free_product'), productIds: z.array(id).max(100), categoryIds: z.array(id).max(100) }).strict(),
  z.object({ type: z.literal('fixed_amount'), amountOre: count(1, 10_000_000) }).strict(),
  z.object({ type: z.literal('percentage'), percent: count(1, 100) }).strict(),
]).refine(r => r.type !== 'free_product' || r.productIds.length + r.categoryIds.length > 0, 'Choose a product or category');

export const programSettingsSchema = z.object({
  active: z.boolean(),
  name: text(80).min(1),
  stampsRequired: count(1, 50),
  minimumAmountOre: count(0, 10_000_000),
  stampsPerPurchase: count(1, 10),
  cardValidityMonths: count(1, 60),
  reward: rewardSchema.nullable(),
  rewardDescription: text(200),
  rewardValidityMonths: count(1, 36),
  crossLocation: z.boolean(),
  discountedOrdersQualify: z.boolean(),
  sessionDays: count(1, 365),
  counterChannels: subset(COUNTER_CHANNELS),
  orderTypes: subset(ORDER_TYPES),
  maxStampsPerDay: count(1, 100).nullable(),
  terms: text(20_000),
  consentText: text(2_000),
}).strict().superRefine((s, ctx) => {
  if (!s.active) return;
  // An inactive draft may be incomplete; launching requires every customer-facing value.
  const missing: Array<[boolean, string]> = [
    [!s.reward, 'reward'], [!s.rewardDescription, 'rewardDescription'], [!s.terms, 'terms'],
    [!s.consentText, 'consentText'], [s.counterChannels.length + s.orderTypes.length === 0, 'counterChannels'],
  ];
  for (const [failed, path] of missing) if (failed) ctx.addIssue({ code: 'custom', path: [path], message: 'Required when the program is active' });
});
export type ProgramSettings = z.infer<typeof programSettingsSchema>;

export function defaultProgramSettings(brandName: string): ProgramSettings {
  return {
    active: false, name: `${brandName.trim() || 'Loyalitets'} Club`.slice(0, 80), stampsRequired: 8, minimumAmountOre: 10_000,
    stampsPerPurchase: 1, cardValidityMonths: 6, reward: null, rewardDescription: '', rewardValidityMonths: 3,
    crossLocation: true, discountedOrdersQualify: false, sessionDays: 180, counterChannels: ['dine_in', 'takeaway'],
    orderTypes: ['pickup'], maxStampsPerDay: null, terms: '', consentText: '',
  };
}

export type PurchaseChannel = { source: 'counter'; channel: CounterChannel } | { source: 'order'; channel: OrderType };
export type PurchaseRejection = 'program_inactive' | 'channel_not_allowed' | 'below_minimum' | 'discount_excluded' | 'daily_limit';
export type PurchaseDecision = { qualifies: true; stamps: number } | { qualifies: false; reason: PurchaseRejection };

// amountOre is the paid amount including VAT after discounts.
export function evaluatePurchase(settings: ProgramSettings, purchase: {
  channel: PurchaseChannel; amountOre: number; discountUsed: boolean; stampsToday: number;
}): PurchaseDecision {
  if (!settings.active) return { qualifies: false, reason: 'program_inactive' };
  const allowed = purchase.channel.source === 'counter'
    ? (settings.counterChannels as string[]).includes(purchase.channel.channel)
    : (settings.orderTypes as string[]).includes(purchase.channel.channel);
  if (!allowed) return { qualifies: false, reason: 'channel_not_allowed' };
  if (!Number.isSafeInteger(purchase.amountOre) || purchase.amountOre < settings.minimumAmountOre)
    return { qualifies: false, reason: 'below_minimum' };
  if (purchase.discountUsed && !settings.discountedOrdersQualify) return { qualifies: false, reason: 'discount_excluded' };
  if (settings.maxStampsPerDay !== null && purchase.stampsToday + settings.stampsPerPurchase > settings.maxStampsPerDay)
    return { qualifies: false, reason: 'daily_limit' };
  return { qualifies: true, stamps: settings.stampsPerPurchase };
}

export type CardProgress = { stamps: number; stampsRequired: number };

// A full card earns one reward and a new card starts. Overflow carries to the
// new card, which uses the current program's stamp requirement.
export function applyStamps(card: CardProgress, added: number, nextStampsRequired: number) {
  if (!Number.isSafeInteger(added) || added < 1) throw new RangeError('invalid_stamp_count');
  let stamps = card.stamps + added, stampsRequired = card.stampsRequired, rewards = 0;
  while (stamps >= stampsRequired) { stamps -= stampsRequired; rewards++; stampsRequired = nextStampsRequired; }
  return { rewards, card: { stamps, stampsRequired }, newCard: rewards > 0 };
}

// Manual removal never reaches below zero and never revokes an earned reward.
export function removeStamps(card: CardProgress, removed: number): CardProgress {
  if (!Number.isSafeInteger(removed) || removed < 1 || removed > card.stamps) throw new RangeError('invalid_stamp_count');
  return { stamps: card.stamps - removed, stampsRequired: card.stampsRequired };
}

// Calendar months, clamped to the last day of a shorter month (31 Aug + 6 = 28/29 Feb).
export function addMonths(from: Date, months: number): Date {
  const result = new Date(from.getTime()), day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const last = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, last));
  return result;
}

// Every new stamp resets the deadline for the whole card.
export const cardExpiresAt = (lastStampAt: Date, validityMonths: number) => addMonths(lastStampAt, validityMonths);
export const rewardExpiresAt = (earnedAt: Date, validityMonths: number) => addMonths(earnedAt, validityMonths);

export type RewardState = { status: 'available' | 'redeemed' | 'expired' | 'cancelled'; expiresAt: Date; locationId: string | null };
export type RedeemRejection = 'not_available' | 'expired' | 'wrong_location';

// locationId on a reward is set only when the card was location-bound.
export function canRedeem(reward: RewardState, now: Date, locationId: string): { allowed: true } | { allowed: false; reason: RedeemRejection } {
  if (reward.status !== 'available') return { allowed: false, reason: 'not_available' };
  if (now.getTime() >= reward.expiresAt.getTime()) return { allowed: false, reason: 'expired' };
  if (reward.locationId !== null && reward.locationId !== locationId) return { allowed: false, reason: 'wrong_location' };
  return { allowed: true };
}

// Without cross-location validity a card is bound to the location of its first
// stamp. A card without stamps is not yet bound.
export function stampLocation(crossLocation: boolean, card: { stamps: number; locationId: string | null }, locationId: string):
  { allowed: true; locationId: string | null } | { allowed: false; reason: 'wrong_location' } {
  if (crossLocation) return { allowed: true, locationId: null };
  if (card.stamps === 0 || card.locationId === null) return { allowed: true, locationId };
  return card.locationId === locationId ? { allowed: true, locationId } : { allowed: false, reason: 'wrong_location' };
}
