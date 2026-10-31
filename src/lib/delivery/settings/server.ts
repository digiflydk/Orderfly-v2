import 'server-only';
import { z } from 'zod';
import type { Location } from '@/types';
import { resolveRestaurantDeliverySchedule } from './restaurant-schedule';
import { getAdminDb, getAdminFieldValue } from '@/lib/firebase-admin';
import { AuthorityError, principalKey } from '@/lib/access/authority';
import { verifiedOrderflyIdentity } from '@/lib/access/orderfly-session';
import { authorizeTransaction } from '@/lib/access/scoped-data';
import { defaultDeliverySettings, deliveryOverridesSchema, deliverySettingsSchema, resolveDeliverySettings, settingsCommandSchema, settingsScopeSchema, type DeliverySettingsResponse } from './schema';

export class DeliverySettingsError extends Error {
  constructor(readonly code: 'invalid_request' | 'record_conflict' | 'settings_unavailable', readonly status: number) { super(code); }
}
const revisionSchema = z.number().int().positive().safe();
const brandRecord = settingsScopeSchema.extend({ schemaVersion: z.literal(1), locationId: z.null(), revision: revisionSchema, settings: deliverySettingsSchema }).strict();
const locationRecord = settingsScopeSchema.extend({ schemaVersion: z.literal(1), locationId: z.string(), revision: revisionSchema, overrides: deliveryOverridesSchema }).strict();
const invalid = (): never => { throw new DeliverySettingsError('invalid_request', 400); };
const unavailable = (): never => { throw new DeliverySettingsError('settings_unavailable', 503); };
async function safe<T>(run: () => Promise<T>): Promise<T> {
  try { return await run(); } catch (error) {
    if (error instanceof AuthorityError || error instanceof DeliverySettingsError) throw error;
    return unavailable();
  }
}
function paths(brandId: string, locationId: string | null) {
  const brand = getAdminDb().collection('deliverySettings').doc(brandId);
  return { brand, local: locationId ? brand.collection('locations').doc(locationId) : null };
}
/** Internal transaction loader; caller must authorize the exact native scope in the same transaction. */
export async function loadDeliverySettingsInTransaction(tx: FirebaseFirestore.Transaction, brandId: string, locationId: string | null, locationSnapshot?:Promise<FirebaseFirestore.DocumentSnapshot>) {
  const refs = paths(brandId, locationId);
  // These document identities are known before either read; keep both in the
  // caller's transaction without adding an unnecessary network round trip.
  const [brandSnapshot, localSnapshot] = await Promise.all([tx.get(refs.brand), refs.local ? tx.get(refs.local) : Promise.resolve(null)]);
  const brand = brandSnapshot.exists ? brandRecord.safeParse(brandSnapshot.data()) : null;
  if (brand && (!brand.success || brand.data.brandId !== brandId)) return unavailable();
  const brandRevision = brand?.success ? brand.data.revision : 0;
  const settings = brand?.success ? brand.data.settings : defaultDeliverySettings();
  if (!refs.local) return { refs, result: { brandId, locationId, brandRevision, revision: brandRevision, settings, brandSettings: settings, overrides: {}, inheritedKeys: [], editable: false } as DeliverySettingsResponse };
  const local = localSnapshot?.exists ? locationRecord.safeParse(localSnapshot.data()) : null;
  if (local && (!local.success || local.data.brandId !== brandId || local.data.locationId !== locationId)) return unavailable();
  const overrides = local?.success ? local.data.overrides : {};
  const resolved = resolveDeliverySettings(settings, overrides);
  if (resolved.settings.scheduleMode === 'restaurant') {
    const location = await (locationSnapshot??tx.get(getAdminDb().collection('locations').doc(locationId!)));
    if (!location.exists || location.data()?.brandId !== brandId) return unavailable();
    resolved.settings = resolveRestaurantDeliverySchedule(resolved.settings, location.data()?.openingHours as Location['openingHours']);
  }
  return { refs, result: { brandId, locationId, brandRevision, revision: local?.success ? local.data.revision : 0, brandSettings: settings, ...resolved, overrides, editable: false } };
}
export async function readDeliverySettings(input: unknown): Promise<DeliverySettingsResponse> {
  const identity = await verifiedOrderflyIdentity();
  const parsed = settingsScopeSchema.safeParse(input); if (!parsed.success) return invalid();
  const scope = parsed.data;
  return safe(() => getAdminDb().runTransaction(async tx => {
    await authorizeTransaction(tx, identity, scope, 'orderfly.catalog:view', scope.locationId ? 'location' : 'company');
    const { result } = await loadDeliverySettingsInTransaction(tx, scope.brandId, scope.locationId);
    try { await authorizeTransaction(tx, identity, scope, 'orderfly.catalog:edit', scope.locationId ? 'location' : 'company'); result.editable = true; }
    catch (error) { if (!(error instanceof AuthorityError && error.status === 403)) throw error; }
    return result;
  }));
}
export async function writeDeliverySettings(input: unknown): Promise<DeliverySettingsResponse> {
  const identity = await verifiedOrderflyIdentity();
  const parsed = settingsCommandSchema.safeParse(input); if (!parsed.success) return invalid();
  const command = parsed.data;
  return safe(() => getAdminDb().runTransaction(async tx => {
    await authorizeTransaction(tx, identity, command, 'orderfly.catalog:edit', command.scope === 'brand' ? 'company' : 'location');
    const { refs, result } = await loadDeliverySettingsInTransaction(tx, command.brandId, command.locationId);
    if (result.revision !== command.expectedRevision || command.scope === 'location' && result.brandRevision !== command.expectedBrandRevision) throw new DeliverySettingsError('record_conflict', 409);
    const revision = result.revision + 1, ref = refs.local ?? refs.brand, auditRef = ref.collection('audit').doc(String(revision));
    if ((await tx.get(auditRef)).exists) throw new DeliverySettingsError('record_conflict', 409);
    const record = command.scope === 'brand'
      ? { schemaVersion: 1, brandId: command.brandId, locationId: null, revision, settings: command.settings }
      : { schemaVersion: 1, brandId: command.brandId, locationId: command.locationId, revision, overrides: command.overrides };
    // Rebuild effective settings from the brand record, not previous local overrides.
    let effective = command.scope === 'brand' ? { settings: command.settings, inheritedKeys: [] as DeliverySettingsResponse['inheritedKeys'] } : null;
    if (command.scope === 'location') {
      const brandSnapshot = await tx.get(refs.brand);
      const brand = brandSnapshot.exists ? brandRecord.parse(brandSnapshot.data()).settings : defaultDeliverySettings();
      effective = resolveDeliverySettings(brand, command.overrides);
      if (effective.settings.scheduleMode === 'restaurant') {
        const location = await tx.get(getAdminDb().collection('locations').doc(command.locationId));
        if (!location.exists || location.data()?.brandId !== command.brandId) return unavailable();
        effective.settings = resolveRestaurantDeliverySchedule(effective.settings, location.data()?.openingHours as Location['openingHours']);
      }
    }
    tx.create(auditRef, { ...record, action: 'delivery.settings.update', actorId: principalKey(identity), previousRevision: result.revision, brandRevision: result.brandRevision, createdAt: getAdminFieldValue().serverTimestamp() });
    if (result.revision === 0) tx.create(ref, record); else tx.set(ref, record);
    return { ...result, ...effective!, brandSettings: command.scope === 'brand' ? command.settings : result.brandSettings, revision, brandRevision: command.scope === 'brand' ? revision : result.brandRevision, overrides: command.scope === 'brand' ? {} : command.overrides, editable: true };
  }));
}

/** Server-owned launch gates. Missing or malformed configuration always leaves dispatch disabled. */
export function deliveryDispatchEnabled(): boolean {
  if (process.env.ORDERFLY_DELIVERY_DISPATCH_ENABLED !== 'true') return false;
  const environment = process.env.ORDERFLY_DELIVERY_ENVIRONMENT;
  return environment === 'sandbox' || environment === 'production' && process.env.ORDERFLY_DELIVERY_PRODUCTION_ENABLED === 'true';
}
