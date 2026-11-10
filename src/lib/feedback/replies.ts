import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { NotificationPlatformClient, NotificationPlatformError } from '@/lib/notifications/platform';
import { assertFeedbackBrand, canEditFeedbackBrand, requireFeedbackAccess } from './access';
import { feedbackMailConfig } from './mail-config';
import { feedbackAdminNotificationConfig } from './admin-notifications';

// Feedback reply thread (#901). One thread per feedback (doc id = feedback id); messages live in
// feedbackReplyMessages. Staff replies are drafted, approved and sent by people with feedback:edit for
// the brand. The guest answers through a personal link; only a SHA-256 hash of that token is stored.
export const REPLY_TOKEN_DAYS = 90;
const DAY = 86400000, MAX_TOKENS = 5, GUEST_DAILY_LIMIT = 10;
export type ReplyMessageView = { id: string; direction: 'staff' | 'guest'; state: string; body: string; at: number; author: string | null; origin: 'staff' | 'assistant' | 'guest' };
export type ReplyThreadView = { status: 'open' | 'closed' | 'none'; canReply: boolean; reason: string | null; recipient: string | null; messages: ReplyMessageView[]; draft: ReplyMessageView | null };

const bodySchema = z.string().trim().min(1, 'Skriv et svar.').max(5000, 'Svaret må højst være 5000 tegn.');
const idSchema = z.string().regex(/^[\w-]{1,160}$/);
export const tokenHash = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex');
const hex = () => randomBytes(32).toString('hex');
const email = (value: unknown) => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? value.trim().toLowerCase() : null;

async function staffScope(feedbackId: string, edit: boolean) {
  const access = await requireFeedbackAccess(edit ? 'feedback:edit' : 'feedback:view');
  const id = idSchema.parse(feedbackId), db = getAdminDb();
  const feedback = (await db.collection('feedback').doc(id).get()).data();
  if (!feedback) throw new Error('Feedback findes ikke længere.');
  assertFeedbackBrand(access, feedback.brandId);
  if (edit && !canEditFeedbackBrand(access, feedback.brandId)) throw new Error('Du har ikke redigeringsadgang.');
  return { access, db, id, feedback };
}

/** Server-side recipient: never taken from the client. Dine-in feedback is anonymous and cannot be answered. */
async function recipientFor(db: FirebaseFirestore.Firestore, feedback: Record<string, any>) {
  if (feedback.sourceType === 'dine_in') return { email: null, name: null, reason: 'Feedback fra spisende gæster er anonym og kan ikke besvares.' };
  if (feedback.sourceType === 'dully_order') {
    const source = (await db.collection('dullyFeedbackSources').doc(String(feedback.sourceId || feedback.customerId || '')).get()).data();
    if (!source || source.brandId !== feedback.brandId || source.isTest) return { email: null, name: null, reason: 'Dully-ordren findes ikke længere.' };
    return { email: email(source.email), name: typeof source.customerName === 'string' ? source.customerName : null, reason: email(source.email) ? null : 'Dully-ordren har ingen gyldig e-mail.' };
  }
  const customer = typeof feedback.customerId === 'string' && /^[\w-]{1,160}$/.test(feedback.customerId) ? (await db.collection('customers').doc(feedback.customerId).get()).data() : undefined;
  if (!customer || customer.brandId !== feedback.brandId) return { email: null, name: null, reason: 'Kunden findes ikke længere.' };
  return { email: email(customer.email), name: typeof customer.fullName === 'string' ? customer.fullName : null, reason: email(customer.email) ? null : 'Kunden har ingen gyldig e-mail.' };
}
const firstName = (name: string | null) => {
  const first = (name || '').trim().split(/\s+/)[0] || '';
  return first && !/^(ikke|ukendt|unknown|dully-kunde)$/i.test(first) ? first.slice(0, 100) : undefined;
};
const maskEmail = (value: string) => value.replace(/^(.)[^@]*(@.*)$/, '$1•••$2');

