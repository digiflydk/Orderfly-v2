import 'server-only';
import { randomUUID } from 'node:crypto';
import type { Firestore, DocumentReference } from 'firebase-admin/firestore';
import { emailChannel, retryDelay, type ConsentEvent, type SyncState } from './consent';
import { marketingConfig, marketingConfigurationStatus } from './config';
import { MarketingError, Omnisend } from './provider';
const NEVER = Number.MAX_SAFE_INTEGER, LEASE = 120000;
async function lease(db: Firestore, ref: DocumentReference, now: number) {
    const token = randomUUID();
    return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref), job = snap.data();
        if (!job || job.nextAttemptAt > now || !['pending', 'failed'].includes(job.state))
            return null;
        tx.update(ref, { lease: token, nextAttemptAt: now + LEASE, updatedAt: now });
        return { ...job, lease: token } as {
            brandId: string;
            customerId: string;
            eventId: string;
            contactKey: string;
            lease: string;
        };
    });
}
async function complete(db: Firestore, ref: DocumentReference, token: string, state: SyncState, now: number, error?: string, retryable = true) {
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref), job = snap.data();
        if (!job || job.lease !== token)
            return;
        const stateRef = db.collection('marketingContacts').doc(job.contactKey), contact = await tx.get(stateRef);
        const customerRef = db.collection('customers').doc(job.customerId), customer = await tx.get(customerRef);
        const attempts = (job.attempts || 0) + 1;
        tx.update(ref, { state, attempts, lease: null, lastError: error || null, updatedAt: now,
            nextAttemptAt: state === 'failed' && retryable && attempts < 8 ? now + retryDelay(attempts) : NEVER });
        if (contact.data()?.latestEventId === job.eventId) {
            tx.set(stateRef, { state, updatedAt: now, nextReconcileAt: state === 'synced' ? now + 3600000 : NEVER }, { merge: true });
            if (state === 'suppressed' && customer.exists && customer.data()?.brandId === job.brandId)
                tx.update(customerRef, { marketingConsent: false });
        }
    });
}
async function deferMissingConfiguration(db: Firestore, ref: DocumentReference, token: string, now: number, reason: string) {
    await db.runTransaction(async tx => {
        const current = await tx.get(ref);
        if (current.data()?.lease !== token) return;
        // No provider request was attempted. Keep the consent eligible for the
        // configured worker after the server-side brand mapping is restored.
        tx.update(ref, { state: 'pending', lease: null, lastError: reason,
            nextAttemptAt: now + 3600000, updatedAt: now });
    });
}
export async function runMarketingWorker(db: Firestore, now = Date.now(), makeProvider = (config: NonNullable<ReturnType<typeof marketingConfig>>) => new Omnisend(config), requestDeadline = Date.now() + 60000) {
    const deadline = Math.min(Date.now() + 45000, requestDeadline - 20000);
    const jobs = await db.collection('marketingOutbox').where('nextAttemptAt', '<=', now).orderBy('nextAttemptAt').limit(10).get();
    const counts = { processed: 0, synced: 0, failed: 0, suppressed: 0, reconciled: 0, waitingConfiguration: 0 };
    for (const snap of jobs.docs) {
        if (Date.now() > deadline)
            break;
        const job = await lease(db, snap.ref, now);
        if (!job)
            continue;
        try {
            const configuration = marketingConfigurationStatus(job.brandId);
            const config = configuration.config;
            if (!config) {
                await deferMissingConfiguration(db, snap.ref, job.lease, now, configuration.reason || 'configuration_required');
                counts.waitingConfiguration++;
                counts.processed++;
                continue;
            }
            const [consent, contact] = await Promise.all([db.collection('marketingConsents').doc(job.eventId).get(), db.collection('marketingContacts').doc(job.contactKey).get()]);
            const event = consent.data() as ConsentEvent | undefined;
            if (!event || event.brandId !== job.brandId || event.customerId !== job.customerId)
                throw new MarketingError('consent_scope_mismatch', false);
            if (contact.data()?.latestEventId !== job.eventId || contact.data()?.state === 'suppressed') {
                await complete(db, snap.ref, job.lease, 'suppressed', now);
                counts.suppressed++;
                continue;
            }
            const provider = makeProvider(config);
            await provider.verifyBrand();
            const state = await provider.sync(event);
            await complete(db, snap.ref, job.lease, state, Date.now());
            counts[state]++;
        }
        catch (error) {
            const failure = error instanceof MarketingError ? error : new MarketingError('sync_failed');
            await complete(db, snap.ref, job.lease, 'failed', Date.now(), failure.code, failure.retryable);
            counts.failed++;
        }
        counts.processed++;
    }
    // Poll only explicitly consented contacts. No import of the provider's audience.
    const contacts = await db.collection('marketingContacts').where('nextReconcileAt', '<=', now).orderBy('nextReconcileAt').limit(10).get();
    for (const snap of contacts.docs) {
        if (Date.now() > deadline)
            break;
        const state = snap.data(), config = marketingConfig(state.brandId);
        if (!config) {
            // A removed mapping must not remain at the front of the due queue and
            // starve configured brands. Check it again later in case it is restored.
            await snap.ref.update({ nextReconcileAt: now + 3600000, updatedAt: now });
            continue;
        }
        try {
            const event = (await db.collection('marketingConsents').doc(state.latestEventId).get()).data() as ConsentEvent;
            if (!event || event.brandId !== state.brandId)
                continue;
            const provider = makeProvider(config);
            await provider.verifyBrand();
            const channel = emailChannel(await provider.contact(event.email), event.email);
            await db.runTransaction(async (tx) => {
                const current = await tx.get(snap.ref), customerRef = db.collection('customers').doc(state.customerId), customer = await tx.get(customerRef);
                if (current.data()?.latestEventId !== state.latestEventId)
                    return;
                const jobRef = db.collection('marketingOutbox').doc(state.latestEventId), job = await tx.get(jobRef);
                const suppressed = channel?.status !== 'subscribed';
                if (suppressed && job.exists && job.data()?.brandId === state.brandId) tx.update(jobRef, {state:'suppressed', lastError:'provider_suppression', updatedAt:now, nextAttemptAt:NEVER});
                tx.update(snap.ref, { providerStatus: channel?.status || 'missing', providerStatusChangedAt: channel?.statusChangedAt || null, state: suppressed ? 'suppressed' : state.state, nextReconcileAt: suppressed ? NEVER : now + 3600000, updatedAt: now });
                if (suppressed && customer.exists && customer.data()?.brandId === state.brandId)
                    tx.update(customerRef, { marketingConsent: false });
            });
            counts.reconciled++;
        }
        catch {
            await snap.ref.update({ nextReconcileAt: now + 900000 });
        }
    }
    return counts;
}
export async function retryMarketingJob(db: Firestore, brandId: string, id: string) {
    if (!marketingConfig(brandId)) return false;
    const ref = db.collection('marketingOutbox').doc(id);
    return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref), job = snap.data();
        const waiting = job?.state === 'pending' && ['secret_unavailable','invalid_mapping','duplicate_mapping','brand_not_mapped','brand_disabled','configuration_required'].includes(job.lastError);
        if (!job || job.brandId !== brandId || !(job.state === 'failed' || waiting) || job.lease)
            return false;
        tx.update(ref, { state: 'pending', attempts: waiting ? job.attempts || 0 : 0, nextAttemptAt: Date.now(), lastError: null });
        return true;
    });
}
