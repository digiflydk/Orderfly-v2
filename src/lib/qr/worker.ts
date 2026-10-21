import { randomUUID } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { runQrRetention, type QrRetentionCursor, type QrRetentionResult } from './retention';

export const QR_MAINTENANCE_PATH = 'qrMaintenance/retention-v1';
export const QR_RETENTION_LEASE_MS = 5 * 60_000;
type Counts = Omit<QrRetentionResult, 'nextCursor'>;
export type QrRetentionWorkerResult = { state: 'disabled' | 'busy' | 'failed' | 'superseded' }
  | ({ state: 'completed' | 'partial' } & Counts);
type Options = {
  enabled?: boolean; now?: () => number; leaseId?: () => string;
  retention?: typeof runQrRetention;
};
const emptyCursor = (): QrRetentionCursor => ({ events: null, rateLimits: null });
function validState(value: Record<string, unknown>): boolean {
  const cursor = value.cursor as Partial<QrRetentionCursor> | null;
  return value.schemaVersion === 1 && Number.isSafeInteger(value.revision) && Number(value.revision) >= 0
    && typeof value.leaseUntil === 'number' && Number.isFinite(value.leaseUntil)
    && (value.lease === null || typeof value.lease === 'string')
    && !!cursor && typeof cursor === 'object' && !Array.isArray(cursor)
    && (cursor.events === null || typeof cursor.events === 'string')
    && (cursor.rateLimits === null || typeof cursor.rateLimits === 'string');
}
function counters(result: QrRetentionResult): Counts {
  return { scanned: result.scanned, deleted: result.deleted, skipped: result.skipped, errors: result.errors,
    deletedEvents: result.deletedEvents, deletedRateLimits: result.deletedRateLimits };
}

/** Trusted existing heartbeat only. The default-off gate runs before resolving the database. */
export async function runQrRetentionWorker(getDb: () => Firestore, options: Options = {}): Promise<QrRetentionWorkerResult> {
  if (!(options.enabled ?? process.env.QR_MODULE_ENABLED === 'true')) return { state: 'disabled' };
  const clock = options.now ?? Date.now;
  try {
    const now = clock(), lease = (options.leaseId ?? randomUUID)();
    if (!Number.isSafeInteger(now) || now < 0 || !/^[A-Za-z0-9_-]{1,128}$/.test(lease)) return { state: 'failed' };
    const db = getDb(), ref = db.doc(QR_MAINTENANCE_PATH);
    const claimed = await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref), current = snapshot.data();
      if (current && !validState(current)) throw new Error('Invalid QR maintenance state');
      if (current?.lease && current.leaseUntil > now) return null;
      const revision = (current?.revision ?? 0) + 1;
      if (!Number.isSafeInteger(revision)) throw new Error('QR maintenance revision exhausted');
      const cursor: QrRetentionCursor = current ? { ...current.cursor } : emptyCursor();
      transaction.set(ref, { schemaVersion: 1, revision, lease, leaseUntil: now + QR_RETENTION_LEASE_MS,
        cursor, updatedAt: now }, { merge: true });
      return { revision, cursor };
    });
    if (!claimed) return { state: 'busy' };
    let result: QrRetentionResult | null = null;
    try { result = await (options.retention ?? runQrRetention)(db, { now, limit: 100, cursor: claimed.cursor }); }
    catch { /* Failure is persisted only while this exact lease still belongs to this invocation. */ }
    const finishedAt = clock();
    if (!Number.isSafeInteger(finishedAt) || finishedAt < 0) return { state: 'failed' };
    const saved = await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref), current = snapshot.data();
      if (!current || !validState(current) || current.revision !== claimed.revision || current.lease !== lease) return false;
      transaction.update(ref, { lease: null, leaseUntil: 0, updatedAt: finishedAt, lastFinishedAt: finishedAt,
        ...(result ? { cursor: result.nextCursor, lastResult: counters(result), lastError: result.errors ? 'partial_failure' : null }
          : { lastError: 'retention_failed' }) });
      return true;
    });
    if (!saved) return { state: 'superseded' };
    if (!result) return { state: 'failed' };
    return { state: result.errors ? 'partial' : 'completed', ...counters(result) };
  } catch { return { state: 'failed' }; }
}
