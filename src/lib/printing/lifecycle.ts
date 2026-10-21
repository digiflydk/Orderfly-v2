import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { principalKey } from '@/lib/access/authority';
import { verifiedOrderflyIdentity } from '@/lib/access/orderfly-session';
import { authorizeTransaction } from '@/lib/access/scoped-data';
import { validatePrinterConfiguration } from './configuration';
import { storedPrinterSchema } from './storage';
import { issuedQueueReviewSchema } from './queue-review-storage';
import { readCanonicalQueueSnapshot } from './queue-snapshot';

const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const commandSchema = z.object({
  brandId: identifier, locationId: identifier, printerId: identifier,
  revision: z.number().int().positive().safe(),
  action: z.enum(['pause', 'deactivate', 'delete', 'resume']),
  receipt: z.string().regex(/^[A-Za-z0-9_-]{43}$/).optional(),
  queueRevision: z.number().int().positive().safe().optional(),
}).strict().refine(command => command.action === 'resume'
  ? (command.receipt === undefined) === (command.queueRevision === undefined)
  : command.receipt === undefined && command.queueRevision === undefined);

export class PrinterLifecycleError extends Error {
  constructor(public code: 'invalid_request' | 'not_found' | 'record_conflict'
    | 'writes_unavailable' | 'queue_review_required' | 'queue_review_blocked', public status: number) { super(code); }
}

/** Audited lifecycle only. Never modifies jobs, dispatches or enables output. */
export async function transitionPrinter(input: unknown) {
  const identity = await verifiedOrderflyIdentity();
  const parsed = commandSchema.safeParse(input);
  if (!parsed.success) throw new PrinterLifecycleError('invalid_request', 400);
  if (process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED !== 'true') throw new PrinterLifecycleError('writes_unavailable', 503);
  const command = parsed.data;
  const db = getAdminDb(), locationRef = db.collection('locations').doc(command.locationId);
  const ref = locationRef.collection('printers').doc(command.printerId);
  const actorId = principalKey(identity);
  return db.runTransaction(async tx => {
    await authorizeTransaction(tx, identity, command,
      command.action === 'delete' ? 'orderfly.catalog:delete' : 'orderfly.catalog:edit', 'location');
    const location = await tx.get(locationRef);
    const saved = await tx.get(ref);
    const record = saved.exists ? storedPrinterSchema.safeParse(saved.data()) : null;
    if (!record?.success || record.data.configuration.id !== saved.id
      || !validatePrinterConfiguration(record.data.configuration,
        { brandId: command.brandId, locationId: command.locationId },
        { id: location.id, brandId: location.data()?.brandId }).ok) {
      throw new PrinterLifecycleError('not_found', 404);
    }
    const before = record.data;
    if (before.revision !== command.revision || before.revision === Number.MAX_SAFE_INTEGER) {
      throw new PrinterLifecycleError('record_conflict', 409);
    }
    let consumedReview: { ref: FirebaseFirestore.DocumentReference;
      data: z.infer<typeof issuedQueueReviewSchema>; consumedAt: number } | undefined;
    if (command.action === 'resume') {
      // Only the hash-addressed server record can authorize resume. GET/client
      // counts and separate consume-then-resume transactions are never evidence.
      if (!command.receipt) throw new PrinterLifecycleError('queue_review_required', 409);
      if (before.configuration.state === 'active') throw new PrinterLifecycleError('record_conflict', 409);
      const tokenHash = createHash('sha256').update(command.receipt).digest('hex');
      const reviewRef = ref.collection('queueReviews').doc(tokenHash);
      const savedReview = await tx.get(reviewRef);
      const review = savedReview.exists ? issuedQueueReviewSchema.safeParse(savedReview.data()) : null;
      if (!review?.success || savedReview.id !== tokenHash || review.data.tokenHash !== tokenHash
        || review.data.actorId !== actorId || review.data.brandId !== command.brandId
        || review.data.locationId !== command.locationId || review.data.printerId !== command.printerId
        || review.data.printerState !== before.configuration.state
        || review.data.printerRevision !== before.revision || review.data.queueRevision !== command.queueRevision) {
        throw new PrinterLifecycleError('queue_review_required', 409);
      }
      // All canonical jobs and ledger are re-read in THIS write transaction.
      const snapshot = await readCanonicalQueueSnapshot(tx, ref, command);
      if (snapshot.status !== 'verified' || snapshot.summary.pendingCount !== 0
        || snapshot.queueRevision !== review.data.queueRevision || snapshot.queueRevision === Number.MAX_SAFE_INTEGER
        || review.data.issuedAt > snapshot.evaluatedAt || snapshot.evaluatedAt >= review.data.expiresAt) {
        throw new PrinterLifecycleError('queue_review_blocked', 409);
      }
      consumedReview = { ref: reviewRef, data: review.data, consumedAt: snapshot.evaluatedAt };
    }
    if (command.action === 'pause' && before.configuration.state !== 'active'
      || command.action === 'deactivate' && before.configuration.state === 'disabled') {
      throw new PrinterLifecycleError('record_conflict', 409);
    }
    const revision = before.revision + 1, timestamp = FieldValue.serverTimestamp();
    const configuration = { ...before.configuration, state: command.action === 'resume' ? 'active' as const
      : command.action === 'pause' ? 'paused' as const : 'disabled' as const };
    const deleted = command.action === 'delete';
    if (consumedReview) tx.set(consumedReview.ref, { ...consumedReview.data, consumedAt: consumedReview.consumedAt });
    tx.delete(locationRef.collection('printerCapabilityVerifications').doc(command.printerId));
    tx.create(ref.collection('audit').doc(String(revision)), {
      schemaVersion: 1, actorId, action: `printer.${command.action}`, revision,
      before: before.configuration, after: configuration, deleted,
      capabilityInvalidated: true, createdAt: timestamp,
      ...(consumedReview ? { queueReview: { tokenHash: consumedReview.data.tokenHash,
        queueRevision: consumedReview.data.queueRevision, decision: consumedReview.data.decision,
        issuedAt: consumedReview.data.issuedAt, expiresAt: consumedReview.data.expiresAt,
        consumedAt: consumedReview.consumedAt } } : {}),
    });
    tx.set(ref, { ...before, configuration, revision,
      deletedAt: deleted ? timestamp : null, updatedAt: timestamp });
    // A tombstone preserves the printer identity, audit children and all job references.
    return deleted ? { deleted: true, printerId: command.printerId, revision }
      : { item: { configuration, revision } };
  });
}
