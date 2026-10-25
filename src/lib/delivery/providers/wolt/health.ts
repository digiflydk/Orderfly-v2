import 'server-only';

export type WoltHealthScope = { brandId: string; locationId: string };
export type WoltHealthEvidence = WoltHealthScope & {
  environment: 'sandbox' | 'production'; active: boolean; credentialConfigured: boolean;
  webhookSecretConfigured: boolean; checkedAt: number;
  authentication: 'verified' | 'rejected' | 'not_checked';
  webhookConfiguration: 'matched' | 'missing' | 'drift' | 'duplicate' | 'not_checked';
};

/** Authorization and server-owned evidence retrieval precede any projection. */
export async function getWoltConnectionHealth(scope: WoltHealthScope, deps: {
  authorize: (scope: WoltHealthScope) => Promise<boolean>;
  readEvidence: (scope: WoltHealthScope) => Promise<WoltHealthEvidence | null>;
  now: () => number;
}) {
  if (!validScope(scope) || !(await deps.authorize(scope))) throw new Error('WOLT_FORBIDDEN');
  const evidence = await deps.readEvidence(scope);
  const now = deps.now();
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('WOLT_INVALID_CLOCK');
  if (evidence && (evidence.brandId !== scope.brandId || evidence.locationId !== scope.locationId)) {
    throw new Error('WOLT_SCOPE_MISMATCH');
  }
  const recent = evidence && Number.isSafeInteger(evidence.checkedAt) && evidence.checkedAt >= 0 &&
    evidence.checkedAt <= now && now - evidence.checkedAt <= 300_000;
  const state = !evidence || !evidence.active || !evidence.credentialConfigured || !evidence.webhookSecretConfigured
    ? 'not_configured' : !recent ? 'stale' : evidence.authentication === 'rejected'
      ? 'authentication_failed' : evidence.authentication === 'verified' && evidence.webhookConfiguration === 'matched'
        ? 'configured' : 'needs_attention';
  // Explicit allowlist: never spread persisted configuration or expose native account/secret/callback fields.
  return { provider: 'wolt' as const, state, environment: evidence?.environment === 'sandbox' || evidence?.environment === 'production' ? evidence.environment : null,
    checkedAt: recent ? evidence!.checkedAt : null, liveDeliveryVerified: false as const };
}

function validScope(scope: WoltHealthScope): boolean {
  return !!scope && [scope.brandId, scope.locationId].every(v => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v));
}

export const WOLT_REQUIRED_EVENTS = [
  'order.received', 'order.rejected', 'order.pickup_eta_updated', 'order.pickup_started',
  'order.picked_up', 'order.pickup_arrival', 'order.dropoff_started', 'order.dropoff_arrival',
  'order.dropoff_completed', 'order.delivered', 'order.not_delivered', 'order.dropoff_eta_updated',
] as const;

type WebhookConfiguration = {
  id: string; callback_url: string; disabled: boolean; subscribed_events: string[];
  callback_config: { exponential_retry_backoff: { exponent_base: number; max_retry_count: number } };
};

/** Pure, server-only plan from an authenticated merchant-level list. Never performs writes. */
export function planWoltWebhookConfiguration(existing: WebhookConfiguration[], desired: {
  callbackUrl: string; ownedWebhookId?: string; exponentBase: number; maxRetryCount: number;
}) {
  const url = new URL(desired.callbackUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search ||
    !Number.isInteger(desired.exponentBase) || desired.exponentBase < 2 || desired.exponentBase > 10 ||
    !Number.isInteger(desired.maxRetryCount) || desired.maxRetryCount < 1 || desired.maxRetryCount > 10) {
    throw new Error('WOLT_INVALID_WEBHOOK_CONFIGURATION');
  }
  const matches = existing.filter(w => w.id === desired.ownedWebhookId || w.callback_url === desired.callbackUrl);
  if (matches.length > 1) return { action: 'manual_review' as const, reason: 'duplicate' as const };
  if (!matches.length) {
    // Do not create an extra subscription when an existing merchant endpoint needs ownership resolution.
    if (existing.length || desired.ownedWebhookId) return { action: 'manual_review' as const, reason: 'ownership' as const };
    return { action: 'create_required' as const };
  }
  const current = matches[0];
  const retry = current.callback_config.exponential_retry_backoff;
  const matched = !current.disabled && current.callback_url === desired.callbackUrl &&
    retry.exponent_base === desired.exponentBase && retry.max_retry_count === desired.maxRetryCount &&
    WOLT_REQUIRED_EVENTS.every(event => current.subscribed_events.includes(event));
  // Keep existing optional subscriptions; updates must be reviewed by the merchant-level owner.
  return { action: matched ? 'none' as const : 'update_required' as const, webhookId: current.id };
}
