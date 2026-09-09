import 'server-only';
import { Omnisend } from '@/lib/marketing/provider';
import { emailChannel } from '@/lib/marketing/consent';
import type { feedbackMailConfig } from './mail-config';
export class FeedbackMailError extends Error {
  constructor(public code: string, public uncertain = false, public retryable = false) { super(code); }
}
export class FeedbackMailProvider {
  constructor(private config: NonNullable<ReturnType<typeof feedbackMailConfig>>, private request: typeof fetch = fetch) {}
  async eligible(email: string) {
    const provider = new Omnisend(this.config.provider, this.request);
    await provider.verifyBrand();
    return emailChannel(await provider.contact(email), email)?.status === 'subscribed';
  }
  async send(eventId: string, kind: 'invitation' | 'reminder' | 'thankYou', email: string, properties: Record<string, unknown>) {
    let response: Response;
    try {
      response = await this.request('https://api.omnisend.com/api/events', {
        method: 'POST', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Omnisend-API-Key ${this.config.provider.apiKey}`, 'Omnisend-Version': '2026-03-15', 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventID: eventId, eventName: this.config.events[kind], origin: 'api', contact: { email }, properties }),
      });
    } catch { throw new FeedbackMailError('provider_result_unknown', true); }
    if (response.status === 429) throw new FeedbackMailError('provider_rate_limited', false, true);
    if (response.status >= 500) throw new FeedbackMailError('provider_result_unknown', true);
    if (!response.ok) throw new FeedbackMailError(`provider_rejected_${response.status}`);
    // Accepted event does not establish actual email delivery. Do not read/log provider bodies.
  }
}
