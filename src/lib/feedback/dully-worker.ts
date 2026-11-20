import 'server-only';
import { randomUUID } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import { FeedbackMailError, FeedbackMailProvider } from './mail-provider';
import { feedbackMailConfig } from './mail-config';
import { dullyEligible, DULLY_NEVER, DULLY_TEST_EMAIL } from './dully-contract';
import { dullyFingerprint, signDullyInvitation, type DullySource } from './dully-source';
import { ESMERALDA_FEEDBACK_BRAND } from './esmeralda-booking-setup';
const leaseMs = 120000;
function origin() {
  const url = new URL(process.env.ORDERFLY_FEEDBACK_ORIGIN || 'https://orderfly.dk');
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid origin');
  return url.origin;
}
function eligible(source: any, config: any, fingerprint: string, now: number) {
  return source?.brandId === ESMERALDA_FEEDBACK_BRAND && config?.brandId === source.brandId && config?.locationId === source.locationId &&
    config?.scopeId === source.scopeId && dullyEligible(source, now) && source.invitationStatus === 'active' &&
    (source.isTest ? source.email === DULLY_TEST_EMAIL && source.fingerprint === fingerprint && config.testSourceId === source.id :
      config.paused === false && Boolean(config.approvedAt) && config.approvedFingerprint === fingerprint &&
      source.externalRestaurantId === config.restaurantId && source.accountId === config.accountId &&
      Number.isFinite(source.lastVerifiedAt) && now - source.lastVerifiedAt <= 24 * 3600000);
}
export async function runDullyFeedbackWorker(makeProvider = (config: NonNullable<ReturnType<typeof feedbackMailConfig>>) => new FeedbackMailProvider(config), now = Date.now()) {
  const db = getAdminDb(), deadline = Date.now() + 20000;
  const due = await db.collection('dullyFeedbackSources').where('dueAt', '<=', now).orderBy('dueAt').limit(10).get();
  const counts = { processed: 0, accepted: 0, deferred: 0, failed: 0, uncertain: 0 };
  for (const doc of due.docs) {
    if (Date.now() > deadline) break;
    const ref = db.collection('dullyFeedbackSources').doc(doc.id), lease = randomUUID();
    const source = await db.runTransaction(async tx => {
      const row = (await tx.get(ref)).data(); if (!row || row.dueAt > now) return null;
      if (row.mailState === 'dispatching') { tx.update(ref, { mailState: 'uncertain', lastError: 'provider_result_unknown', dueAt: DULLY_NEVER, lease: null, updatedAt: now }); return 'uncertain' as const; }
      if (!['pending', 'preparing'].includes(row.mailState)) return null;
      tx.update(ref, { mailState: 'preparing', lease, dueAt: now + leaseMs, updatedAt: now });
      return { ...row, id: doc.id } as DullySource;
    });
    if (!source) continue;
    counts.processed++;
    if (source === 'uncertain') { counts.uncertain++; continue; }
    let dispatched = false;
    let remind = false;
    const finish = async (state: string, lastError: string | null = null, defer = false) => db.runTransaction(async tx => {
      const row = (await tx.get(ref)).data(); if (row?.lease !== lease) return;
      const acceptedAt = Date.now();
      tx.update(ref, { mailState: defer ? 'pending' : state, dueAt: defer ? now + 5 * 60000 : DULLY_NEVER, lease: null,
        lastError, updatedAt: acceptedAt, ...(state === 'accepted' ? { acceptedAt, ...(remind && !row.reminderState ? reminderPlan(acceptedAt) : {}) } : {}) });
    });
    try {
      const configRef = db.collection('dullyFeedbackConfigurations').doc(source.scopeId), config = (await configRef.get()).data();
      if (!config) { await finish('failed', 'configuration_missing'); counts.failed++; continue; }
      remind = !source.isTest && config.reminderEnabled === true;
      const prepared = await dullyFingerprint(source.brandId, source.locationId, config as any);
      const [brand, location] = await Promise.all([db.collection('brands').doc(source.brandId).get(), db.collection('locations').doc(source.locationId).get()]);
      if ((!source.isTest && !prepared.emailEnabled) || !eligible(source, config, prepared.fingerprint, now) || brand.data()?.status !== 'active' || location.data()?.brandId !== source.brandId || location.data()?.isActive === false) {
        await finish('pending', 'paused_unapproved_changed_or_stale', true); counts.deferred++; continue;
      }
      const mail = feedbackMailConfig(source.brandId); if (!mail) throw new FeedbackMailError('mail_configuration_required');
      const provider = makeProvider(mail);
      if (!await provider.eligible(source.email)) { await finish('failed', 'recipient_ineligible'); counts.failed++; continue; }
      const rechecked = await dullyFingerprint(source.brandId, source.locationId, config as any);
      const expiresAt = source.expiresAt > now ? source.expiresAt : now + 30 * 86400000;
      const owns = await db.runTransaction(async tx => {
        const [current, currentConfig, currentBrand, currentLocation] = await Promise.all([
          tx.get(ref), tx.get(configRef), tx.get(db.collection('brands').doc(source.brandId)), tx.get(db.collection('locations').doc(source.locationId)),
        ]);
        const row = current.data(), settings = currentConfig.data();
        const finalFingerprint = settings ? await dullyFingerprint(source.brandId, source.locationId, settings as any, tx) : null;
        const approvedTest = !source.isTest && settings?.approvedTestSourceId ? (await tx.get(db.collection('dullyFeedbackSources').doc(settings.approvedTestSourceId))).data() : null;
        if (row?.lease !== lease || row.mailState !== 'preparing' || row.email !== source.email || (!source.isTest && finalFingerprint?.emailEnabled !== true) || rechecked.fingerprint !== prepared.fingerprint || finalFingerprint?.fingerprint !== prepared.fingerprint ||
          !eligible(row, settings, prepared.fingerprint, now) || currentBrand.data()?.status !== 'active' || currentLocation.data()?.brandId !== source.brandId || currentLocation.data()?.isActive === false ||
          (!source.isTest && (!approvedTest?.isTest || approvedTest.scopeId !== source.scopeId || approvedTest.mailState !== 'accepted' || approvedTest.fingerprint !== prepared.fingerprint))) return false;
        tx.update(ref, { mailState: 'dispatching', dueAt: now + leaseMs, language: prepared.language, fingerprint: prepared.fingerprint, expiresAt, attempts: Number(row.attempts || 0) + 1, updatedAt: now });
        return true;
      });
      if (!owns) { await finish('pending', 'source_changed', true); counts.deferred++; continue; }
      const feedbackUrl = origin() + '/feedback?dullyToken=' + encodeURIComponent(signDullyInvitation(source.id, expiresAt)) + '&lang=' + encodeURIComponent(prepared.language);
      dispatched = true;
      await provider.send(source.eventId, 'invitation', source.email, { feedbackUrl, brandName: String(brand.data()?.name || ''), locationName: String(location.data()?.name || ''), sourceType: 'dully_order', sourceId: source.id, language: prepared.language });
      await finish('accepted'); counts.accepted++;
    } catch (error) {
      const known = error instanceof FeedbackMailError ? error : new FeedbackMailError(dispatched ? 'provider_result_unknown' : 'preflight_failed', dispatched);
      // Preflight failures did not contact the provider. Defer them so configuration/read recovery does not lose orders.
      if (!dispatched || (known.retryable && !known.uncertain && Number(source.attempts || 0) < 2)) {
        await finish('pending', known.code, true); counts.deferred++;
      } else {
        const state = known.uncertain ? 'uncertain' : 'failed';
        await finish(state, known.code); counts[state]++;
      }
    }
  }
  const reminders = Date.now() <= deadline ? await runDullyReminders(makeProvider, now, deadline) : null;
  return { ...counts, ...(reminders || {}) };
}

