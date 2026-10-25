import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import type { NativeTransactionContext } from '@/lib/server/firestore-compat';
import { verifyCloudPrntHttpDevice } from './cloudprnt-http-auth';
import { requireOrdinaryOutputPolicy } from './ordinary-output-policy';
import { createCloudPrntClaimAttempt, nativeClaimAttemptTokens, reserveNativePrintClaim,
  nativePrintClaimSchema, type NativePrintClaimAttempt } from './native-claim';
import { prepareOrdinaryJobContent } from './ordinary-job-content';
import { ordinaryDispatchSchema, ordinaryPointerSchema, originalPrintHistorySchema } from './ordinary-print-storage';
import { deliveredPrintEnvelopeSchema, printDeliveryTokenDigest, prepareCloudPrntPrintConfirmation } from './print-result-native';
import { storedPrintQueueSchema, storedQueuedPrintJobSchema, PRINT_QUEUE_LIMIT } from './queue-storage';
import { printJobId, kitchenPrintEligibility, type KitchenOrder } from './domain';
import { storedPrinterSchema } from './storage';
import { readStoredPrinterActivity } from './activity-metadata';
import { parseCloudPrntConfirmation } from './cloudprnt-http';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const commandSchema = z.object({ brandId: id, locationId: id, printerId: id, authorization: z.string().min(78).max(256) }).strict();
type Command = z.infer<typeof commandSchema>;
type Scope = Pick<Command, 'brandId' | 'locationId' | 'printerId'>;
export class OrdinaryPrintError extends Error {
  constructor(readonly code: 'ordinary_print_conflict' | 'ordinary_print_unavailable') { super(code); }
}
const conflict = (): never => { throw new OrdinaryPrintError('ordinary_print_conflict'); };
const binding = (c: Scope) => ({ brandId: c.brandId, locationId: c.locationId, printerId: c.printerId });
const sameScope = (a: Scope, b: Scope) => a.brandId === b.brandId && a.locationId === b.locationId && a.printerId === b.printerId;
const tokenIndex = (c: Scope, value: string) => createHash('sha256')
  .update(JSON.stringify(['orderfly-order-token-v1', c.brandId, c.locationId, c.printerId, value])).digest('hex');
const hashBytes = (value: Buffer) => createHash('sha256').update(value).digest('hex');
const equal = (a: string, b: string) => timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
async function authorized(context: NativeTransactionContext, command: Command) {
  const identity = await verifyCloudPrntHttpDevice(context, command);
  const policy = await requireOrdinaryOutputPolicy(context, identity);
  const printer = context.db.collection('locations').doc(command.locationId).collection('printers').doc(command.printerId);
  return { identity, policy, printer };
}
async function queue(context: NativeTransactionContext, printer: FirebaseFirestore.DocumentReference, scope: Scope) {
  const [meta, rows] = await Promise.all([context.transaction.get(printer.collection('queue').doc('state')),
    context.transaction.get(printer.collection('jobs').limit(PRINT_QUEUE_LIMIT + 1))]);
  const ledger = storedPrintQueueSchema.safeParse(meta.data()), now = Date.now();
  if (!ledger.success || !sameScope(ledger.data, scope) || rows.size > PRINT_QUEUE_LIMIT
    || !Number.isSafeInteger(now) || now <= 0) return conflict();
  const jobs = rows.docs.map(row => {
    const parsed = storedQueuedPrintJobSchema.safeParse(row.data());
    if (!parsed.success || !sameScope(parsed.data, scope) || parsed.data.id !== row.id
      || printJobId(parsed.data) !== row.id || parsed.data.createdAt <= 0 || parsed.data.createdAt > now) return conflict();
    return parsed.data;
  }).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  if (ledger.data.pendingCount !== jobs.length || ledger.data.oldestPendingAt !== (jobs[0]?.createdAt ?? null)) return conflict();
  return { ledger: ledger.data, jobs, now };
}
function payload(record: z.infer<typeof ordinaryDispatchSchema>) {
  const bytes = Buffer.from(record.payloadBase64, 'base64');
  if (bytes.length !== record.byteLength || bytes.toString('base64') !== record.payloadBase64
    || hashBytes(bytes) !== record.contentDigest) return conflict();
  return bytes;
}
async function readDispatch(context: NativeTransactionContext, c: Command, value: string) {
  const auth = await authorized(context, c), { printer, identity, policy } = auth;
  const index = await context.transaction.get(printer.collection('ordinaryTokens').doc(tokenIndex(c, value)));
  const pointer = ordinaryPointerSchema.safeParse(index.data());
  if (!pointer.success) return conflict();
  const ref = printer.collection('ordinaryDispatches').doc(pointer.data.jobId);
  const saved = await context.transaction.get(ref), parsed = ordinaryDispatchSchema.safeParse(saved.data());
  if (!parsed.success) return conflict();
  const record = parsed.data, now = Date.now();
  if (!sameScope(record, c) || record.jobId !== pointer.data.jobId || record.printerRevision !== identity.printerRevision
    || record.credentialRevision !== identity.credentialRevision || record.qualificationId !== policy.qualificationId
    || record.model !== policy.model || record.paperWidthMm !== policy.paperWidthMm
    || record.job.createdAt < policy.issuedAt || record.offeredAt > now || record.expiresAt > policy.expiresAt
    || !equal(record.deliveryDigest, printDeliveryTokenDigest('delivery', value, { ...binding(c), jobId: record.jobId }))) return conflict();
  return { ...auth, ref, record, now };
}

