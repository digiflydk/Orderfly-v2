import 'server-only';
import { consentPayload, emailChannel, canRenewConsent, type ConsentEvent, type ProviderContact } from './consent';
import type { MarketingConfig } from './config';
export class MarketingError extends Error {
    constructor(public code: string, public retryable = true, public uncertain = false) { super(code); }
}
export class Omnisend {
    constructor(private config: MarketingConfig, private request: typeof fetch = fetch) { }
    private async api(path: string, body?: unknown, expectJson = true) {
        let response: Response;
        try {
            response = await this.request(`https://api.omnisend.com/api/${path}`, {
                method: body ? 'POST' : 'GET', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(5000),
                headers: { 'Authorization': `Omnisend-API-Key ${this.config.apiKey}`, 'Omnisend-Version': '2026-03-15', 'Content-Type': 'application/json' },
                ...(body ? { body: JSON.stringify(body) } : {}),
            });
        }
        catch {
            throw new MarketingError('provider_unavailable', true, true);
        }
        if (!response.ok)
            throw new MarketingError(`provider_http_${response.status}`, response.status === 429 || response.status >= 500, response.status >= 500);
        if (!expectJson)
            return null;
        try {
            return await response.json();
        }
        catch {
            throw new MarketingError('provider_invalid_response', true, true);
        }
    }
    async verifyBrand() {
        const brand = await this.api('brands/current');
        if ((brand.brandID || brand.id) !== this.config.omnisendBrandId)
            throw new MarketingError('brand_mapping_mismatch', false);
    }
    async contact(email: string): Promise<ProviderContact | null> {
        const result = await this.api(`contacts?${new URLSearchParams({ email, limit: '2' })}`);
        const rows = Array.isArray(result.contacts) ? result.contacts : result.data;
        if (!Array.isArray(rows))
            throw new MarketingError('provider_invalid_response');
        if (rows.length === 0)
            return null;
        if (rows.length !== 1 || !Array.isArray(rows[0]?.identifiers) || !emailChannel(rows[0], email))
            throw new MarketingError('provider_ambiguous_contact', false);
        return rows[0];
    }
    async sync(event: ConsentEvent): Promise<'synced' | 'suppressed'> {
        const before = await this.contact(event.email), channel = emailChannel(before, event.email);
        // A retry cannot advance the event time. Only a newly submitted, current
        // explicit consent can renew a dated opt-out under single opt-in policy.
        if (channel?.status === 'unsubscribed' && !canRenewConsent(event, channel))
            return 'suppressed';
        await this.api('contacts', consentPayload(event));
        const after = emailChannel(await this.contact(event.email), event.email);
        if (after?.status === 'unsubscribed')
            return 'suppressed';
        if (after?.status !== 'subscribed')
            throw new MarketingError('provider_consent_unconfirmed');
        return 'synced';
    }
    async paidOrder(event: unknown): Promise<void> {
        await this.api('events', event, false);
    }
}
