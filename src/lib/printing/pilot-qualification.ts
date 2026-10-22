import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { AuthorityError, principalKey } from '@/lib/access/authority';
import { requirePlatformSuperuser } from '@/lib/access/orderfly-session';
import { authorizeTransaction } from '@/lib/access/scoped-data';
import { isSuperuser, policySchema } from '@/lib/access/policy';
import { storedPrinterSchema } from './storage';
import { validatePrinterConfiguration } from './configuration';
import { credentialSchema } from './device-credentials-service';

const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const revision = z.number().int().positive().safe();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const instant = revision.max(8.64e15);
const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const binding = { brandId: id, locationId: id, printerId: id, printerRevision: revision, credentialRevision: revision };
const command = z.object(binding).strict();
export const PILOT_QUALIFICATION_TTL_MS = 600_000;
const deniedAuthority = { outputAuthorized: z.literal(false), dispatchAuthorized: z.literal(false),
  activationAuthorized: z.literal(false), physicalCompatibilityVerified: z.literal(false) };
/** Private pending ceremony. Neither native device capability nor output permission. */
export const pilotQualificationSessionSchema = z.object({ schemaVersion: z.literal(1), ...binding,
  sessionId: token, nonceDigest: digest, actorId: z.string().min(1).max(256).regex(/^[\x21-\x7e]+$/), state: z.literal('pending_operator_attestation'),
  trust: z.literal('supervised_operator'), issuedAt: instant, expiresAt: instant, ...deniedAuthority,
}).strict().refine(row => row.expiresAt - row.issuedAt === PILOT_QUALIFICATION_TTL_MS);
/** Operator input for a future authorized, transactional single-use consumer.
 * Capture digest references private controlled collection, never manufacturer attestation.
 */
export const pilotOperatorAttestationSchema = z.object({ ...binding, sessionId: token, nonce: token,
  trust: z.literal('supervised_operator'), operatorId: id, physicalDeviceIdentified: z.literal(true),
  nativeEnrollmentCorrelated: z.literal(true), method: z.literal('stario_firmware_query'),
  model: z.enum(['mc-print2', 'mc-print3']), labelSku: z.string().min(1).max(64).regex(/^[A-Za-z0-9 _.-]+$/),
  firmware: z.string().regex(/^\d{1,3}\.\d{1,3}(?:\.\d{1,3})?$/), captureDigest: digest,
  paperWidthMm: z.union([z.literal(58), z.literal(80)]), rasterWidthDots: z.union([z.literal(384), z.literal(576)]),
  transport: z.literal('cloudprnt-http'), mediaType: z.literal('image/png'),
}).strict().refine(row => (row.model !== 'mc-print2' || row.paperWidthMm === 58)
  && row.rasterWidthDots === (row.paperWidthMm === 58 ? 384 : 576)
  && (() => { const [major, minor] = row.firmware.split('.').map(Number); return major > 3 || major === 3 && minor >= 2; })());
export class PilotQualificationError extends Error {
  constructor(readonly code: 'invalid_qualification' | 'qualification_unavailable' | 'qualification_conflict') { super(code); }
}
const fail = (code: PilotQualificationError['code']): never => { throw new PilotQualificationError(code); };
const nonceDigest = (nonce: string, session: z.infer<typeof command> & { sessionId: string }) => createHash('sha256')
  .update(JSON.stringify(['orderfly-pilot-qualification-v1', session.brandId, session.locationId,
    session.printerId, session.printerRevision, session.credentialRevision, session.sessionId, nonce])).digest('hex');

/** Pure validation only. Caller must freshly authorize native state/revisions and
 * atomically consume the pending session; this return MUST NOT authorize dispatch.
 */
export function validatePilotOperatorAttestation(saved: unknown, input: unknown, now: number) {
  const session = pilotQualificationSessionSchema.safeParse(saved), attestation = pilotOperatorAttestationSchema.safeParse(input);
  if (!session.success || !attestation.success || !instant.safeParse(now).success
    || now < session.data.issuedAt || now >= session.data.expiresAt) return fail('invalid_qualification');
  const s = session.data, a = attestation.data;
  if (Object.keys(binding).some(key => s[key as keyof typeof binding] !== a[key as keyof typeof binding])
    || s.sessionId !== a.sessionId || !timingSafeEqual(Buffer.from(s.nonceDigest, 'hex'), Buffer.from(nonceDigest(a.nonce, s), 'hex'))) return fail('invalid_qualification');
  return Object.freeze({ sessionId: s.sessionId, trust: 'supervised_operator' as const,
    captureDigest: a.captureDigest, outputAuthorized: false as const, dispatchAuthorized: false as const,
    activationAuthorized: false as const, physicalCompatibilityVerified: false as const });
}

