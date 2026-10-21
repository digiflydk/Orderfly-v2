import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { z } from 'zod';
import { policySchema } from '@/lib/access/policy';
import { customerHasEmail, customerIdentityKey } from '@/lib/customer-identity';
import { normalizeEmail } from '@/lib/integrations/esmeralda-customer-contract';
import { brandSubdomainUrl } from '@/lib/brand-subdomain';
import { stageExplicitConsent } from '@/lib/marketing/store';
import { consumeLimit, RateLimited } from './limits';
import { issueQrToken, LoyaltyError } from './counter';
import {
  cardIsExpired, COLLECTIONS, hashKey, memberIdentityKey, readProgram, type CardDoc, type EventType, type LoyaltyEvent, type MemberDoc, type ProgramDoc, type RewardDoc,
} from './model';
import { profileFromCustomer } from './profile-rules';
import { loadTextContext, renderedHash, renderedTextId, renderForProgram, type TextContext } from './program-texts';

const DAY = 86_400_000;
export const LOGIN_LINK_LIFETIME = 15 * 60_000;
const LIMITS = { signupPerIp: 20, linkPerEmail: 5, linkPerIp: 30, verifyPerIp: 30, qrPerMember: 20 } as const;

export const textVersion = (prefix: string, text: string) => `${prefix}-${createHash('sha256').update(text).digest('hex').slice(0, 16)}`;

// The filled texts a customer sees and the versions that prove which ones they
// accepted. Versions hash the filled text, so a changed setting or brand detail
// also asks the customer to tick the boxes again. Not ready means a placeholder
// cannot be filled: the texts are never shown and nobody can sign up.
export function portalTexts(program: ProgramDoc, ctx: TextContext) {
  const result = renderForProgram(program.settings, program.texts, ctx), t = result.texts;
  const consentWording = t.consentHelp ? `${t.consentText}\n\n${t.consentHelp}` : t.consentText;
  return {
    ready: !result.missing.length && !result.invalid.length, texts: t, consentWording, hash: renderedHash(t),
    consentVersion: textVersion('consent', consentWording), termsVersion: textVersion('terms', `${t.termsAccept}\n\n${t.terms}`),
  };
}
const secret = () => randomBytes(32).toString('hex');
const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const signupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  // Both boxes must be ticked by the customer; the portal never pre-ticks them.
  newsletterConsent: z.literal(true),
  termsAccepted: z.literal(true),
  consentVersion: z.string().max(64),
  termsVersion: z.string().max(64),
}).strict();
export const loginLinkSchema = z.object({ email: z.string().trim().email().max(254) }).strict();
export const verifySchema = z.object({ token: tokenSchema }).strict();
export const consentSchema = z.discriminatedUnion('subscribed', [
  z.object({ subscribed: z.literal(true), consentVersion: z.string().max(64) }).strict(),
  z.object({ subscribed: z.literal(false) }).strict(),
]);
export const deleteSchema = z.object({ confirm: z.literal(true) }).strict();

export type ProgramBrand = { brandId: string; slug: string; brandName: string; companyId: string | null };
export type RequestContext = { ip: string; now: number };

// The brand comes from the public slug, never from a client-supplied ID.
export async function resolveBrand(db: Firestore, slug: string): Promise<ProgramBrand> {
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(slug)) throw new LoyaltyError('brand_not_found', 404);
  const rows = await db.collection('brands').where('slug', '==', slug).limit(2).get();
  const brand = rows.docs.length === 1 ? rows.docs[0] : null;
  if (!brand || brand.data().status === 'suspended') throw new LoyaltyError('brand_not_found', 404);
  const policy = policySchema.safeParse((await db.collection('platformAdminControl').doc('access-v1').get()).data());
  const company = policy.success ? policy.data.companies.find(c => c.active && c.orderflyBrandIds.includes(brand.id)) : undefined;
  return { brandId: brand.id, slug, brandName: String(brand.data().name || slug), companyId: company?.id ?? null };
}

async function limit(tx: Transaction, db: Firestore, scope: string, key: string, count: number, windowMs: number, now: number) {
  try { return await consumeLimit(tx, db, scope, key, count, windowMs, now); }
  catch (error) { if (error instanceof RateLimited) throw new LoyaltyError('rate_limited', 429); throw error; }
}

