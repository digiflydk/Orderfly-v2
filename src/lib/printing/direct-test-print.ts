import 'server-only';
import { z } from 'zod';
import { directTestCommandSchema, directTestSessionSchema, directTestResultSchema } from './direct-test-schema';
import { projectPrinterConnection } from './connection-status';
import { getAdminDb } from '@/lib/firebase-admin';
import { AuthorityError, principalKey } from '@/lib/access/authority';
import { requirePlatformSuperuser } from '@/lib/access/orderfly-session';
import { authorizeTransaction } from '@/lib/access/scoped-data';
import { isSuperuser, policySchema } from '@/lib/access/policy';
import { storedPrinterSchema } from './storage';
import { validatePrinterConfiguration } from './configuration';
import { credentialSchema } from './device-credentials-service';
import { PilotQualificationError } from './pilot-qualification';
import { createSyntheticPilotJobRecord, syntheticPilotJobSchema, testPrintSessionSchema } from './synthetic-pilot-job';

const fail = (code: PilotQualificationError['code']): never => { throw new PilotQualificationError(code); };
const bindingKeys = ['brandId', 'locationId', 'printerId', 'printerRevision', 'credentialRevision'] as const;

export async function requestDirectTestPrint(input: unknown) {
  const authenticated = await requirePlatformSuperuser();
  const parsed = directTestCommandSchema.safeParse(input);
  if (!parsed.success) return fail('invalid_qualification');
  if (process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED !== 'true' || process.env.ORDERFLY_PRINTER_PILOT_OUTPUT_ENABLED !== 'true') return fail('qualification_unavailable');
  try {
    const { requestId, ...a } = parsed.data, actorId = principalKey(authenticated.identity), db = getAdminDb();
    const locationRef = db.collection('locations').doc(a.locationId);
    const printerRef = locationRef.collection('printers').doc(a.printerId);
    const requestRef = printerRef.collection('testPrintRequests').doc(requestId);
    const sessionRef = printerRef.collection('pilotQualifications').doc(requestId);
    const jobRef = printerRef.collection('pilotJobs').doc(requestId);
    const pointerRef = printerRef.collection('pilotState').doc('current');
    const auditRef = printerRef.collection('pilotQualificationAudit').doc(`${requestId}-consume`);
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
      const [printer, credential, pending, job, pointer, audit, contact, previousRequest] = await Promise.all([
        tx.get(printerRef), tx.get(printerRef.collection('deviceCredentials').doc('current')),
        tx.get(sessionRef), tx.get(jobRef), tx.get(pointerRef), tx.get(auditRef), tx.get(printerRef.collection('connection').doc('current')), tx.get(requestRef),
      ]);
      const p = storedPrinterSchema.safeParse(printer.data()), c = credentialSchema.safeParse(credential.data());
      const now = Date.now();
      if (!Number.isSafeInteger(now) || now <= 0 || now > 8.64e15 - 600_000) return fail('qualification_unavailable');
      if (!printer.exists || printer.id !== a.printerId || !p.success || p.data.revision !== a.printerRevision
        || !validatePrinterConfiguration(p.data.configuration, { brandId: a.brandId, locationId: a.locationId }, { id: location.id, brandId: a.brandId }).ok
        || p.data.configuration.id !== a.printerId || p.data.configuration.transport !== 'cloudprnt-http'
        || p.data.configuration.state !== 'active'
        || p.data.configuration.manufacturer !== 'star'
        || !credential.exists || !c.success || bindingKeys.some(key => c.data[key] !== a[key])
        || c.data.revokedAt !== null || c.data.issuedAt > now) return fail('qualification_conflict');
      const result = (jobId: string) => directTestResultSchema.parse({ ...a, jobId, physicalCompatibilityVerified: false });
      if (previousRequest.exists) {
        const previous = directTestResultSchema.extend({ actorId: z.string().min(1), requestId: z.literal(requestId) }).strict().safeParse(previousRequest.data());
        if (!previous.success || previous.data.actorId !== actorId || bindingKeys.some(key => previous.data[key] !== a[key])) return fail('qualification_conflict');
        return result(previous.data.jobId);
      }
      const remember = (jobId: string) => {
        const value = result(jobId);
        tx.create(requestRef, { ...value, actorId, requestId });
        return value;
      };
      // A repeated request id never queues again, including after a lost HTTP response.
      if (pending.exists || job.exists || audit.exists) {
        const prior = directTestSessionSchema.safeParse(pending.data());
        if (!prior.success || prior.data.actorId !== actorId || prior.data.sessionId !== requestId
          || bindingKeys.some(key => prior.data[key] !== a[key]) || !job.exists || !audit.exists) return fail('qualification_conflict');
        return remember(requestId);
      }
      const connection = projectPrinterConnection(contact.data(), credential.data(), a, a.printerRevision, now);
      if (!connection.connected || connection.endpoint !== 'test') return fail('qualification_conflict');
      if (pointer.exists) {
        const pid = pointer.data()?.sessionId;
        if (typeof pid !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(pid)) return fail('qualification_conflict');
        const [oldJob, oldSession] = await Promise.all([tx.get(printerRef.collection('pilotJobs').doc(pid)),
          tx.get(printerRef.collection('pilotQualifications').doc(pid))]);
        const j = syntheticPilotJobSchema.safeParse(oldJob.data()), q = testPrintSessionSchema.safeParse(oldSession.data());
        if (!j.success || !q.success || j.data.sessionId !== pid || q.data.sessionId !== pid
          || bindingKeys.some(key => j.data[key] !== a[key] || q.data[key] !== a[key])) return fail('qualification_conflict');
        // Concurrent clicks/tabs reuse current work. Ambiguous downloads never retry.
        const finished = j.data.state === 'confirmed' && now - j.data.confirmedAt! >= 30_000;
        const neverDownloaded = ['queued', 'offered'].includes(j.data.state) && now >= j.data.expiresAt;
        if (!finished && !neverDownloaded) return remember(pid);
      }
      const model = p.data.configuration.model, paperWidthMm = p.data.configuration.paperWidthMm;
      const record = createSyntheticPilotJobRecord({ ...a, sessionId: requestId, model, paperWidthMm,
        createdAt: now, expiresAt: now + 600_000 });
      const session = directTestSessionSchema.parse({ schemaVersion: 2, ...a, sessionId: requestId, jobId: requestId,
        actorId, state: 'consumed', trust: 'admin_test_request', issuedAt: now, consumedAt: now,
        expiresAt: record.expiresAt, contentDigest: record.content.sha256, physicalCompatibilityVerified: false });
      tx.create(jobRef, record);
      tx.set(pointerRef, { schemaVersion: 1, sessionId: requestId });
      tx.create(sessionRef, session);
      tx.create(auditRef, { ...session, action: 'printer.testPrint.request', model, paperWidthMm });
      return remember(requestId);
    });
  } catch (error) {
    if (error instanceof AuthorityError || error instanceof PilotQualificationError) throw error;
    return fail('qualification_unavailable');
  }
}
