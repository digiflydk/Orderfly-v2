import { createHash } from 'node:crypto';
import { normalizeEmail } from '@/lib/integrations/esmeralda-customer-contract';
import { defaultProgramSettings, programSettingsSchema, type ProgramSettings } from './rules';

// Firestore collections. All access goes through server code; the access rules
// deny every browser read and write. Times are epoch milliseconds; money is øre.
export const COLLECTIONS = {
  programs: 'loyaltyPrograms',
  members: 'loyaltyMembers',
  identities: 'loyaltyMemberIdentities',
  cards: 'loyaltyCards',
  rewards: 'loyaltyRewards',
  events: 'loyaltyEvents',
  qrTokens: 'loyaltyQrTokens',
  rateLimits: 'loyaltyRateLimits',
  loginTokens: 'loyaltyLoginTokens',
  sessions: 'loyaltySessions',
  mailOutbox: 'loyaltyMailOutbox',
  textVersions: 'loyaltyTextVersions',
  renderedTexts: 'loyaltyRenderedTexts',
} as const;

export const EVENT_TYPES = [
  'member_joined', 'stamp_added', 'stamp_removed', 'reward_earned', 'reward_redeemed', 'redemption_cancelled',
  'stamps_expired', 'reward_expired', 'consent_given', 'consent_withdrawn', 'settings_changed', 'member_deleted',
] as const;
export type EventType = typeof EVENT_TYPES[number];
export type EventSource = 'counter_qr' | 'counter_search' | 'order' | 'portal' | 'admin' | 'correction' | 'job';

export type LoyaltyEvent = {
  companyId: string; brandId: string; memberId: string | null; type: EventType; quantity: number;
  amountOre: number | null; channel: string | null; source: EventSource; locationId: string | null;
  actorId: string | null; actorName: string | null; reason: string | null; idempotencyKey: string | null;
  requestHash: string | null; cardId: string | null; rewardId: string | null; createdAt: number;
  // Receipt of the operation on its primary event, returned again for a retried request.
  result?: unknown;
};

export type CardDoc = {
  companyId: string; brandId: string; memberId: string; locationId: string | null; programVersion: number;
  stampsRequired: number; crossLocation: boolean; cardValidityMonths: number; rewardValidityMonths: number;
  reward: ProgramSettings['reward']; rewardDescription: string; stamps: number;
  status: 'active' | 'completed' | 'expired'; startedAt: number; lastStampAt: number | null; expiresAt: number | null;
};

export type RewardDoc = {
  companyId: string; brandId: string; memberId: string; cardId: string; programVersion: number;
  reward: ProgramSettings['reward']; description: string; locationId: string | null; earnedAt: number; expiresAt: number;
  status: 'available' | 'redeemed' | 'expired' | 'cancelled';
  redeemedAt: number | null; redeemedBy: string | null; redeemedByName: string | null; redeemedLocationId: string | null;
};

export type MemberDoc = {
  companyId: string; brandId: string; customerId: string; name: string; normalizedEmail: string;
  status: 'active' | 'deleted'; joinedAt: number; currentCardId: string | null;
  stampDay: string | null; stampsOnDay: number;
  // Newsletter consent as collected by the program. Sign-up requires it; withdrawing it keeps the membership.
  consent: { status: 'given' | 'withdrawn'; at: number; source: 'portal' | 'omnisend'; eventId: string; version?: string };
  termsVersion: string;
  // Published text version and hash of the filled texts the member saw (loyaltyRenderedTexts/{textHash}).
  textVersion?: number; textHash?: string;
  // Incremented to revoke every customer-portal session (logout everywhere, deletion).
  sessionEpoch: number;
  // Latest stamp, redemption or correction, for the admin member list.
  lastActivityAt?: number;
  // The member's current QR code; issuing a new one revokes the previous.
  qrTokenId?: string | null;
};

// The published text version, kept apart from the settings the admin form sends.
// It is counted up when an active program is saved with a different textKey.
export type ProgramTextsMeta = { version: number; effectiveFrom: number | null; key: string | null; templateVersion: string | null };
export const NO_TEXTS: ProgramTextsMeta = { version: 0, effectiveFrom: null, key: null, templateVersion: null };
export type ProgramDoc = { brandId: string; version: number; settings: ProgramSettings; texts: ProgramTextsMeta };

function readTexts(value: unknown): ProgramTextsMeta {
  const t = value as Partial<ProgramTextsMeta> | undefined;
  if (!t || !Number.isSafeInteger(t.version) || t.version! < 0) return NO_TEXTS;
  return { version: t.version!, effectiveFrom: typeof t.effectiveFrom === 'number' ? t.effectiveFrom : null,
    key: typeof t.key === 'string' ? t.key : null, templateVersion: typeof t.templateVersion === 'string' ? t.templateVersion : null };
}

export const hashKey = (...parts: string[]) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
export const memberIdentityKey = (brandId: string, email: string) => hashKey('loyalty-member', brandId, normalizeEmail(email));

// Shows enough for staff to confirm the customer, never the full address.
export function maskEmail(email: string): string {
  const [local, domain] = normalizeEmail(email).split('@');
  if (!local || !domain) return '***';
  return `${local[0]}***@${domain}`;
}

export { copenhagenDay } from './day';

// A brand without a saved program is an inactive program with default rules.
export function readProgram(brandId: string, data: unknown): ProgramDoc {
  const row = data as Partial<ProgramDoc> | undefined;
  const parsed = programSettingsSchema.safeParse(row?.settings);
  if (!row || row.brandId !== brandId || !parsed.success || !Number.isSafeInteger(row.version))
    return { brandId, version: 0, settings: defaultProgramSettings(''), texts: NO_TEXTS };
  return { brandId, version: row.version!, settings: parsed.data, texts: readTexts((row as { texts?: unknown }).texts) };
}

// A new card freezes the rules it was issued under; later setting changes apply to later cards.
export function newCard(program: ProgramDoc, companyId: string, memberId: string, now: number, stamps = 0): CardDoc {
  const s = program.settings;
  return {
    companyId, brandId: program.brandId, memberId, locationId: null, programVersion: program.version,
    stampsRequired: s.stampsRequired, crossLocation: s.crossLocation, cardValidityMonths: s.cardValidityMonths,
    rewardValidityMonths: s.rewardValidityMonths, reward: s.reward, rewardDescription: s.rewardDescription,
    stamps, status: 'active', startedAt: now, lastStampAt: null, expiresAt: null,
  };
}

export const cardIsExpired = (card: CardDoc, now: number) => card.status === 'active' && card.expiresAt !== null && card.expiresAt <= now;