function loyaltyEvent(member: { companyId: string; brandId: string }, memberId: string, now: number, type: EventType, fields: Partial<LoyaltyEvent> = {}): LoyaltyEvent {
  return { companyId: member.companyId, brandId: member.brandId, memberId, type, quantity: 0, amountOre: null, channel: null, source: 'portal',
    locationId: null, actorId: null, actorName: null, reason: null, idempotencyKey: null, requestHash: null, cardId: null, rewardId: null,
    createdAt: now, ...fields };
}

// Phase 2 decides the portal address; the link always targets the brand's own
// canonical host and is never derived from request data. The token travels in
// the fragment so mail scanners that prefetch links cannot consume it.
export const portalLoginUrl = (slug: string, token: string) => `${brandSubdomainUrl(slug)}/club/login#token=${token}`;

// Stages a one-time login link and its mail job; the job holds the link only until it is sent.
function stageLoginLink(tx: Transaction, db: Firestore, brand: ProgramBrand, programName: string, memberId: string, member: { name: string; normalizedEmail: string }, now: number) {
  const token = secret(), id = hashKey('login', token);
  tx.create(db.collection(COLLECTIONS.loginTokens).doc(id), { brandId: brand.brandId, memberId, createdAt: now, expiresAt: now + LOGIN_LINK_LIFETIME, usedAt: null });
  tx.create(db.collection(COLLECTIONS.mailOutbox).doc(id), { brandId: brand.brandId, memberId, email: member.normalizedEmail, name: member.name,
    brandName: brand.brandName, programName, loginUrl: portalLoginUrl(brand.slug, token), state: 'pending', attempts: 0,
    nextAttemptAt: now, expiresAt: now + LOGIN_LINK_LIFETIME, createdAt: now });
  return id;
}

// Brand-scoped customer match on normalized e-mail, reusing the shared identity
// reservation so checkout, booking, Omnisend import and loyalty never duplicate a customer.
async function resolveCustomer(tx: Transaction, db: Firestore, brandId: string, email: string) {
  const reservationRef = db.collection('integrationConsumerCustomerIdentities').doc(customerIdentityKey(brandId, email));
  const reservation = (await tx.get(reservationRef)).data();
  if (reservation) {
    if (reservation.brandId !== brandId || typeof reservation.customerId !== 'string') throw new LoyaltyError('customer_conflict', 409);
    const customer = await tx.get(db.collection('customers').doc(reservation.customerId));
    if (!customer.exists || customer.data()?.brandId !== brandId || !customerHasEmail(customer.data()!, email)) throw new LoyaltyError('customer_conflict', 409);
    return { customerId: customer.id, data: customer.data()!, create: null };
  }
  const customers = db.collection('customers');
  const results = await Promise.all([
    tx.get(customers.where('brandId', '==', brandId).where('normalizedEmail', '==', email).limit(2)),
    tx.get(customers.where('brandId', '==', brandId).where('email', '==', email).limit(2)),
    tx.get(customers.where('brandId', '==', brandId).where('emailAliases', 'array-contains', email).limit(2)),
  ]);
  const matches = new Map(results.flatMap(r => r.docs).map(doc => [doc.id, doc]));
  if (matches.size > 1) throw new LoyaltyError('customer_conflict', 409);
  const existing = [...matches.values()][0];
  const customerId = existing?.id ?? customers.doc().id;
  return { customerId, data: existing?.data() ?? null, create: (name: string, now: number) => {
    if (!existing) tx.set(customers.doc(customerId), { id: customerId, brandId, fullName: name, email, normalizedEmail: email, emailAliases: [], phone: '',
      status: 'active', createdAt: new Date(now), totalOrders: 0, totalSpend: 0, locationIds: [], loyaltyScore: 0, loyaltyClassification: 'New', marketingConsent: false });
    tx.create(reservationRef, { brandId, customerId, emailHash: customerIdentityKey(brandId, email), source: 'loyalty', createdAt: now, updatedAt: now });
  } };
}

const primaryEmailOf = (customer: Record<string, unknown> | null) =>
  normalizeEmail(typeof customer?.normalizedEmail === 'string' ? customer.normalizedEmail : typeof customer?.email === 'string' ? customer.email : '');

