import 'server-only';
import { randomUUID } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import { feedbackAutomation, feedbackMailConfig } from './mail-config';
import { FeedbackMailError, FeedbackMailProvider } from './mail-provider';
import { completedFeedbackOrder, feedbackSourceKey, signOrderFeedbackInvitation } from './order-invitations';
import { resolveBookingFeedbackInvitationToken } from '@/lib/integrations/esmeralda-feedback-integration';
import { pendingFeedbackMessage, type FeedbackMailKind, type FeedbackMailSource } from './mail-queue';
const never = Number.MAX_SAFE_INTEGER, leaseMs = 120000;
type Job = FeedbackMailSource & { kind: FeedbackMailKind; eventId: string; lease: string; attempts: number };
function transientReadError(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  return [4, 8, 10, 13, 14, 'deadline-exceeded', 'resource-exhausted', 'aborted', 'internal', 'unavailable', 'ETIMEDOUT', 'ECONNRESET'].includes(code as string | number);
}
function feedbackOrigin() {
  const url = new URL(process.env.ORDERFLY_FEEDBACK_ORIGIN || 'https://orderfly.dk');
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new FeedbackMailError('invalid_feedback_origin');
  return url.origin;
}
async function context(job: Job) {
  const db = getAdminDb();
  const [settingsDoc, customer, brand, location, feedback] = await Promise.all([
    db.collection('feedbackSettings').doc(job.brandId).get(), db.collection('customers').doc(job.customerId).get(),
    db.collection('brands').doc(job.brandId).get(), db.collection('locations').doc(job.locationId).get(),
    db.collection('feedback').doc(feedbackSourceKey(job.brandId, job.sourceType, job.sourceId)).get(),
  ]);
  const settings = feedbackAutomation(settingsDoc.data());
  const email = typeof customer.data()?.email === 'string' ? customer.data()!.email.trim().toLowerCase() : '';
  if (!settings.emailEnabled || customer.data()?.brandId !== job.brandId || customer.data()?.marketingConsent !== true || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || brand.data()?.status !== 'active' || location.data()?.brandId !== job.brandId || location.data()?.isActive === false) return null;
  let answered = feedback.exists;
  let url: string;
  if (job.sourceType === 'commerce_order') {
    const [order, invite, legacy] = await Promise.all([
      db.collection('orders').doc(job.sourceId).get(), db.collection('feedbackInvitations').doc(job.invitationId).get(),
      db.collection('feedback').where('brandId', '==', job.brandId).where('orderId', '==', job.sourceId).get(),
    ]);
    const data = order.data(), invitation = invite.data();
    if (!data || !completedFeedbackOrder(data) || data.brandId !== job.brandId || data.locationId !== job.locationId || data.customerDetails?.id !== job.customerId || !invitation || invitation.brandId !== job.brandId || invitation.customerId !== job.customerId || invitation.sourceId !== job.sourceId || invitation.expiresAt <= Date.now() || !['active', 'submitted'].includes(invitation.status)) return null;
    answered ||= legacy.docs.some(d => d.data().customerId === job.customerId) || invitation.status === 'submitted';
    url = feedbackOrigin() + '/feedback?orderToken=' + encodeURIComponent(signOrderFeedbackInvitation(job.invitationId, invitation.expiresAt)) + '&lang=' + encodeURIComponent(invitation.language || 'da');
  } else {
    const invitation = job.invitationToken ? await resolveBookingFeedbackInvitationToken(job.invitationToken) : null;
    if (!invitation || invitation.organization_id !== job.brandId || invitation.location_id !== job.locationId || invitation.customer_id !== job.customerId || invitation.booking_id !== job.sourceId || invitation.status === 'revoked' || !invitation.starts_at || !Number.isFinite(Date.parse(invitation.starts_at)) || Date.parse(invitation.starts_at) > Date.now()) return null;
    answered ||= invitation.status === 'submitted';
    url = feedbackOrigin() + '/feedback?token=' + encodeURIComponent(job.invitationToken!) + '&lang=' + encodeURIComponent(settings.language);
  }
  if (job.kind === 'thankYou' ? !answered || !settings.autoReplyEnabled : answered) return null;
  if (job.kind === 'reminder' && settings.maxReminders === 0) return null;
  return { email, url, settings, locationName: String(location.data()?.name || ''), brandName: String(brand.data()?.name || '') };
}