/** POST offers at most one fresh original. A lost offer is never silently
 * renewed: its pointer remains visible and requires supervised investigation.
 */
export async function pollOrdinaryPrint(input: unknown) {
  const parsed = commandSchema.extend({ ready: z.boolean() }).strict().safeParse(input);
  if (!parsed.success) return conflict();
  const { ready, ...c } = parsed.data, db = getAdminDb();
  const attempts = new Map<string, NativePrintClaimAttempt>();
  return db.runTransaction(async transaction => {
    const context = { db, transaction }, { identity, policy, printer } = await authorized(context, c);
    if (!ready) return { jobReady: false as const };
    // Explicit manual receipts share this physical transport. Reading the
    // manual pointer in this transaction conflicts with concurrent enqueue.
    const manual = await transaction.get(printer.collection('manualState').doc('current'));
    if (manual.exists) return { jobReady: false as const };
    const pointerRef = printer.collection('ordinaryState').doc('current');
    const pointer = await transaction.get(pointerRef);
    if (pointer.exists) {
      if (!ordinaryPointerSchema.safeParse(pointer.data()).success) return conflict();
      return { jobReady: false as const };
    }
    const pending = await queue(context, printer, c), job = pending.jobs[0];
    if (!job) return { jobReady: false as const };
    if (job.printerRevision !== identity.printerRevision || job.createdAt < policy.issuedAt
      || pending.now - job.createdAt > 300_000 || policy.expiresAt - pending.now < 60_000) return conflict();
    let attempt = attempts.get(job.id);
    if (!attempt) { attempt = createCloudPrntClaimAttempt({ ...c, jobId: job.id }); attempts.set(job.id, attempt); }
    const tokens = nativeClaimAttemptTokens(attempt), indexRef = printer.collection('ordinaryTokens').doc(tokenIndex(c, tokens.deliveryToken));
    const dispatchRef = printer.collection('ordinaryDispatches').doc(job.id);
    const [dispatch, history, index, content] = await Promise.all([
      transaction.get(dispatchRef), transaction.get(printer.collection('originalPrintHistory').doc(job.id)),
      transaction.get(indexRef), prepareOrdinaryJobContent(context, job, { model: policy.model, paperWidthMm: policy.paperWidthMm }),
    ]);
    if (dispatch.exists || history.exists || index.exists) return conflict();
    const offeredAt = Date.now();
    if (offeredAt < pending.now || policy.expiresAt - offeredAt < 60_000) return conflict();
    const { updatedAt: _updatedAt, ...canonicalJob } = job;
    const record = ordinaryDispatchSchema.parse({ schemaVersion: 1, ...binding(c), jobId: job.id, job: canonicalJob,
      printerRevision: identity.printerRevision, credentialRevision: identity.credentialRevision,
      qualificationId: policy.qualificationId, state: 'offered',
      claimDigest: printDeliveryTokenDigest('claim', tokens.claimToken, { ...binding(c), jobId: job.id }),
      deliveryDigest: printDeliveryTokenDigest('delivery', tokens.deliveryToken, { ...binding(c), jobId: job.id }),
      contentDigest: content.sha256, payloadBase64: content.payload.toString('base64'), byteLength: content.payload.length,
      model: policy.model, paperWidthMm: policy.paperWidthMm, offeredAt, expiresAt: offeredAt + 60_000,
      downloadedAt: null, completedAt: null });
    // Existing producer owns the claim. Its reads are last, before all staged
    // writes; its returned reservation alone never authorizes this dispatch.
    const reserved = await reserveNativePrintClaim(context, attempt);
    if (reserved.printerRevision !== identity.printerRevision || reserved.credentialRevision !== identity.credentialRevision) return conflict();
    transaction.create(dispatchRef, record);
    transaction.create(indexRef, { schemaVersion: 1, jobId: job.id });
    transaction.create(pointerRef, { schemaVersion: 1, jobId: job.id });
    return { jobReady: true as const, jobToken: tokens.deliveryToken, mediaTypes: ['image/png'] as const };
  });
}