export async function programForPortal(db: Firestore, brand: ProgramBrand) {
  const [snap, ctx] = await Promise.all([db.collection(COLLECTIONS.programs).doc(brand.brandId).get(), loadTextContext(db, brand.brandId)]);
  const program = readProgram(brand.brandId, snap.data()), s = program.settings, texts = portalTexts(program, ctx);
  // A missing brand detail closes sign-up instead of showing an unfilled placeholder.
  if (s.active && !texts.ready) console.error('[loyalty] program texts cannot be filled', brand.brandId);
  const active = s.active && brand.companyId !== null && texts.ready;
  return { active, name: s.name, stampsRequired: s.stampsRequired, rewardDescription: s.rewardDescription,
    consentText: active ? texts.texts.consentText : '', consentHelp: active ? texts.texts.consentHelp : '',
    termsAccept: active ? texts.texts.termsAccept : '', terms: active ? texts.texts.terms : '',
    consentVersion: texts.consentVersion, termsVersion: texts.termsVersion };
}

// Always resolves neutrally so the response never reveals whether an e-mail is known.
export async function signup(db: Firestore, brand: ProgramBrand, input: z.infer<typeof signupSchema>, ctx: RequestContext) {
  const email = normalizeEmail(input.email), now = ctx.now;
  const mailJob = await db.runTransaction(async tx => {
    const recordIp = await limit(tx, db, 'signup-ip', `${brand.brandId}|${ctx.ip}`, LIMITS.signupPerIp, 3_600_000, now);
    const recordEmail = await limit(tx, db, 'link-email', `${brand.brandId}|${email}`, LIMITS.linkPerEmail, 3_600_000, now);
    const program = readProgram(brand.brandId, (await tx.get(db.collection(COLLECTIONS.programs).doc(brand.brandId))).data()), s = program.settings;
    const texts = portalTexts(program, await loadTextContext(db, brand.brandId, tx));
    if (!s.active || !brand.companyId || !texts.ready) throw new LoyaltyError('program_inactive', 409);
    const { consentVersion, termsVersion } = texts;
    if (input.consentVersion !== consentVersion || input.termsVersion !== termsVersion) throw new LoyaltyError('program_changed', 409);
    // The exact filled texts the member saw, stored once per variant.
    const shownRef = db.collection(COLLECTIONS.renderedTexts).doc(renderedTextId(brand.brandId, program.texts.version, texts.hash));
    const shownKnown = (await tx.get(shownRef)).exists;
    const identityRef = db.collection(COLLECTIONS.identities).doc(memberIdentityKey(brand.brandId, email));
    const identity = (await tx.get(identityRef)).data();
    if (identity) {
      const member = (await tx.get(db.collection(COLLECTIONS.members).doc(String(identity.memberId)))).data() as MemberDoc | undefined;
      recordIp(); recordEmail();
      if (!member || member.status !== 'active' || member.brandId !== brand.brandId) return null;
      return stageLoginLink(tx, db, brand, s.name, String(identity.memberId), member, now);
    }
    const customer = await resolveCustomer(tx, db, brand.brandId, email);
    const memberId = db.collection(COLLECTIONS.members).doc().id;
    const consent = await stageExplicitConsent(tx, db, { brandId: brand.brandId, customerId: customer.customerId, email, source: 'loyalty',
      action: 'subscribe', requestId: `signup:${memberId}`, capturedAt: now, version: consentVersion, wording: texts.consentWording,
      primaryEmail: !customer.data || primaryEmailOf(customer.data) === email });
    recordIp(); recordEmail();
    customer.create?.(input.name, now);
    const member: MemberDoc = { companyId: brand.companyId, brandId: brand.brandId, customerId: customer.customerId, name: input.name, normalizedEmail: email,
      status: 'active', joinedAt: now, currentCardId: null, stampDay: null, stampsOnDay: 0, termsVersion, sessionEpoch: 0,
      textVersion: program.texts.version, textHash: texts.hash,
      consent: { status: 'given', at: now, source: 'portal', eventId: consent.id, version: consentVersion } };
    tx.create(db.collection(COLLECTIONS.members).doc(memberId), member);
    if (!shownKnown) tx.create(shownRef, { brandId: brand.brandId, textVersion: program.texts.version, hash: texts.hash, texts: texts.texts, createdAt: now });
    tx.create(identityRef, { brandId: brand.brandId, memberId, createdAt: now });
    consent.apply();
    tx.create(db.collection(COLLECTIONS.events).doc(hashKey('joined', memberId)), loyaltyEvent(member, memberId, now, 'member_joined',
      { reason: termsVersion, result: { textVersion: program.texts.version, textHash: texts.hash } }));
    tx.create(db.collection(COLLECTIONS.events).doc(hashKey('consent-given', memberId, consent.id)),
      loyaltyEvent(member, memberId, now, 'consent_given', { channel: 'email', reason: consentVersion }));
    return stageLoginLink(tx, db, brand, s.name, memberId, member, now);
  }).catch(error => {
    // An identity conflict needs an administrator; the customer still gets the neutral answer.
    if (error instanceof LoyaltyError && error.code === 'customer_conflict') { console.error('[loyalty] customer identity conflict', brand.brandId); return null; }
    throw error;
  });
  return { ok: true as const, mailJob };
}

