// Shared wording is versioned. The server stores exactly the text shown with
// the explicit email opt-in, separately from terms and cookie consent.
export const NEWSLETTER_CONSENT_VERSION = 'checkout-email-da-2026-09-28';
export const PREVIOUS_NEWSLETTER_CONSENT_VERSION = 'checkout-email-da-2026-09-08';
export function newsletterConsentText(brandName: string, version = NEWSLETTER_CONSENT_VERSION) {
    const prefix = `Ja tak, jeg vil modtage nyheder og tilbud fra ${brandName} via e-mail. Jeg kan altid afmelde mig igen.`;
    return version === PREVIOUS_NEWSLETTER_CONSENT_VERSION
        ? `${prefix} Tilmeldingen er frivillig og sendes, når jeg går videre til betaling.`
        : `${prefix} Tilmeldingen er frivillig og gemmes, når jeg går videre til betaling. Den sendes til nyhedsbrevstjenesten, når forbindelsen er klar.`;
}
export type ConsentEvent = {
    id: string;
    brandId: string;
    customerId: string;
    locationId: string;
    email: string;
    channel: 'email';
    source: 'checkout' | 'game';
    capturedAt: number;
    version: string;
    wording: string;
};
export type SyncState = 'pending' | 'synced' | 'failed' | 'suppressed';
export const retryDelay = (attempt: number) => Math.min(6 * 60 * 60 * 1000, 30000 * 2 ** Math.min(attempt, 10));
export type ProviderContact = {
    id?: string;
    contactID?: string;
    identifiers?: {
        type: string;
        id: string;
        channels?: {
            email?: {
                status: string;
                statusChangedAt?: string;
            };
        };
    }[];
};
export function emailChannel(contact: ProviderContact | null, email: string) {
    return contact?.identifiers?.find(identifier => identifier.type === 'email' && identifier.id.trim().toLowerCase() === email)?.channels?.email;
}
export function consentPayload(event: ConsentEvent) {
    return {
        identifiers: [{ type: 'email', id: event.email, sendWelcomeMessage: false,
                channels: { email: { status: 'subscribed', statusChangedAt: new Date(event.capturedAt).toISOString() } },
                consent: { source: event.source === 'game' ? 'orderfly-game' : 'orderfly-checkout', createdAt: new Date(event.capturedAt).toISOString() } }],
        customProperties: { orderfly_brand_id: event.brandId, orderfly_consent_id: event.id,
            orderfly_location_id: event.locationId, orderfly_consent_version: event.version, orderfly_consent_source: event.source },
    };
}
// Current explicit signup can renew consent only after a dated opt-out.
// A legacy boolean or a retry retains its original event/time and cannot do so.
export function canRenewConsent(event: ConsentEvent, channel: {
    status: string;
    statusChangedAt?: string;
}) {
    const changed = channel.statusChangedAt ? Date.parse(channel.statusChangedAt) : NaN;
    return (([NEWSLETTER_CONSENT_VERSION, PREVIOUS_NEWSLETTER_CONSENT_VERSION].includes(event.version) && event.source === 'checkout') || (event.version === 'game-email-da-v1' && event.source === 'game')) && Number.isFinite(changed) && event.capturedAt > changed;
}
