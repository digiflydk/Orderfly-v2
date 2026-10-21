import 'server-only';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { verifiedOrderflyIdentity } from '@/lib/access/orderfly-session';
import { authorizeTransaction } from '@/lib/access/scoped-data';
import { validatePrinterConfiguration } from './configuration';
import { storedPrinterSchema } from './storage';
import { printJobId } from './domain';
import { storedPrintQueueSchema, storedQueuedPrintJobSchema, PRINT_QUEUE_LIMIT } from './queue-storage';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const inputSchema = z.object({ brandId: id, locationId: id, printerId: id }).strict();
export class PrinterQueueReadError extends Error {
  constructor(readonly code: 'invalid_request' | 'not_found', readonly status: number) { super(code); }
}
type BlockReason = 'missing_metadata' | 'invalid_metadata' | 'queue_too_large'
  | 'invalid_jobs' | 'unknown_outcome_jobs' | 'expired_jobs' | 'clock_invalid' | 'inconsistent_metadata';

/** Read-only transaction snapshot. Never a review receipt or permission to resume. */
export async function readPrinterQueueSummary(input: unknown) {
  const identity = await verifiedOrderflyIdentity();
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new PrinterQueueReadError('invalid_request', 400);
  const query = parsed.data, db = getAdminDb();
  const locationRef = db.collection('locations').doc(query.locationId);
  const printerRef = locationRef.collection('printers').doc(query.printerId);
  return db.runTransaction(async tx => {
    // Policy, native ownership, printer and queue are checked in the same snapshot.
    await authorizeTransaction(tx, identity, query, 'orderfly.catalog:view', 'location');
    const [location, printer] = await Promise.all([tx.get(locationRef), tx.get(printerRef)]);
    const record = printer.exists ? storedPrinterSchema.safeParse(printer.data()) : null;
    if (!record?.success || record.data.configuration.id !== printer.id
      || !validatePrinterConfiguration(record.data.configuration,
        { brandId: query.brandId, locationId: query.locationId },
        { id: location.id, brandId: location.data()?.brandId }).ok) {
      throw new PrinterQueueReadError('not_found', 404);
    }
    const [metadata, rows] = await Promise.all([
      tx.get(printerRef.collection('queue').doc('state')),
      tx.get(printerRef.collection('jobs').limit(PRINT_QUEUE_LIMIT + 1)),
    ]);
    const evaluatedAt = Date.now();
    const common = { ...query, printerState: record.data.configuration.state,
      printerRevision: record.data.revision, evaluatedAt, resumeAuthorized: false as const };
    const blocked = (reason: BlockReason) => ({ ...common, status: 'blocked' as const,
      reason, queueRevision: null, summary: null });
    // GET does not initialize metadata, even when no jobs are found.
    if (!metadata.exists) return blocked('missing_metadata');
    const queue = storedPrintQueueSchema.safeParse(metadata.data());
    const sameScope = (row: { brandId: string; locationId: string; printerId: string }) =>
      row.brandId === query.brandId && row.locationId === query.locationId && row.printerId === query.printerId;
    if (!queue.success || !sameScope(queue.data)) return blocked('invalid_metadata');
    if (rows.size > PRINT_QUEUE_LIMIT) return blocked('queue_too_large');
    if (!Number.isSafeInteger(evaluatedAt) || evaluatedAt <= 0) return blocked('clock_invalid');
    let oldestAt: number | null = null, newestAt: number | null = null;
    for (const row of rows.docs) {
      const raw = row.data(), job = storedQueuedPrintJobSchema.safeParse(raw);
      if (!job.success || !sameScope(job.data) || job.data.id !== row.id || printJobId(job.data) !== row.id) {
        // V1 has no transport/terminal transitions. Recognized unsafe states are
        // explicit blockers, never counted as a verified queued/fresh/empty set.
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
    if (queue.data.pendingCount !== rows.size || queue.data.oldestPendingAt !== oldestAt) {
      return blocked('inconsistent_metadata');
    }
    return { ...common, status: 'verified' as const, reason: null,
      queueRevision: queue.data.revision, summary: {
        pendingCount: rows.size, oldestCreatedAt: oldestAt, newestCreatedAt: newestAt,
        oldestAgeMs: oldestAt === null ? null : evaluatedAt - oldestAt,
        newestAgeMs: newestAt === null ? null : evaluatedAt - newestAt,
      } };
  }, { readOnly: true });
}
