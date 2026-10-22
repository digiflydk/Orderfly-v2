import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { NativeTransactionContext } from '@/lib/server/firestore-compat';
import { verifyNativePrinterDevice } from './device-auth-native';

const CHALLENGE_TTL_MS = 120_000;
const MAX_CLOCK_MS = 8.64e15;
const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const mac = z.string().regex(/^[0-9a-f]{2}(?::[0-9a-f]{2}){5}$/);
const boundedAscii = z.string().min(1).max(64).regex(/^[\x20-\x7e]+$/);
const encoding = z.string().min(1).max(32).regex(/^[A-Za-z0-9._+-]+$/);
const optionalSerial = boundedAscii.refine(value => !/^(?:n\/a|unknown|none)$/i.test(value));

export const nativeProtocolFactsSchema = z.object({
  mac,
  uid: z.string().min(1).max(128).regex(/^[\x20-\x7e]+$/).nullable(),
  clientFamily: z.enum(['cloudprnt', 'star-cloudprnt']),
  clientVersion: z.string().min(1).max(32).regex(/^\d+(?:\.\d+){0,3}$/),
  serial: optionalSerial.nullable(),
  protocols: z.array(z.enum(['http', 'https', 'mqtt'])).min(1).max(3),
  encodings: z.array(encoding).min(1).max(16),
  mediaTypes: z.array(z.enum(['image/png', 'text/plain'])).min(1).max(2),
  page: z.object({ widthDots: z.number().int().min(1).max(2048), dpi: z.number().int().min(72).max(1200) }).strict(),
}).strict().refine(value => [value.protocols, value.encodings, value.mediaTypes]
  .every(values => new Set(values).size === values.length));

export const storedNativeProtocolObservationSchema = z.object({
  schemaVersion: z.literal(1), brandId: id, locationId: id, printerId: id,
  printerRevision: z.number().int().min(0).safe(), credentialRevision: z.number().int().min(1).safe(),
  observationRevision: z.number().int().min(1).safe(), recordedAt: z.number().int().positive().max(MAX_CLOCK_MS),
  nonceDigest: digest, facts: nativeProtocolFactsSchema,
}).strict();

const challengeSchema = z.object({
  schemaVersion: z.literal(1), brandId: id, locationId: id, printerId: id,
  printerRevision: z.number().int().min(0).safe(), credentialRevision: z.number().int().min(1).safe(),
  nonceDigest: digest, issuedAt: z.number().int().positive().max(MAX_CLOCK_MS),
  expiresAt: z.number().int().positive().max(MAX_CLOCK_MS),
  consumedAt: z.number().int().positive().max(MAX_CLOCK_MS).nullable(),
}).strict().refine(value => value.expiresAt === value.issuedAt + CHALLENGE_TTL_MS
  && (value.consumedAt === null || value.consumedAt >= value.issuedAt && value.consumedAt < value.expiresAt));

type Facts = z.infer<typeof nativeProtocolFactsSchema>;
type StoredObservation = z.infer<typeof storedNativeProtocolObservationSchema>;
type Scope = { brandId: string; locationId: string; printerId: string; secret: string };
type Row = Record<string, unknown>;

