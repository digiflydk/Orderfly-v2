import 'server-only';
import { createWoltHttpClient, type WoltHttpClient } from '../providers/wolt/http';
import { WOLT_REQUIRED_EVENTS } from '../providers/wolt/health';
import { readDeliveryMerchantSecret } from './secrets';

type MerchantInput = { environment: 'sandbox' | 'production'; merchantId: string; venueId: string; apiSecretRef: string };
type Dependencies = { readSecret?: typeof readDeliveryMerchantSecret; fetchImpl?: typeof fetch };
type Webhook = { id: string; callbackUrl: string; disabled: boolean; events: string[]; exponentBase: number; maxRetryCount: number };
export class WoltManagementError extends Error {
  constructor(readonly code: 'invalid_wolt_configuration' | 'wolt_authentication_failed' | 'wolt_connection_unavailable'
    | 'wolt_webhook_ownership_conflict' | 'wolt_webhook_configuration_mismatch') {
    super(code); this.name = 'WoltManagementError';
  }
}
const id = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
function validate(input: MerchantInput) {
  if (!input || !['sandbox', 'production'].includes(input.environment) || !id(input.merchantId) || !id(input.venueId)
    || typeof input.apiSecretRef !== 'string' || !input.apiSecretRef) throw new WoltManagementError('invalid_wolt_configuration');
}
async function client(input: MerchantInput, dependencies: Dependencies): Promise<WoltHttpClient> {
  validate(input);
  const apiKey = await (dependencies.readSecret ?? readDeliveryMerchantSecret)(input.apiSecretRef, {
    environment: input.environment, merchantId: input.merchantId, kind: 'api',
  });
  return createWoltHttpClient({ baseUrl: input.environment === 'sandbox' ? 'https://daas-public-api.development.dev.woltapi.com' : 'https://daas-public-api.wolt.com', merchantKey: apiKey }, { fetchImpl: dependencies.fetchImpl, maxReadRetries: 0 });
}
function parseWebhooks(value: unknown): Webhook[] {
  if (!Array.isArray(value) || value.length > 100) throw new WoltManagementError('wolt_connection_unavailable');
  return value.map(row => {
    if (!row || !id(row.id) || typeof row.callback_url !== 'string' || row.callback_url.length > 2048
      || typeof row.disabled !== 'boolean' || !Array.isArray(row.subscribed_events)
      || !row.subscribed_events.every((event: unknown) => typeof event === 'string' && event.length < 100)
      || !Number.isSafeInteger(row.callback_config?.exponential_retry_backoff?.exponent_base)
      || !Number.isSafeInteger(row.callback_config?.exponential_retry_backoff?.max_retry_count)) throw new WoltManagementError('wolt_connection_unavailable');
    return { id: row.id, callbackUrl: row.callback_url, disabled: row.disabled, events: [...row.subscribed_events],
      exponentBase: row.callback_config.exponential_retry_backoff.exponent_base, maxRetryCount: row.callback_config.exponential_retry_backoff.max_retry_count };
  });
}
async function list(client: WoltHttpClient, merchantId: string): Promise<Webhook[]> {
  const result = await client.request({ method: 'GET', path: `/v1/merchants/${merchantId}/webhooks`, operation: 'read' });
  if (!result.ok) throw new WoltManagementError(result.error.code === 'authentication' ? 'wolt_authentication_failed' : 'wolt_connection_unavailable');
  if (result.status !== 200) throw new WoltManagementError('wolt_connection_unavailable');
  return parseWebhooks(result.data);
}
/** Read-only merchant credential check. Does NOT verify venue ownership, pickup address or signed callback delivery. */
export async function verifyWoltMerchantConnection(raw: MerchantInput, dependencies: Dependencies = {}): Promise<boolean> {
  const input = { ...raw };
  await list(await client(input, dependencies), input.merchantId);
  return true;
}
export type WoltCallbackRegistration = { status: 'registered'; webhookId: string } | { status: 'unknown' };
/** Caller authorizes scope and durably claims the operation BEFORE invoking this helper.
 * allowCreate is false after any prior registration intent; a lost POST is reconciled only by GET.
 * The server-generated callback URL and signing reference must remain immutable after that intent.
 */
