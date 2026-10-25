import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import type { NativeTransactionContext } from '@/lib/server/firestore-compat';
import { verifyCloudPrntHttpDevice } from './cloudprnt-http-auth';
import { storedPrinterSchema } from './storage';
import { parseCloudPrntConfirmation } from './cloudprnt-http';
import { ManualPrintError, MANUAL_PRINT_MAX_BYTES, manualPrintPointerSchema,
  storedManualPrintJobSchema, type ManualPrintJob } from './manual-print-schema';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/)
  .refine(value => Buffer.from(value, 'base64url').toString('base64url') === value);
const commandSchema = z.object({ brandId: id, locationId: id, printerId: id,
  authorization: z.string().min(78).max(256) }).strict();
type Command = z.infer<typeof commandSchema>;
type Scope = Pick<Command, 'brandId' | 'locationId' | 'printerId'>;
const conflict = (): never => { throw new ManualPrintError('manual_print_conflict'); };
const sameScope = (a: Scope, b: Scope) => a.brandId === b.brandId && a.locationId === b.locationId && a.printerId === b.printerId;
const tokenDigest = (scope: Scope, value: string) => createHash('sha256')
  .update(JSON.stringify(['orderfly-manual-token-v1', scope.brandId, scope.locationId, scope.printerId, value])).digest('hex');
const equalDigest = (a: string, b: string) => timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
const deliveryDeadline = (job: ManualPrintJob) => Math.min(job.expiresAt, (job.offeredAt ?? 0) + 60_000);
function outputGate() {
  if (process.env.ORDERFLY_PRINTER_ORDER_TEST_OUTPUT_ENABLED !== 'true') throw new ManualPrintError('manual_print_unavailable');
}
async function authorized(context: NativeTransactionContext, command: Command) {
  outputGate();
  const identity = await verifyCloudPrntHttpDevice(context, command);
  const printer = context.db.collection('locations').doc(command.locationId).collection('printers').doc(command.printerId);
  const [row, brand] = await Promise.all([context.transaction.get(printer),
    context.transaction.get(context.db.collection('brands').doc(command.brandId))]);
  const configured = storedPrinterSchema.safeParse(row.data());
  if (!configured.success || configured.data.revision !== identity.printerRevision) return conflict();
  const dispatchAllowed = ['active', 'trialing'].includes(brand.data()?.status) && identity.printerState === 'active'
    && configured.data.configuration.manufacturer === 'star' && configured.data.configuration.transport === 'cloudprnt-http'
    && ['mc-print2', 'mc-print3'].includes(configured.data.configuration.model);
  return { printer, identity, dispatchAllowed };
}
function checkedJob(value: unknown, requestId: string, identity: Awaited<ReturnType<typeof verifyCloudPrntHttpDevice>>, now: number,
  requireCurrentRevision = true) {
  const parsed = storedManualPrintJobSchema.safeParse(value);
  if (!parsed.success || !sameScope(parsed.data, identity) || parsed.data.requestId !== requestId
    || (requireCurrentRevision && (identity.printerState !== 'active' || parsed.data.printerRevision !== identity.printerRevision
      || parsed.data.credentialRevision !== identity.credentialRevision))
    || parsed.data.createdAt > now || (parsed.data.offeredAt ?? 0) > now || (parsed.data.downloadedAt ?? 0) > now
    || (parsed.data.completedAt ?? 0) > now) return conflict();
  const job = parsed.data;
  if ((job.offeredAt !== null && (job.offeredAt < job.createdAt || job.offeredAt >= job.expiresAt))
    || (job.downloadedAt !== null && (job.offeredAt === null || job.downloadedAt < job.offeredAt || job.downloadedAt >= deliveryDeadline(job)))
    || (job.completedAt !== null && job.completedAt < (job.downloadedAt ?? job.offeredAt ?? job.createdAt))
    || (job.state === 'queued' && (job.offeredAt !== null || job.tokenDigest !== null || job.downloadedAt !== null || job.completedAt !== null))
    || (job.state === 'offered' && (job.offeredAt === null || job.tokenDigest === null || job.downloadedAt !== null || job.completedAt !== null))
    || (job.state === 'download_started' && (job.downloadedAt === null || job.tokenDigest === null || job.completedAt !== null))
    || (['confirmed', 'failed', 'unknown'].includes(job.state) && (job.downloadedAt === null || job.tokenDigest === null || job.completedAt === null))) return conflict();
  return job;
}
function payload(job: ManualPrintJob) {
  const bytes = Buffer.from(job.payloadBase64, 'base64');
  if (bytes.length !== job.byteLength || bytes.length > MANUAL_PRINT_MAX_BYTES || bytes.length < 24
    || bytes.toString('base64') !== job.payloadBase64 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
    || createHash('sha256').update(bytes).digest('hex') !== job.sha256) return conflict();
  return bytes;
}

