import 'server-only';
import { z } from 'zod';
import { FieldValue, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { kitchenPrintIntentEligibility, printJobId, type KitchenOrder } from './domain';
import { storedPrinterSchema } from './storage';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const integer = z.number().int().nonnegative().safe();
const scope = { brandId: id, locationId: id, printerId: id };
const commandSchema = z.object({ ...scope, orderId: id, kind: z.enum(['kitchen', 'packing']) }).strict();
const queueSchema = z.object({
  schemaVersion: z.literal(1), ...scope, revision: integer.positive(),
  pendingCount: integer, oldestPendingAt: integer.nullable(),
  updatedAt: z.unknown(),
}).strict().refine(q => (q.pendingCount === 0) === (q.oldestPendingAt === null));
const jobSchema = z.object({
  schemaVersion: z.literal(1), ...scope, orderId: id, kind: z.enum(['kitchen', 'packing']),
  revision: z.literal(0), id: z.string().regex(/^[a-f0-9]{64}$/),
  printerRevision: integer.positive(), state: z.literal('queued'), attempts: z.literal(0),
  createdAt: integer, updatedAt: z.unknown(),
}).strict();
const orderSchema = z.object({
  brandId: id, locationId: id, status: z.string(), paymentStatus: z.string(),
  paymentMethod: z.string(), deliveryType: z.string(), discountReservation: z.string().optional(),
  psp: z.unknown().optional(),
});

export class PrintOutboxError extends Error {
  constructor(readonly code: 'invalid_intent' | 'ineligible_intent' | 'queue_unverified' | 'job_conflict') {
    super(code);
  }
}

/** Server-only prepare/apply helper, like prepareAdminCapacitySettlement.
 * Reads persisted order/native ownership before any writes. Caller must authorize
 * its server event/actor, call once per printer per transaction, finish ALL reads,
 * then apply together with its order mutation. No browser/payment claims accepted.
 * V1 supports already eligible persisted orders; Pending->accepted/paid transition
 * integration needs a separately reviewed trusted transition adapter, not a DTO override.
 */
export async function prepareOriginalPrintIntent(db: Firestore, tx: Transaction, input: unknown) {
  const parsed = commandSchema.safeParse(input);
  if (!parsed.success) throw new PrintOutboxError('invalid_intent');
  const command = parsed.data;
  const identity = { ...command, revision: 0 as const };
  const jobId = printJobId(identity);
  const printerRef = db.collection('locations').doc(command.locationId).collection('printers').doc(command.printerId);
  const jobs = printerRef.collection('jobs');
  const jobRef = jobs.doc(jobId), queueRef = printerRef.collection('queue').doc('state');
  const [brand, location, printer, order, job, queue] = await Promise.all([
    tx.get(db.collection('brands').doc(command.brandId)),
    tx.get(db.collection('locations').doc(command.locationId)), tx.get(printerRef),
    tx.get(db.collection('orders').doc(command.orderId)), tx.get(jobRef), tx.get(queueRef),
  ]);
  const config = storedPrinterSchema.safeParse(printer.data());
  const savedOrder = orderSchema.safeParse(order.data());
  if (!brand.exists || location.data()?.brandId !== command.brandId || !config.success || !savedOrder.success
    || config.data.configuration.id !== command.printerId
    || config.data.configuration.brandId !== command.brandId || config.data.configuration.locationId !== command.locationId
    || savedOrder.data.brandId !== command.brandId || savedOrder.data.locationId !== command.locationId
    || !kitchenPrintIntentEligibility({ ...savedOrder.data, id: order.id } as KitchenOrder, config.data.configuration).eligible) {
    throw new PrintOutboxError('ineligible_intent');
  }
  const sameScope = (q: { brandId: string; locationId: string; printerId: string }) =>
    q.brandId === command.brandId && q.locationId === command.locationId && q.printerId === command.printerId;
  const current = queueSchema.safeParse(queue.data());
  // V1 insertion-only backlog is bounded; never trust count/oldest aggregates
  // without validating EVERY counted row (orderBy would hide missing fields).
  const rows = await tx.get(jobs.limit(501));
  if (rows.size > 500) throw new PrintOutboxError('queue_unverified');
  let oldestAt: number | null = null;
  for (const row of rows.docs) {
    const stored = jobSchema.safeParse(row.data());
    if (!stored.success || !sameScope(stored.data) || stored.data.id !== row.id
      || printJobId(stored.data) !== row.id) throw new PrintOutboxError('queue_unverified');
    oldestAt = oldestAt === null ? stored.data.createdAt : Math.min(oldestAt, stored.data.createdAt);
  }
  const count = rows.size;
  if ((!queue.exists && count !== 0) || (queue.exists && (!current.success || !sameScope(current.data)))
    || (current.success && (current.data.pendingCount !== count || current.data.oldestPendingAt !== oldestAt))) {
    throw new PrintOutboxError('queue_unverified');
  }
  if (job.exists) {
    const prior = jobSchema.safeParse(job.data());
    if (!prior.success || !sameScope(prior.data) || prior.data.id !== jobId
      || prior.data.orderId !== command.orderId || prior.data.kind !== command.kind
      || !current.success || current.data.pendingCount < 1
      || current.data.oldestPendingAt! > prior.data.createdAt) throw new PrintOutboxError('job_conflict');
    return { jobId, created: false, apply() {} };
  }
  const revision = current.success ? current.data.revision : 0;
  const pendingCount = current.success ? current.data.pendingCount : 0;
  if (revision === Number.MAX_SAFE_INTEGER || pendingCount >= 500) throw new PrintOutboxError('queue_unverified');
  // Clock is trusted server time; commit timestamp is retained separately. Age review
  // must reject future/implausible clocks, never interpret them as a fresh empty queue.
  const now = Date.now();
  let applied = false;
  return { jobId, created: true, apply() {
    if (applied) throw new PrintOutboxError('job_conflict');
    applied = true;
    tx.create(jobRef, { schemaVersion: 1, ...identity, id: jobId,
      printerRevision: config.data.revision, state: 'queued', attempts: 0,
      createdAt: now, updatedAt: FieldValue.serverTimestamp() });
    const next = { schemaVersion: 1, brandId: command.brandId, locationId: command.locationId,
      printerId: command.printerId, revision: revision + 1, pendingCount: pendingCount + 1,
      oldestPendingAt: current.success && current.data.oldestPendingAt !== null ? Math.min(current.data.oldestPendingAt, now) : now,
      updatedAt: FieldValue.serverTimestamp() };
    if (queue.exists) tx.set(queueRef, next); else tx.create(queueRef, next);
  } };
}
