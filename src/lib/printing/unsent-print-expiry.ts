import 'server-only';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import type { NativeTransactionContext } from '@/lib/server/firestore-compat';
import { storedPrintQueueSchema, storedQueuedPrintJobSchema, PRINT_QUEUE_LIMIT } from './queue-storage';
import { printJobId } from './domain';
import { automaticActivationIdSchema } from './brand-automatic-print-schema';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const scopeSchema = z.object({ brandId: id, locationId: id, printerId: id }).strict();
const policySchema = z.object({ automaticActivationId: automaticActivationIdSchema, issuedAt: z.number().int().positive().safe().max(8.64e15) }).strict();
export const storedExpiredPrintJobSchema = z.object({
  schemaVersion: z.literal(1), ...scopeSchema.shape, jobId: z.string().regex(/^[a-f0-9]{64}$/),
  orderId: id, kind: z.enum(['kitchen', 'packing']), revision: z.literal(0),
  printerRevision: z.number().int().positive().safe(), automaticActivationId: automaticActivationIdSchema.optional(),
  createdAt: z.number().int().positive().safe().max(8.64e15), completedAt: z.number().int().positive().safe().max(8.64e15),
  state: z.literal('expired'), reason: z.enum(['unsent_timeout', 'activation_changed', 'offer_timeout']),
}).strict().refine(row => printJobId(row) === row.jobId && row.completedAt >= row.createdAt);
export const UNSENT_PRINT_MAX_AGE_MS = 300_000;
export const UNSENT_PRINT_EXPIRY_BATCH = 50;
export class UnsentPrintExpiryError extends Error { constructor() { super('unsent_print_expiry_unverified'); } }
const fail = (): never => { throw new UnsentPrintExpiryError(); };

/** Called only after permanent output authorization. Preparation is read-only;
 * apply must be the caller's final transaction operation, with no later reads.
 * No claim, offer or downloaded job is eligible for archival or retry here. */
export async function prepareUnsentPrintExpiry(context: NativeTransactionContext,
  input: { brandId: string; locationId: string; printerId: string },
  activation: { automaticActivationId: string; issuedAt: number }, now = Date.now()) {
  const scope = scopeSchema.safeParse(input), policy = policySchema.safeParse(activation);
  if (!scope.success || !policy.success || context.db !== getAdminDb() || !context.transaction
    || !Number.isSafeInteger(now) || now <= 0 || now > 8.64e15 || policy.data.issuedAt > now) return fail();
  const matches = (row: { brandId: string; locationId: string; printerId: string }) =>
    row.brandId === scope.data.brandId && row.locationId === scope.data.locationId && row.printerId === scope.data.printerId;
  const tx = context.transaction, printer = context.db.collection('locations').doc(scope.data.locationId).collection('printers').doc(scope.data.printerId);
  const ledgerRef = printer.collection('queue').doc('state');
  const [ledgerSnapshot, jobSnapshot, ordinaryPointer, manualPointer] = await Promise.all([
    tx.get(ledgerRef), tx.get(printer.collection('jobs').limit(PRINT_QUEUE_LIMIT + 1)),
    tx.get(printer.collection('ordinaryState').doc('current')), tx.get(printer.collection('manualState').doc('current')),
  ]);
  const empty = { count: 0, apply() {} };
  if (ordinaryPointer.exists || manualPointer.exists) return empty;
  const ledger = storedPrintQueueSchema.safeParse(ledgerSnapshot.data());
  if (!ledger.success || !matches(ledger.data) || !Number.isSafeInteger(ledger.data.revision + 1) || jobSnapshot.size > PRINT_QUEUE_LIMIT) return fail();
  const jobs = jobSnapshot.docs.map(snapshot => {
    const parsed = storedQueuedPrintJobSchema.safeParse(snapshot.data());
    if (!parsed.success || !matches(parsed.data) || parsed.data.id !== snapshot.id || printJobId(parsed.data) !== snapshot.id
      || parsed.data.createdAt <= 0 || parsed.data.createdAt > now) return fail();
    return parsed.data;
  }).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  if (ledger.data.pendingCount !== jobs.length || ledger.data.oldestPendingAt !== (jobs[0]?.createdAt ?? null)) return fail();
  const candidates = jobs.filter(job => job.automaticActivationId !== policy.data.automaticActivationId
    || job.createdAt < policy.data.issuedAt || now - job.createdAt > UNSENT_PRINT_MAX_AGE_MS).slice(0, UNSENT_PRINT_EXPIRY_BATCH);
  const checked = await Promise.all(candidates.map(async job => {
    const proof = await Promise.all(['claims', 'ordinaryDispatches', 'originalPrintHistory', 'deliveries', 'printResults', 'expiredPrintJobs'].map(collection => tx.get(printer.collection(collection).doc(job.id))));
    // Any existing execution evidence is deliberately left for explicit review.
    return proof.some(snapshot => snapshot.exists) ? null : job;
  }));
  const expired = checked.filter((job): job is NonNullable<typeof job> => job !== null);
  if (!expired.length) return empty;
  const expiredIds = new Set(expired.map(job => job.id)), remaining = jobs.filter(job => !expiredIds.has(job.id));
  let applied = false;
  return { count: expired.length, apply() {
    if (applied) return fail(); applied = true;
    for (const job of expired) {
      const sameActivation = job.automaticActivationId === policy.data.automaticActivationId;
      tx.create(printer.collection('expiredPrintJobs').doc(job.id), { schemaVersion: 1, ...scope.data, jobId: job.id,
        orderId: job.orderId, kind: job.kind, revision: 0, printerRevision: job.printerRevision,
        ...(job.automaticActivationId ? { automaticActivationId: job.automaticActivationId } : {}), createdAt: job.createdAt, completedAt: now, state: 'expired',
        reason: sameActivation && job.createdAt >= policy.data.issuedAt ? 'unsent_timeout' : 'activation_changed' });
      tx.delete(printer.collection('jobs').doc(job.id));
    }
    tx.set(ledgerRef, { ...ledger.data, revision: ledger.data.revision + 1, pendingCount: remaining.length,
      oldestPendingAt: remaining[0]?.createdAt ?? null, updatedAt: FieldValue.serverTimestamp() });
  } };
}