export async function requestLoginLink(db: Firestore, brand: ProgramBrand, input: z.infer<typeof loginLinkSchema>, ctx: RequestContext) {
  const email = normalizeEmail(input.email), now = ctx.now;
  const mailJob = await db.runTransaction(async tx => {
    const recordIp = await limit(tx, db, 'link-ip', `${brand.brandId}|${ctx.ip}`, LIMITS.linkPerIp, 3_600_000, now);
    const recordEmail = await limit(tx, db, 'link-email', `${brand.brandId}|${email}`, LIMITS.linkPerEmail, 3_600_000, now);
    const identity = (await tx.get(db.collection(COLLECTIONS.identities).doc(memberIdentityKey(brand.brandId, email)))).data();
    const member = identity ? (await tx.get(db.collection(COLLECTIONS.members).doc(String(identity.memberId)))).data() as MemberDoc | undefined : undefined;
    const program = readProgram(brand.brandId, (await tx.get(db.collection(COLLECTIONS.programs).doc(brand.brandId))).data());
    recordIp(); recordEmail();
    if (!identity || !member || member.status !== 'active' || member.brandId !== brand.brandId) return null;
    return stageLoginLink(tx, db, brand, program.settings.name, String(identity.memberId), member, now);
  });
  return { ok: true as const, mailJob };
}

export async function verifyLoginLink(db: Firestore, brand: ProgramBrand, input: z.infer<typeof verifySchema>, ctx: RequestContext) {
  const now = ctx.now;
  // Failed attempts are returned, not thrown, so their rate-limit count commits.
  const outcome = await db.runTransaction(async tx => {
    const recordIp = await limit(tx, db, 'verify-ip', `${brand.brandId}|${ctx.ip}`, LIMITS.verifyPerIp, 3_600_000, now);
    const ref = db.collection(COLLECTIONS.loginTokens).doc(hashKey('login', input.token));
    const link = (await tx.get(ref)).data();
    const memberRef = link ? db.collection(COLLECTIONS.members).doc(String(link.memberId)) : null;
    const member = memberRef ? (await tx.get(memberRef)).data() as MemberDoc | undefined : undefined;
    const program = readProgram(brand.brandId, (await tx.get(db.collection(COLLECTIONS.programs).doc(brand.brandId))).data());
    recordIp();
    if (!link || link.brandId !== brand.brandId || link.usedAt) return { error: 'link_invalid' };
    if (link.expiresAt <= now) return { error: 'link_expired' };
    if (!memberRef || !member || member.status !== 'active' || member.brandId !== brand.brandId) return { error: 'link_invalid' };
    const session = secret(), expiresAt = now + program.settings.sessionDays * DAY;
    tx.update(ref, { usedAt: now });
    tx.create(db.collection(COLLECTIONS.sessions).doc(hashKey('session', session)),
      { brandId: brand.brandId, memberId: memberRef.id, epoch: member.sessionEpoch, createdAt: now, expiresAt, revokedAt: null });
    return { session, expiresAt };
  });
  if ('error' in outcome) throw new LoyaltyError(outcome.error!, 410);
  return outcome as { session: string; expiresAt: number };
}

export type MemberSession = { sessionId: string; memberId: string; member: MemberDoc };