/** Issue pending session only, with fresh native authority on every SDK attempt.
 * No attestation acceptance, capability producer, HTTP endpoint or hardware I/O.
 */
export async function issuePilotQualificationSession(input: unknown) {
  const session = await requirePlatformSuperuser();
  const parsed = command.safeParse(input);
  if (!parsed.success) return fail('invalid_qualification');
  if (process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED !== 'true') return fail('qualification_unavailable');
  try {
    const c = parsed.data, actorId = principalKey(session.identity), db = getAdminDb();
    // Entropy is generated once outside SDK retries. Plaintext never enters callback result.
    const sessionId = randomBytes(32).toString('base64url'), nonce = randomBytes(32).toString('base64url');
    const locationRef = db.collection('locations').doc(c.locationId);
    const printerRef = locationRef.collection('printers').doc(c.printerId);
    const sessionRef = printerRef.collection('pilotQualifications').doc(sessionId);
    const auditRef = printerRef.collection('pilotQualificationAudit').doc(sessionId);
    const result = await db.runTransaction(async tx => {
      const policy = policySchema.safeParse((await tx.get(db.collection('platformAdminControl').doc('access-v1'))).data());
      if (!policy.success || !isSuperuser(policy.data, actorId)) throw new AuthorityError('forbidden');
      await authorizeTransaction(tx, session.identity, c, 'orderfly.catalog:edit', 'location');
      const [brand, location] = await Promise.all([tx.get(db.collection('brands').doc(c.brandId)), tx.get(locationRef)]);
      const validNative = (row: FirebaseFirestore.DocumentSnapshot, expected: string) => {
        const value = row.data();
        return row.exists && row.id === expected && value && (value.id === undefined || value.id === expected)
          && !['deleted', 'isDeleted', 'isTestData'].some(key => value[key] !== undefined && value[key] !== false)
          && (value.deletedAt === undefined || value.deletedAt === null) && (value.isActive === undefined || value.isActive === true);
      };
      if (!validNative(brand, c.brandId) || !['active', 'pending', 'trialing'].includes(brand.data()!.status)
        || !validNative(location, c.locationId) || location.data()!.brandId !== c.brandId) return fail('qualification_conflict');
      const [printer, credential, existing, audit] = await Promise.all([tx.get(printerRef),
        tx.get(printerRef.collection('deviceCredentials').doc('current')), tx.get(sessionRef), tx.get(auditRef)]);
      const p = storedPrinterSchema.safeParse(printer.data()), cred = credentialSchema.safeParse(credential.data());
      const now = Date.now();
      if (!instant.safeParse(now).success || now > 8.64e15 - PILOT_QUALIFICATION_TTL_MS) return fail('qualification_unavailable');
      if (!printer.exists || printer.id !== c.printerId || !p.success || p.data.revision !== c.printerRevision
        || !validatePrinterConfiguration(p.data.configuration, { brandId: c.brandId, locationId: c.locationId }, { id: location.id, brandId: c.brandId }).ok
        || p.data.configuration.id !== c.printerId || p.data.configuration.manufacturer !== 'star'
        || p.data.configuration.transport !== 'cloudprnt-http'
        || !credential.exists || !cred.success || Object.keys(binding).some(key => cred.data[key as keyof typeof binding] !== c[key as keyof typeof binding])
        || cred.data.revokedAt !== null || cred.data.issuedAt > now || existing.exists || audit.exists) return fail('qualification_conflict');
      const record = pilotQualificationSessionSchema.parse({ schemaVersion: 1, ...c, sessionId, nonceDigest: nonceDigest(nonce, { ...c, sessionId }),
        actorId, state: 'pending_operator_attestation', trust: 'supervised_operator', issuedAt: now, expiresAt: now + PILOT_QUALIFICATION_TTL_MS,
        outputAuthorized: false, dispatchAuthorized: false, activationAuthorized: false, physicalCompatibilityVerified: false });
      tx.create(sessionRef, record);
      tx.create(auditRef, { schemaVersion: 1, ...c, sessionId, actorId, action: 'printer.pilotQualification.issue',
        trust: 'supervised_operator', issuedAt: now, expiresAt: record.expiresAt });
      return Object.freeze({ ...c, sessionId, expiresAt: record.expiresAt, outputAuthorized: false as const,
        dispatchAuthorized: false as const, activationAuthorized: false as const, physicalCompatibilityVerified: false as const });
    });
    return Object.freeze(Object.defineProperty({ ...result }, 'nonce', { value: nonce }));
  } catch (error) {
    if (error instanceof AuthorityError || error instanceof PilotQualificationError) throw error;
    return fail('qualification_unavailable');
  }
}
