import { createHash, randomBytes } from 'node:crypto';
import { previewQrCsv, type QrBulkEntry } from './bulk';
import { QR_PATHS, QrStoreError, qrAuditSnapshot, qrReceiptWithCurrentLifetime, type QrDatabase, type QrRecord, type QrScope } from './store';
import { emptyQrLifetime } from './lifetime';

export type QrBulkCommand = { canonical: string; sha256: string; requestId: string };
export type QrBulkResult = { records: QrRecord[]; requestId: string; sha256: string };
export type QrBulkStoreOptions = {
  /** Required trusted server callback. Re-check current native create permission; never derive from command data. */
  authorizeCreate: (scope: QrScope, locationId: string | null) => Promise<void>;
  blockedOrigins?: readonly string[];
  now?: () => number;
  newId?: () => string;
};
function fail(code: string, status = 400): never { throw new QrStoreError(code, status); }
const validId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const exactKeys = (value: object, keys: string[]) => Object.keys(value).sort().join(',') === keys.sort().join(',');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

function validate(scope: QrScope, command: QrBulkCommand, options: QrBulkStoreOptions): QrBulkEntry[] {
  if (!scope || !validId(scope.brandId) || !validId(scope.actorId) || (scope.locationIds !== null && (!Array.isArray(scope.locationIds) || scope.locationIds.some(id => !validId(id))))) fail('forbidden', 403);
  if (!command || typeof command !== 'object' || !exactKeys(command, ['canonical','sha256','requestId'])
    || typeof command.canonical !== 'string' || Buffer.byteLength(command.canonical) > 256 * 1024
    || typeof command.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(command.sha256)
    || typeof command.requestId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(command.requestId)) fail('invalid_bulk_command');
  if (hash(command.canonical) !== command.sha256) fail('plan_mismatch', 409);
  let plan: { schemaVersion: number; entries: QrBulkEntry[] };
  try { plan = JSON.parse(command.canonical); } catch { return fail('invalid_bulk_plan'); }
  if (!plan || typeof plan !== 'object' || !exactKeys(plan, ['schemaVersion','entries']) || plan.schemaVersion !== 1
    || !Array.isArray(plan.entries) || plan.entries.length < 1 || plan.entries.length > 100) fail('invalid_bulk_plan');
  const fields = ['name','destination','brandId','locationId','campaign','tags'];
  for (const entry of plan.entries) {
    if (!entry || typeof entry !== 'object' || !exactKeys(entry, fields)
      || ['name','destination','brandId','campaign'].some(key => typeof entry[key as keyof QrBulkEntry] !== 'string')
      || (entry.locationId !== null && typeof entry.locationId !== 'string') || !Array.isArray(entry.tags) || entry.tags.some(tag => typeof tag !== 'string')) fail('invalid_bulk_plan');
    if (entry.brandId !== scope.brandId) fail('forbidden', 403);
  }
  // Reuse the canonical parser's complete row validation, not a client supplied successful preview.
  const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const csv = ['name,destination,brand_id,location_id,campaign,tags', ...plan.entries.map(entry =>
    [entry.name, entry.destination, entry.brandId, entry.locationId ?? '', entry.campaign, entry.tags.join('|')].map(quote).join(','))].join('\r\n');
  const preview = previewQrCsv(csv, { blockedOrigins: options.blockedOrigins,
    allowedScopes: [{ brandId: scope.brandId, locationIds: scope.locationIds ?? plan.entries.flatMap(entry => entry.locationId ? [entry.locationId] : []), allowBrandWide: scope.locationIds === null }] });
  if (!preview.ok || !preview.plan || preview.plan.canonical !== command.canonical) return fail('invalid_bulk_plan');
  return preview.plan.entries;
}

