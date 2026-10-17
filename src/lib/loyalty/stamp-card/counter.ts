import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { z } from 'zod';
import { authorizeTransaction } from '@/lib/access/scoped-data';
import { authorize, policySchema } from '@/lib/access/policy';
import { principalKey, type VerifiedIdentity } from '@/lib/access/authority';
import { consumeLimit, RateLimited } from './limits';
import { applyStamps, canRedeem, cardExpiresAt, COUNTER_CHANNELS, evaluatePurchase, removeStamps, rewardExpiresAt, stampLocation } from './rules';
import {
  cardIsExpired, COLLECTIONS, copenhagenDay, hashKey, maskEmail, memberIdentityKey, newCard, readProgram,
  type CardDoc, type EventSource, type EventType, type LoyaltyEvent, type MemberDoc, type RewardDoc,
} from './model';

export class LoyaltyError extends Error {
  constructor(public code: string, public status = 422) { super(code); }
}
export type CounterActor = { identity: VerifiedIdentity; name: string };

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const scope = { brandId: id, locationId: id };
const idempotencyKey = z.string().regex(/^[a-f0-9]{64}$/);
export const lookupSchema = z.union([
  z.object({ ...scope, qrToken: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  z.object({ ...scope, email: z.string().trim().email().max(254) }).strict(),
]);
export const stampSchema = z.object({
  ...scope, memberId: id, channel: z.enum(COUNTER_CHANNELS), amountOre: z.number().int().min(0).max(10_000_000),
  discountUsed: z.boolean(), via: z.enum(['qr', 'search']), idempotencyKey,
}).strict();
export const redeemSchema = z.object({ ...scope, rewardId: id, via: z.enum(['qr', 'search']), idempotencyKey }).strict();
const reason = z.string().trim().min(3).max(500);
export const correctionSchema = z.discriminatedUnion('kind', [
  z.object({ ...scope, kind: z.literal('add_stamps'), memberId: id, count: z.number().int().min(1).max(50), reason, idempotencyKey }).strict(),
  z.object({ ...scope, kind: z.literal('remove_stamps'), memberId: id, count: z.number().int().min(1).max(50), reason, idempotencyKey }).strict(),
  z.object({ ...scope, kind: z.literal('cancel_redemption'), rewardId: id, reason, idempotencyKey }).strict(),
]);

const PERMISSION = {
  counter: 'orderfly.stamp_cards:counter', redeem: 'orderfly.stamp_cards:redeem', correct: 'orderfly.stamp_cards:correct',
} as const;
const LOOKUPS_PER_MINUTE = 60;
const requestHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Authorizes the actor for this exact brand location inside the transaction and
// resolves the tenant (company) snapshot recorded on every event.
async function authorizeAt(db: Firestore, tx: Transaction, actor: CounterActor, brandId: string, locationId: string, permission: string) {
  await authorizeTransaction(tx, actor.identity, { brandId, locationIds: [locationId] }, permission, 'locations');
  const policy = policySchema.parse((await tx.get(db.collection('platformAdminControl').doc('access-v1'))).data());
  const company = policy.companies.find(c => c.orderflyBrandIds.includes(brandId))!;
  const principalId = principalKey(actor.identity);
  const can = (p: string) => authorize(policy, { principalId, companyId: company.id, locationIds: [locationId], permission: p }).allowed;
  return { companyId: company.id, principalId, can };
}

type Writer = { tx: Transaction; db: Firestore };
function writeEvent({ tx, db }: Writer, eventId: string, event: LoyaltyEvent) {
  tx.create(db.collection(COLLECTIONS.events).doc(eventId), event);
}
const event = (base: Pick<LoyaltyEvent, 'companyId' | 'brandId' | 'createdAt'>, fields: Partial<LoyaltyEvent> & { type: EventType; source: EventSource }): LoyaltyEvent => ({
  memberId: null, quantity: 0, amountOre: null, channel: null, locationId: null, actorId: null, actorName: null, reason: null,
  idempotencyKey: null, requestHash: null, cardId: null, rewardId: null, ...base, ...fields,
});

// Replays a committed operation for the same key and rejects a different request with it.
async function replay(tx: Transaction, db: Firestore, eventId: string, hash: string) {
  const prior = await tx.get(db.collection(COLLECTIONS.events).doc(eventId));
  if (!prior.exists) return null;
  if (prior.data()?.requestHash !== hash) throw new LoyaltyError('idempotency_conflict', 409);
  return prior.data() as LoyaltyEvent & { result?: unknown };
}

async function activeMember(tx: Transaction, db: Firestore, brandId: string, memberId: string) {
  const snap = await tx.get(db.collection(COLLECTIONS.members).doc(memberId));
  const member = snap.data() as MemberDoc | undefined;
  if (!member || member.brandId !== brandId || member.status !== 'active') throw new LoyaltyError('member_not_found', 404);
  return member;
}

async function currentCard(tx: Transaction, db: Firestore, member: MemberDoc, memberId: string) {
  if (!member.currentCardId) return null;
  const card = (await tx.get(db.collection(COLLECTIONS.cards).doc(member.currentCardId))).data() as CardDoc | undefined;
  return card && card.memberId === memberId && card.brandId === member.brandId ? { id: member.currentCardId, card } : null;
}

async function availableRewards(tx: Transaction, db: Firestore, brandId: string, memberId: string, now: number) {
  const snap = await tx.get(db.collection(COLLECTIONS.rewards).where('memberId', '==', memberId).where('status', '==', 'available'));
  return snap.docs.map(doc => ({ id: doc.id, ...(doc.data() as RewardDoc) }))
    .filter(r => r.brandId === brandId && r.expiresAt > now).sort((a, b) => a.expiresAt - b.expiresAt);
}

function cardView(entry: { card: CardDoc } | null, program: ReturnType<typeof readProgram>, now: number) {
  const card = entry && entry.card.status === 'active' && !cardIsExpired(entry.card, now) ? entry.card : null;
  return { stamps: card?.stamps ?? 0, stampsRequired: card?.stampsRequired ?? program.settings.stampsRequired, expiresAt: card?.expiresAt ?? null };
}

// A minute bucket per actor limits enumeration of customers by e-mail or token.
async function consumeLookupLimit(tx: Transaction, db: Firestore, principalId: string, now: number) {
  try { return await consumeLimit(tx, db, 'lookup', principalId, LOOKUPS_PER_MINUTE, 60_000, now); }
  catch (error) { if (error instanceof RateLimited) throw new LoyaltyError('rate_limited', 429); throw error; }
}

export async function lookupMember(db: Firestore, actor: CounterActor, input: z.infer<typeof lookupSchema>, now: number) {
  const outcome = await db.runTransaction(async tx => {
    const { principalId, can } = await authorizeAt(db, tx, actor, input.brandId, input.locationId, PERMISSION.counter);
    const recordLookup = await consumeLookupLimit(tx, db, principalId, now);
    // A miss counts against the limit as well, so staff cannot enumerate e-mails or tokens.
    try { return { view: await resolveLookup(tx, principalId, can, recordLookup) }; }
    catch (error) { if (error instanceof LoyaltyError) { recordLookup(); return { error }; } throw error; }
  });
  if ('error' in outcome) throw outcome.error;
  return outcome.view;

  async function resolveLookup(tx: Transaction, principalId: string, can: (p: string) => boolean, recordLookup: () => void) {
    let memberId: string, via: 'qr' | 'search', consumeToken: (() => void) | null = null;
    if ('qrToken' in input) {
      const ref = db.collection(COLLECTIONS.qrTokens).doc(hashKey('qr', input.qrToken));
      const token = (await tx.get(ref)).data();
      // Unknown, foreign, used and expired tokens are indistinguishable to the caller.
      if (!token || token.brandId !== input.brandId || token.usedAt || token.expiresAt <= now) throw new LoyaltyError('qr_invalid', 410);
      memberId = String(token.memberId); via = 'qr';
      consumeToken = () => tx.update(ref, { usedAt: now, usedBy: principalId, usedLocationId: input.locationId });
    } else {
      const identity = (await tx.get(db.collection(COLLECTIONS.identities).doc(memberIdentityKey(input.brandId, input.email)))).data();
      if (!identity || identity.brandId !== input.brandId) throw new LoyaltyError('member_not_found', 404);
      memberId = String(identity.memberId); via = 'search';
    }
    const member = await activeMember(tx, db, input.brandId, memberId);
    const [program, card, rewards] = await Promise.all([
      tx.get(db.collection(COLLECTIONS.programs).doc(input.brandId)).then(s => readProgram(input.brandId, s.data())),
      currentCard(tx, db, member, memberId),
      availableRewards(tx, db, input.brandId, memberId, now),
    ]);
    recordLookup();
    consumeToken?.();
    const s = program.settings;
    return {
      via, member: { id: memberId, name: member.name, maskedEmail: maskEmail(member.normalizedEmail) },
      card: cardView(card, program, now),
      rewards: rewards.map(r => ({ id: r.id, description: r.description, expiresAt: r.expiresAt,
        redeemableHere: canRedeem({ status: r.status, expiresAt: new Date(r.expiresAt), locationId: r.locationId }, new Date(now), input.locationId).allowed })),
      program: { active: s.active, name: s.name, counterChannels: s.counterChannels, minimumAmountOre: s.minimumAmountOre, discountedOrdersQualify: s.discountedOrdersQualify },
      permissions: { redeem: can(PERMISSION.redeem), correct: can(PERMISSION.correct) },
    };
  }
}

type StampOutcome = { stamps: number; stampsRequired: number; rewardsEarned: number; cardId: string };

// Shared by purchases and manual corrections. Reads must already be complete.
function addStampsToCard(w: Writer, ctx: {
  companyId: string; brandId: string; memberId: string; member: MemberDoc; program: ReturnType<typeof readProgram>;
  entry: { id: string; card: CardDoc } | null; count: number; locationId: string; now: number;
  base: Partial<LoyaltyEvent> & { source: EventSource }; eventId: string; hash: string; idempotencyKey: string;
  memberPatch?: Partial<MemberDoc>;
}): StampOutcome {
  const { tx, db } = w, { now, program, memberId, companyId, brandId } = ctx;
  const meta = { companyId, brandId, createdAt: now };
  let entry = ctx.entry;
  if (entry && cardIsExpired(entry.card, now)) {
    // The job may not have run yet: expire the stale card in this transaction.
    tx.update(db.collection(COLLECTIONS.cards).doc(entry.id), { status: 'expired' });
    writeEvent(w, hashKey('expired-card', entry.id), event(meta, { type: 'stamps_expired', source: 'job', memberId, cardId: entry.id, quantity: entry.card.stamps }));
    entry = null;
  }
  if (!entry || entry.card.status !== 'active') entry = { id: db.collection(COLLECTIONS.cards).doc().id, card: newCard(program, companyId, memberId, now) };
  const card = entry.card;
  const location = stampLocation(card.crossLocation, card, ctx.locationId);
  if (!location.allowed) throw new LoyaltyError('wrong_location', 409);
  const result = applyStamps(card, ctx.count, program.settings.stampsRequired);
  const nowDate = new Date(now);
  const cardRef = db.collection(COLLECTIONS.cards).doc(entry.id);
  let finalCardId = entry.id;
  if (!result.newCard) {
    tx.set(cardRef, { ...card, stamps: result.card.stamps, locationId: location.locationId, lastStampAt: now,
      expiresAt: cardExpiresAt(nowDate, card.cardValidityMonths).getTime() });
  } else {
    tx.set(cardRef, { ...card, stamps: card.stampsRequired, locationId: location.locationId, lastStampAt: now, expiresAt: null, status: 'completed' });
    for (let i = 0; i < result.rewards; i++) {
      // Every reward is earned under the frozen rules of the card that completed it.
      // Overflow beyond one full card (only when stamps per purchase exceed the card size) uses current rules.
      const source = i === 0 ? card : newCard(program, companyId, memberId, now);
      const rewardRef = db.collection(COLLECTIONS.rewards).doc(hashKey('reward', ctx.eventId, String(i)));
      const reward: RewardDoc = { companyId, brandId, memberId, cardId: entry.id, programVersion: source.programVersion, reward: source.reward,
        description: source.rewardDescription, locationId: source.crossLocation ? null : location.locationId, earnedAt: now,
        expiresAt: rewardExpiresAt(nowDate, source.rewardValidityMonths).getTime(), status: 'available',
        redeemedAt: null, redeemedBy: null, redeemedByName: null, redeemedLocationId: null };
      tx.create(rewardRef, reward);
      writeEvent(w, hashKey(ctx.eventId, 'reward', String(i)), event(meta, { type: 'reward_earned', source: ctx.base.source, memberId,
        quantity: 1, locationId: ctx.locationId, actorId: ctx.base.actorId ?? null, actorName: ctx.base.actorName ?? null, cardId: entry.id, rewardId: rewardRef.id }));
    }
    const next = newCard(program, companyId, memberId, now, result.card.stamps);
    finalCardId = db.collection(COLLECTIONS.cards).doc().id;
    tx.create(db.collection(COLLECTIONS.cards).doc(finalCardId), result.card.stamps > 0
      ? { ...next, locationId: next.crossLocation ? null : ctx.locationId, lastStampAt: now, expiresAt: cardExpiresAt(nowDate, next.cardValidityMonths).getTime() }
      : next);
  }
  tx.update(db.collection(COLLECTIONS.members).doc(memberId), { ...ctx.memberPatch, currentCardId: finalCardId, lastActivityAt: now });
  const outcome = { stamps: result.card.stamps, stampsRequired: result.card.stampsRequired, rewardsEarned: result.rewards, cardId: finalCardId };
  writeEvent(w, ctx.eventId, event(meta, { ...ctx.base, type: 'stamp_added', memberId, quantity: ctx.count, locationId: ctx.locationId,
    idempotencyKey: ctx.idempotencyKey, requestHash: ctx.hash, cardId: entry.id, result: outcome }));
  return outcome;
}

export async function grantStamp(db: Firestore, actor: CounterActor, input: z.infer<typeof stampSchema>, now: number) {
  const hash = requestHash({ op: 'stamp', ...input }), eventId = hashKey('stamp', input.brandId, input.idempotencyKey);
  return db.runTransaction(async tx => {
    const prior = await replay(tx, db, eventId, hash);
    if (prior) return { ...(prior.result as StampOutcome), replayed: true };
    const { companyId, principalId } = await authorizeAt(db, tx, actor, input.brandId, input.locationId, PERMISSION.counter);
    const member = await activeMember(tx, db, input.brandId, input.memberId);
    const [program, entry] = await Promise.all([
      tx.get(db.collection(COLLECTIONS.programs).doc(input.brandId)).then(s => readProgram(input.brandId, s.data())),
      currentCard(tx, db, member, input.memberId),
    ]);
    const day = copenhagenDay(now), stampsToday = member.stampDay === day ? member.stampsOnDay : 0;
    const decision = evaluatePurchase(program.settings, { channel: { source: 'counter', channel: input.channel },
      amountOre: input.amountOre, discountUsed: input.discountUsed, stampsToday });
    if (!decision.qualifies) throw new LoyaltyError(decision.reason, 422);
    const outcome = addStampsToCard({ tx, db }, { companyId, brandId: input.brandId, memberId: input.memberId, member, program, entry,
      count: decision.stamps, locationId: input.locationId, now, eventId, hash, idempotencyKey: input.idempotencyKey,
      base: { source: input.via === 'qr' ? 'counter_qr' : 'counter_search', channel: input.channel, amountOre: input.amountOre,
        actorId: principalId, actorName: actor.name },
      memberPatch: { stampDay: day, stampsOnDay: stampsToday + decision.stamps } });
    return { ...outcome, replayed: false };
  });
}

export async function redeemReward(db: Firestore, actor: CounterActor, input: z.infer<typeof redeemSchema>, now: number) {
  const hash = requestHash({ op: 'redeem', ...input }), eventId = hashKey('redeem', input.brandId, input.idempotencyKey);
  return db.runTransaction(async tx => {
    const prior = await replay(tx, db, eventId, hash);
    if (prior) return { rewardId: input.rewardId, description: String((prior.result as { description?: string })?.description || ''), replayed: true };
    const { companyId, principalId } = await authorizeAt(db, tx, actor, input.brandId, input.locationId, PERMISSION.redeem);
    const ref = db.collection(COLLECTIONS.rewards).doc(input.rewardId);
    const reward = (await tx.get(ref)).data() as RewardDoc | undefined;
    if (!reward || reward.brandId !== input.brandId) throw new LoyaltyError('reward_not_found', 404);
    await activeMember(tx, db, input.brandId, reward.memberId);
    const program = readProgram(input.brandId, (await tx.get(db.collection(COLLECTIONS.programs).doc(input.brandId))).data());
    if (!program.settings.active) throw new LoyaltyError('program_inactive', 422);
    const allowed = canRedeem({ status: reward.status, expiresAt: new Date(reward.expiresAt), locationId: reward.locationId }, new Date(now), input.locationId);
    if (!allowed.allowed) throw new LoyaltyError(allowed.reason === 'not_available' ? 'reward_not_available' : `reward_${allowed.reason}`, 409);
    tx.update(ref, { status: 'redeemed', redeemedAt: now, redeemedBy: principalId, redeemedByName: actor.name, redeemedLocationId: input.locationId });
    tx.update(db.collection(COLLECTIONS.members).doc(reward.memberId), { lastActivityAt: now });
    writeEvent({ tx, db }, eventId, event({ companyId, brandId: input.brandId, createdAt: now }, { type: 'reward_redeemed',
      source: input.via === 'qr' ? 'counter_qr' : 'counter_search', memberId: reward.memberId, quantity: 1, locationId: input.locationId,
      actorId: principalId, actorName: actor.name, idempotencyKey: input.idempotencyKey, requestHash: hash, cardId: reward.cardId,
      rewardId: input.rewardId, result: { description: reward.description } }));
    return { rewardId: input.rewardId, description: reward.description, replayed: false };
  });
}

export async function correctMember(db: Firestore, actor: CounterActor, input: z.infer<typeof correctionSchema>, now: number) {
  const hash = requestHash({ op: 'correct', ...input }), eventId = hashKey('correct', input.brandId, input.idempotencyKey);
  return db.runTransaction(async tx => {
    const prior = await replay(tx, db, eventId, hash);
    if (prior) return { ...(prior.result as object), replayed: true };
    const { companyId, principalId } = await authorizeAt(db, tx, actor, input.brandId, input.locationId, PERMISSION.correct);
    const meta = { companyId, brandId: input.brandId, createdAt: now };
    const actorFields = { actorId: principalId, actorName: actor.name, reason: input.reason, locationId: input.locationId,
      idempotencyKey: input.idempotencyKey, requestHash: hash };
    if (input.kind === 'cancel_redemption') {
      const ref = db.collection(COLLECTIONS.rewards).doc(input.rewardId);
      const reward = (await tx.get(ref)).data() as RewardDoc | undefined;
      if (!reward || reward.brandId !== input.brandId) throw new LoyaltyError('reward_not_found', 404);
      if (reward.status !== 'redeemed') throw new LoyaltyError('reward_not_redeemed', 409);
      // A cancelled redemption restores the reward; one past its validity is expired, not usable.
      const status = reward.expiresAt > now ? 'available' : 'expired';
      tx.update(ref, { status, redeemedAt: null, redeemedBy: null, redeemedByName: null, redeemedLocationId: null });
      tx.update(db.collection(COLLECTIONS.members).doc(reward.memberId), { lastActivityAt: now });
      const result = { rewardId: input.rewardId, status };
      writeEvent({ tx, db }, eventId, event(meta, { ...actorFields, type: 'redemption_cancelled', source: 'correction', memberId: reward.memberId,
        quantity: 1, cardId: reward.cardId, rewardId: input.rewardId, result }));
      if (status === 'expired') writeEvent({ tx, db }, hashKey('expired-reward', input.rewardId, eventId),
        event(meta, { type: 'reward_expired', source: 'job', memberId: reward.memberId, quantity: 1, rewardId: input.rewardId, cardId: reward.cardId }));
      return { ...result, replayed: false };
    }
    const member = await activeMember(tx, db, input.brandId, input.memberId);
    const [program, entry] = await Promise.all([
      tx.get(db.collection(COLLECTIONS.programs).doc(input.brandId)).then(s => readProgram(input.brandId, s.data())),
      currentCard(tx, db, member, input.memberId),
    ]);
    if (input.kind === 'add_stamps') {
      const outcome = addStampsToCard({ tx, db }, { companyId, brandId: input.brandId, memberId: input.memberId, member, program, entry,
        count: input.count, locationId: input.locationId, now, eventId, hash, idempotencyKey: input.idempotencyKey,
        base: { source: 'correction', actorId: principalId, actorName: actor.name, reason: input.reason } });
      return { ...outcome, replayed: false };
    }
    if (!entry || entry.card.status !== 'active' || cardIsExpired(entry.card, now)) throw new LoyaltyError('no_active_stamps', 409);
    let next;
    try { next = removeStamps(entry.card, input.count); } catch { throw new LoyaltyError('no_active_stamps', 409); }
    tx.update(db.collection(COLLECTIONS.cards).doc(entry.id), { stamps: next.stamps });
    tx.update(db.collection(COLLECTIONS.members).doc(input.memberId), { lastActivityAt: now });
    const result = { stamps: next.stamps, stampsRequired: next.stampsRequired, cardId: entry.id };
    writeEvent({ tx, db }, eventId, event(meta, { ...actorFields, type: 'stamp_removed', source: 'correction', memberId: input.memberId,
      quantity: input.count, cardId: entry.id, result }));
    return { ...result, replayed: false };
  });
}

// Issued to the signed-in member (customer portal, phase 2). Stored as a hash,
// valid for 60 seconds and consumed by the first counter lookup.
export const QR_TOKEN_LIFETIME = 60_000;
export async function issueQrToken(db: Firestore, brandId: string, memberId: string, now: number) {
  const token = randomBytes(32).toString('hex');
  await db.collection(COLLECTIONS.qrTokens).doc(hashKey('qr', token)).set({ brandId, memberId, createdAt: now, expiresAt: now + QR_TOKEN_LIFETIME, usedAt: null });
  return { token, expiresAt: now + QR_TOKEN_LIFETIME };
}

