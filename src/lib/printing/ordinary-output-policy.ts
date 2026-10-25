import 'server-only';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import type { NativeTransactionContext } from '@/lib/server/firestore-compat';
import type { NativePrinterDeviceIdentitySnapshot } from './device-auth-native';
import { requirePlatformSuperuser } from '@/lib/access/orderfly-session';
import { AuthorityError, principalKey } from '@/lib/access/authority';
import { authorizeTransaction } from '@/lib/access/scoped-data';
import { isSuperuser, policySchema } from '@/lib/access/policy';
import { storedPrinterSchema } from './storage';
import { credentialSchema } from './device-credentials-service';
import { syntheticPilotJobSchema } from './synthetic-pilot-job';
import { testPrintSessionSchema } from './synthetic-pilot-job';
import { readSyntheticTestBonContent } from './job-content';
import { prepareSavedPrinterRouting } from './saved-routing';
import { orderTestBinding as binding, orderTestScopeSchema, orderTestWindowSchema, ORDER_TEST_WINDOW_MS } from './order-test-schema';
export { orderTestScopeSchema, orderTestWindowSchema, ORDER_TEST_WINDOW_MS } from './order-test-schema';

const revision = z.number().int().positive().safe();
const time = revision.max(8.64e15);
const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export class OrdinaryOutputPolicyError extends Error {
  constructor(readonly code: 'invalid_order_test' | 'order_test_conflict' | 'order_test_unavailable') { super(code); }
}
const fail = (code: OrdinaryOutputPolicyError['code']): never => { throw new OrdinaryOutputPolicyError(code); };
const matches = (a: Record<string, unknown>, b: Record<string, unknown>) => Object.keys(binding).every(k => a[k] === b[k]);
function gates() {
  if (process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED !== 'true'
    || process.env.ORDERFLY_PRINTER_ORDER_TEST_OUTPUT_ENABLED !== 'true') fail('order_test_unavailable');
}
const validScope = (snapshot: FirebaseFirestore.DocumentSnapshot, expected: string) => {
  const row = snapshot.data();
  return snapshot.exists && snapshot.id === expected && row && (row.id === undefined || row.id === expected)
    && (row.deletedAt === undefined || row.deletedAt === null)
    && ['deleted', 'isDeleted', 'isTestData'].every(k => row[k] === undefined || row[k] === false)
    && (row.isActive === undefined || row.isActive === true);
};

/** Limited, explicit supervised testing permission, never unattended hardware capability. */
export async function requireOrdinaryOutputPolicy(context: NativeTransactionContext, identity: NativePrinterDeviceIdentitySnapshot) {
  gates();
  if (context.db !== getAdminDb() || !context.transaction || !orderTestScopeSchema.safeParse({
    brandId: identity.brandId, locationId: identity.locationId, printerId: identity.printerId,
    printerRevision: identity.printerRevision, credentialRevision: identity.credentialRevision }).success
    || identity.printerState !== 'active') return fail('order_test_conflict');
  const { db, transaction: tx } = context;
  const loc = db.collection('locations').doc(identity.locationId), ref = loc.collection('printers').doc(identity.printerId);
  const [brand, location, printer, credential, window] = await Promise.all([
    tx.get(db.collection('brands').doc(identity.brandId)), tx.get(loc), tx.get(ref),
    tx.get(ref.collection('deviceCredentials').doc('current')), tx.get(ref.collection('orderTestWindows').doc('current')),
  ]);
  const p = storedPrinterSchema.safeParse(printer.data()), c = credentialSchema.safeParse(credential.data());
  const w = orderTestWindowSchema.safeParse(window.data()), now = Date.now();
  if (!time.safeParse(now).success || !validScope(brand, identity.brandId) || !['active', 'trialing'].includes(brand.data()!.status)
    || !validScope(location, identity.locationId) || location.data()!.brandId !== identity.brandId
    || !p.success || !c.success || !w.success || !matches(c.data, identity) || !matches(w.data, identity)
    || c.data.revokedAt !== null || c.data.issuedAt > now || p.data.revision !== identity.printerRevision
    || p.data.configuration.id !== identity.printerId || p.data.configuration.brandId !== identity.brandId
    || p.data.configuration.locationId !== identity.locationId || p.data.configuration.state !== 'active'
    || p.data.configuration.transport !== 'cloudprnt-http' || p.data.configuration.manufacturer !== 'star'
    || p.data.configuration.model !== w.data.model || p.data.configuration.paperWidthMm !== w.data.paperWidthMm
    || w.data.stoppedAt !== null || now < w.data.issuedAt || now >= w.data.expiresAt) return fail('order_test_conflict');
  return Object.freeze({ model: w.data.model, paperWidthMm: w.data.paperWidthMm,
    issuedAt: w.data.issuedAt, expiresAt: w.data.expiresAt, qualificationId: w.data.qualificationId });
}

