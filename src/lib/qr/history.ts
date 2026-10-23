import { createHash } from 'node:crypto';
import { QR_PATHS, type QrScope } from './store';

type Snapshot = { id: string; data(): Record<string, unknown> | undefined };
type Query = { orderBy(field: string, direction: 'desc'): Query; limit(value: number): Query; get(): Promise<{ docs: Snapshot[] }> };
type Collection = Query & { doc(id: string): { collection(name: string): Collection } };
export type QrHistoryDatabase = { collection(name: string): Collection };
export type QrHistoryChange = { field: string; before: string | null; after: string | null };
export type QrHistoryRow = { id: string; at: number; action: string; actorId: string; revision: number; previousRevision: number | null; changes?: QrHistoryChange[] };
export type QrHistoryResult = { rows: QrHistoryRow[]; truncated: boolean; discarded: number };
type CodeScope = { id: string; brandId: string; locationId: string | null };
export class QrHistoryError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
const validKey = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const safeText = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
function checkScope(scope: QrScope, id: string, code?: CodeScope) {
  if (!validKey(scope?.brandId) || !validKey(scope?.actorId) || !validKey(id)) throw new QrHistoryError('invalid_scope');
  if (scope.locationIds !== null && (!Array.isArray(scope.locationIds) || !scope.locationIds.length || scope.locationIds.length > 500 || scope.locationIds.some(value => !validKey(value)))) throw new QrHistoryError('forbidden', 403);
  if (code && (code.id !== id || code.brandId !== scope.brandId || (code.locationId !== null && !validKey(code.locationId))
    || scope.locationIds !== null && (code.locationId === null || !scope.locationIds.includes(code.locationId)))) throw new QrHistoryError('forbidden', 403);
}
const fields = ['name', 'destination', 'locationId', 'campaign', 'tags', 'expiresAt', 'status', 'design'] as const;
function snapshotValues(raw: unknown, scope: QrScope, id: string): Record<string, string | null> | null | undefined {
  if (raw === null) return null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const value = raw as Record<string, unknown>;
  try { checkScope(scope, id, value as CodeScope); } catch { return undefined; }
  if (!safeText(value.name, 160) || !safeText(value.destination, 2000) || !safeText(value.campaign, 160)
      || !['active', 'paused', 'archived'].includes(String(value.status)) || !Array.isArray(value.tags) || value.tags.length > 20
      || value.tags.some(tag => !safeText(tag, 50)) || (value.expiresAt !== null && (!Number.isSafeInteger(value.expiresAt) || Number(value.expiresAt) <= 0))) return undefined;
  let design: string | null = null;
  if (value.design !== undefined) {
    const d = value.design as Record<string, unknown>;
    if (!d || typeof d !== 'object' || !Number.isInteger(d.width) || Number(d.width) < 128 || Number(d.width) > 4096
        || !Number.isInteger(d.margin) || Number(d.margin) < 4 || Number(d.margin) > 32
        || !/^#[a-f0-9]{6}$/i.test(String(d.dark)) || !/^#[a-f0-9]{6}$/i.test(String(d.light))
        || !['L','M','Q','H'].includes(String(d.errorCorrectionLevel))) return undefined;
    design = JSON.stringify({ width: d.width, margin: d.margin, dark: d.dark, light: d.light, errorCorrectionLevel: d.errorCorrectionLevel, ...(d.moduleShape ? {moduleShape:d.moduleShape}:{}), ...(d.cornerShape ? {cornerShape:d.cornerShape}:{}), ...(d.cornerShapes ? {cornerShapes:d.cornerShapes}:{}), ...(d.cornerColor ? {cornerColor:d.cornerColor}:{}), ...(typeof d.logoBase64==='string' ? {logo: createHash('sha256').update(d.logoBase64).digest('hex').slice(0,16)}:{}) });
  }
  return { name: value.name, destination: value.destination, locationId: value.locationId === null ? null : String(value.locationId),
    campaign: value.campaign, tags: JSON.stringify(value.tags), expiresAt: value.expiresAt === null ? null : String(value.expiresAt), status: String(value.status), design };
}
function project(doc: Snapshot, scope: QrScope, id: string): QrHistoryRow | null {
  const value = doc.data();
  if (!value || !validKey(doc.id) || !Number.isSafeInteger(value.at) || Number(value.at) < 0 || !Number.isFinite(new Date(Number(value.at)).getTime())
      || !safeText(value.action, 80) || !value.action || !validKey(value.actorId) || !Number.isSafeInteger(value.revision) || Number(value.revision) < 1
      || value.previousRevision !== null && (!Number.isSafeInteger(value.previousRevision) || Number(value.previousRevision) < 1 || Number(value.previousRevision) >= Number(value.revision))) return null;
  const row: QrHistoryRow = { id: doc.id, at: Number(value.at), action: value.action, actorId: value.actorId, revision: Number(value.revision), previousRevision: value.previousRevision as number | null };
  // Even an audit header must not reveal another location's actor/time. A
  // location-scoped viewer needs positively scoped immutable snapshots.
  if (scope.locationIds !== null && (!('before' in value) || !('after' in value))) return null;
  if ('before' in value && 'after' in value) {
    for (const snapshot of [value.before, value.after]) if (snapshot && typeof snapshot === 'object'
      && ((snapshot as Record<string, unknown>).brandId !== scope.brandId || (snapshot as Record<string, unknown>).id !== id)) return null;
    const before = snapshotValues(value.before, scope, id), after = snapshotValues(value.after, scope, id);
    if (scope.locationIds !== null && (before === undefined || after === undefined || after === null)) return null;
    // Missing/invalid legacy snapshots for brand-wide viewers are not evidence
    // of any particular field change. Explicitly omit unknown details.
    if (before !== undefined && after !== undefined && after !== null) row.changes = fields.flatMap(field => {
      const oldValue = before?.[field] ?? null, newValue = after[field];
      return oldValue === newValue ? [] : [{ field, before: oldValue, after: newValue }];
    });
  }
  return row;
}

/** Internal read service; HTTP must authenticate current native :view first. */
export function createQrHistoryService(db: QrHistoryDatabase, dependencies: {
  getCode: (scope: QrScope, id: string) => Promise<CodeScope>;
}) {
  if (typeof dependencies?.getCode !== 'function') throw new QrHistoryError('missing_scope_reader', 500);
  return { async read(scope: QrScope, id: string): Promise<QrHistoryResult> {
    checkScope(scope, id);
    const current = await dependencies.getCode(scope, id);
    if (!current) throw new QrHistoryError('forbidden', 403);
    checkScope(scope, id, current);
    const page = await db.collection('brands').doc(scope.brandId).collection(QR_PATHS.codes).doc(id).collection(QR_PATHS.audit)
      .orderBy('at', 'desc').limit(51).get();
    const latest = await dependencies.getCode(scope, id);
    if (!latest) throw new QrHistoryError('forbidden', 403);
    checkScope(scope, id, latest);
    let discarded = 0;
    const rows = page.docs.slice(0, 50).flatMap(doc => { const row = project(doc, scope, id); if (!row) discarded++; return row ? [row] : []; });
    return { rows, truncated: page.docs.length > 50, discarded };
  } };
}