export async function ensureWoltMerchantCallback(raw: MerchantInput & {
  signingSecretRef: string; callbackUrl: string; beforeCreate: () => Promise<void>; allowCreate: boolean; ownedWebhookId?: string | null;
}, dependencies: Dependencies = {}): Promise<WoltCallbackRegistration> {
  const input = { ...raw };
  validate(input);
  let url: URL;
  try { url = new URL(input.callbackUrl); } catch { throw new WoltManagementError('invalid_wolt_configuration'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || !/^\/api\/delivery\/webhooks\/wolt\/[A-Za-z0-9_-]{32,128}$/.test(url.pathname)
    || url.href !== input.callbackUrl || typeof input.allowCreate !== 'boolean'
    || typeof input.beforeCreate !== 'function' || !input.signingSecretRef || input.signingSecretRef === input.apiSecretRef
    || input.ownedWebhookId != null && !id(input.ownedWebhookId)) throw new WoltManagementError('invalid_wolt_configuration');
  const transport = await client(input, dependencies);
  function inspect(rows: Webhook[]): { status: 'registered'; webhookId: string } | null {
    // V1 supports a single canonical merchant-level subscription, never competing endpoints.
    if (rows.length > 1 || rows.some(row => row.callbackUrl !== input.callbackUrl)) throw new WoltManagementError('wolt_webhook_ownership_conflict');
    const row = rows[0];
    if (!row) return null;
    if (input.ownedWebhookId && row.id !== input.ownedWebhookId) throw new WoltManagementError('wolt_webhook_ownership_conflict');
    if (row.disabled || row.exponentBase !== 2 || row.maxRetryCount !== 5 || !WOLT_REQUIRED_EVENTS.every(event => row.events.includes(event))) throw new WoltManagementError('wolt_webhook_configuration_mismatch');
    return { status: 'registered', webhookId: row.id };
  }
  const current = inspect(await list(transport, input.merchantId));
  if (current) return current;
  // Missing previously owned subscriptions and unknown creates require operator reconciliation.
  if (!input.allowCreate || input.ownedWebhookId) return { status: 'unknown' };
  const signingSecret = await (dependencies.readSecret ?? readDeliveryMerchantSecret)(input.signingSecretRef, {
    environment: input.environment, merchantId: input.merchantId, kind: 'webhook',
  });
  // Credential separation is also checked at the secret boundary, never inferred from ref names alone.
  const apiKey = await (dependencies.readSecret ?? readDeliveryMerchantSecret)(input.apiSecretRef, {
    environment: input.environment, merchantId: input.merchantId, kind: 'api',
  });
  if (signingSecret === apiKey || signingSecret.length < 32) throw new WoltManagementError('invalid_wolt_configuration');
  await input.beforeCreate();
  const created = await transport.request({ method: 'POST', path: `/v1/merchants/${input.merchantId}/webhooks`, operation: 'create', body: {
    callback_url: input.callbackUrl, client_secret: signingSecret, disabled: false,
    callback_config: { exponential_retry_backoff: { exponent_base: 2, max_retry_count: 5 } },
  } });
  // Once a write was attempted, never retry it. GET may recover a lost successful response.
  try {
    const recovered = inspect(await list(transport, input.merchantId));
    if (!recovered) return { status: 'unknown' };
    if (created.ok && (created.status !== 201 || !created.data || typeof created.data !== 'object'
      || !('id' in created.data) || created.data.id !== recovered.webhookId)) return { status: 'unknown' };
    return recovered;
  } catch { return { status: 'unknown' }; }
}
