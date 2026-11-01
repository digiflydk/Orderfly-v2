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
    const finish = async (state: string, lastError: string | null = null, defer = false) => db.runTransaction(async tx => {
      const row = (await tx.get(ref)).data(); if (row?.lease !== lease) return;
      tx.update(ref, { mailState: defer ? 'pending' : state, dueAt: defer ? now + 5 * 60000 : DULLY_NEVER, lease: null,
        lastError, updatedAt: Date.now(), ...(state === 'accepted' ? { acceptedAt: Date.now() } : {}) });
    });
    try {
      const configRef = db.collection('dullyFeedbackConfigurations').doc(source.scopeId), config = (await configRef.get()).data();
      if (!config) { await finish('failed', 'configuration_missing'); counts.failed++; continue; }
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
  return counts;
}