export class NativeProtocolObservationError extends Error {
  constructor(readonly code: 'invalid_protocol_observation' | 'protocol_observation_unavailable') { super(code); }
}
const invalid = (): never => { throw new NativeProtocolObservationError('invalid_protocol_observation'); };
const hash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const safeNow = () => { const now = Date.now(); return Number.isSafeInteger(now) && now > 0 && now <= MAX_CLOCK_MS ? now : invalid(); };
const ownData = (value: unknown, maxKeys: number): Row => {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return invalid();
    const keys = Reflect.ownKeys(value);
    if (keys.length > maxKeys) return invalid();
    const result: Row = Object.create(null);
    for (const key of keys) {
      if (typeof key !== 'string' || key.length > 128) return invalid();
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor)) return invalid();
      result[key] = descriptor.value;
    }
    return result;
  } catch (error) {
    if (error instanceof NativeProtocolObservationError) throw error;
    return invalid();
  }
};
const ownArray = (value: unknown, max: number): unknown[] => {
  try {
    if (!Array.isArray(value) || value.length < 1 || value.length > max) return invalid();
    const result: unknown[] = [];
    for (let index = 0; index < value.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !('value' in descriptor)) return invalid();
      result.push(descriptor.value);
    }
    const keys = Reflect.ownKeys(value);
    if (keys.length !== value.length + 1 || keys.some(key => key !== 'length' && (typeof key !== 'string' || !/^\d+$/.test(key)))) return invalid();
    return result;
  } catch (error) {
    if (error instanceof NativeProtocolObservationError) throw error;
    return invalid();
  }
};
function exactScope(input: unknown): Scope {
  const row = ownData(input, 4), keys = Object.keys(row), allowed = ['brandId', 'locationId', 'printerId', 'secret'];
  if (keys.length !== 4 || keys.some(key => !allowed.includes(key))) return invalid();
  const parsed = z.object({ brandId: id, locationId: id, printerId: id,
    secret: z.string().length(43).regex(/^[A-Za-z0-9_-]{43}$/) }).strict().safeParse(row);
  if (!parsed.success || Buffer.from(parsed.data.secret, 'base64url').toString('base64url') !== parsed.data.secret) return invalid();
  return parsed.data;
}
function uniqueFacts(input: unknown): Facts {
  const row = ownData(input, 9);
  const candidate = { ...row, protocols: ownArray(row.protocols, 3), encodings: ownArray(row.encodings, 16),
    mediaTypes: ownArray(row.mediaTypes, 2), page: ownData(row.page, 2) };
  const parsed = nativeProtocolFactsSchema.safeParse(candidate);
  if (!parsed.success) return invalid();
  for (const values of [parsed.data.protocols, parsed.data.encodings, parsed.data.mediaTypes]) {
    if (new Set(values).size !== values.length) return invalid();
  }
  return parsed.data;
}
function command(input: unknown): Scope & { nonce: string; facts: Facts } {
  const row = ownData(input, 6), keys = Object.keys(row), allowed = ['brandId', 'locationId', 'printerId', 'secret', 'nonce', 'facts'];
  if (keys.length !== 6 || keys.some(key => !allowed.includes(key))) return invalid();
  const scope = exactScope({ brandId: row.brandId, locationId: row.locationId, printerId: row.printerId, secret: row.secret });
  if (typeof row.nonce !== 'string' || row.nonce.length !== 43 || !/^[A-Za-z0-9_-]{43}$/.test(row.nonce)
    || Buffer.from(row.nonce, 'base64url').toString('base64url') !== row.nonce) return invalid();
  return { ...scope, nonce: row.nonce, facts: uniqueFacts(row.facts) };
}
function snapshotData(snapshot: FirebaseFirestore.DocumentSnapshot): unknown {
  return snapshot.exists ? snapshot.data() : undefined;
}
function refs(context: NativeTransactionContext, scope: Pick<Scope, 'locationId' | 'printerId'>) {
  const printer = context.db.collection('locations').doc(scope.locationId).collection('printers').doc(scope.printerId);
  return { challenge: printer.collection('protocolObservationChallenges').doc('current'),
    current: printer.collection('protocolObservations').doc('current'),
    audit: (revision: number) => printer.collection('protocolObservationAudit').doc(String(revision).padStart(12, '0')) };
}
function publicObservation(stored: StoredObservation) {
  const { nonceDigest: _private, ...visible } = stored;
  return Object.freeze({ ...visible, dispatchAuthorized: false as const, capabilityAuthorized: false as const,
    physicalCompatibilityVerified: false as const });
}

/** Issues a short-lived server nonce after fresh native authentication. The nonce is
 * returned only to that authenticated caller and is never included in later DTOs. */
export async function issueNativeProtocolObservationChallenge(context: NativeTransactionContext, input: unknown) {
  if (process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED !== 'true')
    throw new NativeProtocolObservationError('protocol_observation_unavailable');
  const scope = exactScope(input);
  try {
    const identity = await verifyNativePrinterDevice(context, scope);
    if (identity.printerState !== 'active') return invalid();
    const nonce = randomBytes(32).toString('base64url'), reference = refs(context, scope).challenge;
    const existing = await context.transaction.get(reference);
    const now = safeNow();
    if (existing.exists) {
      const parsed = challengeSchema.safeParse(snapshotData(existing));
      if (!parsed.success || parsed.data.brandId !== scope.brandId || parsed.data.locationId !== scope.locationId
        || parsed.data.printerId !== scope.printerId || parsed.data.printerRevision > identity.printerRevision
        || parsed.data.credentialRevision > identity.credentialRevision || parsed.data.issuedAt > now
        || (parsed.data.consumedAt ?? 0) > now || parsed.data.consumedAt === null && now < parsed.data.expiresAt) return invalid();
    }
    const saved = { schemaVersion: 1 as const, brandId: scope.brandId, locationId: scope.locationId, printerId: scope.printerId,
      printerRevision: identity.printerRevision, credentialRevision: identity.credentialRevision,
      nonceDigest: hash(nonce), issuedAt: now, expiresAt: now + CHALLENGE_TTL_MS, consumedAt: null };
    if (!challengeSchema.safeParse(saved).success) return invalid();
    context.transaction.set(reference, saved);
    return Object.freeze({ nonce, expiresAt: saved.expiresAt, dispatchAuthorized: false as const,
      capabilityAuthorized: false as const, physicalCompatibilityVerified: false as const });
  } catch (error) {
    if (error instanceof NativeProtocolObservationError) throw error;
    throw new NativeProtocolObservationError('protocol_observation_unavailable');
  }
}