// Every portal request revalidates the session: expiry, revocation, the member's
// session epoch (deletion and logout-everywhere) and the brand of the request.
export async function readSession(db: Firestore, brand: ProgramBrand, token: string | undefined, now: number): Promise<MemberSession> {
  if (!token || !tokenSchema.safeParse(token).success) throw new LoyaltyError('unauthorized', 401);
  const sessionId = hashKey('session', token);
  const session = (await db.collection(COLLECTIONS.sessions).doc(sessionId).get()).data();
  if (!session || session.brandId !== brand.brandId || session.revokedAt || session.expiresAt <= now) throw new LoyaltyError('unauthorized', 401);
  const member = (await db.collection(COLLECTIONS.members).doc(String(session.memberId)).get()).data() as MemberDoc | undefined;
  if (!member || member.status !== 'active' || member.brandId !== brand.brandId || member.sessionEpoch !== session.epoch) throw new LoyaltyError('unauthorized', 401);
  return { sessionId, memberId: String(session.memberId), member };
}

const HISTORY_TYPES = new Set<EventType>(['stamp_added', 'stamp_removed', 'reward_earned', 'reward_redeemed', 'redemption_cancelled', 'stamps_expired', 'reward_expired']);

// The customer's own card. Staff identities and reasons are never included.
export async function memberView(db: Firestore, brand: ProgramBrand, session: MemberSession, now: number) {
  const { member, memberId } = session;
  const [programSnap, cardSnap, rewards, events, ctx, customerSnap] = await Promise.all([
    db.collection(COLLECTIONS.programs).doc(brand.brandId).get(),
    member.currentCardId ? db.collection(COLLECTIONS.cards).doc(member.currentCardId).get() : Promise.resolve(null),
    db.collection(COLLECTIONS.rewards).where('memberId', '==', memberId).where('status', '==', 'available').get(),
    db.collection(COLLECTIONS.events).where('memberId', '==', memberId).orderBy('createdAt', 'desc').limit(100).get(),
    loadTextContext(db, brand.brandId),
    db.collection('customers').doc(member.customerId).get(),
  ]);
  const program = readProgram(brand.brandId, programSnap.data()), texts = portalTexts(program, ctx);
  const card = cardSnap?.data() as CardDoc | undefined;
  const live = card && card.brandId === brand.brandId && card.status === 'active' && !cardIsExpired(card, now) ? card : null;
  return {
    program: { name: program.settings.name, active: program.settings.active, rewardDescription: program.settings.rewardDescription, terms: texts.ready ? texts.texts.terms : '' },
    member: { name: member.name, email: member.normalizedEmail, joinedAt: member.joinedAt },
    profile: profileFromCustomer(customerSnap.data()?.brandId === brand.brandId && customerHasEmail(customerSnap.data()!, member.normalizedEmail) ? customerSnap.data() : undefined),
    card: { stamps: live?.stamps ?? 0, stampsRequired: live?.stampsRequired ?? program.settings.stampsRequired, expiresAt: live?.expiresAt ?? null,
      rewardDescription: live?.rewardDescription ?? program.settings.rewardDescription },
    rewards: rewards.docs.map(doc => ({ id: doc.id, ...(doc.data() as RewardDoc) }))
      .filter(r => r.brandId === brand.brandId && r.expiresAt > now).sort((a, b) => a.expiresAt - b.expiresAt)
      .map(r => ({ id: r.id, description: r.description, expiresAt: r.expiresAt })),
    history: events.docs.map(doc => doc.data() as LoyaltyEvent).filter(e => e.brandId === brand.brandId && HISTORY_TYPES.has(e.type))
      .map(e => ({ type: e.type, quantity: e.quantity, channel: e.channel, createdAt: e.createdAt })),
    newsletter: { subscribed: member.consent.status === 'given', consentVersion: texts.consentVersion },
  };
}

export async function memberQrToken(db: Firestore, brand: ProgramBrand, session: MemberSession, now: number) {
  await db.runTransaction(async tx => (await limit(tx, db, 'qr', session.memberId, LIMITS.qrPerMember, 60_000, now))());
  return issueQrToken(db, brand.brandId, session.memberId, now);
}