// One reminder per order (#931), 24 h after the invitation was accepted, with the invitation's own link.
export const DULLY_REMINDER_DELAY_MS = 24 * 3600000;
// A reminder held back (pause, stale import) more than two days after its slot is no longer useful.
const REMINDER_LATEST_MS = 48 * 3600000;
export function reminderPlan(acceptedAt: number, now = acceptedAt, delay = DULLY_REMINDER_DELAY_MS) {
  const due = Math.max(now, acceptedAt + delay);
  return { reminderState: 'pending', reminderDueAt: due, reminderPlannedFor: due, reminderEventId: randomUUID(), reminderAttempts: 0, reminderLastError: null };
}
async function runDullyReminders(makeProvider: (config: NonNullable<ReturnType<typeof feedbackMailConfig>>) => FeedbackMailProvider, now: number, deadline: number) {
  const db = getAdminDb();
  const due = await db.collection('dullyFeedbackSources').where('reminderDueAt', '<=', now).orderBy('reminderDueAt').limit(10).get();
  const counts = { remindersAccepted: 0, remindersSkipped: 0, remindersDeferred: 0, remindersFailed: 0, remindersUncertain: 0 };
  for (const doc of due.docs) {
    if (Date.now() > deadline) break;
    const ref = db.collection('dullyFeedbackSources').doc(doc.id), lease = randomUUID();
    const source = await db.runTransaction(async tx => {
      const row = (await tx.get(ref)).data(); if (!row || !(row.reminderDueAt <= now)) return null;
      if (row.reminderState === 'dispatching') { tx.update(ref, { reminderState: 'uncertain', reminderLastError: 'provider_result_unknown', reminderDueAt: DULLY_NEVER, reminderLease: null, updatedAt: now }); return 'uncertain' as const; }
      if (!['pending', 'preparing'].includes(row.reminderState)) { tx.update(ref, { reminderDueAt: DULLY_NEVER }); return null; }
      tx.update(ref, { reminderState: 'preparing', reminderLease: lease, reminderDueAt: now + leaseMs, updatedAt: now });
      return { ...row, id: doc.id } as DullySource & Record<string, any>;
    });
    if (!source) continue;
    if (source === 'uncertain') { counts.remindersUncertain++; continue; }
    let dispatched = false;
    const finish = async (state: string, lastError: string | null = null, deferMs = 0) => db.runTransaction(async tx => {
      const row = (await tx.get(ref)).data(); if (row?.reminderLease !== lease) return;
      tx.update(ref, { reminderState: deferMs ? 'pending' : state, reminderDueAt: deferMs ? now + deferMs : DULLY_NEVER, reminderLease: null,
        reminderLastError: lastError, updatedAt: Date.now(), ...(state === 'accepted' ? { reminderAcceptedAt: Date.now() } : {}) });
    });
    // Final reasons never send: the order was answered, the link expired, reminders were switched off or the slot is long past.
    const skip = (source: any, config: any) => source.invitationStatus === 'submitted' ? 'answered' : source.mailState !== 'accepted' ? 'invitation_not_accepted'
      : !(source.expiresAt > now) ? 'link_expired' : !source.isTest && config?.reminderEnabled !== true ? 'reminders_disabled'
      : !source.isTest && !(now - Number(source.reminderPlannedFor) <= REMINDER_LATEST_MS) ? 'too_late' : null;
    try {
      const configRef = db.collection('dullyFeedbackConfigurations').doc(source.scopeId), config = (await configRef.get()).data();
      const reason = config ? skip(source, config) : 'configuration_missing';
      if (reason) { await finish('skipped', reason); counts.remindersSkipped++; continue; }
      const prepared = await dullyFingerprint(source.brandId, source.locationId, config as any);
      const [brand, location] = await Promise.all([db.collection('brands').doc(source.brandId).get(), db.collection('locations').doc(source.locationId).get()]);
      const approved = (row: any, settings: any, fingerprint: string) => row.isTest ? settings?.approvedTestSourceId === row.id : settings?.reminderApprovedFingerprint === fingerprint;
      if ((!source.isTest && !prepared.emailEnabled) || !eligible(source, config, prepared.fingerprint, now) || !approved(source, config, prepared.fingerprint) || brand.data()?.status !== 'active' || location.data()?.brandId !== source.brandId || location.data()?.isActive === false) {
        await finish('pending', 'paused_unapproved_changed_or_stale', 3600000); counts.remindersDeferred++; continue;
      }
      const mail = feedbackMailConfig(source.brandId); if (!mail) throw new FeedbackMailError('mail_configuration_required');
      const provider = makeProvider(mail);
      if (!await provider.eligible(source.email)) { await finish('failed', 'recipient_ineligible'); counts.remindersFailed++; continue; }
      const owns = await db.runTransaction(async tx => {
        const [current, currentConfig] = await Promise.all([tx.get(ref), tx.get(configRef)]);
        const row = current.data(), settings = currentConfig.data();
        const finalFingerprint = settings ? await dullyFingerprint(source.brandId, source.locationId, settings as any, tx) : null;
        if (!row || row.reminderLease !== lease || row.reminderState !== 'preparing' || row.email !== source.email || row.reminderEventId !== source.reminderEventId || skip(row, settings) ||
          finalFingerprint?.fingerprint !== prepared.fingerprint || (!source.isTest && finalFingerprint?.emailEnabled !== true) || !eligible(row, settings, prepared.fingerprint, now) || !approved({ ...row, id: source.id }, settings, prepared.fingerprint)) return false;
        tx.update(ref, { reminderState: 'dispatching', reminderDueAt: now + leaseMs, reminderAttempts: Number(row.reminderAttempts || 0) + 1, updatedAt: now });
        return true;
      });
      if (!owns) { await finish('pending', 'source_changed', 5 * 60000); counts.remindersDeferred++; continue; }
      const feedbackUrl = origin() + '/feedback?dullyToken=' + encodeURIComponent(signDullyInvitation(source.id, source.expiresAt)) + '&lang=' + encodeURIComponent(source.language || prepared.language);
      dispatched = true;
      await provider.send(source.reminderEventId, 'reminder', source.email, { feedbackUrl, brandName: String(brand.data()?.name || ''), locationName: String(location.data()?.name || ''), sourceType: 'dully_order', sourceId: source.id, language: source.language || prepared.language });
      await finish('accepted'); counts.remindersAccepted++;
    } catch (error) {
      const known = error instanceof FeedbackMailError ? error : new FeedbackMailError(dispatched ? 'provider_result_unknown' : 'preflight_failed', dispatched);
      if (!dispatched || (known.retryable && !known.uncertain && Number(source.reminderAttempts || 0) < 2)) { await finish('pending', known.code, 5 * 60000); counts.remindersDeferred++; }
      else if (known.uncertain) { await finish('uncertain', known.code); counts.remindersUncertain++; }
      else { await finish('failed', known.code); counts.remindersFailed++; }
    }
  }
  return counts;
}
