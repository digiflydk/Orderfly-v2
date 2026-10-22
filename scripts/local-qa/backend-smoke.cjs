'use strict';
// Real emulator users/tokens/session cookies stay in memory and never reach logs.
const assert = require('node:assert/strict');
const { randomBytes, createHash } = require('node:crypto');
const { Firestore } = require('@google-cloud/firestore');
const { PROJECT } = require('./environment.cjs');
const BASE = 'http://127.0.0.1:3100', AUTH = 'http://127.0.0.1:9099';
if (process.env.ORDERFLY_LOCAL_QA !== 'true' || process.env.GCLOUD_PROJECT !== PROJECT
  || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8088' || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099'
  || Reflect.get(globalThis, Symbol.for('orderfly.qa0.loopback-guard')) !== true) throw Error('QA0 runtime boundary missing');
const db = new Firestore({ projectId: PROJECT, host: '127.0.0.1:8088', ssl: false,
  credentials: { client_email: 'qa0@demo-orderfly-qa0.invalid', private_key: 'LOCAL_EMULATOR_ONLY_NOT_A_PRIVATE_KEY' } });
const actor = uid => createHash('sha256').update(JSON.stringify(['firebase', uid])).digest('hex');
const ids = { brand: 'qa0-brand', foreignBrand: 'qa0-foreign-brand', location: 'qa0-location', foreignLocation: 'qa0-foreign-location', printer: 'qa0-printer' };
const known = ['platformAdminControl/access-v1', `brands/${ids.brand}`, `brands/${ids.foreignBrand}`, `locations/${ids.location}`, `locations/${ids.foreignLocation}`];
const accounts = [];
const extraPaths = [];
let seeded = false;
async function json(url, body) { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw Error('QA0 emulator operation rejected'); return r.json(); }
async function user(label) {
  const response = await json(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=qa0-public-only`, {
    email: `${label}@qa0.example.invalid`, password: randomBytes(24).toString('base64url'), returnSecureToken: true });
  accounts.push(response.localId); return { uid: response.localId, idToken: response.idToken };
}
async function session(idToken) {
  const r = await fetch(BASE + '/api/admin/session', { method: 'POST', headers: { origin: BASE, 'content-type': 'application/json' }, body: JSON.stringify({ idToken }) });
  assert.equal(r.status, 200, 'real app must accept freshly verified emulator identity and native policy');
  const cookie = r.headers.get('set-cookie')?.split(';')[0]; assert.ok(cookie?.startsWith('__session=')); return cookie;
}
async function printerRead(cookie, brand = ids.brand, location = ids.location) {
  return fetch(`${BASE}/api/merchant/printers?brandId=${brand}&locationId=${location}&overview=true`, { headers: { cookie } });
}
(async () => {
  const counters = []; let proof;
  try {
    for (const key of known) assert.equal((await db.doc(key).get()).exists, false, 'QA0 refuses to overwrite an existing seed');
    const [admin, merchant] = await Promise.all([user('superadmin'), user('merchant')]);
    const superId = actor(admin.uid), merchantId = actor(merchant.uid);
    const policy = {
      principals: [{ id: superId, active: true, name: 'QA0 Superadmin' }, { id: merchantId, active: true, name: 'QA0 Merchant' }],
      companies: [
        { id: 'qa0-company', active: true, locationIds: [ids.location], orderflyBrandIds: [ids.brand] },
        { id: 'qa0-foreign-company', active: true, locationIds: [ids.foreignLocation], orderflyBrandIds: [ids.foreignBrand] },
      ],
      roles: [
        { id: 'qa0-owner', name: 'QA0 Owner', companyId: null, kind: 'superuser', permissions: [], active: true },
        { id: 'qa0-member', name: 'QA0 Member', companyId: 'qa0-company', kind: 'company_user', permissions: ['orderfly.catalog:view', 'orderfly.catalog:edit', 'orderfly.orders:view'], active: true },
      ],
      memberships: [
        { id: 'qa0-owner', principalId: superId, companyId: null, locationIds: null, roleIds: ['qa0-owner'], active: true },
        { id: 'qa0-member', principalId: merchantId, companyId: 'qa0-company', locationIds: [ids.location], roleIds: ['qa0-member'], active: true },
      ],
    };
    const batch = db.batch(); batch.create(db.doc(known[0]), policy);
    for (const [id, name] of [[ids.brand, 'QA0 Own'], [ids.foreignBrand, 'QA0 Foreign']]) batch.create(db.doc(`brands/${id}`), { id, name, status: 'active', isActive: true });
    for (const [id, brand] of [[ids.location, ids.brand], [ids.foreignLocation, ids.foreignBrand]]) batch.create(db.doc(`locations/${id}`), { id, brandId: brand, name: id, isActive: true });
    const printerPath = `locations/${ids.location}/printers/${ids.printer}`;
    batch.create(db.doc(printerPath), { schemaVersion: 1, configuration: { id: ids.printer, brandId: ids.brand, locationId: ids.location,
      name: 'QA0 Disabled ÆØÅ', manufacturer: 'star', model: 'mc-print3', transport: 'cloudprnt-http', state: 'disabled', paperWidthMm: 80 },
      revision: 1, deletedAt: null, createdAt: 1, updatedAt: 1 });
    batch.create(db.doc(printerPath + '/queue/state'), { schemaVersion: 1, brandId: ids.brand, locationId: ids.location, printerId: ids.printer,
      revision: 1, pendingCount: 0, oldestPendingAt: null, updatedAt: 1 });
    await batch.commit(); seeded = true; counters.push('real Firestore atomic seed/readback');
    const [adminCookie, merchantCookie] = await Promise.all([session(admin.idToken), session(merchant.idToken)]); counters.push('two real Auth identities -> actual Next session cookies');
    const read = await printerRead(adminCookie); assert.equal(read.status, 200); const result = await read.json();
    assert.equal(result.items.length, 1); assert.equal(result.items[0].configuration.id, ids.printer); assert.equal(result.totalPrinters, 1); counters.push('actual native printer API reads persisted disabled printer');
    assert.equal((await printerRead(merchantCookie)).status, 403); counters.push('ordinary merchant denied printer administration');
    assert.equal((await printerRead(adminCookie, ids.brand, ids.foreignLocation)).status, 403); counters.push('foreign native location rejected');
    assert.equal((await printerRead('')).status, 401); counters.push('anonymous rejected');
    const queue = await fetch(`${BASE}/api/merchant/printers/queue?brandId=${ids.brand}&locationId=${ids.location}&printerId=${ids.printer}`, { headers: { cookie: adminCookie } });
    assert.equal(queue.status, 200); const summary = await queue.json(); assert.equal(summary.resumeAuthorized, false); counters.push('actual queue API validates native empty ledger without resume authority');
    assert.equal((await db.doc(printerPath).get()).data().configuration.state, 'disabled');
    const credentialMetadata = process.env.QA0_CREDENTIAL_METADATA_PROOF === 'true'
      ? await require('./credential-metadata-proof.cjs').runCredentialMetadataProof({ db, ids, adminCookie, merchantCookie, register(path) {
        assert.equal(path, printerPath + '/deviceCredentials/current', 'QA504 registers only its owner-created native credential path');
        if (!extraPaths.includes(path)) extraPaths.push(path);
        return true;
      } }) : undefined;
    proof = { ...(credentialMetadata ? { credentialMetadata } : {}), environment: 'QA0a-local-backend', project: PROJECT, softwareOnly: true, checks: counters, productionAcceptance: false, physicalPrintVerified: false };
  } finally {
    try {
    // Only fixed test project and explicit seed paths. Never delete arbitrary projects/data.
    for (const id of seeded ? [ids.location, ids.foreignLocation] : []) if ((await db.doc(`locations/${id}`).get()).exists) await db.recursiveDelete(db.doc(`locations/${id}`));
    for (const key of seeded ? known.filter(p => !p.startsWith('locations/')) : []) await db.doc(key).delete();
    for (const uid of accounts) { const response = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:delete`, { method: 'POST', headers: { authorization: 'Bearer owner', 'content-type': 'application/json' }, body: JSON.stringify({localId:uid}) }); assert.equal(response.ok, true, 'QA0 removes only its created Auth user'); }
    if (seeded) {
      const paths = [...known, `locations/${ids.location}/printers/${ids.printer}`, `locations/${ids.location}/printers/${ids.printer}/queue/state`, ...extraPaths];
      for (const key of paths) assert.equal((await db.doc(key).get()).exists, false, 'QA0 verifies every seeded native document was removed');
    }
    const lookup = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`, { method: 'POST', headers: { authorization: 'Bearer owner', 'content-type': 'application/json' }, body: JSON.stringify({ localId: accounts }) });
    assert.equal(lookup.ok, true, 'QA0 can verify created user cleanup');
    assert.equal(((await lookup.json()).users ?? []).length, 0, 'QA0 verifies every created Auth user was removed');
    } finally { await db.terminate(); }
  }
  console.log(JSON.stringify({ ...proof, cleanupVerified: true }));
})().catch(() => { console.error('QA0a backend smoke failed; inspect fixed assertions locally without credentials'); process.exitCode = 1; });
