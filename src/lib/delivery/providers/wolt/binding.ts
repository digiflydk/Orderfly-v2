import 'server-only';
import { isBoundedWoltId, isWoltEnvironment, type WoltCredentialBinding, type WoltEnvironment } from './config';

export interface WoltScope { brandId: string; locationId: string }
export interface WoltBinding extends WoltScope, WoltCredentialBinding {
  provider: 'wolt';
  active: true;
  revision: string;
}

export interface WoltBindingDependencies {
  /** Must use the current server identity and confirm location ownership and permission. */
  authorizeScope(scope: Readonly<WoltScope>): Promise<boolean>;
  /** Coordinator-owned persistence must return the current binding, never a client DTO. */
  resolveBinding(scope: Readonly<WoltScope>, provider: 'wolt'): Promise<unknown>;
}

export class WoltBindingError extends Error {
  constructor(public readonly code: 'INVALID_SCOPE' | 'FORBIDDEN' | 'BINDING_UNAVAILABLE') {
    super(code);
    this.name = 'WoltBindingError';
  }
}

export async function resolveWoltBinding(
  scope: WoltScope,
  dependencies: WoltBindingDependencies,
  environment: WoltEnvironment,
): Promise<Readonly<WoltBinding>> {
  if (!scope || !isBoundedWoltId(scope.brandId) || !isBoundedWoltId(scope.locationId) || !isWoltEnvironment(environment)) {
    throw new WoltBindingError('INVALID_SCOPE');
  }
  const safeScope = Object.freeze({ brandId: scope.brandId, locationId: scope.locationId });
  let authorized = false;
  try { authorized = await dependencies.authorizeScope(safeScope); } catch { /* fail closed */ }
  if (authorized !== true) throw new WoltBindingError('FORBIDDEN');
  let raw: unknown;
  try { raw = await dependencies.resolveBinding(safeScope, 'wolt'); }
  catch { throw new WoltBindingError('BINDING_UNAVAILABLE'); }
  if (!raw || typeof raw !== 'object') throw new WoltBindingError('BINDING_UNAVAILABLE');
  const value = raw as Record<string, unknown>;
  if (value.provider !== 'wolt' || value.active !== true || value.brandId !== safeScope.brandId
    || value.locationId !== safeScope.locationId || value.environment !== environment
    || !isBoundedWoltId(value.revision) || !isBoundedWoltId(value.merchantId) || !isBoundedWoltId(value.venueId)
    || typeof value.secretRef !== 'string' || !/^[A-Za-z0-9_./:-]{1,512}$/.test(value.secretRef)) {
    throw new WoltBindingError('BINDING_UNAVAILABLE');
  }
  return Object.freeze({ ...safeScope, provider: 'wolt', active: true, revision: value.revision,
    environment, merchantId: value.merchantId, venueId: value.venueId, secretRef: value.secretRef });
}
