import 'server-only';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import type { NativeTransactionContext } from '@/lib/server/firestore-compat';
import { ordinaryDispatchSchema, ordinaryPointerSchema } from './ordinary-print-storage';
import { nativePrintClaimSchema } from './native-claim';
import { storedPrintQueueSchema, storedQueuedPrintJobSchema, PRINT_QUEUE_LIMIT } from './queue-storage';
import { storedExpiredPrintJobSchema, UnsentPrintExpiryError } from './unsent-print-expiry';
import { printJobId } from './domain';
const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const scopeSchema = z.object({ brandId: id, locationId: id, printerId: id }).strict();
const fail = (): never => { throw new UnsentPrintExpiryError(); };

/** Expire only an offer proven never downloaded. This does not retry the order.
 * Caller authenticates the printer and permanent policy in the same transaction.
 * apply is the final operation: no subsequent transaction reads are permitted. */
export async function prepareExpiredOfferCleanup(context: NativeTransactionContext,
  input: { brandId: string; locationId: string; printerId: string }, now = Date.now()) {
  const scope = scopeSchema.safeParse(input);
  if (!scope.success || context.db !== getAdminDb() || !context.transaction || !Number.isSafeInteger(now) || now <= 0 || now > 8.64e15) return fail();
  const tx = context.transaction, printer = context.db.collection('locations').doc(scope.data.locationId).collection('printers').doc(scope.data.printerId);
  const pointerRef = printer.collection('ordinaryState').doc('current');
  const [pointer, manual] = await Promise.all([tx.get(pointerRef), tx.get(printer.collection('manualState').doc('current'))]);
  const empty = { count: 0, apply() {} };
  if (!pointer.exists || manual.exists) return empty;
  const ptr = ordinaryPointerSchema.safeParse(pointer.data()); if (!ptr.success) return fail();
  const dispatch = ordinaryDispatchSchema.safeParse((await tx.get(printer.collection('ordinaryDispatches').doc(ptr.data.jobId))).data());
  const matches = (row: { brandId: string; locationId: string; printerId: string }) =>
    row.brandId === scope.data.brandId && row.locationId === scope.data.locationId && row.printerId === scope.data.printerId;
  if (!dispatch.success || !matches(dispatch.data) || dispatch.data.jobId !== ptr.data.jobId || dispatch.data.offeredAt > now) return fail();
  const offer = dispatch.data;
  if (offer.state !== 'offered' || offer.downloadedAt !== null || offer.completedAt !== null || now < offer.expiresAt) return empty;
  const ledgerRef = printer.collection('queue').doc('state');
  const [claimSnapshot, ledgerSnapshot, queueSnapshot, ...evidence] = await Promise.all([
    tx.get(printer.collection('claims').doc(offer.jobId)), tx.get(ledgerRef), tx.get(printer.collection('jobs').limit(PRINT_QUEUE_LIMIT + 1)),
    ...['deliveries', 'originalPrintHistory', 'printResults', 'expiredPrintJobs'].map(name => tx.get(printer.collection(name).doc(offer.jobId))),
  ]);
  // A persisted delivery/result is stronger evidence than an apparently untouched offer.
  if (evidence.some(row => row.exists)) return empty;
  const claim = nativePrintClaimSchema.safeParse(claimSnapshot.data()), ledger = storedPrintQueueSchema.safeParse(ledgerSnapshot.data());
  if (!claim.success || !matches(claim.data) || claim.data.jobId !== offer.jobId || claim.data.expiresAt > now
    || claim.data.reservedAt < offer.offeredAt || claim.data.claimDigest !== offer.claimDigest || claim.data.deliveryDigest !== offer.deliveryDigest
    || claim.data.printerRevision !== offer.printerRevision || claim.data.credentialRevision !== offer.credentialRevision
    || !isDeepStrictEqual(claim.data.job, offer.job) || !ledger.success || !matches(ledger.data)
    || !Number.isSafeInteger(ledger.data.revision + 1) || queueSnapshot.size > PRINT_QUEUE_LIMIT) return fail();
  const jobs = queueSnapshot.docs.map(snapshot => {
    const parsed = storedQueuedPrintJobSchema.safeParse(snapshot.data());
    if (!parsed.success || !matches(parsed.data) || parsed.data.id !== snapshot.id || printJobId(parsed.data) !== snapshot.id
      || parsed.data.createdAt <= 0 || parsed.data.createdAt > now) return fail();
    return parsed.data;
  }).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  if (ledger.data.pendingCount !== jobs.length || ledger.data.oldestPendingAt !== (jobs[0]?.createdAt ?? null)) return fail();
  const job = jobs.find(row => row.id === offer.jobId); if (!job) return fail();
  const { updatedAt: _updatedAt, ...canonical } = job;
  if (!isDeepStrictEqual(canonical, offer.job)) return fail();
  const archived = storedExpiredPrintJobSchema.parse({ schemaVersion: 1, ...scope.data, jobId: job.id,
    orderId: job.orderId, kind: job.kind, revision: 0, printerRevision: job.printerRevision,
    ...(job.automaticActivationId ? { automaticActivationId: job.automaticActivationId } : {}),
    createdAt: job.createdAt, completedAt: now, state: 'expired', reason: 'offer_timeout' });
  const remaining = jobs.filter(row => row.id !== job.id); let applied = false;
  return { count: 1, apply() {
    if (applied) return fail(); applied = true;
    tx.create(printer.collection('expiredPrintJobs').doc(job.id), archived);
    tx.delete(printer.collection('jobs').doc(job.id));
    tx.delete(pointerRef);
    tx.set(ledgerRef, { ...ledger.data, revision: ledger.data.revision + 1, pendingCount: remaining.length,
      oldestPendingAt: remaining[0]?.createdAt ?? null, updatedAt: FieldValue.serverTimestamp() });
  } };
}
