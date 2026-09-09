import 'server-only';
import { notificationPlatformConfig } from '@/lib/feedback/mail-config';

export class NotificationPlatformError extends Error {
  constructor(public code: string, public uncertain = false, public retryable = false) { super(code); }
}

export type NotificationMessage = {
  idempotencyKey: string;
  templateKey: 'orderfly.order.confirmation' | 'orderfly.feedback.invitation' | 'orderfly.feedback.reminder' | 'orderfly.feedback.thank_you';
  locale: string;
  recipientEmail: string;
  recipientName?: string;
  relatedEntity: { type: string; id: string };
  variables: Record<string, unknown>;
};

export class NotificationPlatformClient {
  constructor(private config = notificationPlatformConfig(), private request: typeof fetch = fetch) {}

  async send(message: NotificationMessage) {
    if (!this.config) throw new NotificationPlatformError('notification_configuration_required');
    let response: Response;
    try {
      response = await this.request(this.config.endpoint, {
        method: 'POST', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { 'x-orderfly-notification-secret': this.config.secret, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: this.config.organizationId,
          sender_profile: 'orderfly',
          idempotency_key: message.idempotencyKey,
          module: 'orderfly',
          template_key: message.templateKey,
          locale: message.locale,
          recipient: { email: message.recipientEmail, ...(message.recipientName ? { name: message.recipientName } : {}) },
          related_entity: message.relatedEntity,
          variables: message.variables,
        }),
      });
    } catch { throw new NotificationPlatformError('provider_result_unknown', true); }
    if (response.status === 429) throw new NotificationPlatformError('provider_rate_limited', false, true);
    if (response.status >= 500) throw new NotificationPlatformError('provider_result_unknown', true);
    if (!response.ok) throw new NotificationPlatformError(`provider_rejected_${response.status}`);
  }
}
