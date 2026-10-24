import 'server-only';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { AuthorityError, principalKey } from '@/lib/access/authority';
import { requirePlatformSuperuser } from '@/lib/access/orderfly-session';
import { authorizeTransaction } from '@/lib/access/scoped-data';
import { isSuperuser, policySchema } from '@/lib/access/policy';
import { printerConfigurationSchema } from './configuration';
import { createPrinterDeviceCredentialDraft } from './device-auth';
import { initialPrinterActivity } from './activity-metadata';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const connectionSetupSchema = z.object({ brandId: id, locationId: id,
  name: z.string().min(1).max(80), description: z.string().max(160).optional(),
  manufacturer: z.literal('star'), model: z.enum(['mc-print2', 'mc-print3']),
  paperWidthMm: z.union([z.literal(58), z.literal(80)]),
}).strict();
export class ConnectionSetupError extends Error {
  constructor(readonly code: 'invalid_request' | 'writes_unavailable' | 'setup_conflict' | 'setup_unavailable', readonly status: number) { super(code); }
}
function validNative(snapshot: FirebaseFirestore.DocumentSnapshot, expectedId: string) {
  const row = snapshot.data();
  return snapshot.exists && snapshot.id === expectedId && row && (row.id === undefined || row.id === expectedId)
    && ['deleted', 'isDeleted', 'isTestData'].every(key => row[key] === undefined || row[key] === false)
    && (row.deletedAt === undefined || row.deletedAt === null) && (row.isActive === undefined || row.isActive === true);
}
const fail = (code: ConstructorParameters<typeof ConnectionSetupError>[0], status: number): never => { throw new ConnectionSetupError(code, status); };

/** Fresh identities only. Enrollment, initial active state and digest commit together. */
export async function createPrinterConnection(input: unknown) {
  const session = await requirePlatformSuperuser();
  const parsed = connectionSetupSchema.safeParse(input);
  if (!parsed.success) return fail('invalid_request', 400);
  if (process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED !== 'true') return fail('writes_unavailable', 503);
  try {
    const printerId = 'prn_' + randomUUID();
    const checked = printerConfigurationSchema.safeParse({ ...parsed.data, id: printerId, transport: 'cloudprnt-http', state: 'active' });
    if (!checked.success) return fail('invalid_request', 400);
    const config = checked.data, scope = { brandId: config.brandId, locationId: config.locationId, printerId };
    const draft = createPrinterDeviceCredentialDraft({ ...scope, printerRevision: 1, credentialRevision: 1 });
    const actorId = principalKey(session.identity), db = getAdminDb();
    const locationRef = db.collection('locations').doc(config.locationId), ref = locationRef.collection('printers').doc(printerId);
    const result = await db.runTransaction(async tx => {
      const policy = policySchema.safeParse((await tx.get(db.collection('platformAdminControl').doc('access-v1'))).data());
      if (!policy.success || !isSuperuser(policy.data, actorId)) throw new AuthorityError('forbidden');
      await authorizeTransaction(tx, session.identity, scope, 'orderfly.catalog:create', 'location');
      await authorizeTransaction(tx, session.identity, scope, 'orderfly.catalog:edit', 'location');
      const location = await tx.get(locationRef), brand = await tx.get(db.collection('brands').doc(config.brandId));
      if (!validNative(location, config.locationId) || !validNative(brand, config.brandId)
        || !['active', 'pending', 'trialing'].includes(brand.data()?.status) || location.data()?.brandId !== config.brandId) throw new AuthorityError('forbidden');
      // Reject any surviving private child or ledger, never initialize a reused identity.
      const checks = await Promise.all([
        tx.get(ref), tx.get(ref.collection('queue').doc('state')), tx.get(ref.collection('jobs').limit(1)),
        tx.get(ref.collection('deviceCredentials').doc('current')), tx.get(ref.collection('audit').limit(1)),
        tx.get(ref.collection('deviceCredentialAudit').limit(1)), tx.get(ref.collection('pilotState').doc('current')),
        tx.get(ref.collection('statusMetadata').doc('current')), tx.get(ref.collection('connection').doc('current')),
        ...['pilotJobs', 'pilotQualifications', 'pilotQualificationAudit', 'orderTestWindows', 'orderTestAudit']
          .map(name => tx.get(ref.collection(name).limit(1))),
      ]);
      if (checks.some(s => 'exists' in s ? s.exists : !s.empty)) return fail('setup_conflict', 409);
      const now = Date.now(), timestamp = FieldValue.serverTimestamp();
      tx.create(ref, { schemaVersion: 1, configuration: config, revision: 1, deletedAt: null, createdAt: timestamp, updatedAt: timestamp });
      tx.create(ref.collection('queue').doc('state'), { schemaVersion: 1, ...scope, revision: 1, pendingCount: 0, oldestPendingAt: null, updatedAt: timestamp });
      tx.create(ref.collection('statusMetadata').doc('current'), { ...initialPrinterActivity(scope, true), activatedAt: now, activationRevision: 1 });
      tx.create(ref.collection('deviceCredentials').doc('current'), draft.record);
      tx.create(ref.collection('audit').doc('1'), { schemaVersion: 1, actorId, action: 'printer.connection.create', revision: 1,
        before: null, after: config, emptyQueueVerified: true, createdAt: timestamp });
      tx.create(ref.collection('deviceCredentialAudit').doc('1'), { schemaVersion: 1, actorId, action: 'printer.credential.issue', ...scope,
        printerRevision: 1, previousCredentialRevision: 0, credentialRevision: 1, revoked: false, createdAt: timestamp });
      return { item: { configuration: config, revision: 1 }, username: 'orderfly' as const };
    });
    return Object.freeze(Object.defineProperty(result, 'secret', { value: draft.secret })) as typeof result & { secret: string };
  } catch (error) {
    if (error instanceof AuthorityError || error instanceof ConnectionSetupError) throw error;
    return fail('setup_unavailable', 503);
  }
}
