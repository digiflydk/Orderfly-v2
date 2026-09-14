import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import { authorize, policySchema } from './policy';
import { AuthorityError, principalKey, type VerifiedIdentity } from './authority';
import { orderflyReadGrants, requireOrderflyAccess, verifiedOrderflyIdentity } from './orderfly-session';

type Row = Record<string, any>;
export type DocumentScope = 'company' | 'location' | 'locations';
const idPattern = /^[A-Za-z0-9_-]{1,128}$/;
function validId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !idPattern.test(id)) throw new AuthorityError('invalid_identifier', 400);
}
export function documentScope(data: Row, kind: DocumentScope) {
  validId(data.brandId);
  if (kind === 'company') return { brandId: data.brandId, locationIds: null };
  if (kind === 'location') {
    if (data.locationId == null || data.locationId === '') return { brandId: data.brandId, locationIds: null };
    validId(data.locationId);
    return { brandId: data.brandId, locationIds: [data.locationId] };
  }
  if (data.locationIds == null || Array.isArray(data.locationIds) && data.locationIds.length === 0) {
    return { brandId: data.brandId, locationIds: null };
  }
  if (!Array.isArray(data.locationIds) || data.locationIds.length > 500) throw new AuthorityError('invalid_scope');
  data.locationIds.forEach(validId);
  return { brandId: data.brandId, locationIds: [...new Set<string>(data.locationIds)] };
}

// Full customer/company records require company-wide grants. Location rows are
// queried within native tenants before they are returned, never fetched globally.
export async function listScopedDocuments(collection: string, permission: string, kind: DocumentScope, filters: Array<[string, any, any]> = [], brandField: 'brandId' | 'brand_id' = 'brandId') {
  const db = getAdminDb(), grants = await orderflyReadGrants(permission);
  const documents = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  for (const grant of grants) {
    if (kind === 'company' && grant.locationIds !== null) continue;
    const scopes = grant.locationIds === null ? [null] : Array.from({ length: Math.ceil(grant.locationIds.length / 30) }, (_, i) => grant.locationIds!.slice(i * 30, (i + 1) * 30));
    for (const locations of scopes) {
      let query: FirebaseFirestore.Query = db.collection(collection).where(brandField, '==', grant.brandId);
      if (locations) query = query.where(kind === 'location' ? 'locationId' : 'locationIds', kind === 'location' ? 'in' : 'array-contains-any', locations);
      for (const [field, operator, value] of filters) query = query.where(field, operator, value);
      const snapshot = await query.get();
      for (const doc of snapshot.docs) {
        const scope = documentScope({...doc.data(),brandId:doc.data()[brandField]}, kind);
        // A shared record may span several locations. Viewing it requires the
        // whole record scope so another location's customer data cannot leak.
        if (grant.locationIds !== null && (scope.locationIds === null || !scope.locationIds.every(id => grant.locationIds!.includes(id)))) continue;
        documents.set(doc.id, doc);
      }
    }
  }
  return [...documents.values()];
}

export async function getScopedDocument(collection: string, id: string, permission: string, kind: DocumentScope) {
  validId(id);
  await verifiedOrderflyIdentity();
  const doc = await getAdminDb().collection(collection).doc(id).get();
  if (!doc.exists) return null;
  const scope = documentScope(doc.data()!, kind);
  await requireOrderflyAccess(scope.brandId, scope.locationIds, permission);
  return doc;
}

export async function authorizeTransaction(tx: FirebaseFirestore.Transaction, identity: VerifiedIdentity, data: Row, permission: string, kind: DocumentScope) {
  const db = getAdminDb(), scope = documentScope(data, kind);
  const saved = await tx.get(db.collection('platformAdminControl').doc('access-v1'));
  const parsed = policySchema.safeParse(saved.data());
  if (!parsed.success) throw new AuthorityError('forbidden');
  const company = parsed.data.companies.find(c => c.orderflyBrandIds.includes(scope.brandId));
  if (!company || !authorize(parsed.data, { principalId: principalKey(identity), companyId: company.id, locationIds: scope.locationIds, permission }).allowed) throw new AuthorityError('forbidden');
  if (!(await tx.get(db.collection('brands').doc(scope.brandId))).exists) throw new AuthorityError('forbidden');
  for (const id of scope.locationIds || []) {
    const location = await tx.get(db.collection('locations').doc(id));
    if (!location.exists || location.data()?.brandId !== scope.brandId) throw new AuthorityError('forbidden');
  }
}

// Policy, previous ownership and resulting ownership are read in the same
// transaction as the write. Concurrent revocation or reassignment retries it.
export async function mutateScopedDocument(collection: string, id: string, permission: string, kind: DocumentScope,
  update: (before: Row | null, tx: FirebaseFirestore.Transaction) => Promise<Row | null> | Row | null) {
  validId(id);
  const identity = await verifiedOrderflyIdentity(), db = getAdminDb(), ref = db.collection(collection).doc(id);
  return db.runTransaction(async tx => {
    const saved = await tx.get(ref), before = saved.exists ? saved.data()! : null;
    if (permission.endsWith(':create') && before) throw new AuthorityError('record_exists', 409);
    if (!permission.endsWith(':create') && !before) throw new AuthorityError('record_missing', 404);
    if (before) await authorizeTransaction(tx, identity, before, permission, kind);
    const after = await update(before, tx);
    if (after) await authorizeTransaction(tx, identity, after, permission, kind);
    if (!before && !after) throw new AuthorityError('record_missing', 404);
    if (after) tx.set(ref, after); else tx.delete(ref);
    return after;
  });
}
