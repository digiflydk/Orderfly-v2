import 'server-only';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { AuthorityError, principalKey } from '@/lib/access/authority';
import { requirePlatformSuperuser } from '@/lib/access/orderfly-session';
import { authorizeTransaction } from '@/lib/access/scoped-data';
import { isSuperuser, policySchema } from '@/lib/access/policy';
import { storedPrinterSchema } from './storage';
import { validatePrinterConfiguration } from './configuration';
import { credentialSchema } from './device-credentials-service';
import { pilotQualificationSessionSchema, pilotOperatorAttestationSchema,
  validatePilotOperatorAttestation, PilotQualificationError, PILOT_QUALIFICATION_TTL_MS } from './pilot-qualification';
import { createSyntheticPilotJobRecord } from './synthetic-pilot-job';

const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const instant = z.number().int().positive().safe().max(8.64e15);
export const SYNTHETIC_PILOT_MIN_DELIVERY_WINDOW_MS = 60_000;
/** Consumed human-supervised ceremony, never production device capability. */
export const consumedPilotQualificationSchema = pilotQualificationSessionSchema.innerType().extend({
  state: z.literal('consumed'), jobId: token, contentDigest: digest, consumedAt: instant,
}).strict().refine(row => row.jobId === row.sessionId
  && row.expiresAt - row.issuedAt === PILOT_QUALIFICATION_TTL_MS
  && row.consumedAt >= row.issuedAt && row.consumedAt < row.expiresAt);
const fail = (code: PilotQualificationError['code']): never => { throw new PilotQualificationError(code); };
const bindingKeys = ['brandId', 'locationId', 'printerId', 'printerRevision', 'credentialRevision'] as const;

/** One controlled noncustomer job, atomically bound to the still-pending ceremony.
 * The authenticated supervisor attests the observed operator capture. The capture
 * digest/operator label themselves are not independent or manufacturer evidence.
 * No delivery, output gate, production capability or physical proof is granted.
 */