function view(doc: Record<string, any>): ReplyMessageView {
  return { id: String(doc.id), direction: doc.direction === 'guest' ? 'guest' : 'staff', state: String(doc.state), body: String(doc.body || ''),
    at: Number(doc.sentAt || doc.receivedAt || doc.updatedAt || doc.createdAt) || 0, author: typeof doc.authorName === 'string' ? doc.authorName : null,
    origin: doc.direction === 'guest' ? 'guest' : doc.origin === 'assistant' ? 'assistant' : 'staff' };
}
async function messagesFor(db: FirebaseFirestore.Firestore, feedbackId: string, brandId: string) {
  // Sorted in memory: one equality filter needs no composite index.
  const docs = (await db.collection('feedbackReplyMessages').where('feedbackId', '==', feedbackId).get()).docs.map(d => ({ ...d.data(), id: d.id }) as Record<string, any>);
  // Order by when a message was actually sent or received, not when a draft was first created.
  const at = (d: Record<string, any>) => Number(d.sentAt || d.receivedAt || d.updatedAt || d.createdAt) || 0;
  return docs.filter(d => d.brandId === brandId).sort((a, b) => at(a) - at(b));
}

export async function getReplyThread(feedbackId: string): Promise<ReplyThreadView> {
  const s = await staffScope(feedbackId, false);
  const [thread, messages, recipient] = await Promise.all([s.db.collection('feedbackReplyThreads').doc(s.id).get(), messagesFor(s.db, s.id, s.feedback.brandId), recipientFor(s.db, s.feedback)]);
  const draft = messages.filter(m => m.state === 'draft').at(-1);
  return { status: thread.exists ? (thread.data()?.status === 'closed' ? 'closed' : 'open') : 'none', canReply: !!recipient.email, reason: recipient.reason,
    recipient: recipient.email ? maskEmail(recipient.email) : null, messages: messages.filter(m => m.state !== 'draft').map(view), draft: draft ? view(draft) : null };
}

/** One current draft per thread. origin 'assistant' only labels a draft written by Claude; a person must still approve it. */
export async function saveReplyDraft(input: { feedbackId: string; body: string; origin?: 'staff' | 'assistant' }) {
  const s = await staffScope(input.feedbackId, true), body = bodySchema.parse(input.body), now = Date.now();
  const existing = (await messagesFor(s.db, s.id, s.feedback.brandId)).filter(m => m.state === 'draft').at(-1);
  const ref = existing ? s.db.collection('feedbackReplyMessages').doc(existing.id) : s.db.collection('feedbackReplyMessages').doc(hex());
  await ref.set({ ...(existing || { feedbackId: s.id, brandId: s.feedback.brandId, locationId: s.feedback.locationId || null, customerId: s.feedback.customerId || null, direction: 'staff', createdAt: now }),
    id: ref.id, state: 'draft', body, origin: input.origin === 'assistant' ? 'assistant' : 'staff', draftedBy: s.access.uid, updatedAt: now });
  return { ok: true as const, id: ref.id };
}

export async function discardReplyDraft(feedbackId: string) {
  const s = await staffScope(feedbackId, true);
  for (const m of (await messagesFor(s.db, s.id, s.feedback.brandId)).filter(m => m.state === 'draft')) await s.db.collection('feedbackReplyMessages').doc(m.id).delete();
  return { ok: true as const };
}

