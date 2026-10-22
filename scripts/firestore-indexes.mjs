// Creates the composite Firestore indexes listed in the given docs/*-firestore-indexes.json
// files in the production data project. Additive only: an index that already exists is left
// alone and nothing is ever deleted. Waits until every listed index is READY.
// Usage: node scripts/firestore-indexes.mjs docs/loyalty-firestore-indexes.json [...]
import { readFileSync } from 'node:fs';
import admin from 'firebase-admin';

const PROJECT = process.env.FIRESTORE_PROJECT_ID || 'orderfly-39325';
const files = process.argv.slice(2);
if (!files.length) throw new Error('Name at least one docs/*-firestore-indexes.json file.');
// A service-account key (CI secret) or an existing token, e.g. FIRESTORE_ACCESS_TOKEN=$(gcloud auth print-access-token).
const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw && !process.env.FIRESTORE_ACCESS_TOKEN) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set.');
// An explicit token wins; the key's account is named only when its key supplied the token.
const account = process.env.FIRESTORE_ACCESS_TOKEN ? null : JSON.parse(raw);
const token = process.env.FIRESTORE_ACCESS_TOKEN || (await admin.credential.cert(account).getAccessToken()).access_token;
// The account name and its home project are not secret; they say which principal needs the IAM role.
if (account) console.log(`account   ${account.client_email} (key project ${account.project_id}), target project ${PROJECT}`);
else console.log(`account   principal of FIRESTORE_ACCESS_TOKEN, target project ${PROJECT}`);
const base = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/collectionGroups`;
const api = async (url, init = {}) => {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const key = fields => fields.filter(f => f.fieldPath !== '__name__').map(f => `${f.fieldPath}:${f.order || f.arrayConfig}`).join(',');

// Read-only proof for the document-name ordered collection-group sweep: the query with and without a
// start cursor, at most one document name, no field values. Needs read access; an index-only principal
// logs the readiness as NOT VERIFIED without failing the run.
async function probe() {
  const documents = `projects/${PROJECT}/databases/(default)/documents`;
  for (const override of builtin.filter(o => o.indexes.some(i => i.queryScope === 'COLLECTION_GROUP'))) {
    for (const startAt of [null, { values: [{ referenceValue: `${documents}/brands/0` }], before: false }]) {
      const { status, body } = await api(`https://firestore.googleapis.com/v1/${documents}:runQuery`, {
        method: 'POST', body: JSON.stringify({ structuredQuery: { from: [{ collectionId: override.collectionGroup, allDescendants: true }],
          select: { fields: [{ fieldPath: '__name__' }] }, orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
          ...(startAt ? { startAt } : {}), limit: 1 } }),
      });
      const label = `query     ${override.collectionGroup} collection group ordered by __name__${startAt ? ' after a cursor' : ''}`;
      if (status === 200) console.log(`${label}: OK (${(Array.isArray(body) ? body : []).filter(r => r.document).length} document name read)`);
      else if (status === 403) console.log(`${label}: NOT VERIFIED, principal has no read access (HTTP 403)`);
      else throw new Error(`${label}: HTTP ${status} ${(Array.isArray(body) ? body[0] : body)?.error?.message || ''}`);
    }
  }
}

const wanted = files.flatMap(file => JSON.parse(readFileSync(file, 'utf8')).indexes);
for (const index of wanted) {
  const { status, body } = await api(`${base}/${index.collectionGroup}/indexes`, {
    method: 'POST', body: JSON.stringify({ queryScope: index.queryScope, fields: index.fields }),
  });
  const label = `${index.collectionGroup} (${key(index.fields)})`;
  if (status === 200) console.log(`created   ${label}`);
  else if (status === 409) console.log(`exists    ${label}`);
  else if (status === 403) throw new Error(`${label}: HTTP 403 ${body.error?.message || ''}. If the role is missing, grant "Cloud Datastore Index Admin" in ${PROJECT} to ${account?.client_email || 'the token\'s principal'}.`);
  else throw new Error(`${label}: HTTP ${status} ${body.error?.message || ''}`);
}