/** Consumes one server nonce and atomically stores current + immutable audit evidence.
 * This is an observation only: it can never authorize dispatch or physical capability. */
export async function persistNativeProtocolObservation(context: NativeTransactionContext, input: unknown) {
  if (process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED !== 'true')
    throw new NativeProtocolObservationError('protocol_observation_unavailable');
  const value = command(input);
  try {
    const identity = await verifyNativePrinterDevice(context, {
      brandId: value.brandId, locationId: value.locationId, printerId: value.printerId, secret: value.secret,
    });
    if (identity.printerState !== 'active') return invalid();
    const reference = refs(context, value);
    const [challengeSnapshot, currentSnapshot] = await Promise.all([
      context.transaction.get(reference.challenge), context.transaction.get(reference.current),
    ]);
    const challenge = challengeSchema.safeParse(snapshotData(challengeSnapshot));
    if (!challenge.success || challenge.data.consumedAt !== null
      || challenge.data.brandId !== value.brandId || challenge.data.locationId !== value.locationId
      || challenge.data.printerId !== value.printerId || challenge.data.printerRevision !== identity.printerRevision
      || challenge.data.credentialRevision !== identity.credentialRevision || challenge.data.nonceDigest !== hash(value.nonce)) return invalid();
    const now = safeNow();
    if (now < challenge.data.issuedAt || now >= challenge.data.expiresAt) return invalid();
    let observationRevision = 1;
    if (currentSnapshot.exists) {
      const current = storedNativeProtocolObservationSchema.safeParse(snapshotData(currentSnapshot));
      if (!current.success || current.data.brandId !== value.brandId || current.data.locationId !== value.locationId
        || current.data.printerId !== value.printerId || current.data.printerRevision > identity.printerRevision
        || current.data.credentialRevision > identity.credentialRevision || current.data.recordedAt > now
        || current.data.observationRevision >= Number.MAX_SAFE_INTEGER) return invalid();
      observationRevision = current.data.observationRevision + 1;
    }
    const audit = reference.audit(observationRevision);
    const auditSnapshot = await context.transaction.get(audit);
    if (auditSnapshot.exists) return invalid();
    const saved = { schemaVersion: 1 as const, brandId: value.brandId, locationId: value.locationId, printerId: value.printerId,
      printerRevision: identity.printerRevision, credentialRevision: identity.credentialRevision,
      observationRevision, recordedAt: now, nonceDigest: challenge.data.nonceDigest, facts: value.facts };
    if (!storedNativeProtocolObservationSchema.safeParse(saved).success) return invalid();
    context.transaction.update(reference.challenge, { consumedAt: now });
    context.transaction.set(reference.current, saved);
    context.transaction.create(audit, saved);
    return publicObservation(saved);
  } catch (error) {
    if (error instanceof NativeProtocolObservationError) throw error;
    throw new NativeProtocolObservationError('protocol_observation_unavailable');
  }
}

/** Freshly re-authenticated private read. Missing, legacy, foreign or stale evidence
 * remains unknown and is never upgraded to a capability assertion. */
export async function readNativeProtocolObservation(context: NativeTransactionContext, input: unknown) {
  const scope = exactScope(input);
  try {
    const identity = await verifyNativePrinterDevice(context, scope);
    const snapshot = await context.transaction.get(refs(context, scope).current);
    if (!snapshot.exists) return null;
    const parsed = storedNativeProtocolObservationSchema.safeParse(snapshotData(snapshot));
    if (!parsed.success || parsed.data.brandId !== scope.brandId || parsed.data.locationId !== scope.locationId
      || parsed.data.printerId !== scope.printerId || parsed.data.printerRevision !== identity.printerRevision
      || parsed.data.credentialRevision !== identity.credentialRevision || parsed.data.recordedAt > safeNow()) return null;
    return publicObservation(parsed.data);
  } catch (error) {
    if (error instanceof NativeProtocolObservationError) throw error;
    throw new NativeProtocolObservationError('protocol_observation_unavailable');
  }
}
