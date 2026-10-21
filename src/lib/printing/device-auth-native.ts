import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import type { NativeTransactionContext } from '@/lib/server/firestore-compat';
import { storedPrinterSchema } from './storage';
import { comparePrinterDeviceCredentialCandidates } from './device-auth';

export const PRINTER_DEVICE_CREDENTIAL_DOCUMENT = 'current';
export class NativePrinterDeviceAuthenticationError extends Error {
  constructor(readonly code: 'invalid_device_request' | 'device_unverified' | 'device_unavailable') { super(code); }
}
export type NativePrinterDeviceIdentitySnapshot = Readonly<{
  brandId: string; locationId: string; printerId: string;
  printerRevision: number; credentialRevision: number;
  printerState: 'active' | 'paused' | 'disabled';
  deviceVerifiedForAttempt: true;
  dispatchAuthorized: false; capabilityAuthorized: false; physicalCompatibilityVerified: false;
}>;
type Row = Record<string, unknown>;
const reject = (): never => { throw new NativePrinterDeviceAuthenticationError('device_unverified'); };
function field(row: Row, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(row, key);
  if (descriptor && !('value' in descriptor)) return reject();
  return descriptor?.value;
}
function dataRow(value: unknown): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return reject();
  return value as Row;
}
const validId = (value: unknown): value is string => typeof value === 'string' && value.length >= 1 && value.length <= 128 && /^[A-Za-z0-9_-]+$/.test(value);
function request(input: unknown) {
  try {
    const row = dataRow(input), keys = Reflect.ownKeys(row);
    if (keys.length !== 4 || keys.some(key => typeof key !== 'string' || !['brandId', 'locationId', 'printerId', 'secret'].includes(key))) return reject();
    const brandId = field(row, 'brandId'), locationId = field(row, 'locationId'), printerId = field(row, 'printerId'), secret = field(row, 'secret');
    if (!validId(brandId) || !validId(locationId) || !validId(printerId) || typeof secret !== 'string'
      || secret.length !== 43 || !/^[A-Za-z0-9_-]{43}$/.test(secret)
      || Buffer.from(secret, 'base64url').toString('base64url') !== secret) return reject();
    return { brandId, locationId, printerId, secret };
  } catch { throw new NativePrinterDeviceAuthenticationError('invalid_device_request'); }
}
function nativeRow(snapshot: FirebaseFirestore.DocumentSnapshot, id: string): Row {
  if (!snapshot.exists || snapshot.id !== id) return reject();
  return dataRow(snapshot.data());
}
function nativeScope(snapshot: FirebaseFirestore.DocumentSnapshot, id: string): Row {
  const row = nativeRow(snapshot, id);
  if (field(row, 'id') !== undefined && field(row, 'id') !== id) return reject();
  for (const key of ['deleted', 'isDeleted', 'isTestData']) if (field(row, key) !== undefined && field(row, key) !== false) return reject();
  if (field(row, 'deletedAt') !== undefined && field(row, 'deletedAt') !== null) return reject();
  if (field(row, 'isActive') !== undefined && field(row, 'isActive') !== true) return reject();
  return row;
}
function printerData(row: Row) {
  const keys = Reflect.ownKeys(row), allowed = ['schemaVersion', 'configuration', 'revision', 'deletedAt', 'createdAt', 'updatedAt'];
  if (keys.length > allowed.length || keys.some(key => typeof key !== 'string' || !allowed.includes(key))) return reject();
  const copy: Row = {};
  for (const key of keys as string[]) copy[key] = field(row, key);
  const raw = dataRow(copy.configuration), configKeys = Reflect.ownKeys(raw);
  if (configKeys.length > 10) return reject();
  const configuration: Row = {};
  for (const key of configKeys) {
    if (typeof key !== 'string' || key.length > 32) return reject();
    const value = field(raw, key);
    if (typeof value === 'string' ? value.length > 160 : typeof value !== 'number') return reject();
    configuration[key] = value;
  }
  const parsed = storedPrinterSchema.safeParse({ ...copy, configuration });
  if (!parsed.success) return reject();
  return parsed.data;
}

/**
 * Read-only identity snapshot in a TRUSTED caller's current native transaction.
 * Invoke again inside every retry/operation. This DTO is never a capability,
 * freshness/commit proof, lifecycle permission, transport verification or dispatch grant.
 */
export async function verifyNativePrinterDevice(context: NativeTransactionContext, input: unknown): Promise<NativePrinterDeviceIdentitySnapshot> {
  const command = request(input); // All external bounds precede any native path.
  try {
    if (!context || context.db !== getAdminDb() || !context.transaction || typeof context.transaction.get !== 'function') return reject();
    const { db, transaction } = context;
    const { brandId, locationId, printerId, secret } = command;
    const locationRef = db.collection('locations').doc(locationId);
    // Establish native tenant ownership before constructing or reading private paths.
    const [brand, location] = await Promise.all([
      transaction.get(db.collection('brands').doc(brandId)), transaction.get(locationRef),
    ]);
    const nativeBrand = nativeScope(brand, brandId);
    // Canonical Brand.status, not legacy isActive, owns tenant suspension.
    // Pending/trialing may identify during onboarding; this grants no dispatch.
    const brandStatus = field(nativeBrand, 'status');
    if (brandStatus !== 'active' && brandStatus !== 'pending' && brandStatus !== 'trialing') return reject();
    if (field(nativeScope(location, locationId), 'brandId') !== brandId) return reject();
    const printerRef = locationRef.collection('printers').doc(printerId);
    const [printer, credential] = await Promise.all([
      transaction.get(printerRef), transaction.get(printerRef.collection('deviceCredentials').doc(PRINTER_DEVICE_CREDENTIAL_DOCUMENT)),
    ]);
    const stored = printerData(nativeRow(printer, printerId)), config = stored.configuration;
    if (config.id !== printerId || config.brandId !== brandId || config.locationId !== locationId) return reject();
    const privateRecord = nativeRow(credential, PRINTER_DEVICE_CREDENTIAL_DOCUMENT);
    const credentialRevision = field(privateRecord, 'credentialRevision');
    if (typeof credentialRevision !== 'number' || !Number.isSafeInteger(credentialRevision) || credentialRevision < 1) return reject();
    const expected = { brandId, locationId, printerId, printerRevision: stored.revision, credentialRevision };
    if (!comparePrinterDeviceCredentialCandidates(privateRecord, expected, secret).credentialMatches) return reject();
    return Object.freeze({ ...expected, printerState: config.state, deviceVerifiedForAttempt: true as const,
      dispatchAuthorized: false as const, capabilityAuthorized: false as const, physicalCompatibilityVerified: false as const });
  } catch (error) {
    if (error instanceof NativePrinterDeviceAuthenticationError) throw error;
    throw new NativePrinterDeviceAuthenticationError('device_unavailable');
  }
}