// Single-field overrides, e.g. a COLLECTION_GROUP index on a field used by a collection-group query.
// Additive: the field's current effective indexes are kept and only missing ones are appended.
const fieldUrl = override => `${base}/${override.collectionGroup}/fields/${encodeURIComponent(override.fieldPath)}`;
const fieldKey = index => `${index.queryScope}:${index.order || index.arrayConfig}`;
const fieldIndexes = body => (body.indexConfig?.indexes || []).map(index => ({
  queryScope: index.queryScope, state: index.state,
  ...(index.fields?.[0]?.order ? { order: index.fields[0].order } : { arrayConfig: index.fields?.[0]?.arrayConfig }),
}));
const requested = files.flatMap(file => JSON.parse(readFileSync(file, 'utf8')).fieldOverrides || []);
// Firestore rejects any override on the reserved document-name field and indexes it itself; for that
// field the read-only query probe below is the readiness evidence.
const builtin = requested.filter(override => override.fieldPath === '__name__');
const overrides = requested.filter(override => override.fieldPath !== '__name__');
for (const override of builtin) console.log(`builtin   ${override.collectionGroup}.__name__ (not configurable; verified by the query probe)`);
for (const override of overrides) {
  const label = `${override.collectionGroup}.${override.fieldPath}`;
  const current = await api(fieldUrl(override));
  if (current.status !== 200) throw new Error(`${label}: HTTP ${current.status} ${current.body.error?.message || ''}`);
  const existing = fieldIndexes(current.body);
  const missing = override.indexes.filter(index => !existing.some(e => fieldKey(e) === fieldKey(index)));
  if (!missing.length) { console.log(`exists    ${label} (${override.indexes.map(fieldKey).join(',')})`); continue; }
  const indexes = [...existing, ...missing].map(index => ({ queryScope: index.queryScope,
    fields: [{ fieldPath: override.fieldPath, ...(index.order ? { order: index.order } : { arrayConfig: index.arrayConfig }) }] }));
  const { status, body } = await api(`${fieldUrl(override)}?updateMask=indexConfig`, { method: 'PATCH', body: JSON.stringify({ indexConfig: { indexes } }) });
  if (status !== 200) throw new Error(`${label}: HTTP ${status} ${body.error?.message || ''}`);
  console.log(`created   ${label} (${missing.map(fieldKey).join(',')}; kept ${existing.map(fieldKey).join(',') || 'none'})`);
}

// Index builds take a few minutes; report the final state of every listed index.
for (let attempt = 0; attempt < 60; attempt++) {
  const states = [];
  for (const override of overrides) {
    const { status, body } = await api(fieldUrl(override));
    if (status !== 200) throw new Error(`get ${override.collectionGroup}.${override.fieldPath}: HTTP ${status} ${body.error?.message || ''}`);
    const existing = fieldIndexes(body);
    for (const index of override.indexes) {
      states.push([`${override.collectionGroup}.${override.fieldPath} (${fieldKey(index)})`, existing.find(e => fieldKey(e) === fieldKey(index))?.state
        // An override is applied by a long-running operation; give it a minute to appear.
        || (attempt < 3 ? 'PENDING' : 'MISSING')]);
    }
  }
  for (const group of [...new Set(wanted.map(i => i.collectionGroup))]) {
    const existing = [];
    for (let page = ''; ;) {
      const { status, body } = await api(`${base}/${group}/indexes${page ? `?pageToken=${encodeURIComponent(page)}` : ''}`);
      if (status !== 200) throw new Error(`list ${group}: HTTP ${status} ${body.error?.message || ''}`);
      existing.push(...(body.indexes || []));
      if (!body.nextPageToken) break;
      page = body.nextPageToken;
    }
    for (const index of wanted.filter(i => i.collectionGroup === group)) {
      const found = existing.find(i => i.queryScope === index.queryScope && key(i.fields) === key(index.fields));
      states.push([`${group} (${key(index.fields)})`, found?.state || 'MISSING']);
    }
  }
  const pending = states.filter(([, state]) => state !== 'READY');
  if (!pending.length) { console.log(`All ${states.length} indexes are READY.`); await probe(); process.exit(0); }
  if (pending.some(([, state]) => state === 'MISSING' || state === 'NEEDS_REPAIR')) throw new Error(`Not building: ${JSON.stringify(pending)}`);
  console.log(`waiting   ${pending.length} index(es) still building`);
  await new Promise(resolve => setTimeout(resolve, 20_000));
}
throw new Error('Indexes were still building after 20 minutes; rerun to check again.');
