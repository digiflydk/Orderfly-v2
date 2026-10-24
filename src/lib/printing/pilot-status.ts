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
import { PilotQualificationError } from './pilot-qualification';
import { syntheticPilotJobSchema, testPrintSessionSchema } from './synthetic-pilot-job';
import { readSyntheticTestBonContent } from './job-content';

const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const revision = z.number().int().positive().safe();
export const pilotStatusScopeSchema = z.object({ brandId: id, locationId: id, printerId: id,
  printerRevision: revision, credentialRevision: revision }).strict();
export const pilotStatusResultSchema = pilotStatusScopeSchema.extend({
  state: z.enum(['none', 'queued', 'offered', 'download_started', 'confirmed', 'failed', 'unknown', 'expired']),
  createdAt: z.number().int().positive().safe().nullable(), expiresAt: z.number().int().positive().safe().nullable(),
  confirmedAt: z.number().int().positive().safe().nullable(), physicalCompatibilityVerified: z.literal(false),
}).strict();
const fail = (code: PilotQualificationError['code']): never => { throw new PilotQualificationError(code); };

/** Read-only supervised status. No credential, token, payload or operator capture
 * leaves this boundary, and device confirmation never proves physical paper fit. */
export async function readPrinterPilotStatus(input: unknown) {
  const authenticated = await requirePlatformSuperuser();
  const parsed = pilotStatusScopeSchema.safeParse(input);
  if (!parsed.success) return fail('invalid_qualification');
  try {
    const c = parsed.data, db = getAdminDb(), actorId = principalKey(authenticated.identity);
    const locationRef = db.collection('locations').doc(c.locationId);
    const printerRef = locationRef.collection('printers').doc(c.printerId);
    return await db.runTransaction(async tx => {
      const policy = policySchema.safeParse((await tx.get(db.collection('platformAdminControl').doc('access-v1'))).data());
      if (!policy.success || !isSuperuser(policy.data, actorId)) throw new AuthorityError('forbidden');
      await authorizeTransaction(tx, authenticated.identity, c, 'orderfly.catalog:edit', 'location');
      const [brand, location, printer, credential, pointer] = await Promise.all([
        tx.get(db.collection('brands').doc(c.brandId)), tx.get(locationRef), tx.get(printerRef),
        tx.get(printerRef.collection('deviceCredentials').doc('current')), tx.get(printerRef.collection('pilotState').doc('current')),
      ]);
      const native = (row: FirebaseFirestore.DocumentSnapshot, expected: string) => {
        const value = row.data();
        return row.exists && row.id === expected && value && (value.id === undefined || value.id === expected)
          && !['deleted', 'isDeleted', 'isTestData'].some(key => value[key] !== undefined && value[key] !== false)
          && (value.deletedAt === undefined || value.deletedAt === null) && (value.isActive === undefined || value.isActive === true);
      };
      const p = storedPrinterSchema.safeParse(printer.data()), cred = credentialSchema.safeParse(credential.data()), now = Date.now();
      if (!Number.isSafeInteger(now) || now <= 0) return fail('qualification_unavailable');
      if (!native(brand, c.brandId) || !['active', 'pending', 'trialing'].includes(brand.data()!.status)
        || !native(location, c.locationId) || location.data()!.brandId !== c.brandId
        || !printer.exists || printer.id !== c.printerId || !p.success || p.data.revision !== c.printerRevision
        || p.data.configuration.id !== c.printerId || p.data.configuration.transport !== 'cloudprnt-http'
        || !validatePrinterConfiguration(p.data.configuration, { brandId: c.brandId, locationId: c.locationId }, { id: location.id, brandId: c.brandId }).ok
        || !credential.exists || !cred.success || cred.data.revokedAt !== null || cred.data.issuedAt > now
        || Object.keys(c).some(key => cred.data[key as keyof typeof c] !== c[key as keyof typeof c])) return fail('qualification_conflict');
      const result = { ...c, createdAt: null, expiresAt: null, confirmedAt: null, physicalCompatibilityVerified: false as const };
      if (!pointer.exists) return pilotStatusResultSchema.parse({ ...result, state: 'none' });
      const ptr = z.object({ schemaVersion: z.literal(1), sessionId: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict().safeParse(pointer.data());
      if (!ptr.success) return fail('qualification_conflict');
      const [saved, session] = await Promise.all([tx.get(printerRef.collection('pilotJobs').doc(ptr.data.sessionId)),
        tx.get(printerRef.collection('pilotQualifications').doc(ptr.data.sessionId))]);
      const job = syntheticPilotJobSchema.safeParse(saved.data()), qualification = testPrintSessionSchema.safeParse(session.data());
      if (!saved.exists || !session.exists || !job.success || !qualification.success) return fail('qualification_conflict');
      const j = job.data, q = qualification.data;
      if (saved.id !== j.jobId || session.id !== j.sessionId || ptr.data.sessionId !== j.sessionId
        || Object.keys(c).some(key => j[key as keyof typeof c] !== c[key as keyof typeof c] || q[key as keyof typeof c] !== c[key as keyof typeof c])
        || j.createdAt !== q.consumedAt || j.expiresAt !== q.expiresAt || j.createdAt > now
        || [j.offeredAt, j.downloadStartedAt, j.confirmedAt].some(time => time !== null && time > now)
        || j.model !== p.data.configuration.model || j.paperWidthMm !== p.data.configuration.paperWidthMm) return fail('qualification_conflict');
      const content = readSyntheticTestBonContent(j.content, { brandId: c.brandId, locationId: c.locationId,
        printerId: c.printerId, printerRevision: c.printerRevision, model: j.model, paperWidthMm: j.paperWidthMm });
      if (content.sha256 !== q.contentDigest) return fail('qualification_conflict');
      const terminal = ['confirmed', 'failed', 'unknown'].includes(j.state);
      return pilotStatusResultSchema.parse({ ...result, state: !terminal && now >= j.expiresAt ? 'expired' : j.state,
        createdAt: j.createdAt, expiresAt: j.expiresAt, confirmedAt: j.confirmedAt });
    }, { readOnly: true });
  } catch (error) {
    if (error instanceof AuthorityError || error instanceof PilotQualificationError) throw error;
    return fail('qualification_unavailable');
  }
}