/** Actual atomic writer, server only. HTTP confirmation and caller authentication belong to the adapter. */
export function createQrBulkStore(db: QrDatabase, options: QrBulkStoreOptions) {
  if (!options || typeof options.authorizeCreate !== 'function') fail('missing_authorization_adapter', 500);
  const now = options.now ?? Date.now, newId = options.newId ?? (() => randomBytes(16).toString('hex'));
  return {
    async create(scope: QrScope, command: QrBulkCommand): Promise<QrBulkResult> {
      const entries = validate(scope, command, options);
      const brand = db.collection('brands').doc(scope.brandId);
      const receiptRef = brand.collection(QR_PATHS.requests).doc(command.requestId);
      const signature = hash(JSON.stringify({ actorId: scope.actorId, action: 'bulk-create', canonical: command.canonical }));
      const locations = [...new Set(entries.map(entry => entry.locationId))];
      return db.runTransaction(async tx => {
        // Every retry and receipt replay re-checks current native authority and current native records.
        for (const locationId of locations) await options.authorizeCreate(scope, locationId);
        const receipt = await tx.get(receiptRef), brandSnapshot = await tx.get(brand);
        if (!brandSnapshot.exists) fail('not_found', 404);
        for (const locationId of locations) {
          if (locationId === null) continue;
          const location = await tx.get(db.collection('locations').doc(locationId));
          if (!location.exists || location.data()?.brandId !== scope.brandId || location.data()?.isActive !== true) fail('invalid_location', 403);
        }
        if (receipt.exists) {
          const saved = receipt.data();
          if (saved?.signature !== signature) fail('request_conflict', 409);
          const result = saved?.result as QrBulkResult;
          if (!result || result.requestId !== command.requestId || result.sha256 !== command.sha256 || !Array.isArray(result.records)
            || result.records.length !== entries.length || result.records.some((row, index) => !row || row.brandId !== scope.brandId || row.locationId !== entries[index].locationId)) fail('request_conflict', 409);
          // A privileged edit may have moved a created code since the receipt was saved.
          // The receipt must not expose it to an actor who no longer has its current scope.
          const checkedLocations = new Set(locations);
          const records: QrRecord[] = [];
          for (const row of result.records) {
            if (!validId(row.id)) fail('request_conflict', 409);
            const current = await tx.get(brand.collection(QR_PATHS.codes).doc(row.id));
            const value = current.data() as QrRecord | undefined;
            if (!current.exists || !value || value.id !== row.id || value.brandId !== scope.brandId) fail('request_conflict', 409);
            if (value.locationId !== null && !validId(value.locationId)) fail('request_conflict', 409);
            if (scope.locationIds !== null && (value.locationId === null || !scope.locationIds.includes(value.locationId))) fail('forbidden', 403);
            if (!checkedLocations.has(value.locationId)) {
              await options.authorizeCreate(scope, value.locationId);
              if (value.locationId !== null) {
                const location = await tx.get(db.collection('locations').doc(value.locationId));
                if (!location.exists || location.data()?.brandId !== scope.brandId || location.data()?.isActive !== true) fail('invalid_location', 403);
              }
              checkedLocations.add(value.locationId);
            }
            records.push(qrReceiptWithCurrentLifetime(row, value));
          }
          return { ...result, records };
        }
        const at = now();
        if (!Number.isSafeInteger(at) || at <= 0) fail('invalid_clock', 500);
        const records: QrRecord[] = entries.map(entry => {
          const id = newId(), slug = newId();
          if (!validId(id) || !/^[a-f0-9]{32}$/.test(slug)) fail('invalid_id_source', 500);
          return { ...entry, id, slug: Buffer.from(slug, 'hex').toString('base64url'), status: 'active', expiresAt: null, revision: 1, createdAt: at, updatedAt: at, lifetime: emptyQrLifetime() };
        });
        if (new Set(records.map(row => row.id)).size !== records.length || new Set(records.map(row => row.slug)).size !== records.length) fail('id_collision', 409);
        for (const row of records) {
          const saved = await tx.get(brand.collection(QR_PATHS.codes).doc(row.id));
          const index = await tx.get(db.collection(QR_PATHS.publicCodes).doc(row.slug));
          if (saved.exists || index.exists) fail('id_collision', 409);
        }
        // At most 301 writes: 100 records + 100 public indexes + 100 audit rows + one receipt.
        for (const row of records) {
          const codeRef = brand.collection(QR_PATHS.codes).doc(row.id);
          tx.create(codeRef, row);
          tx.create(db.collection(QR_PATHS.publicCodes).doc(row.slug), { brandId: scope.brandId, codeId: row.id });
          tx.create(codeRef.collection(QR_PATHS.audit).doc(command.requestId), { actorId: scope.actorId, action: 'bulk-create', at, revision: 1, previousRevision: null,
            before: null, after: qrAuditSnapshot(row) });
        }
        const result: QrBulkResult = { records, requestId: command.requestId, sha256: command.sha256 };
        tx.create(receiptRef, { signature, result, createdAt: at });
        return result;
      });
    },
  };
}
