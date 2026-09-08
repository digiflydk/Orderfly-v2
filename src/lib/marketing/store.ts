import 'server-only';
import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { NEWSLETTER_CONSENT_VERSION, newsletterConsentText, type ConsentEvent } from './consent';
export const contactKey = (brandId: string, email: string) => createHash('sha256').update(`${brandId}\n${email.trim().toLowerCase()}`).digest('hex');
export async function recordNewsletterConsent(db: Firestore, input: {
    brandId: string;
    brandName: string;
    locationId: string;
    customerId: string;
    email: string;
    submissionId?: string;
    version?: string;
}) {
    const email = input.email.trim().toLowerCase();
    const key = contactKey(input.brandId, email);
    // Old clients get one stable, legacy event. They cannot refresh its timestamp
    // on retries or cause a new subscription after an opt-out.
    const legacy = !input.submissionId || input.version !== NEWSLETTER_CONSENT_VERSION;
    const id = createHash('sha256').update(`${key}\n${input.submissionId || 'legacy-checkout-v1'}`).digest('hex');
    const event: ConsentEvent = { id, brandId: input.brandId, customerId: input.customerId, locationId: input.locationId, email, channel: 'email', source: 'checkout',
        capturedAt: Date.now(), version: legacy ? 'checkout-email-en-v1' : NEWSLETTER_CONSENT_VERSION,
        wording: legacy ? 'Subscribe to newsletter. Receive updates and special offers from us.' : newsletterConsentText(input.brandName) };
    const eventRef = db.collection('marketingConsents').doc(id), jobRef = db.collection('marketingOutbox').doc(id), stateRef = db.collection('marketingContacts').doc(key), customerRef = db.collection('customers').doc(input.customerId);
    await db.runTransaction(async (tx) => {
        const [existing, state, customer] = await Promise.all([tx.get(eventRef), tx.get(stateRef), tx.get(customerRef)]);
        if (existing.exists)
            return;
        if (!customer.exists || customer.data()?.brandId !== input.brandId || (customer.data()?.normalizedEmail || customer.data()?.email || '').trim().toLowerCase() !== email)
            throw new Error('Consent customer scope mismatch');
        const suppressed = state.data()?.state === 'suppressed' && legacy;
        tx.create(eventRef, event);
        tx.create(jobRef, { eventId: id, contactKey: key, brandId: input.brandId, customerId: input.customerId, state: suppressed ? 'suppressed' : 'pending', attempts: 0,
            nextAttemptAt: suppressed ? Number.MAX_SAFE_INTEGER : event.capturedAt, createdAt: event.capturedAt, updatedAt: event.capturedAt });
        tx.set(stateRef, { brandId: input.brandId, customerId: input.customerId, latestEventId: id, updatedAt: event.capturedAt,
            state: suppressed ? 'suppressed' : 'pending', nextReconcileAt: Number.MAX_SAFE_INTEGER }, { merge: true });
        if (!suppressed)
            tx.update(customerRef, { marketingConsent: true });
    });
    return id;
}
