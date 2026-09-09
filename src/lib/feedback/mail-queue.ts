import 'server-only';
import { randomUUID } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import { feedbackAutomation, feedbackMailConfig } from './mail-config';
import { completedFeedbackOrder, feedbackSourceKey } from './order-invitations';
import { readActiveQuestionsForBrand } from './question-store';

export type FeedbackMailKind = 'invitation' | 'reminder' | 'thankYou';
export type FeedbackMailSource = { brandId: string; locationId: string; customerId: string; sourceId: string; sourceType: 'commerce_order' | 'booking'; invitationId: string; invitationToken?: string };
export function pendingFeedbackMessage(source: FeedbackMailSource, kind: FeedbackMailKind, dueAt: number) {
  const { brandId, locationId, customerId, sourceId, sourceType, invitationId, invitationToken } = source;
  return { brandId, locationId, customerId, sourceId, sourceType, invitationId, ...(invitationToken ? { invitationToken } : {}), kind, state: 'pending', eventId: randomUUID(), nextAttemptAt: dueAt, attempts: 0, createdAt: Date.now(), updatedAt: Date.now() };
}
export async function enqueueFeedbackMessage(source: FeedbackMailSource, kind: FeedbackMailKind, dueAt: number) {
  const db = getAdminDb(), id = feedbackSourceKey(source.brandId, source.sourceType, source.sourceId) + '-' + kind;
  const ref = db.collection('feedbackMailJobs').doc(id);
  await db.runTransaction(async tx => {
    const existing = await tx.get(ref); if (existing.exists) return;
    tx.create(ref, pendingFeedbackMessage(source, kind, dueAt));
  });
  return id;
}

export async function queueOrderFeedback(orderId: string, automatic = false) {
  if (!/^[\w-]{1,160}$/.test(orderId)) throw new Error('Ugyldig ordre.');
  const db = getAdminDb(), order = (await db.collection('orders').doc(orderId).get()).data();
  if (!order || !completedFeedbackOrder(order) || !/^[\w-]{1,160}$/.test(order.brandId || '') || !/^[\w-]{1,160}$/.test(order.locationId || '')) throw new Error('Feedback kan først sendes for en gennemført og betalt ordre.');
  const settings = feedbackAutomation((await db.collection('feedbackSettings').doc(order.brandId).get()).data());
  if (!settings.emailEnabled || (automatic && !settings.automaticRequests)) return null;
  if (!feedbackMailConfig(order.brandId)) throw new Error('Feedbackmail er ikke konfigureret for brandet.');
  const customerId = order.customerDetails?.id;
  if (typeof customerId !== 'string' || !/^[\w-]{1,160}$/.test(customerId)) throw new Error('Ordren mangler en gyldig kunde.');
  const [customer, location, questions] = await Promise.all([
    db.collection('customers').doc(customerId).get(), db.collection('locations').doc(order.locationId).get(),
    readActiveQuestionsForBrand(order.brandId, order.deliveryType === 'Delivery' ? 'delivery' : 'pickup', settings.language),
  ]);
  if (customer.data()?.brandId !== order.brandId || location.data()?.brandId !== order.brandId || !questions) throw new Error('Kontrollér kunde, lokation og aktivt spørgeskema.');
  const id = feedbackSourceKey(order.brandId, 'commerce_order', orderId), ref = db.collection('feedbackInvitations').doc(id);
  const source: FeedbackMailSource = { brandId: order.brandId, locationId: order.locationId, customerId, sourceId: orderId, sourceType: 'commerce_order', invitationId: id };
  await db.runTransaction(async tx => {
    const existing = await tx.get(ref);
    if (!existing.exists) tx.create(ref, { ...source, status: 'active', language: settings.language, createdAt: Date.now(), expiresAt: Date.now() + 30 * 86400000 });
  });
  return enqueueFeedbackMessage(source, 'invitation', Date.now() + (automatic ? settings.delayHours * 3600000 : 0));
}

export async function queueBookingFeedback(source: FeedbackMailSource, startsAt: string | null) {
  const settings = feedbackAutomation((await getAdminDb().collection('feedbackSettings').doc(source.brandId).get()).data());
  if (!settings.emailEnabled || !settings.automaticRequests || !feedbackMailConfig(source.brandId)) return null;
  if (!await readActiveQuestionsForBrand(source.brandId, 'booking', settings.language)) return null;
  const time = startsAt ? Date.parse(startsAt) : NaN;
  if (!Number.isFinite(time)) return null;
  return enqueueFeedbackMessage(source, 'invitation', Math.max(Date.now(), time + settings.delayHours * 3600000));
}