// Unsubscribing keeps the membership, stamps and rewards; both directions sync to Omnisend.
export async function setNewsletterConsent(db: Firestore, brand: ProgramBrand, session: MemberSession, input: z.infer<typeof consentSchema>, now: number) {
  return db.runTransaction(async tx => {
    const memberRef = db.collection(COLLECTIONS.members).doc(session.memberId);
    const member = (await tx.get(memberRef)).data() as MemberDoc | undefined;
    if (!member || member.status !== 'active' || member.brandId !== brand.brandId) throw new LoyaltyError('unauthorized', 401);
    const target = input.subscribed ? 'given' : 'withdrawn';
    if (member.consent.status === target) return { subscribed: input.subscribed };
    const program = readProgram(brand.brandId, (await tx.get(db.collection(COLLECTIONS.programs).doc(brand.brandId))).data());
    const texts = portalTexts(program, await loadTextContext(db, brand.brandId, tx)), version = texts.consentVersion;
    if (input.subscribed && !texts.ready) throw new LoyaltyError('program_inactive', 409);
    if (input.subscribed && input.consentVersion !== version) throw new LoyaltyError('program_changed', 409);
    const customer = await tx.get(db.collection('customers').doc(member.customerId));
    if (!customer.exists || customer.data()?.brandId !== brand.brandId) throw new LoyaltyError('customer_conflict', 409);
    const requestId = `portal:${session.memberId}:${now}`;
    const consent = await stageExplicitConsent(tx, db, { brandId: brand.brandId, customerId: member.customerId, email: member.normalizedEmail, source: 'loyalty',
      action: input.subscribed ? 'subscribe' : 'unsubscribe', requestId, capturedAt: now, version, wording: input.subscribed ? texts.consentWording : '',
      primaryEmail: primaryEmailOf(customer.data()!) === member.normalizedEmail });
    consent.apply();
    tx.update(memberRef, { consent: { status: target, at: now, source: 'portal', eventId: consent.id, version } });
    tx.create(db.collection(COLLECTIONS.events).doc(hashKey(target === 'given' ? 'consent-given' : 'consent-withdrawn', session.memberId, consent.id)),
      loyaltyEvent(member, session.memberId, now, target === 'given' ? 'consent_given' : 'consent_withdrawn', { channel: 'email', reason: version }));
    return { subscribed: input.subscribed };
  });
}

// Deletes the membership and its personal data. The log is kept, pseudonymized:
// events reference only the random member ID, whose document no longer holds
// any personal data or customer link. The Orderfly customer and Omnisend contact remain.
export async function deleteMembership(db: Firestore, brand: ProgramBrand, session: MemberSession, now: number) {
  return db.runTransaction(async tx => {
    const memberRef = db.collection(COLLECTIONS.members).doc(session.memberId);
    const member = (await tx.get(memberRef)).data() as MemberDoc | undefined;
    if (!member || member.status !== 'active' || member.brandId !== brand.brandId) throw new LoyaltyError('unauthorized', 401);
    const rewards = await tx.get(db.collection(COLLECTIONS.rewards).where('memberId', '==', session.memberId).where('status', '==', 'available'));
    const mails = await tx.get(db.collection(COLLECTIONS.mailOutbox).where('memberId', '==', session.memberId));
    const cardRef = member.currentCardId ? db.collection(COLLECTIONS.cards).doc(member.currentCardId) : null;
    const card = cardRef ? (await tx.get(cardRef)).data() as CardDoc | undefined : undefined;
    for (const reward of rewards.docs) if (reward.data().brandId === brand.brandId) tx.update(reward.ref, { status: 'cancelled' });
    if (cardRef && card?.status === 'active') tx.update(cardRef, { status: 'expired' });
    // Waiting login mails are cancelled and every mail job loses the member's name, address and link.
    for (const mail of mails.docs) if (mail.data().brandId === brand.brandId)
      tx.update(mail.ref, { email: null, name: null, loginUrl: null, nextAttemptAt: Number.MAX_SAFE_INTEGER, updatedAt: now,
        ...(['pending', 'failed'].includes(mail.data().state) ? { state: 'cancelled' } : {}) });
    tx.delete(db.collection(COLLECTIONS.identities).doc(memberIdentityKey(brand.brandId, member.normalizedEmail)));
    tx.set(memberRef, { companyId: member.companyId, brandId: member.brandId, status: 'deleted', joinedAt: member.joinedAt, deletedAt: now,
      sessionEpoch: member.sessionEpoch + 1, currentCardId: null });
    tx.create(db.collection(COLLECTIONS.events).doc(hashKey('deleted', session.memberId)), loyaltyEvent(member, session.memberId, now, 'member_deleted'));
    return { deleted: true };
  });
}

export async function logout(db: Firestore, session: MemberSession, now: number) {
  await db.collection(COLLECTIONS.sessions).doc(session.sessionId).update({ revokedAt: now });
  return { ok: true };
}
