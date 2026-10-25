import 'server-only';
import { createHash } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import { requirePlatformSuperuser, orderflySession } from '@/lib/access/orderfly-session';
import { AuthorityError, principalKey, type VerifiedIdentity } from '@/lib/access/authority';
import { authorizeTransaction } from '@/lib/access/scoped-data';
import { isSuperuser, policySchema } from '@/lib/access/policy';
import { storedPrinterSchema } from './storage';
import { credentialSchema } from './device-credential-schema';
import { prepareReceiptPrintContent } from './receipt-print-content';
import { MANUAL_PRINT_TTL_MS, MANUAL_PRINT_MAX_BYTES, ManualPrintError, manualPrintCommandSchema,
  manualPrintPointerSchema, storedManualPrintJobSchema, projectManualPrint, type ManualPrintCommand, type ManualPrintJob } from './manual-print-schema';

const conflict = (): never => { throw new ManualPrintError('manual_print_conflict'); };
const sha256 = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const commandKeys = ['orderId', 'brandId', 'locationId', 'printerId', 'printerRevision', 'kind', 'requestId'] as const;
function gates() {
  if (process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED !== 'true'
    || process.env.ORDERFLY_PRINTER_ORDER_TEST_OUTPUT_ENABLED !== 'true') throw new ManualPrintError('manual_print_unavailable');
}
function nativeScope(snapshot: FirebaseFirestore.DocumentSnapshot, expected: string) {
  const value = snapshot.data();
  return snapshot.exists && snapshot.id === expected && value && (value.id === undefined || value.id === expected)
    && ['deleted', 'isDeleted', 'isTestData'].every(key => value[key] === undefined || value[key] === false)
    && (value.deletedAt === undefined || value.deletedAt === null) && (value.isActive === undefined || value.isActive === true);
}
async function scope(tx: FirebaseFirestore.Transaction, identity: VerifiedIdentity, a: ManualPrintCommand, merchant = false) {
  const db = getAdminDb(), actorId = principalKey(identity);
  if (!merchant) {
    const access = policySchema.safeParse((await tx.get(db.collection('platformAdminControl').doc('access-v1'))).data());
    if (!access.success || !isSuperuser(access.data, actorId)) throw new AuthorityError('forbidden');
  }
  await authorizeTransaction(tx, identity, a, 'orderfly.orders:edit', 'location');
  const printerRef = db.collection('locations').doc(a.locationId).collection('printers').doc(a.printerId);
  const [brand, location, order, printer, credential, saved] = await Promise.all([
    tx.get(db.collection('brands').doc(a.brandId)), tx.get(db.collection('locations').doc(a.locationId)),
    tx.get(db.collection('orders').doc(a.orderId)), tx.get(printerRef),
    tx.get(printerRef.collection('deviceCredentials').doc('current')),
    tx.get(printerRef.collection('manualPrintRequests').doc(a.requestId)),
  ]);
  const p = storedPrinterSchema.safeParse(printer.data()), c = credentialSchema.safeParse(credential.data()), o = order.data();
  if (!nativeScope(brand, a.brandId) || !['active', 'trialing'].includes(brand.data()!.status)
    || !nativeScope(location, a.locationId) || location.data()!.brandId !== a.brandId
    || !order.exists || !o || o.brandId !== a.brandId || o.locationId !== a.locationId
    || !p.success || p.data.revision !== a.printerRevision || p.data.configuration.id !== a.printerId
    || p.data.configuration.brandId !== a.brandId || p.data.configuration.locationId !== a.locationId
    || p.data.configuration.state !== 'active' || p.data.configuration.transport !== 'cloudprnt-http'
    || !c.success || c.data.brandId !== a.brandId || c.data.locationId !== a.locationId || c.data.printerId !== a.printerId
    || c.data.printerRevision !== a.printerRevision || c.data.revokedAt !== null || c.data.issuedAt > Date.now()) return conflict();
  // Merchant copies require an actual accepted order, never an unpaid online attempt.
  if (merchant && !saved.exists && o.paymentStatus !== 'Paid' && !(o.paymentMethod === 'PayAtPickup' && o.paymentStatus === 'Pending'
    && o.deliveryType === 'Pickup' && !o.psp && o.discountReservation === 'held'
    && ['Received', 'In Progress', 'Ready'].includes(o.status))) return conflict();
  let prior: ManualPrintJob | null = null;
  if (saved.exists) {
    const parsed = storedManualPrintJobSchema.safeParse(saved.data());
    if (!parsed.success || commandKeys.some(key => parsed.data[key] !== a[key]) || parsed.data.actorId !== actorId) return conflict();
    prior = parsed.data;
  }
  return { printerRef, actorId, prior, credentialRevision: c.data.credentialRevision,
    orderFingerprint: sha256(JSON.stringify([order.updateTime?.toMillis() ?? null, o])), configurationFingerprint: sha256(JSON.stringify(p.data.configuration)) };
}
async function read(input: unknown, merchant: boolean) {
  const session = await (merchant ? orderflySession() : requirePlatformSuperuser()), parsed = manualPrintCommandSchema.safeParse(input);
  if (!parsed.success) throw new ManualPrintError('manual_print_invalid');
  const db = getAdminDb();
  return db.runTransaction(async tx => {
    const found = await scope(tx, session.identity, parsed.data, merchant);
    if (!found.prior) return conflict();
    return projectManualPrint(found.prior);
  });
}
/** Explicit new copy, never an original replay. Rendering is outside the retrying
 * Firestore transaction; native order/printer/credential authority is checked again. */