/** Explicit manual work only. null permits the ordinary lane to try; an occupied
 * manual pointer blocks ordinary offers. Both transactions read both pointers. */
export async function pollManualPrint(input: unknown) {
  const parsed = commandSchema.extend({ ready: z.boolean() }).strict().safeParse(input);
  if (!parsed.success) return conflict();
  const { ready, ...command } = parsed.data, db = getAdminDb();
  // One random token per operation, also across native transaction retries.
  const deliveryToken = randomBytes(32).toString('base64url'), digest = tokenDigest(command, deliveryToken);
  return db.runTransaction(async transaction => {
    const context = { db, transaction }, { printer, identity, dispatchAllowed } = await authorized(context, command);
    const pointerRef = printer.collection('manualState').doc('current');
    const [pointer, ordinary] = await Promise.all([transaction.get(pointerRef),
      transaction.get(printer.collection('ordinaryState').doc('current'))]);
    if (!pointer.exists) return null;
    const parsedPointer = manualPrintPointerSchema.safeParse(pointer.data());
    if (!parsedPointer.success) return conflict();
    const ref = printer.collection('manualPrintRequests').doc(parsedPointer.data.requestId);
    const stored = await transaction.get(ref), now = Date.now();
    // Validate stored ownership and lifecycle independently of current device
    // revisions. A rotated printer may expire untouched old work, but can never
    // receive its bytes or clear an ambiguous previous transfer.
    const job = checkedJob(stored.data(), ref.id, identity, now, false);
    // A downloaded job may already be on paper: never clear or retry it because
    // an acknowledgement was lost. An untouched/never-downloaded job can expire.
    if ((job.state === 'queued' && now >= job.expiresAt)
      || (job.state === 'offered' && now >= deliveryDeadline(job))) {
      transaction.set(ref, { ...job, state: 'expired', completedAt: now });
      transaction.delete(pointerRef);
      return { jobReady: false as const };
    }
    if (job.state === 'download_started' && now >= deliveryDeadline(job)) {
      transaction.set(ref, { ...job, state: 'unknown', completedAt: now });
      return { jobReady: false as const };
    }
    if (!dispatchAllowed || !ready || ordinary.exists || job.state !== 'queued'
      || job.printerRevision !== identity.printerRevision || job.credentialRevision !== identity.credentialRevision) return { jobReady: false as const };
    if (job.offeredAt !== null || job.downloadedAt !== null || job.completedAt !== null || job.tokenDigest !== null) return conflict();
    payload(job); // Refuse corrupted frozen bytes before offering.
    const indexRef = printer.collection('manualTokens').doc(digest), index = await transaction.get(indexRef);
    if (index.exists) return conflict();
    transaction.set(ref, { ...job, state: 'offered', offeredAt: now, tokenDigest: digest });
    transaction.create(indexRef, { schemaVersion: 1, requestId: job.requestId });
    return { jobReady: true as const, jobToken: deliveryToken, mediaTypes: ['image/png'] as const };
  });
}

