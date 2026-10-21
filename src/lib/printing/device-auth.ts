import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Private candidate data only. A DTO is never native identity or output authority. */
export type PrinterDeviceCredentialBinding = Readonly<{
  brandId: string; locationId: string; printerId: string;
  printerRevision: number; credentialRevision: number;
}>;
export type PrivatePrinterDeviceCredential = PrinterDeviceCredentialBinding & Readonly<{
  schemaVersion: 1; secretDigest: string; issuedAt: number; revokedAt: number | null;
}>;
export type PrinterDeviceCredentialComparison = Readonly<{
  credentialMatches: boolean; authenticationAuthorized: false; dispatchAuthorized: false;
}>;
const bindingKeys = ['brandId', 'locationId', 'printerId', 'printerRevision', 'credentialRevision'] as const;
const recordKeys = [...bindingKeys, 'schemaVersion', 'secretDigest', 'issuedAt', 'revokedAt'] as const;
const rejected: PrinterDeviceCredentialComparison = Object.freeze({ credentialMatches: false, authenticationAuthorized: false, dispatchAuthorized: false });
const matched: PrinterDeviceCredentialComparison = Object.freeze({ credentialMatches: true, authenticationAuthorized: false, dispatchAuthorized: false });
const validRevision = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
const validId = (value: unknown): value is string => typeof value === 'string' && value.length >= 1 && value.length <= 128 && /^[A-Za-z0-9_-]+$/.test(value);

// Bound fields before regex/hash work; do not invoke accessors or walk unknown data.
function fields(input: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  if (![Object.prototype, null].includes(Object.getPrototypeOf(input))) return null;
  const own = Reflect.ownKeys(input);
  if (own.length !== keys.length || own.some(key => typeof key !== 'string' || !keys.includes(key))) return null;
  const result: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !('value' in descriptor)) return null;
    result[key] = descriptor.value;
  }
  return result;
}
function binding(input: unknown, record = false): Record<string, unknown> | null {
  const row = fields(input, record ? recordKeys : bindingKeys);
  if (!row || !validId(row.brandId) || !validId(row.locationId) || !validId(row.printerId)
    || !validRevision(row.printerRevision) || !validRevision(row.credentialRevision)) return null;
  return row;
}
function digest(scope: Record<string, unknown>, secret: string): Buffer {
  // Frame each field so a copied digest cannot authenticate another scope/revision.
  return createHash('sha256').update(JSON.stringify(['orderfly/printer-device/v1',
    ...bindingKeys.map(key => scope[key]), secret])).digest();
}
function canonicalSecret(value: unknown): value is string {
  return typeof value === 'string' && value.length === 43 && /^[A-Za-z0-9_-]{43}$/.test(value)
    && Buffer.from(value, 'base64url').toString('base64url') === value;
}

/** Unpersisted server draft. Provisioning must separately authorize and atomically store it. */
export function createPrinterDeviceCredentialDraft(input: unknown): Readonly<{
  secret: string; record: PrivatePrinterDeviceCredential;
}> {
  let scope: Record<string, unknown> | null;
  try { scope = binding(input); } catch { scope = null; }
  if (!scope) throw new Error('Invalid private device credential binding');
  const secret = randomBytes(32).toString('base64url');
  const record = Object.freeze({ ...scope, schemaVersion: 1, secretDigest: digest(scope, secret).toString('hex'),
    issuedAt: Date.now(), revokedAt: null }) as PrivatePrinterDeviceCredential;
  // Keep the one-time secret out of ordinary JSON/object logging. Never expose
  // this server-only object through a public DTO or log an extracted secret.
  return Object.freeze(Object.defineProperty({ record }, 'secret', { value: secret })) as Readonly<{ secret: string; record: PrivatePrinterDeviceCredential }>;
}

/**
 * Pure comparison of UNTRUSTED candidates, deliberately not authentication.
 * A future native service must reread current printer/scope/credential in each
 * operation; supplied records, expected revisions and a true result grant nothing.
 */
export function comparePrinterDeviceCredentialCandidates(recordInput: unknown, expectedBinding: unknown, secret: unknown): PrinterDeviceCredentialComparison {
  try {
    const row = binding(recordInput, true), expected = binding(expectedBinding);
    if (!row || !expected || !canonicalSecret(secret) || row.schemaVersion !== 1
      || typeof row.secretDigest !== 'string' || row.secretDigest.length !== 64 || !/^[a-f0-9]{64}$/.test(row.secretDigest)
      || !validRevision(row.issuedAt) || row.issuedAt > Date.now() || row.revokedAt !== null
      || bindingKeys.some(key => row[key] !== expected[key])) return rejected;
    return timingSafeEqual(Buffer.from(row.secretDigest, 'hex'), digest(row, secret)) ? matched : rejected;
  } catch { return rejected; }
}