/** Commit pending ownership transfer and uncertain usage BEFORE returning bytes.
 * Repeated GET is deliberately refused, even if the original response was lost.
 */
export async function downloadOrdinaryPrint(input: unknown) {
  const parsed = commandSchema.extend({ token }).strict().safeParse(input);
  if (!parsed.success) return conflict();
  const { token: value, ...c } = parsed.data, db = getAdminDb();
  return db.runTransaction(async transaction => {
    const context = { db, transaction }, { identity, printer, ref, record, now } = await readDispatch(context, c, value);
    if (record.state !== 'offered' || now >= record.expiresAt) return conflict();
    const pending = await queue(context, printer, c);
    const [pointer, claim, delivery, history, activity, order, printerRow] = await Promise.all([
      transaction.get(printer.collection('ordinaryState').doc('current')),
      transaction.get(printer.collection('claims').doc(record.jobId)),
      transaction.get(printer.collection('deliveries').doc(record.jobId)),
      transaction.get(printer.collection('originalPrintHistory').doc(record.jobId)),
      transaction.get(printer.collection('statusMetadata').doc('current')),
      transaction.get(db.collection('orders').doc(record.job.orderId)), transaction.get(printer),
    ]);
    const ptr = ordinaryPointerSchema.safeParse(pointer.data()), reserved = nativePrintClaimSchema.safeParse(claim.data()),
      configured = storedPrinterSchema.safeParse(printerRow.data());
    const job = pending.jobs.find(row => row.id === record.jobId), transferredAt = Date.now();
    const { updatedAt: _updatedAt, ...canonical } = job ?? {};
    if (!job || JSON.stringify(canonical) !== JSON.stringify(record.job) || !ptr.success || ptr.data.jobId !== record.jobId
      || !reserved.success || reserved.data.claimDigest !== record.claimDigest || reserved.data.deliveryDigest !== record.deliveryDigest
      || JSON.stringify(reserved.data.job) !== JSON.stringify(record.job)
      || reserved.data.printerRevision !== identity.printerRevision || reserved.data.credentialRevision !== identity.credentialRevision
      || reserved.data.expiresAt <= transferredAt || reserved.data.reservedAt > transferredAt
      || delivery.exists || history.exists || pending.ledger.revision === Number.MAX_SAFE_INTEGER
      || transferredAt < now || transferredAt >= record.expiresAt || !configured.success || !order.exists
      || !kitchenPrintEligibility({ ...order.data(), id: order.id } as KitchenOrder, configured.data.configuration).eligible) return conflict();
    const bytes = payload(record), previous = readStoredPrinterActivity(activity.data(), identity, identity.printerRevision, transferredAt);
    if ((previous.lastConfirmedPrintAt ?? 0) > transferredAt || (previous.activatedAt ?? 0) > transferredAt) return conflict();
    const envelope = deliveredPrintEnvelopeSchema.parse({ schemaVersion: 1, ...binding(c), state: 'delivered',
      job: { ...binding(c), id: job.id, orderId: job.orderId, kind: job.kind, revision: 0,
        printerRevision: job.printerRevision, createdAt: job.createdAt },
      printerRevision: identity.printerRevision, credentialRevision: identity.credentialRevision,
      claimDigest: record.claimDigest, deliveryDigest: record.deliveryDigest, contentDigest: record.contentDigest,
      deliveredAt: transferredAt, expiresAt: record.expiresAt });
    const terminal = originalPrintHistorySchema.parse({ schemaVersion: 1, ...binding(c), jobId: job.id,
      orderId: job.orderId, kind: job.kind, revision: 0, printerRevision: identity.printerRevision,
      credentialRevision: identity.credentialRevision, contentDigest: record.contentDigest, transferredAt });
    const remaining = pending.jobs.filter(row => row.id !== job.id);
    transaction.create(printer.collection('deliveries').doc(job.id), envelope);
    transaction.create(printer.collection('originalPrintHistory').doc(job.id), terminal);
    transaction.delete(printer.collection('jobs').doc(job.id));
    transaction.set(printer.collection('queue').doc('state'), { ...pending.ledger,
      revision: pending.ledger.revision + 1, pendingCount: remaining.length, oldestPendingAt: remaining[0]?.createdAt ?? null,
      updatedAt: FieldValue.serverTimestamp() });
    transaction.set(ref, { ...record, state: 'download_started', downloadedAt: transferredAt });
    if (previous.printHistory === 'never') transaction.set(printer.collection('statusMetadata').doc('current'), { ...previous, printHistory: 'unknown' });
    return { payload: bytes, contentType: 'image/png' as const, sha256: record.contentDigest };
  });
}