const commandSchema = z.union([
  orderTestScopeSchema.extend({ operation: z.literal('startIndependent') }).strict(),
  orderTestScopeSchema.extend({ operation: z.literal('start'), physicalPaperChecked: z.literal(true),
    deviceUnchanged: z.literal(true), supervisingPurchases: z.literal(true) }).strict(),
  orderTestScopeSchema.extend({ operation: z.literal('stop') }).strict(),
  orderTestScopeSchema.extend({ operation: z.literal('read') }).strict(),
]);
export async function controlOrderTestWindow(input: unknown) {
  const session = await requirePlatformSuperuser();
  const parsed = commandSchema.safeParse(input);
  if (!parsed.success) return fail('invalid_order_test');
  const a = parsed.data, db = getAdminDb(), actorId = principalKey(session.identity);
  if (a.operation === 'start' || a.operation === 'startIndependent') {
    gates();
    if (process.env.ORDERFLY_PRINT_INTENTS_ENABLED !== 'true') return fail('order_test_unavailable');
  }
  if (a.operation === 'stop' && process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED !== 'true') return fail('order_test_unavailable');
  try {
    return await db.runTransaction(async tx => {
      const access = policySchema.safeParse((await tx.get(db.collection('platformAdminControl').doc('access-v1'))).data());
      if (!access.success || !isSuperuser(access.data, actorId)) throw new AuthorityError('forbidden');
      await authorizeTransaction(tx, session.identity, a, 'orderfly.catalog:edit', 'location');
      const loc = db.collection('locations').doc(a.locationId), ref = loc.collection('printers').doc(a.printerId);
      const windowRef = ref.collection('orderTestWindows').doc('current');
      const [brand, location, printer, credential, window, pointer] = await Promise.all([
        tx.get(db.collection('brands').doc(a.brandId)), tx.get(loc), tx.get(ref),
        tx.get(ref.collection('deviceCredentials').doc('current')), tx.get(windowRef), tx.get(ref.collection('pilotState').doc('current')),
      ]);
      const p = storedPrinterSchema.safeParse(printer.data()), c = credentialSchema.safeParse(credential.data());
      const w = window.exists ? orderTestWindowSchema.safeParse(window.data()) : null, now = Date.now();
      if (!time.safeParse(now).success || !validScope(brand, a.brandId) || !['active', 'trialing'].includes(brand.data()!.status)
        || !validScope(location, a.locationId) || location.data()!.brandId !== a.brandId
        || !p.success || !c.success || !matches(c.data, a) || c.data.revokedAt !== null || c.data.issuedAt > now
        || p.data.revision !== a.printerRevision || p.data.configuration.id !== a.printerId
        || p.data.configuration.brandId !== a.brandId || p.data.configuration.locationId !== a.locationId
        || (w && !w.success)) return fail('order_test_conflict');
      const scope = orderTestScopeSchema.parse(Object.fromEntries(Object.keys(binding).map(k => [k, a[k as keyof typeof binding]])));
      const project = (row: z.infer<typeof orderTestWindowSchema> | null) => ({ ...scope,
        state: row === null ? 'not_started' : !matches(row, a) ? 'stale' : row.stoppedAt !== null ? 'stopped'
          : now >= row.expiresAt ? 'expired' : 'active', expiresAt: row?.expiresAt ?? null,
        unattendedAuthorized: false, enabled: process.env.ORDERFLY_PRINTER_ORDER_TEST_OUTPUT_ENABLED === 'true'
          && process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED === 'true'
          && process.env.ORDERFLY_PRINT_INTENTS_ENABLED === 'true' });
      if (a.operation === 'read') return project(w?.success ? w.data : null);
      if (a.operation === 'stop') {
        if (!w?.success || !matches(w.data, a)) return fail('order_test_conflict');
        if (w.data.stoppedAt === null) {
          tx.set(windowRef, { ...w.data, stoppedAt: now });
          tx.create(ref.collection('orderTestAudit').doc(`${w.data.qualificationId}-stop`), {
            ...scope, actorId, action: 'printer.orderTest.stop', at: now });
        }
        return project({ ...w.data, stoppedAt: w.data.stoppedAt ?? now });
      }
      if (window.exists || p.data.configuration.state !== 'active' || p.data.configuration.transport !== 'cloudprnt-http'
        || p.data.configuration.manufacturer !== 'star') return fail('order_test_conflict');
      let qid = randomBytes(32).toString('base64url');
      if (a.operation === 'start') {
      const ptr = z.object({ schemaVersion: z.literal(1), sessionId: token }).strict().safeParse(pointer.data());
      if (!ptr.success) return fail('order_test_conflict');
      qid = ptr.data.sessionId;
      const [job, qualification, audit] = await Promise.all([tx.get(ref.collection('pilotJobs').doc(qid)),
        tx.get(ref.collection('pilotQualifications').doc(qid)), tx.get(ref.collection('pilotQualificationAudit').doc(`${qid}-consume`))]);
      const j = syntheticPilotJobSchema.safeParse(job.data()), q = testPrintSessionSchema.safeParse(qualification.data());
      const capture = audit.data();
      if (!j.success || !q.success || !matches(j.data, a) || !matches(q.data, a)
        || j.data.sessionId !== qid || q.data.sessionId !== qid || j.data.state !== 'confirmed' || j.data.confirmedAt === null
        || j.data.confirmedAt > now || now - j.data.confirmedAt >= ORDER_TEST_WINDOW_MS
        || j.data.createdAt !== q.data.consumedAt || j.data.expiresAt !== q.data.expiresAt
        || p.data.configuration.model !== j.data.model || p.data.configuration.paperWidthMm !== j.data.paperWidthMm
        || !capture || !matches(capture, a) || capture.sessionId !== qid || capture.trust !== q.data.trust
        || capture.contentDigest !== q.data.contentDigest || capture.model !== j.data.model) return fail('order_test_conflict');
      if (q.data.trust === 'supervised_operator') {
        if (capture.method !== 'stario_firmware_query' || !/^\d{1,3}\.\d{1,3}(?:\.\d{1,3})?$/.test(capture.firmware)) return fail('order_test_conflict');
        const [major, minor] = capture.firmware.split('.').map(Number);
        if (!(major > 3 || major === 3 && minor >= 2)) return fail('order_test_conflict');
      } else if (capture.action !== 'printer.testPrint.request' || capture.physicalCompatibilityVerified !== false) return fail('order_test_conflict');
      const content = readSyntheticTestBonContent(j.data.content, { brandId: a.brandId, locationId: a.locationId,
        printerId: a.printerId, printerRevision: a.printerRevision,
        model: j.data.model, paperWidthMm: j.data.paperWidthMm });
      if (content.sha256 !== q.data.contentDigest) return fail('order_test_conflict');
      }
      const intentRef = loc.collection('printIntentPolicies').doc('original');
      const existingIntent = await tx.get(intentRef);
      // A test must never overwrite an existing production routing policy.
      if (existingIntent.exists) return fail('order_test_conflict');
      const routing = await prepareSavedPrinterRouting({ db, transaction: tx }, { brandId: a.brandId, locationId: a.locationId });
      if (routing.revision === null || routing.rules.length !== 1 || routing.rules[0].printerId !== a.printerId
        || routing.rules[0].effect !== 'include' || routing.rules[0].match.type !== 'all' || routing.rules[0].deliveryTypes) return fail('order_test_conflict');
      const record = orderTestWindowSchema.parse({ schemaVersion: 1, ...scope, qualificationId: qid,
        routingRevision: routing.revision,
        trust: 'supervised_order_test', actorId, model: p.data.configuration.model, paperWidthMm: p.data.configuration.paperWidthMm,
        issuedAt: now, expiresAt: now + ORDER_TEST_WINDOW_MS, stoppedAt: null,
        physicalPaperCheckedByOperator: a.operation === 'start', unattendedAuthorized: false });
      tx.create(windowRef, record);
      tx.create(intentRef, { schemaVersion: 1, id: 'original', brandId: a.brandId, locationId: a.locationId,
        revision: 1, deletedAt: null, enabled: true, supervisedOrderTest: true,
        targets: [{ printerId: a.printerId, printerRevision: a.printerRevision, kinds: ['kitchen'] }] });
      tx.create(ref.collection('orderTestAudit').doc(`${qid}-start`), { ...record, action: 'printer.orderTest.start' });
      return project(record);
    });
  } catch (e) {
    if (e instanceof AuthorityError || e instanceof OrdinaryOutputPolicyError) throw e;
    return fail('order_test_unavailable');
  }
}