/** Approve and send now. The text sent is exactly the text the approver saw; the recipient is resolved on the server. */
export async function approveAndSendReply(input: { feedbackId: string; body: string }, request: typeof fetch = fetch) {
  const s = await staffScope(input.feedbackId, true), body = bodySchema.parse(input.body), now = Date.now();
  const recipient = await recipientFor(s.db, s.feedback);
  if (!recipient.email) throw new Error(recipient.reason || 'Kunden kan ikke kontaktes.');
  const mail = feedbackMailConfig(s.feedback.brandId);
  if (!mail) throw new Error('Mail er ikke konfigureret for brandet.');
  const brand = (await s.db.collection('brands').doc(s.feedback.brandId).get()).data();
  const threadRef = s.db.collection('feedbackReplyThreads').doc(s.id);
  const draft = (await messagesFor(s.db, s.id, s.feedback.brandId)).filter(m => m.state === 'draft').at(-1);
  const messageRef = s.db.collection('feedbackReplyMessages').doc(draft?.id || hex());
  const token = hex(), expiresAt = now + REPLY_TOKEN_DAYS * DAY;
  // Status check and token append in one transaction: concurrent sends keep each other's links, and a
  // concurrent close is never undone by an in-flight send.
  await s.db.runTransaction(async tx => {
    const thread = (await tx.get(threadRef)).data();
    if (thread?.status === 'closed') throw new Error('Samtalen er lukket. Genåbn den for at svare.');
    const tokens = [...(Array.isArray(thread?.tokens) ? thread!.tokens : []), { hash: tokenHash(token), expiresAt }].filter(t => t.expiresAt > now).slice(-MAX_TOKENS);
    tx.set(threadRef, { ...(thread || {}), feedbackId: s.id, brandId: s.feedback.brandId, locationId: s.feedback.locationId || null, customerId: s.feedback.customerId || null,
      status: 'open', tokens, tokenHashes: tokens.map(t => t.hash), createdAt: thread?.createdAt || now, updatedAt: now, lastMessageAt: now });
  });
  await messageRef.set({ id: messageRef.id, feedbackId: s.id, brandId: s.feedback.brandId, locationId: s.feedback.locationId || null, customerId: s.feedback.customerId || null,
    direction: 'staff', body, origin: draft?.origin === 'assistant' ? 'assistant' : 'staff', draftedBy: draft?.draftedBy || s.access.uid,
    approvedBy: s.access.uid, state: 'sending', createdAt: draft?.createdAt || now, updatedAt: now });
  const name = firstName(recipient.name);
  try {
    await new NotificationPlatformClient(mail.platform, request).send({
      idempotencyKey: `feedback-reply:${messageRef.id}`, templateKey: 'orderfly.feedback.reply', locale: 'da',
      recipientEmail: recipient.email, ...(name ? { recipientName: name } : {}), relatedEntity: { type: 'feedback_reply', id: messageRef.id },
      variables: { brand_id: s.feedback.brandId, brand_name: String(brand?.name || 'Orderfly').slice(0, 200), ...(name ? { name } : {}), message: body,
        reply_url: `https://orderfly.dk/feedback/reply#token=${token}` },
    });
    await messageRef.update({ state: 'sent', sentAt: Date.now(), updatedAt: Date.now() });
    return { ok: true as const, state: 'sent' as const };
  } catch (error) {
    const uncertain = error instanceof NotificationPlatformError ? error.uncertain : true;
    // An uncertain result is never retried automatically: the guest may already have the mail.
    await messageRef.update({ state: uncertain ? 'uncertain' : 'failed', error: error instanceof NotificationPlatformError ? error.code : 'send_failed', updatedAt: Date.now() });
    throw new Error(uncertain ? 'Afsendelsen er uafklaret. Tjek mailplatformen, før du sender igen.' : 'Svaret kunne ikke sendes. Prøv igen.');
  }
}

export async function setReplyThreadStatus(feedbackId: string, status: 'open' | 'closed') {
  const s = await staffScope(feedbackId, true), ref = s.db.collection('feedbackReplyThreads').doc(s.id);
  await s.db.runTransaction(async tx => {
    if (!(await tx.get(ref)).exists) throw new Error('Der er ingen samtale endnu.');
    // Closing revokes every guest link at once.
    tx.update(ref, { status, updatedAt: Date.now(), ...(status === 'closed' ? { tokens: [], tokenHashes: [], closedBy: s.access.uid } : {}) });
  });
  return { ok: true as const };
}

// ---- Guest side: authorised only by the personal token. ----
const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
async function guestThread(token: string, now: number) {
  const hash = tokenHash(tokenSchema.parse(token)), db = getAdminDb();
  const docs = (await db.collection('feedbackReplyThreads').where('tokenHashes', 'array-contains', hash).limit(2).get()).docs;
  const thread = docs.length === 1 ? docs[0] : null, data = thread?.data();
  const valid = data && data.status === 'open' && Array.isArray(data.tokens) && data.tokens.some((t: any) => t.hash === hash && t.expiresAt > now);
  return valid ? { db, ref: thread!.ref, data: data! } : null;
}

