import 'server-only';

export type WoltEnvironment = 'sandbox' | 'production';

const HOSTS = Object.freeze({
  sandbox: 'https://daas-public-api.development.dev.woltapi.com',
  production: 'https://daas-public-api.wolt.com',
});

export class WoltConfigurationError extends Error {
  constructor(public readonly code: 'INVALID_CONFIG' | 'ENVIRONMENT_MISMATCH' | 'SECRET_UNAVAILABLE') {
    super(code);
    this.name = 'WoltConfigurationError';
  }
}

export interface WoltCredentialBinding {
  environment: WoltEnvironment;
  merchantId: string;
  venueId: string;
  secretRef: string;
}

/** Resolving a secret is a server integration seam, never a client input. */
export type WoltSecretResolver = (
  reference: string,
  context: Readonly<{ environment: WoltEnvironment; merchantId: string }>,
) => Promise<string | undefined>;

export class ResolvedWoltConfig {
  readonly baseUrl: string;
  readonly environment: WoltEnvironment;
  readonly merchantId: string;
  readonly venueId: string;
  #merchantKey: string;

  constructor(binding: WoltCredentialBinding, merchantKey: string) {
    this.environment = binding.environment;
    this.baseUrl = HOSTS[binding.environment];
    this.merchantId = binding.merchantId;
    this.venueId = binding.venueId;
    this.#merchantKey = merchantKey;
    Object.freeze(this);
  }

  // Deliberately non-enumerable: JSON, spreading and ordinary inspection cannot leak the key.
  get merchantKey(): string { return this.#merchantKey; }

  toJSON() {
    return { environment: this.environment, baseUrl: this.baseUrl, merchantId: this.merchantId, venueId: this.venueId };
  }
}

export function isWoltEnvironment(value: unknown): value is WoltEnvironment {
  return value === 'sandbox' || value === 'production';
}

export function isBoundedWoltId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

export async function resolveWoltConfig(
  binding: WoltCredentialBinding,
  runtimeEnvironment: WoltEnvironment,
  resolveSecret: WoltSecretResolver,
): Promise<ResolvedWoltConfig> {
  if (!binding || !isWoltEnvironment(runtimeEnvironment) || !isWoltEnvironment(binding.environment)
    || !isBoundedWoltId(binding.merchantId) || !isBoundedWoltId(binding.venueId)
    || typeof binding.secretRef !== 'string' || !/^[A-Za-z0-9_./:-]{1,512}$/.test(binding.secretRef)
    || typeof resolveSecret !== 'function') {
    throw new WoltConfigurationError('INVALID_CONFIG');
  }
  if (binding.environment !== runtimeEnvironment) throw new WoltConfigurationError('ENVIRONMENT_MISMATCH');
  // Capture validated values before awaiting external code; caller mutation cannot switch the host/account.
  const snapshot = Object.freeze({ ...binding });
  let merchantKey: string | undefined;
  try {
    merchantKey = await resolveSecret(snapshot.secretRef, Object.freeze({ environment: snapshot.environment, merchantId: snapshot.merchantId }));
  } catch {
    // Do not forward resolver errors: they may contain secret material or provider responses.
    throw new WoltConfigurationError('SECRET_UNAVAILABLE');
  }
  if (typeof merchantKey !== 'string' || merchantKey.length < 16 || merchantKey.length > 4096 || !/^[A-Za-z0-9._~-]+$/.test(merchantKey)) {
    throw new WoltConfigurationError('SECRET_UNAVAILABLE');
  }
  return new ResolvedWoltConfig(snapshot, merchantKey);
}