export async function consumePilotQualification(input: unknown) {
  const authenticated = await requirePlatformSuperuser();
  const parsed = pilotOperatorAttestationSchema.safeParse(input);
  if (!parsed.success) return fail('invalid_qualification');
  if (process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED !== 'true') return fail('qualification_unavailable');
  try {
    const a = parsed.data, actorId = principalKey(authenticated.identity), db = getAdminDb();
    const locationRef = db.collection('locations').doc(a.locationId);
    const printerRef = locationRef.collection('printers').doc(a.printerId);
    const sessionRef = printerRef.collection('pilotQualifications').doc(a.sessionId);
    const jobRef = printerRef.collection('pilotJobs').doc(a.sessionId);
    const pointerRef = printerRef.collection('pilotState').doc('current');
    const auditRef = printerRef.collection('pilotQualificationAudit').doc(`${a.sessionId}-consume`);
    return await db.runTransaction(async tx => {
      const policy = policySchema.safeParse((await tx.get(db.collection('platformAdminControl').doc('access-v1'))).data());
      if (!policy.success || !isSuperuser(policy.data, actorId)) throw new AuthorityError('forbidden');
      await authorizeTransaction(tx, authenticated.identity, a, 'orderfly.catalog:edit', 'location');
      const [brand, location] = await Promise.all([tx.get(db.collection('brands').doc(a.brandId)), tx.get(locationRef)]);
      const nativeScope = (row: FirebaseFirestore.DocumentSnapshot, expected: string) => {
        const value = row.data();
        return row.exists && row.id === expected && value && (value.id === undefined || value.id === expected)
          && !['deleted', 'isDeleted', 'isTestData'].some(key => value[key] !== undefined && value[key] !== false)
          && (value.deletedAt === undefined || value.deletedAt === null) && (value.isActive === undefined || value.isActive === true);
      };
      if (!nativeScope(brand, a.brandId) || !['active', 'pending', 'trialing'].includes(brand.data()!.status)
        || !nativeScope(location, a.locationId) || location.data()!.brandId !== a.brandId) return fail('qualification_conflict');
      const [printer, credential, pending, job, pointer, audit] = await Promise.all([
        tx.get(printerRef), tx.get(printerRef.collection('deviceCredentials').doc('current')),
        tx.get(sessionRef), tx.get(jobRef), tx.get(pointerRef), tx.get(auditRef),
      ]);
      const p = storedPrinterSchema.safeParse(printer.data()), c = credentialSchema.safeParse(credential.data());
      const s = pilotQualificationSessionSchema.safeParse(pending.data()), now = Date.now();
      if (!instant.safeParse(now).success) return fail('qualification_unavailable');
      if (!printer.exists || printer.id !== a.printerId || !p.success || p.data.revision !== a.printerRevision
        || !validatePrinterConfiguration(p.data.configuration, { brandId: a.brandId, locationId: a.locationId }, { id: location.id, brandId: a.brandId }).ok
        || p.data.configuration.id !== a.printerId || p.data.configuration.transport !== 'cloudprnt-http'
        || p.data.configuration.state !== 'active'
        || p.data.configuration.model !== a.model || p.data.configuration.paperWidthMm !== a.paperWidthMm
        || !credential.exists || !c.success || bindingKeys.some(key => c.data[key] !== a[key])
        || c.data.revokedAt !== null || c.data.issuedAt > now
        || !pending.exists || pending.id !== a.sessionId || !s.success || s.data.actorId !== actorId
        || job.exists || pointer.exists || audit.exists) return fail('qualification_conflict');
      validatePilotOperatorAttestation(s.data, a, now);
      // The pointer deliberately has no automatic clear/retry path. Do not
      // consume a valid ceremony so late that the resulting one-shot job is
      // unusable before the authenticated device can poll and download it.
      if (s.data.expiresAt - now < SYNTHETIC_PILOT_MIN_DELIVERY_WINDOW_MS) return fail('invalid_qualification');
      const record = createSyntheticPilotJobRecord({ brandId: a.brandId, locationId: a.locationId,
        printerId: a.printerId, printerRevision: a.printerRevision, credentialRevision: a.credentialRevision,
        sessionId: a.sessionId, model: a.model, paperWidthMm: a.paperWidthMm, createdAt: now, expiresAt: s.data.expiresAt });
      const consumed = consumedPilotQualificationSchema.parse({ ...s.data, state: 'consumed', jobId: a.sessionId,
        contentDigest: record.content.sha256, consumedAt: now });
      tx.create(jobRef, record);
      tx.create(pointerRef, { schemaVersion: 1, sessionId: a.sessionId });
      tx.set(sessionRef, consumed);
      tx.create(auditRef, { schemaVersion: 1, action: 'printer.pilotQualification.consume', actorId,
        brandId: a.brandId, locationId: a.locationId, printerId: a.printerId,
        printerRevision: a.printerRevision, credentialRevision: a.credentialRevision,
        sessionId: a.sessionId, jobId: a.sessionId, trust: 'supervised_operator', operatorLabel: a.operatorId,
        method: a.method, labelSku: a.labelSku, firmware: a.firmware, model: a.model,
        captureDigest: a.captureDigest, contentDigest: record.content.sha256, consumedAt: now, expiresAt: s.data.expiresAt });
      return Object.freeze({ brandId: a.brandId, locationId: a.locationId, printerId: a.printerId,
        printerRevision: a.printerRevision, credentialRevision: a.credentialRevision,
        sessionId: a.sessionId, jobId: a.sessionId, contentDigest: record.content.sha256,
        trust: 'supervised_operator' as const, outputAuthorized: false as const,
        dispatchAuthorized: false as const, activationAuthorized: false as const, physicalCompatibilityVerified: false as const });
    });
  } catch (error) {
    if (error instanceof AuthorityError || error instanceof PilotQualificationError) throw error;
    return fail('qualification_unavailable');
  }
}
