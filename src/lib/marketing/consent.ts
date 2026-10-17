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
    source: 'checkout' | 'game' | 'loyalty';
    // Absent on subscribe events. A loyalty member can withdraw consent from the portal.
    action?: 'unsubscribe';
    capturedAt: number;
    version: string;
    wording: string;
};
export type SyncState = 'pending' | 'synced' | 'failed' | 'suppressed';
export const retryDelay = (attempt: number) => Math.min(6 * 60 * 60 * 1000, 30000 * 2 ** Math.min(attempt, 10));
export type ProviderContact = {
    id?: string;
    contactID?: string;
    firstName?: string;
    lastName?: string;
    createdAt?: string;
    updatedAt?: string;
    identifiers?: {
        type: string;
        id: string;
        channels?: {
            email?: {
                status: string;
                statusChangedAt?: string;
            };
        };
        consent?: {
            source?: string;
            createdAt?: string;
            ip?: string;
            userAgent?: string;
        };
    }[];
};
export function emailIdentifier(contact: ProviderContact | null, email: string) {
    return contact?.identifiers?.find(identifier =>
        identifier.type === 'email' && identifier.id.trim().toLowerCase() === email
    ) ?? null;
}
export function emailChannel(contact: ProviderContact | null, email: string) {
    return emailIdentifier(contact, email)?.channels?.email;
}
const providerSource = { checkout: 'orderfly-checkout', game: 'orderfly-game', loyalty: 'orderfly-loyalty' } as const;
export function consentPayload(event: ConsentEvent) {
    const at = new Date(event.capturedAt).toISOString();
    if (event.action === 'unsubscribe')
        return { identifiers: [{ type: 'email', id: event.email, channels: { email: { status: 'unsubscribed', statusChangedAt: at } } }],
            customProperties: { orderfly_brand_id: event.brandId, orderfly_consent_id: event.id, orderfly_consent_source: event.source } };
    return {
        identifiers: [{ type: 'email', id: event.email, sendWelcomeMessage: false,
                channels: { email: { status: 'subscribed', statusChangedAt: at } },
                consent: { source: providerSource[event.source], createdAt: at } }],
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
    // A loyalty sign-up or portal re-subscription is always a new, explicit, versioned consent.
    return (([NEWSLETTER_CONSENT_VERSION, PREVIOUS_NEWSLETTER_CONSENT_VERSION].includes(event.version) && event.source === 'checkout') || (event.version === 'game-email-da-v1' && event.source === 'game') || (event.source === 'loyalty' && event.action !== 'unsubscribe')) && Number.isFinite(changed) && event.capturedAt > changed;
}
