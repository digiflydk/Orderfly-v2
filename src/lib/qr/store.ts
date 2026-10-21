import { createHash, randomBytes } from 'node:crypto';

/** Internal service only. Scope MUST come from current server-side native authorization. */
export type QrScope = { brandId: string; locationIds: string[] | null; actorId: string };
export type QrStatus = 'active' | 'paused' | 'archived';
export type QrInput = { name: string; destination: string; locationId: string | null; campaign?: string; tags?: string[]; expiresAt?: number | null };
export type QrRecord = { id: string; brandId: string; locationId: string | null; slug: string; name: string; destination: string;
  campaign: string; tags: string[]; expiresAt: number | null; status: QrStatus; revision: number; createdAt: number; updatedAt: number };
type Snapshot = { exists: boolean; id: string; data(): Record<string, any> | undefined };
type Reference = { path: string; collection(path: string): Collection };
type Query = { where(field: string, op: string, value: unknown): Query; limit(limit: number): Query; get(): Promise<{ docs: Snapshot[] }> };
type Collection = Query & { doc(id: string): Reference };
export type QrTransaction = { get(ref: Reference): Promise<Snapshot>; create(ref: Reference, data: unknown): void; set(ref: Reference, data: unknown): void };
type Transaction = QrTransaction;
export type QrResolvedTarget = { destination: string; brandId: string; codeId: string; locationId: string | null; revision: number; campaign: string; tags: string[] };
export const QR_PATHS = { codes: 'qrCodes', publicCodes: 'qrPublicCodes', events: 'events', audit: 'audit', requests: 'qrRequests' } as const;
export type QrDatabase = { collection(path: string): Collection; runTransaction<T>(body: (tx: Transaction) => Promise<T>): Promise<T> };
export class QrStoreError extends Error { constructor(public code: string, public status = 400) { super(code); } }
const fail = (code: string, status = 400): never => { throw new QrStoreError(code, status); };
const key = (value: unknown): string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : fail('invalid_id');
const requestKey = (value: unknown): string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value) ? value : fail('invalid_request_id');
const text = (v: unknown, max: number, required = false): string => {
  if (typeof v !== 'string' || v.length > max || /[\u0000-\u001f\u007f]/.test(v) || required && !v.trim()) return fail('invalid_text');
  return v.trim();
};
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function createQrStore(db: QrDatabase, options: {
  normalizeDestination: (value: string) => string; now?: () => number; newId?: () => string;
}) {
  const now = options.now ?? Date.now, newId = options.newId ?? (() => randomBytes(16).toString('hex'));
  const brandRef = (brandId: string) => db.collection('brands').doc(key(brandId));
  const codes = (brandId: string) => brandRef(brandId).collection(QR_PATHS.codes);
  const recordRef = (brandId: string, id: string) => codes(brandId).doc(key(id));
  const indexRef = (slug: string) => db.collection(QR_PATHS.publicCodes).doc(slug);
  function scopeCheck(scope: QrScope, locationId: string | null) {
    key(scope.brandId); key(scope.actorId);
    if (locationId !== null) key(locationId);
    if (scope.locationIds !== null && (!Array.isArray(scope.locationIds) || locationId === null || !scope.locationIds.includes(locationId))) fail('forbidden', 403);
  }
  function input(scope: QrScope, value: QrInput) {
    scopeCheck(scope, value.locationId);
    const expiresAt = value.expiresAt ?? null;
    if (expiresAt !== null && (!Number.isSafeInteger(expiresAt) || expiresAt <= 0)) fail('invalid_expiry');
    if (value.tags !== undefined && (!Array.isArray(value.tags) || value.tags.length > 20)) fail('invalid_tags');
    return { name: text(value.name, 160, true), destination: options.normalizeDestination(value.destination), locationId: value.locationId,
      campaign: text(value.campaign ?? '', 160), tags: [...new Set((value.tags ?? []).map(t => text(t, 50, true)))], expiresAt };
  }
  function read(scope: QrScope, snapshot: Snapshot): QrRecord {
    if (!snapshot.exists) return fail('not_found', 404);
    const row = snapshot.data() as QrRecord;
    if (row.brandId !== scope.brandId || row.id !== snapshot.id) return fail('not_found', 404);
    scopeCheck(scope, row.locationId);
    return row;
  }
  async function checkLocation(tx: Transaction, brandId: string, locationId: string | null) {
    if (locationId === null) return;
    const location = await tx.get(db.collection('locations').doc(locationId));
    if (!location.exists || location.data()?.brandId !== brandId || location.data()?.isActive !== true) fail('invalid_location', 403);
  }
  const activeBrand = (snapshot: Snapshot) => snapshot.exists && ['active', 'trialing'].includes(snapshot.data()?.status) && snapshot.data()?.isActive !== false;
  async function mutate(scope: QrScope, id: string | null, action: string, raw: unknown, requestId: string, revision: number | null,
    make: (tx: Transaction, current: QrRecord | null, at: number) => Promise<QrRecord>) {
    key(scope.brandId); key(scope.actorId); requestKey(requestId);
    const receiptRef = brandRef(scope.brandId).collection(QR_PATHS.requests).doc(requestId);
    const signature = digest({ actorId: scope.actorId, action, id, revision, input: raw });
    return db.runTransaction(async tx => {
      // Re-check current scope before returning a saved request result. An old receipt never grants access.
      const receipt = await tx.get(receiptRef), brand = await tx.get(brandRef(scope.brandId));
      if (!brand.exists) return fail('not_found', 404);
      const current = id ? read(scope, await tx.get(recordRef(scope.brandId, id))) : null;
      if (receipt.exists) {
        if (receipt.data()?.signature !== signature) return fail('request_conflict', 409);
        const result = receipt.data()?.result as QrRecord;
        if (!result || result.brandId !== scope.brandId) return fail('request_conflict', 409);
        // Create/duplicate have no command target ID. Their receipt must still
        // reauthorize the CURRENT result record, which may have moved locations.
        read(scope, await tx.get(recordRef(scope.brandId, result.id)));
        scopeCheck(scope, result.locationId);
        return result;
      }
      if (current && (current.revision !== revision || current.status === 'archived')) return fail('revision_conflict', 409);
      const at = now(), next = await make(tx, current, at);
      scopeCheck(scope, next.locationId);
      const audit = { actorId: scope.actorId, action, at, revision: next.revision, previousRevision: current?.revision ?? null };
      if (current) tx.set(recordRef(scope.brandId, next.id), next);
      else {
        tx.create(recordRef(scope.brandId, next.id), next);
        tx.create(indexRef(next.slug), { brandId: scope.brandId, codeId: next.id });
      }
      tx.create(recordRef(scope.brandId, next.id).collection(QR_PATHS.audit).doc(requestId), audit);
      tx.create(receiptRef, { signature, result: next, createdAt: at });
      return next;
    });
  }
  async function create(scope: QrScope, value: QrInput, requestId: string) {
    const parsed = input(scope, value);
    return mutate(scope, null, 'create', parsed, requestId, null, async (tx, _, at) => {
      await checkLocation(tx, scope.brandId, parsed.locationId);
      if (parsed.expiresAt !== null && parsed.expiresAt <= at) return fail('invalid_expiry');
      return { ...parsed, id: key(newId()), slug: newSlug(), brandId: scope.brandId, status: 'active', revision: 1, createdAt: at, updatedAt: at };
    });
  }
  function newSlug() { const slug = newId(); if (!/^[a-f0-9]{32}$/.test(slug)) fail('invalid_slug_source', 500); return slug; }
  async function update(scope: QrScope, id: string, value: QrInput, revision: number, requestId: string) {
    const parsed = input(scope, value);
    return mutate(scope, key(id), 'update', parsed, requestId, revision, async (tx, current, at) => {
      await checkLocation(tx, scope.brandId, parsed.locationId);
      if (parsed.expiresAt !== null && parsed.expiresAt <= at) return fail('invalid_expiry');
      return { ...current!, ...parsed, revision: current!.revision + 1, updatedAt: at };
    });
  }
  async function status(scope: QrScope, id: string, state: QrStatus, revision: number, requestId: string) {
    return mutate(scope, key(id), state, { state }, requestId, revision, async (_, current, at) => ({ ...current!, status: state, revision: current!.revision + 1, updatedAt: at }));
  }
  async function get(scope: QrScope, id: string) {
    return db.runTransaction(async tx => read(scope, await tx.get(recordRef(scope.brandId, id))));
  }
  async function list(scope: QrScope, filter: { locationId: string | null; limit?: number }) {
    scopeCheck(scope, filter.locationId);
    const limit = filter.limit ?? 100;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) return fail('invalid_limit');
    const snapshot = await codes(scope.brandId).where('brandId', '==', scope.brandId).where('locationId', '==', filter.locationId).limit(limit + 1).get();
    return { rows: snapshot.docs.slice(0, limit).map(s => read(scope, s)), truncated: snapshot.docs.length > limit };
  }
  async function duplicate(scope: QrScope, id: string, name: string, requestId: string) {
    // Source data is loaded inside the transaction; no cached authorization/result can cross a concurrent edit.
    key(id);
    return mutate(scope, null, 'duplicate', { sourceId: id, name: text(name, 160, true) }, requestId, null, async (tx, _, at) => {
      const source = read(scope, await tx.get(recordRef(scope.brandId, id)));
      if (source.status === 'archived' || source.expiresAt !== null && source.expiresAt <= at) return fail('source_unavailable', 409);
      await checkLocation(tx, scope.brandId, source.locationId);
      return { ...source, name: text(name, 160, true), id: key(newId()), slug: newSlug(), status: 'paused', revision: 1, createdAt: at, updatedAt: at };
    });
  }
  /** Internal transaction read phase for B2: append the event only AFTER this returns. */
  async function resolveInTransaction(tx: QrTransaction, slug: string): Promise<QrResolvedTarget> {
    if (!/^[a-f0-9]{32}$/.test(slug)) return fail('not_found', 404);
      const index = await tx.get(indexRef(slug));
      if (!index.exists) return fail('not_found', 404);
      const { brandId, codeId } = index.data()!;
      key(brandId); key(codeId);
      const brand = await tx.get(brandRef(brandId)), saved = await tx.get(recordRef(brandId, codeId));
      const row = saved.data() as QrRecord | undefined;
      if (!activeBrand(brand) || !row || row.id !== codeId || row.brandId !== brandId || row.slug !== slug || row.status !== 'active' || row.expiresAt !== null && row.expiresAt <= now()) return fail('not_found', 404);
      if (row.locationId !== null) await checkLocation(tx, brandId, row.locationId);
      return { destination: options.normalizeDestination(row.destination), brandId, codeId, locationId: row.locationId,
        revision: row.revision, campaign: row.campaign, tags: [...row.tags] };
  }
  async function resolve(slug: string): Promise<string> {
    return db.runTransaction(async tx => (await resolveInTransaction(tx, slug)).destination);
  }
  return { create, update, get, list, duplicate, pause: (s: QrScope, id: string, revision: number, requestId: string) => status(s, id, 'paused', revision, requestId),
    activate: (s: QrScope, id: string, revision: number, requestId: string) => status(s, id, 'active', revision, requestId),
    archive: (s: QrScope, id: string, revision: number, requestId: string) => status(s, id, 'archived', revision, requestId), resolve, resolveInTransaction };
}
