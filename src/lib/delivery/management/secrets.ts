import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { getAdminApp } from '@/lib/firebase-admin';

export type DeliverySecretScope = {
  environment: 'sandbox' | 'production'; merchantId: string; kind: 'api' | 'webhook' | 'geoapify';
};
type SecretClient = Pick<SecretManagerServiceClient, 'createSecret' | 'addSecretVersion' | 'accessSecretVersion'>;
// Reuse SDK transport/auth plumbing, never secret payloads or authorization results.
// Every read still accesses the exact pinned version and propagates IAM rejection.
let defaultSecretClient: SecretManagerServiceClient | undefined;
const sharedSecretClient = () => defaultSecretClient ??= new SecretManagerServiceClient();
export class DeliverySecretError extends Error {
  constructor(readonly code: 'secret_configuration_missing' | 'secret_permission_denied' | 'secret_store_unavailable' | 'invalid_secret_input' | 'secret_reference_mismatch') {
    super(code); this.name = 'DeliverySecretError';
  }
}
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
/** Deployment-owned project only. Never infer it from a portal request or public Firebase config. */
export function deliverySecretProjectId(env: NodeJS.ProcessEnv = process.env): string {
  let value: unknown;
  try { value = env.ORDERFLY_DELIVERY_SECRET_PROJECT ?? getAdminApp().options.projectId; }
  catch { throw new DeliverySecretError('secret_configuration_missing'); }
  if (typeof value !== 'string' || !/^[a-z][a-z0-9-]{4,62}$/.test(value)) throw new DeliverySecretError('secret_configuration_missing');
  return value;
}
function validateScope(scope: DeliverySecretScope) {
  if (!scope || !['sandbox', 'production'].includes(scope.environment) || !identifier(scope.merchantId)
    || !['api', 'webhook', 'geoapify'].includes(scope.kind)
    || scope.kind === 'geoapify' && scope.merchantId !== 'platform') throw new DeliverySecretError('invalid_secret_input');
}
function validateValue(value: string, kind?: DeliverySecretScope['kind']) {
  if (typeof value !== 'string' || value.length < (kind === 'webhook' ? 32 : 16) || value.length > 4096 || /[\s\p{Cc}\p{Cf}]/u.test(value)) throw new DeliverySecretError('invalid_secret_input');
}
function translated(error: unknown): DeliverySecretError {
  if (error instanceof DeliverySecretError) return error;
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
  return new DeliverySecretError(code === 7 || code === 16 || code === 403 || code === 401 ? 'secret_permission_denied' : 'secret_store_unavailable');
}
/** Only the authorized management service calls this store. No Firestore plaintext fallback. */
export function createDeliverySecretStore(options: { projectId: string; client?: SecretClient }) {
  const projectId = options.projectId;
  if (typeof projectId !== 'string' || !/^[a-z][a-z0-9-]{4,62}$/.test(projectId)) throw new DeliverySecretError('secret_configuration_missing');
  const client = options.client ?? sharedSecretClient();
  function secretName(scope: DeliverySecretScope) {
    validateScope(scope);
    const suffix = createHash('sha256').update(JSON.stringify([scope.environment, scope.merchantId])).digest('hex');
    const prefix = scope.kind === 'geoapify' ? 'orderfly-geoapify' : scope.kind === 'webhook' ? 'orderfly-wolt-webhook' : 'orderfly-wolt';
    return `projects/${projectId}/secrets/${prefix}-${scope.environment}-${suffix}`;
  }
  function validateReference(reference: string, scope: DeliverySecretScope) {
    const name = secretName(scope);
    if (typeof reference !== 'string' || !reference.startsWith(`${name}/versions/`) || !/^[1-9][0-9]{0,10}$/.test(reference.slice(`${name}/versions/`.length))) throw new DeliverySecretError('secret_reference_mismatch');
    return reference;
  }
  function responseReference(reference: string, scope: DeliverySecretScope): string {
    const name = secretName(scope), secretId = name.split('/').at(-1);
    const match = typeof reference === 'string' ? reference.match(/^projects\/([A-Za-z0-9-]+)\/secrets\/([A-Za-z0-9_-]+)\/versions\/([1-9][0-9]{0,10})$/) : null;
    // Google may canonicalize the request's project ID to its numeric project number.
    // This is accepted ONLY on an authenticated response to our exact scoped request;
    // caller/stored references must still use the configured project ID above.
    if (!match || (match[1] !== projectId && !/^[0-9]+$/.test(match[1])) || match[2] !== secretId) throw new DeliverySecretError('secret_reference_mismatch');
    return `${name}/versions/${match[3]}`;
  }
  return Object.freeze({
    async provision(input: DeliverySecretScope & { value: string }): Promise<string> {
      const value = input.value;
      validateValue(value, input.kind);
      const scope = { environment: input.environment, merchantId: input.merchantId, kind: input.kind };
      const name = secretName(scope);
      try {
        try {
          await client.createSecret({ parent: `projects/${projectId}`, secretId: name.split('/').at(-1), secret: { replication: { automatic: {} } } });
        } catch (error) {
          // ALREADY_EXISTS is the only creation error that permits a version write.
          if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 6) throw error;
        }
        const [version] = await client.addSecretVersion({ parent: name, payload: { data: Buffer.from(value, 'utf8') } });
        return responseReference(version.name ?? '', scope);
      } catch (error) { throw translated(error); }
    },
    async read(reference: string, scope: DeliverySecretScope): Promise<string> {
      validateReference(reference, scope);
      try {
        const [version] = await client.accessSecretVersion({ name: reference });
        if (responseReference(version.name ?? '', scope) !== reference) throw new DeliverySecretError('secret_reference_mismatch');
        const data = version.payload?.data;
        const value = typeof data === 'string' ? Buffer.from(data, 'base64').toString('utf8') : data ? Buffer.from(data).toString('utf8') : '';
        validateValue(value, scope.kind); return value;
      } catch (error) { throw translated(error); }
    },
    validateReference,
  });
}