async function readDispatch(context: NativeTransactionContext, command: Command, value: string) {
  const { printer, identity, dispatchAllowed } = await authorized(context, command), digest = tokenDigest(command, value);
  const index = await context.transaction.get(printer.collection('manualTokens').doc(digest));
  // Only absence permits fallback. A corrupt/manual-owned token must not fall
  // through and accidentally operate on the ordinary queue.
  if (!index.exists) return null;
  if (!dispatchAllowed) return conflict();
  const pointer = manualPrintPointerSchema.safeParse(index.data());
  if (!pointer.success) return conflict();
  const ref = printer.collection('manualPrintRequests').doc(pointer.data.requestId);
  const stored = await context.transaction.get(ref), now = Date.now();
  const job = checkedJob(stored.data(), ref.id, identity, now);
  if (job.tokenDigest === null || !equalDigest(job.tokenDigest, digest) || job.offeredAt === null
    || job.offeredAt < job.createdAt) return conflict();
  return { printer, ref, job, now };
}

/** Persist ambiguous ownership transfer before exposing bytes. A repeated GET
 * never returns the receipt again, even after a dropped HTTP response. */
export async function downloadManualPrint(input: unknown) {
  const parsed = commandSchema.extend({ token }).strict().safeParse(input);
  if (!parsed.success) return conflict();
  const { token: value, ...command } = parsed.data, db = getAdminDb();
  return db.runTransaction(async transaction => {
    const dispatch = await readDispatch({ db, transaction }, command, value);
    if (dispatch === null) return null;
    const { printer, ref, job, now } = dispatch;
    const [pointer, ordinary] = await Promise.all([
      transaction.get(printer.collection('manualState').doc('current')),
      transaction.get(printer.collection('ordinaryState').doc('current')),
    ]);
    const ptr = manualPrintPointerSchema.safeParse(pointer.data());
    if (!ptr.success || ptr.data.requestId !== job.requestId || ordinary.exists || job.state !== 'offered'
      || job.downloadedAt !== null || job.completedAt !== null || now >= deliveryDeadline(job)) return conflict();
    const bytes = payload(job);
    transaction.set(ref, { ...job, state: 'download_started', downloadedAt: now });
    return { payload: bytes, contentType: 'image/png' as const, sha256: job.sha256 };
  });
}

/** Device acknowledgement belongs solely to the manual job. It never rewrites
 * original order manifests, original delivery history or synthetic results. */
export async function recordManualPrintResult(input: unknown) {
  const parsed = commandSchema.extend({ query: z.string().max(2048) }).strict().safeParse(input);
  if (!parsed.success) return conflict();
  const { query, ...command } = parsed.data, confirmation = parseCloudPrntConfirmation(query);
  if (!token.safeParse(confirmation.token).success) return conflict();
  const db = getAdminDb();
  return db.runTransaction(async transaction => {
    const dispatch = await readDispatch({ db, transaction }, command, confirmation.token);
    if (dispatch === null) return null;
    const { printer, ref, job, now } = dispatch;
    const state = confirmation.outcome === 'confirmed' ? 'confirmed' : confirmation.outcome === 'reported_failure' ? 'failed' : 'unknown';
    if (job.state === state && job.completedAt !== null && job.downloadedAt !== null) return { outcome: state, duplicate: true };
    const pointerRef = printer.collection('manualState').doc('current'), pointer = await transaction.get(pointerRef);
    const ptr = manualPrintPointerSchema.safeParse(pointer.data());
    if (!ptr.success || ptr.data.requestId !== job.requestId || job.state !== 'download_started'
      || job.downloadedAt === null || job.downloadedAt < job.offeredAt! || job.completedAt !== null
      || now >= deliveryDeadline(job)) return conflict();
    transaction.set(ref, { ...job, state, completedAt: now });
    // Confirmed output releases the transport. Failed/unknown stays explicit;
    // it is never automatically reoffered or silently replayed.
    if (state === 'confirmed') transaction.delete(pointerRef);
    return { outcome: state, duplicate: false };
  });
}
