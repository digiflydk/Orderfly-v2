import 'server-only';
import { printJobId } from './domain';
import { storedPrintQueueSchema, storedQueuedPrintJobSchema, PRINT_QUEUE_LIMIT } from './queue-storage';

type Scope = { brandId: string; locationId: string; printerId: string };
type BlockReason = 'missing_metadata' | 'invalid_metadata' | 'queue_too_large'
  | 'invalid_jobs' | 'unknown_outcome_jobs' | 'expired_jobs' | 'clock_invalid' | 'inconsistent_metadata';

/** Internal only: caller must authorize and validate the native printer in THIS transaction.
 * All queue reads belong to the caller's transaction; never starts a separate snapshot.
 */
export async function readCanonicalQueueSnapshot(tx: FirebaseFirestore.Transaction,
  printerRef: FirebaseFirestore.DocumentReference, scope: Scope) {
  const [metadata, rows] = await Promise.all([
    tx.get(printerRef.collection('queue').doc('state')),
    tx.get(printerRef.collection('jobs').limit(PRINT_QUEUE_LIMIT + 1)),
  ]);
  const evaluatedAt = Date.now();
  const blocked = (reason: BlockReason) => ({ evaluatedAt, status: 'blocked' as const,
    reason, queueRevision: null, summary: null });
  if (!metadata.exists) return blocked('missing_metadata');
  const queue = storedPrintQueueSchema.safeParse(metadata.data());
  const sameScope = (row: Scope) => row.brandId === scope.brandId
    && row.locationId === scope.locationId && row.printerId === scope.printerId;
  if (!queue.success || !sameScope(queue.data)) return blocked('invalid_metadata');
  if (rows.size > PRINT_QUEUE_LIMIT) return blocked('queue_too_large');
  if (!Number.isSafeInteger(evaluatedAt) || evaluatedAt <= 0) return blocked('clock_invalid');
  let oldestAt: number | null = null, newestAt: number | null = null;
  for (const row of rows.docs) {
    const raw = row.data(), job = storedQueuedPrintJobSchema.safeParse(raw);
    if (!job.success || !sameScope(job.data) || job.data.id !== row.id || printJobId(job.data) !== row.id) {
      const recognizedShape = storedQueuedPrintJobSchema.safeParse({ ...raw, state: 'queued' });
      if (!recognizedShape.success || !sameScope(recognizedShape.data)
        || recognizedShape.data.id !== row.id || printJobId(recognizedShape.data) !== row.id) return blocked('invalid_jobs');
      if (raw?.state === 'uncertain' || raw?.state === 'dispatching') return blocked('unknown_outcome_jobs');
      if (raw?.state === 'expired') return blocked('expired_jobs');
      return blocked('invalid_jobs');
    }
    if (job.data.createdAt <= 0 || job.data.createdAt > evaluatedAt) return blocked('clock_invalid');
    oldestAt = oldestAt === null ? job.data.createdAt : Math.min(oldestAt, job.data.createdAt);
    newestAt = newestAt === null ? job.data.createdAt : Math.max(newestAt, job.data.createdAt);
  }
  if (queue.data.pendingCount !== rows.size || queue.data.oldestPendingAt !== oldestAt) return blocked('inconsistent_metadata');
  return { evaluatedAt, status: 'verified' as const, reason: null,
    queueRevision: queue.data.revision, summary: {
      pendingCount: rows.size, oldestCreatedAt: oldestAt, newestCreatedAt: newestAt,
      oldestAgeMs: oldestAt === null ? null : evaluatedAt - oldestAt,
      newestAgeMs: newestAt === null ? null : evaluatedAt - newestAt,
    } };
}