async function request(input: unknown, merchant: boolean) {
  const session = await (merchant ? orderflySession() : requirePlatformSuperuser()), parsed = manualPrintCommandSchema.safeParse(input);
  if (!parsed.success) throw new ManualPrintError('manual_print_invalid');
  gates();
  const a = parsed.data, db = getAdminDb();
  const before = await db.runTransaction(tx => scope(tx, session.identity, a, merchant));
  if (before.prior) return projectManualPrint(before.prior);
  const content = await prepareReceiptPrintContent({ orderId: a.orderId, brandId: a.brandId,
    locationId: a.locationId, printerId: a.printerId, kind: a.kind });
  if (!Buffer.isBuffer(content.payload) || content.payload.length < 24 || content.payload.length > MANUAL_PRINT_MAX_BYTES
    || content.payload.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
    || content.sha256 !== sha256(content.payload)) throw new ManualPrintError('manual_print_unavailable');
  return db.runTransaction(async tx => {
    gates();
    const current = await scope(tx, session.identity, a, merchant);
    if (current.prior) return projectManualPrint(current.prior);
    if (current.orderFingerprint !== before.orderFingerprint || current.configurationFingerprint !== before.configurationFingerprint
      || current.credentialRevision !== before.credentialRevision) return conflict();
    const pointerRef = current.printerRef.collection('manualState').doc('current');
    const [pointer, ordinary] = await Promise.all([tx.get(pointerRef), tx.get(current.printerRef.collection('ordinaryState').doc('current'))]);
    if (ordinary.exists) return conflict();
    if (pointer.exists) {
      const p = manualPrintPointerSchema.safeParse(pointer.data());
      if (!p.success) return conflict();
      const old = storedManualPrintJobSchema.safeParse((await tx.get(current.printerRef.collection('manualPrintRequests').doc(p.data.requestId))).data());
      // An ambiguous download blocks fresh copies. It must never be silently replaced.
      if (!old.success || old.data.requestId !== p.data.requestId || old.data.brandId !== a.brandId || old.data.locationId !== a.locationId || old.data.printerId !== a.printerId
        || !['confirmed', 'failed', 'expired'].includes(projectManualPrint(old.data).state)) return conflict();
    }
    const now = Date.now();
    const job = storedManualPrintJobSchema.parse({ ...a, schemaVersion: 1, jobId: a.requestId,
      credentialRevision: current.credentialRevision, actorId: current.actorId, createdAt: now, expiresAt: now + MANUAL_PRINT_TTL_MS,
      state: 'queued', payloadBase64: content.payload.toString('base64'), sha256: content.sha256, byteLength: content.payload.length,
      offeredAt: null, downloadedAt: null, completedAt: null, tokenDigest: null });
    tx.create(current.printerRef.collection('manualPrintRequests').doc(a.requestId), job);
    tx.create(current.printerRef.collection('manualPrintAudit').doc(a.requestId), { schemaVersion: 1, ...a,
      actorId: current.actorId, credentialRevision: current.credentialRevision, createdAt: now,
      action: 'manual_receipt_requested', sha256: content.sha256 });
    tx.set(pointerRef, { schemaVersion: 1, requestId: a.requestId });
    return projectManualPrint(job, now);
  });
}

// Public entry points always establish their own session and fresh transaction authority.
export const readManualPrint = (input: unknown) => read(input, false);
export const requestManualPrint = (input: unknown) => request(input, false);
export const readMerchantPrint = (input: unknown) => read(input, true);
export const requestMerchantPrint = (input: unknown) => request(input, true);