/** Separate signing material is generated server-side and never included in a portal DTO. */
export function generateWoltWebhookSecret(): string { return randomBytes(32).toString('base64url'); }

type MerchantScope = { environment: 'sandbox' | 'production'; merchantId: string };
export async function readDeliveryMerchantSecret(reference: string, scope: MerchantScope & { kind: 'api' | 'webhook' }): Promise<string> {
  return createDeliverySecretStore({ projectId: deliverySecretProjectId() }).read(reference, scope);
}
export async function provisionDeliveryMerchantSecrets(input: MerchantScope & {
  apiKey?: string; webhookSigningSecret?: string; existing: { api: string | null; webhook: string | null };
}): Promise<{ api: string | null; webhook: string | null }> {
  const store = createDeliverySecretStore({ projectId: deliverySecretProjectId() });
  const apiScope = { environment: input.environment, merchantId: input.merchantId, kind: 'api' as const };
  const webhookScope = { ...apiScope, kind: 'webhook' as const };
  let api = input.existing.api, webhook = input.existing.webhook;
  if (api) store.validateReference(api, apiScope);
  if (webhook) store.validateReference(webhook, webhookScope);
  const apiValue = input.apiKey || undefined;
  const signingValue = input.webhookSigningSecret || (!webhook && (apiValue || api) ? generateWoltWebhookSecret() : undefined);
  if (apiValue) validateValue(apiValue);
  if (signingValue) validateValue(signingValue, 'webhook');
  // Refuse API/signing reuse even when only one of the two fields changes.
  if (apiValue || signingValue) {
    const a = apiValue ?? (api ? await store.read(api, apiScope) : undefined);
    const b = signingValue ?? (webhook ? await store.read(webhook, webhookScope) : undefined);
    if (a && b && a === b) throw new DeliverySecretError('invalid_secret_input');
  }
  if (apiValue) api = await store.provision({ ...apiScope, value: apiValue });
  if (signingValue) webhook = await store.provision({ ...webhookScope, value: signingValue });
  return { api, webhook };
}