export async function loadGuestThread(token: string, now = Date.now()) {
  const t = await guestThread(token, now).catch(() => null);
  if (!t) return null;
  const brand = (await t.db.collection('brands').doc(t.data.brandId).get()).data();
  const messages = (await messagesFor(t.db, t.data.feedbackId, t.data.brandId)).filter(m => m.direction === 'guest' || m.state === 'sent');
  // The guest sees only the conversation text, never staff names or internal state.
  return { brandName: String(brand?.name || ''), messages: messages.map(m => ({ direction: m.direction === 'guest' ? 'guest' as const : 'staff' as const, body: String(m.body), at: Number(m.sentAt || m.receivedAt || m.createdAt) || 0 })) };
}

export async function submitGuestReply(input: { token: string; body: string }, request: typeof fetch = fetch, now = Date.now()) {
  const body = z.string().trim().min(1, 'Skriv en besked.').max(2000, 'Beskeden må højst være 2000 tegn.').parse(input.body);
  const t = await guestThread(input.token, now).catch(() => null);
  if (!t) throw new Error('Linket er udløbet eller samtalen er lukket.');
  const ref = t.db.collection('feedbackReplyMessages').doc(hex()), hash = tokenHash(input.token);
  // Allowance, validity and the message itself commit together, so concurrent submissions cannot exceed the limit.
  await t.db.runTransaction(async tx => {
    const current = (await tx.get(t.ref)).data();
    if (!current || current.status !== 'open' || !Array.isArray(current.tokens) || !current.tokens.some((x: any) => x.hash === hash && x.expiresAt > now))
      throw new Error('Linket er udløbet eller samtalen er lukket.');
    const recent = (Array.isArray(current.guestMessageTimes) ? current.guestMessageTimes : []).filter((at: number) => at > now - DAY);
    if (recent.length >= GUEST_DAILY_LIMIT) throw new Error('Du har sendt mange beskeder i dag. Prøv igen i morgen.');
    tx.create(ref, { id: ref.id, feedbackId: current.feedbackId, brandId: current.brandId, locationId: current.locationId || null, customerId: current.customerId || null,
      direction: 'guest', body, state: 'received', receivedAt: now, createdAt: now, updatedAt: now });
    tx.update(t.ref, { guestMessageTimes: [...recent, now], lastMessageAt: now, lastGuestMessageAt: now, updatedAt: now });
  });
  // Best effort: the guest's message is stored even if the admin notice cannot be queued.
  const admin = feedbackAdminNotificationConfig(t.data.brandId);
  if (admin && /^[a-f0-9]{64}$/.test(t.data.feedbackId)) {
    const brand = (await t.db.collection('brands').doc(t.data.brandId).get()).data();
    await new NotificationPlatformClient(admin.platform, request).send({
      idempotencyKey: `feedback-customer-reply:${ref.id}`, templateKey: 'orderfly.feedback.customer_reply', locale: 'da', recipientEmail: admin.recipientEmail,
      relatedEntity: { type: 'feedback', id: t.data.feedbackId },
      variables: { brand_id: t.data.brandId, brand_name: String(brand?.name || 'Orderfly').slice(0, 200), feedback_id: t.data.feedbackId, admin_url: `https://orderfly.dk/superadmin/feedback/${t.data.feedbackId}` },
    }).catch(() => ref.update({ adminNotice: 'failed' }));
  }
  return { ok: true as const };
}

/** Customer page: the thread per feedback for an already-authorised customer record. */
export async function customerReplyHistory(brandId: string, feedbackIds: string[]) {
  const db = getAdminDb(), out: Record<string, ReplyMessageView[]> = {};
  for (const id of feedbackIds.filter(id => /^[\w-]{1,160}$/.test(id)).slice(0, 200)) {
    const messages = (await messagesFor(db, id, brandId)).filter(m => m.state !== 'draft');
    if (messages.length) out[id] = messages.map(view);
  }
  return out;
}
