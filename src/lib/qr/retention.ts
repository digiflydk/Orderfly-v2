import { FieldPath, Timestamp, type Firestore, type DocumentSnapshot } from 'firebase-admin/firestore';

/** Internal service-principal operation across brands. Never expose as a browser/admin action. */
export const QR_RETENTION_GROUPS = { events: 'qrScanEvents', rateLimits: 'qrRateLimits' } as const;
export type QrRetentionCursor = { events: string | null; rateLimits: string | null };
export type QrRetentionResult = {
  scanned: number; deleted: number; skipped: number; errors: number;
  deletedEvents: number; deletedRateLimits: number;
  nextCursor: QrRetentionCursor;
};
export type QrRetentionDatabase = Pick<Firestore, 'collectionGroup' | 'doc' | 'runTransaction'>;
type Group = keyof typeof QR_RETENTION_GROUPS;
const idPattern = /^[A-Za-z0-9_-]{1,128}$/;
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

function expiryMillis(value: unknown): number | null {
  if (!(value instanceof Date) && !(value instanceof Timestamp)) return null;
  const millis = value instanceof Date ? value.getTime() : value.toMillis();
  return Number.isFinite(millis) ? millis : null;
}

// A collection-group cursor may encounter foreign paths. Advancing past them is essential:
// those rows must neither be deleted nor repeatedly starve canonical QR records.
function validCursor(path: unknown, group: Group): path is string {
  if (typeof path !== 'string' || !path || path.length > 6144) return false;
  const parts = path.split('/');
  return parts.length % 2 === 0 && parts.length >= 2 && parts.every(part => part.length > 0)
    && parts[parts.length - 2] === QR_RETENTION_GROUPS[group];
}

function deletable(snapshot: DocumentSnapshot, group: Group, now: number): boolean {
  if (!snapshot.exists) return false;
  const parts = snapshot.ref.path.split('/');
  if (parts.length !== 6 || parts[0] !== 'brands' || parts[2] !== 'qrCodes'
    || parts[4] !== QR_RETENTION_GROUPS[group] || !idPattern.test(parts[1]) || !idPattern.test(parts[3])
    || !(group === 'events' ? uuidPattern.test(parts[5]) : /^[0-9]{1,16}$/.test(parts[5]))) return false;
  const row = snapshot.data();
  if (!row || row.brandId !== parts[1] || row.qrId !== parts[3]) return false;
  const expiresAt = expiryMillis(row.expiresAt);
  return expiresAt !== null && expiresAt <= now;
}

/**
 * Bounded path-ordered sweep, not a TTL configuration or scheduler.
 * Persist nextCursor between invocations; null restarts a completed sweep.
 * Every candidate is re-read/revalidated transactionally before deletion.
 */
export async function runQrRetention(db: QrRetentionDatabase, options: {
  now?: number; limit?: number; cursor?: Partial<QrRetentionCursor>;
} = {}): Promise<QrRetentionResult> {
  const now = options.now ?? Date.now(), limit = options.limit ?? 100;
  if (!Number.isFinite(now) || !Number.isFinite(new Date(now).getTime())) throw new RangeError('Invalid retention time');
  // At least one slot per family ensures limiter/event fairness on every invocation.
  if (!Number.isInteger(limit) || limit < 2 || limit > 100) throw new RangeError('Invalid retention limit');
  if (options.cursor != null && (typeof options.cursor !== 'object' || Array.isArray(options.cursor))) throw new TypeError('Invalid retention cursor');
  const cursor: QrRetentionCursor = { events: options.cursor?.events ?? null, rateLimits: options.cursor?.rateLimits ?? null };
  for (const group of ['events', 'rateLimits'] as const) if (cursor[group] !== null && !validCursor(cursor[group], group)) throw new TypeError('Invalid retention cursor');
  const result: QrRetentionResult = { scanned: 0, deleted: 0, skipped: 0, errors: 0,
    deletedEvents: 0, deletedRateLimits: 0, nextCursor: { ...cursor } };
  const budgets = { events: Math.ceil(limit / 2), rateLimits: Math.floor(limit / 2) };
  for (const group of ['events', 'rateLimits'] as const) {
    const budget = budgets[group];
    try {
      let query = db.collectionGroup(QR_RETENTION_GROUPS[group]).orderBy(FieldPath.documentId());
      if (cursor[group] !== null) query = query.startAfter(db.doc(cursor[group]!));
      const page = await query.limit(budget).get();
      const docs = page.docs.slice(0, budget);
      for (const candidate of docs) {
        result.scanned++;
        if (!deletable(candidate, group, now)) { result.skipped++; continue; }
        try {
          const deleted = await db.runTransaction(async transaction => {
            const current = await transaction.get(candidate.ref);
            if (current.ref.path !== candidate.ref.path || !deletable(current, group, now)) return false;
            transaction.delete(candidate.ref);
            return true;
          });
          if (deleted) { result.deleted++; if (group === 'events') result.deletedEvents++; else result.deletedRateLimits++; }
          else result.skipped++;
        } catch { result.errors++; }
      }
      // Query metadata is internal. Cursor payloads must never be sent to public clients/logs.
      const lastPath = docs.at(-1)?.ref.path;
      if (docs.length === budget && validCursor(lastPath, group)) result.nextCursor[group] = lastPath;
      else if (docs.length < budget) result.nextCursor[group] = null;
      else result.errors++;
    } catch {
      // Preserve this family's input cursor on query failure; another family can still progress.
      result.errors++;
    }
  }
  return result;
}