export async function runFeedbackMailWorker(makeProvider = (config: NonNullable<ReturnType<typeof feedbackMailConfig>>) => new FeedbackMailProvider(config), now = Date.now()) {
  const db = getAdminDb();
  const due = await db.collection('feedbackMailJobs').where('nextAttemptAt', '<=', now).orderBy('nextAttemptAt').limit(10).get();
  const counts = { processed: 0, accepted: 0, suppressed: 0, uncertain: 0, failed: 0 };
  const deadline = Date.now() + 45000;
  for (const doc of due.docs) {
    if (Date.now() > deadline) break;
    const ref = db.collection('feedbackMailJobs').doc(doc.id), lease = randomUUID();
    const job = await db.runTransaction(async tx => {
      const data = (await tx.get(ref)).data();
      if (!data || data.nextAttemptAt > now) return null;
      if (data.state === 'dispatching') {
        tx.update(ref, { state: 'uncertain', lease: null, nextAttemptAt: never, lastError: 'provider_result_unknown', updatedAt: now }); return 'recovered_uncertain' as const;
      }
      if (!['pending', 'preparing'].includes(data.state)) return null;
      tx.update(ref, { state: 'preparing', lease, nextAttemptAt: now + leaseMs, updatedAt: now });
      return { ...data, lease } as Job;
    });
    if (!job) continue;
    counts.processed++;
    if (job === 'recovered_uncertain') { counts.uncertain++; continue; }
    let dispatched = false;
    const finish = async (state: string, lastError: string | null = null, retry = false, reminderHours?: number) => db.runTransaction(async tx => {
      const current = (await tx.get(ref)).data(); if (current?.lease !== lease) return;
      const reminderRef = reminderHours ? db.collection('feedbackMailJobs').doc(feedbackSourceKey(job.brandId, job.sourceType, job.sourceId) + '-reminder') : null;
      const reminder = reminderRef ? await tx.get(reminderRef) : null;
      const attempts = (current.attempts || 0) + 1;
      tx.update(ref, { state: retry && attempts < 3 ? 'pending' : state, attempts, lease: null, lastError, updatedAt: Date.now(), nextAttemptAt: retry && attempts < 3 ? Date.now() + 60000 : never, ...(state === 'accepted' ? { acceptedAt: Date.now() } : {}) });
      if (reminderRef && !reminder?.exists) tx.create(reminderRef, pendingFeedbackMessage(job, 'reminder', Date.now() + reminderHours! * 3600000));
    });
    try {
      const config = feedbackMailConfig(job.brandId); if (!config) throw new FeedbackMailError('mail_configuration_required');
      const prepared = await context(job);
      if (!prepared) { await finish('suppressed', 'source_replied_or_not_eligible'); counts.suppressed++; continue; }
      const provider = makeProvider(config);
      if (!await provider.eligible(prepared.email)) { await finish('suppressed', 'email_not_subscribed'); counts.suppressed++; continue; }
      // Recheck replies, cancellation and consent after provider preflight, before dispatch.
      const current = await context(job);
      if (!current || current.email !== prepared.email) { await finish('suppressed', 'source_changed'); counts.suppressed++; continue; }
      const ownsLease = await db.runTransaction(async tx => {
        const current = (await tx.get(ref)).data();
        if (current?.lease !== lease || current.state !== 'preparing') return false;
        tx.update(ref, { state: 'dispatching', nextAttemptAt: Date.now() + leaseMs, updatedAt: Date.now() }); return true;
      });
      if (!ownsLease) continue;
      dispatched = true;
      await provider.send(job.eventId, job.kind, current.email, { feedbackUrl: job.kind === 'thankYou' ? undefined : current.url, brandName: current.brandName, locationName: current.locationName, sourceType: job.sourceType, language: current.settings.language });
      await finish('accepted', null, false, job.kind === 'invitation' && current.settings.maxReminders > 0 ? current.settings.reminderAfterHours : undefined); counts.accepted++;
    } catch (error) {
      const known = error instanceof FeedbackMailError ? error : new FeedbackMailError(dispatched ? 'provider_result_unknown' : 'provider_preflight_failed', dispatched, !dispatched && transientReadError(error));
      const state = known.uncertain ? 'uncertain' : 'failed';
      await finish(state, known.code, known.retryable); counts[state]++;
    }
  }
  return counts;
}
