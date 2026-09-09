import 'server-only';
import type { feedbackMailConfig } from './mail-config';
import { NotificationPlatformClient, NotificationPlatformError } from '@/lib/notifications/platform';
export class FeedbackMailError extends Error {
  constructor(public code: string, public uncertain = false, public retryable = false) { super(code); }
}
export class FeedbackMailProvider {
  private client: NotificationPlatformClient;
  constructor(config: NonNullable<ReturnType<typeof feedbackMailConfig>>, request: typeof fetch = fetch) {
    this.client = new NotificationPlatformClient(config.platform, request);
  }
  async eligible(_email: string) { return true; }
  async send(eventId: string, kind: 'invitation' | 'reminder' | 'thankYou', email: string, properties: Record<string, unknown>) {
    try {
      await this.client.send({
        idempotencyKey: eventId,
        templateKey: `orderfly.feedback.${kind === 'thankYou' ? 'thank_you' : kind}`,
        locale: String(properties.language || 'da'), recipientEmail: email,
        relatedEntity: { type: String(properties.sourceType || 'feedback'), id: String(properties.sourceId || '') },
        variables: properties,
      });
    } catch (error) {
      if (error instanceof NotificationPlatformError) throw new FeedbackMailError(error.code, error.uncertain, error.retryable);
      throw new FeedbackMailError('provider_result_unknown', true);
    }
  }
}