export async function recordOrdinaryPrintResult(input: unknown) {
  const parsed = commandSchema.extend({ query: z.string().max(2048) }).strict().safeParse(input);
  if (!parsed.success) return conflict();
  const { query, ...c } = parsed.data, confirmation = parseCloudPrntConfirmation(query);
  if (!token.safeParse(confirmation.token).success) return conflict();
  const db = getAdminDb();
  return db.runTransaction(async transaction => {
    const context = { db, transaction }, { printer, ref, record, now } = await readDispatch(context, c, confirmation.token);
    const pointerRef = printer.collection('ordinaryState').doc('current'), pointer = await transaction.get(pointerRef);
    const ptr = ordinaryPointerSchema.safeParse(pointer.data());
    if (confirmation.outcome === 'confirmed') {
      const plan = await prepareCloudPrntPrintConfirmation(context, { ...c, jobId: record.jobId, query });
      if (plan.duplicate) return { outcome: 'confirmed', duplicate: true };
      if (!ptr.success || ptr.data.jobId !== record.jobId) return conflict();
      plan.apply();
      transaction.set(ref, { ...record, state: 'confirmed', completedAt: plan.confirmedAt });
      transaction.delete(pointerRef);
      return { outcome: 'confirmed', duplicate: false };
    }
    const state = confirmation.outcome === 'reported_failure' ? 'failed' : 'unknown';
    if (record.state === state) return { outcome: state, duplicate: true };
    if (record.state !== 'download_started' || now >= record.expiresAt || !ptr.success || ptr.data.jobId !== record.jobId) return conflict();
    transaction.set(ref, { ...record, state, completedAt: now });
    // The pointer intentionally remains: uncertain/failed physical output must
    // not trigger another job or an automatic retry of this original.
    return { outcome: state, duplicate: false };
  });
}
