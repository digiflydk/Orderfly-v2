'use strict';
// Final printer QA driver (HTTP + native readback) against the accepted QA0a stack.
// Runs ONLY against demo-orderfly-qa0 loopback emulators. Credentials, cookies and
// receipts stay in memory; only case ids, statuses and boolean invariants are printed.
const ROOT = '/home/user/Orderfly-v2';
const { createRequire } = require('node:module');
const rq = createRequire(ROOT + '/package.json');
const assert = require('node:assert/strict');
const { randomBytes, createHash } = require('node:crypto');
const { Firestore, Timestamp } = rq('@google-cloud/firestore');
const { PROJECT } = require(ROOT + '/scripts/local-qa/environment.cjs');
const BASE = 'http://127.0.0.1:3100', AUTH = 'http://127.0.0.1:9099';
if (process.env.ORDERFLY_LOCAL_QA !== 'true' || process.env.GCLOUD_PROJECT !== PROJECT || PROJECT !== 'demo-orderfly-qa0'
  || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8088' || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099'
  || Reflect.get(globalThis, Symbol.for('orderfly.qa0.loopback-guard')) !== true) throw Error('QA runtime boundary missing');
const db = new Firestore({ projectId: PROJECT, host: '127.0.0.1:8088', ssl: false,
  credentials: { client_email: 'qa@demo-orderfly-qa0.invalid', private_key: 'LOCAL_EMULATOR_ONLY_NOT_A_PRIVATE_KEY' } });
const sha = s => createHash('sha256').update(s).digest('hex');
const actor = uid => sha(JSON.stringify(['firebase', uid]));
const B = 'qac-brand', FB = 'qac-foreign-brand', L = 'qac-loc', L2 = 'qac-loc-b', FL = 'qac-foreign-loc';
const results = []; let PASS = 0;
function rec(id, issue, expected, actual, pass) { results.push({ id: `pass${PASS} ${id}`, issue, expected, actual: String(actual), pass: !!pass }); }

async function json(url, body) { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw Error('emulator op rejected'); return r.json(); }
async function user(label) { const r = await json(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=qa0-public-only`,
  { email: `${label}@qac.example.invalid`, password: randomBytes(24).toString('base64url'), returnSecureToken: true });
  return { uid: r.localId, idToken: r.idToken }; }
async function session(idToken) {
  const r = await fetch(BASE + '/api/admin/session', { method: 'POST', headers: { origin: BASE, 'content-type': 'application/json' }, body: JSON.stringify({ idToken }) });
  assert.equal(r.status, 200); return r.headers.get('set-cookie').split(';')[0]; }

let headerViolations = 0;
async function call(method, path, { cookie = '', body, origin = BASE, ctype = 'application/json', raw } = {}) {
  const headers = {}; if (cookie) headers.cookie = cookie;
  if (method !== 'GET') { if (origin) headers.origin = origin; if (ctype) headers['content-type'] = ctype; }
  const r = await fetch(BASE + path, { method, headers, body: method === 'GET' ? undefined : (raw ?? JSON.stringify(body ?? {})) });
  const text = await r.text(); let data = null; try { data = JSON.parse(text); } catch {}
  const cc = r.headers.get('cache-control') || '', vary = r.headers.get('vary') || '';
  if (path.startsWith('/api/') && (!/no-store/.test(cc) || !/cookie/i.test(vary))) headerViolations++;
  return { status: r.status, data, text };
}
const q = o => new URLSearchParams(o).toString();
const P = (loc = L) => `/api/merchant/printers`;
const conf = (id, o = {}) => ({ id, brandId: B, locationId: L, name: `QA ${id}`, manufacturer: 'star', model: 'mc-print3', transport: 'cloudprnt-http', state: 'disabled', paperWidthMm: 80, ...o });
const pdoc = (id, loc = L) => db.doc(`locations/${loc}/printers/${id}`);
const snap = async ref => { const s = await ref.get(); return s.exists ? s.data() : null; };
const count = async col => (await db.collection(col).get()).size;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const credentialWords = /secret|token|password|credential|private|apiKey|mac(Address)?"|firmware/i;
async function nativeState(id, loc = L) {
  const base = `locations/${loc}/printers/${id}`;
  return JSON.stringify({ p: await snap(db.doc(base)), audit: (await db.collection(base + '/audit').get()).docs.map(d => d.id).sort(),
    reviews: (await db.collection(base + '/queueReviews').get()).docs.map(d => [d.id, d.data().consumedAt]),
    q: await snap(db.doc(base + '/queue/state')), jobs: await count(base + '/jobs'),
    cap: !!(await snap(db.doc(`locations/${loc}/printerCapabilityVerifications/${id}`))) });
}
async function seedPrinter(id, state = 'disabled', loc = L, brand = B, revision = 1) {
  await pdoc(id, loc).create({ schemaVersion: 1, configuration: conf(id, { state, locationId: loc, brandId: brand }), revision, deletedAt: null, createdAt: 1, updatedAt: 1 });
}
async function seedLedger(id, o = {}, loc = L) {
  await db.doc(`locations/${loc}/printers/${id}/queue/state`).create({ schemaVersion: 1, brandId: B, locationId: loc, printerId: id, revision: 1, pendingCount: 0, oldestPendingAt: null, updatedAt: 1, ...o });
}
function jobId(j) { return sha(JSON.stringify(['orderfly-print-v1', j.brandId, j.locationId, j.orderId, j.printerId, j.kind, j.revision])); }
async function seedJob(printerId, orderId, createdAt, o = {}) {
  const j = { schemaVersion: 1, brandId: B, locationId: L, printerId, orderId, kind: 'kitchen', revision: 0, printerRevision: 1, state: 'queued', attempts: 0, createdAt, updatedAt: 1 };
  j.id = jobId(j); Object.assign(j, o);
  await db.doc(`locations/${L}/printers/${printerId}/jobs/${o.id ?? j.id}`).create(j); return j;
}
const queueGet = (cookie, id) => call('GET', `/api/merchant/printers/queue?${q({ brandId: B, locationId: L, printerId: id })}`, { cookie });
const review = (cookie, id, pr, qr, extra = {}) => call('POST', '/api/merchant/printers/queue/review', { cookie, body: { brandId: B, locationId: L, printerId: id, printerRevision: pr, queueRevision: qr, decision: 'resume_empty', ...extra } });
const life = (cookie, id, revision, action, extra = {}) => call('POST', '/api/merchant/printers/lifecycle', { cookie, body: { brandId: B, locationId: L, printerId: id, revision, action, ...extra } });
const detail = (cookie, id, brand = B, loc = L) => call('GET', `${P()}?${q({ brandId: brand, locationId: loc, printerId: id })}`, { cookie });
const list = (cookie, o = {}) => call('GET', `${P()}?${q({ brandId: B, locationId: L, overview: 'true', ...o })}`, { cookie });

// ================= #345 saved routing API acceptance (isolated, real app/auth/persistence) =================
const fsx = require('node:fs'), pth = require('node:path');
const OBS = process.env.QA_OBSERVER_DIR, ofile = n => pth.join(OBS, n);
const obsLines = () => { try { return fsx.readFileSync(ofile('attempts.log'), 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch { return []; } };
async function waitFile(name, ms) { const until = Date.now() + ms; while (Date.now() < until) { if (fsx.existsSync(ofile(name))) return true; await sleep(50); } return false; }
const OFF = process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED === 'false';
const R = '/api/superadmin/printers/routing';
const rdoc = (loc = L) => db.doc(`locations/${loc}/printerRouting/original`);
const raudit = (loc = L) => db.collection(`locations/${loc}/printerRouting/original/audit`);
const get = (cookie, loc = L, brand = B) => call('GET', `${R}?${q({ brandId: brand, locationId: loc })}`, { cookie });
const put = (cookie, expectedRevision, rules, o = {}) => call('PUT', R, { cookie, body: { brandId: o.brand ?? B, locationId: o.loc ?? L, expectedRevision, rules, ...(o.extra || {}) }, ...(o.req || {}) });
const rule = (id, printerId, match, effect = 'include', extra = {}) => ({ id, brandId: B, locationId: L, printerId, match, effect, ...extra });
const nstate = async (loc = L) => JSON.stringify({ d: await snap(rdoc(loc)), a: (await raudit(loc).get()).docs.map(x => x.id).sort() });
const DECLARED = ['platformAdminControl/access-v1', `brands/${B}`, `brands/${FB}`, `locations/${L}`, `locations/${L2}`, `locations/${FL}`,
  'products/qr-prod-1', 'products/qr-prod-g', 'products/qr-prod-l2', 'products/qr-prod-foreign', 'products/qr-prod-inactive',
  'categories/qr-cat-1', 'categories/qr-cat-2', 'categories/qr-cat-l2'];
(async () => {
  const started = new Date().toISOString();
  if (!fsx.existsSync(ofile('observer-loaded'))) throw Error('observer not loaded');
  rec('W0 environment write flag', '345', OFF ? 'false' : 'true', process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED, true);
  const pre = (await db.listCollections()).map(c => c.id); rec('C0 emulator empty before run', '345', '[]', JSON.stringify(pre), pre.length === 0);
  const [s1, s2, m] = await Promise.all([user('superadmin1'), user('superadmin2'), user('merchant')]);
  const a1 = actor(s1.uid), a2 = actor(s2.uid), am = actor(m.uid);
  const policy = { principals: [{ id: a1, active: true, name: 'S1' }, { id: a2, active: true, name: 'S2' }, { id: am, active: true, name: 'M' }],
    companies: [{ id: 'qac-company', active: true, locationIds: [L, L2], orderflyBrandIds: [B] }, { id: 'qac-foreign-company', active: true, locationIds: [FL], orderflyBrandIds: [FB] }],
    roles: [{ id: 'qac-owner', name: 'Owner', companyId: null, kind: 'superuser', permissions: [], active: true },
      { id: 'qac-member', name: 'Member', companyId: 'qac-company', kind: 'company_user', permissions: ['orderfly.catalog:view', 'orderfly.catalog:create', 'orderfly.catalog:edit', 'orderfly.catalog:delete', 'orderfly.orders:view'], active: true }],
    memberships: [{ id: 'qac-owner-1', principalId: a1, companyId: null, locationIds: null, roleIds: ['qac-owner'], active: true },
      { id: 'qac-owner-2', principalId: a2, companyId: null, locationIds: null, roleIds: ['qac-owner'], active: true },
      { id: 'qac-member', principalId: am, companyId: 'qac-company', locationIds: [L, L2], roleIds: ['qac-member'], active: true }] };
  const b = db.batch(); b.create(db.doc('platformAdminControl/access-v1'), policy);
  for (const [id, name] of [[B, 'QAC Own'], [FB, 'QAC Foreign']]) b.create(db.doc(`brands/${id}`), { id, name, status: 'active', isActive: true });
  for (const [id, brand] of [[L, B], [L2, B], [FL, FB]]) b.create(db.doc(`locations/${id}`), { id, brandId: brand, name: id, isActive: true });
  const prod = (id, o) => { const row = { id, brandId: B, productName: `Produkt ${id}`, categoryId: 'qr-cat-1', isActive: true, locationIds: [L], ...o }; if (row.locationIds === undefined) delete row.locationIds; b.create(db.doc(`products/${id}`), row); };
  prod('qr-prod-1', {}); prod('qr-prod-g', { locationIds: undefined }); prod('qr-prod-l2', { locationIds: [L2], categoryId: 'qr-cat-l2' }); prod('qr-prod-foreign', { brandId: FB }); prod('qr-prod-inactive', { isActive: false });
  const cat = (id, locs, o = {}) => b.create(db.doc(`categories/${id}`), { id, categoryName: `Kategori ${id}`, isActive: true, locationIds: locs, ...o });
  cat('qr-cat-1', [L]); cat('qr-cat-2', [L, L2]); cat('qr-cat-l2', [L2]);
  await b.commit();
  // printers: disabled draft, active, other-location, deleted tombstone
  await seedPrinter('qr-p-a'); await seedPrinter('qr-p-b', 'active'); await seedPrinter('qr-p-c', 'disabled', L2);
  await pdoc('qr-p-del').create({ schemaVersion: 1, configuration: conf('qr-p-del'), revision: 2, deletedAt: Timestamp.now(), createdAt: 1, updatedAt: 1 });
  for (let i = 0; i < 17; i++) await seedPrinter(`qr-many-${i}`);
  const [c1, c2, cm] = await Promise.all([session(s1.idToken), session(s2.idToken), session(m.idToken)]);
  const keysOk = d => d && JSON.stringify(Object.keys(d).sort()) === JSON.stringify(['dispatchAuthorized', 'printers', 'referencesVerified', 'revision', 'rules', 'scope']) && d.dispatchAuthorized === false;
  let r = await get(c1);
  rec('S1 GET empty saved routing', '345', '200 revision null, rules [], referencesVerified true, dispatchAuthorized false, strict keys', `${r.status} ${r.text}`, r.status === 200 && keysOk(r.data) && r.data.revision === null && r.data.rules.length === 0 && r.data.referencesVerified === true);
  if (OFF) {
    r = await put(c1, 0, [rule('r1', 'qr-p-a', { type: 'all' })]);
    rec('OFF1 PUT with writes flag OFF', '345', '503 writes_unavailable; no routing doc/audit', `${r.status} ${r.text}`, r.status === 503 && r.data?.error === 'writes_unavailable' && !(await snap(rdoc())) && (await raudit().get()).size === 0);
    r = await call('PUT', R, { cookie: c1, body: { nope: 1 } }); rec('OFF2 invalid body still 400 before flag', '345', '400', r.status, r.status === 400);
  } else {
    const rules1 = [rule('r1', 'qr-p-a', { type: 'all' }), rule('r2', 'qr-p-b', { type: 'category', id: 'qr-cat-1' }, 'include', { deliveryTypes: ['Pickup'] }), rule('r3', 'qr-p-a', { type: 'product', id: 'qr-prod-1' }, 'exclude')];
    r = await put(c1, 0, rules1); let d = await snap(rdoc()); let au = await snap(raudit().doc('1'));
    rec('S2 PUT create (expectedRevision 0)', '345', '200 rev1, referencesVerified true; native doc rev1 strict; audit/1 printer.routing.save actor super1 before null after rules', `${r.status} rev${r.data?.revision}`,
      r.status === 200 && keysOk(r.data) && r.data.revision === 1 && d?.revision === 1 && d.schemaVersion === 1 && d.id === 'original' && d.deletedAt === null && d.createdAt instanceof Timestamp
      && JSON.stringify(d.rules) === JSON.stringify(rules1) && au?.action === 'printer.routing.save' && au.actorId === a1 && au.before === null && JSON.stringify(au.after) === JSON.stringify(rules1));
    r = await get(c1);
    rec('S3 GET canonical readback', '345', 'rev1, same rules, printers = referenced (qr-p-a, qr-p-b), verified', `${r.status} rev${r.data?.revision} printers=${r.data?.printers?.map(p => p.configuration.id)}`,
      r.status === 200 && r.data.revision === 1 && JSON.stringify(r.data.rules) === JSON.stringify(rules1) && JSON.stringify(r.data.printers.map(p => p.configuration.id).sort()) === '["qr-p-a","qr-p-b"]' && r.data.referencesVerified === true && !credentialWords.test(r.text));
    let before = await nstate();
    r = await put(c1, 0, rules1); rec('S4 create again with expectedRevision 0', '345', '409 record_conflict, unchanged', `${r.status} ${r.text}`, r.status === 409 && r.data.error === 'record_conflict' && before === await nstate());
    const rules2 = [rule('r1', 'qr-p-a', { type: 'all' }, 'exclude'), rule('r4', 'qr-p-b', { type: 'product', id: 'qr-prod-g' })];
    r = await put(c1, 1, rules2); d = await snap(rdoc()); au = await snap(raudit().doc('2'));
    rec('S5 edit with current revision (incl. global product)', '345', '200 rev2; audit/2 before=rev1 rules, after=rev2 rules; createdAt preserved', `${r.status} rev${r.data?.revision}`,
      r.status === 200 && r.data.revision === 2 && d.revision === 2 && JSON.stringify(au?.before) === JSON.stringify(rules1) && JSON.stringify(au?.after) === JSON.stringify(rules2) && d.createdAt.isEqual((await snap(rdoc())).createdAt));
    before = await nstate(); r = await put(c1, 1, rules1); rec('S6 stale expectedRevision', '345', '409, no overwrite', `${r.status}`, r.status === 409 && before === await nstate());
    const [x1, x2] = await Promise.all([put(c1, 2, [rule('ra', 'qr-p-a', { type: 'all' })]), put(c2, 2, [rule('rb', 'qr-p-b', { type: 'all' })])]);
    d = await snap(rdoc()); const ids = (await raudit().get()).docs.map(x => x.id).sort().join();
    rec('S7 concurrent PUTs at same revision (two superadmins)', '345', 'one 200 + one 409; rev3; audits 1,2,3; winner rules persisted', `${x1.status}/${x2.status} rev${d.revision} audits ${ids}`,
      [x1.status, x2.status].sort().join() === '200,409' && d.revision === 3 && ids === '1,2,3' && d.rules[0].id === (x1.status === 200 ? 'ra' : 'rb'));
    r = await put(c1, 3, []); const g = await get(c1);
    rec('S8 remove all rules', '345', '200 rev4; GET rules [] revision 4; audit/4 after []', `${r.status} rev${g.data?.revision} rules=${g.data?.rules?.length}`, r.status === 200 && g.data.revision === 4 && g.data.rules.length === 0 && JSON.stringify((await snap(raudit().doc('4'))).after) === '[]');
    // reference validation (all must leave native state unchanged)
    const bad = [
      ['printer in other location', [rule('x', 'qr-p-c', { type: 'all' })], 409], ['nonexistent printer', [rule('x', 'qr-p-none', { type: 'all' })], 409],
      ['deleted (tombstoned) printer', [rule('x', 'qr-p-del', { type: 'all' })], 409], ['foreign-brand product', [rule('x', 'qr-p-a', { type: 'product', id: 'qr-prod-foreign' })], 409],
      ['product of other location', [rule('x', 'qr-p-a', { type: 'product', id: 'qr-prod-l2' })], 409], ['inactive product', [rule('x', 'qr-p-a', { type: 'product', id: 'qr-prod-inactive' })], 409],
      ['category not in location', [rule('x', 'qr-p-a', { type: 'category', id: 'qr-cat-l2' })], 409], ['missing category', [rule('x', 'qr-p-a', { type: 'category', id: 'qr-cat-none' })], 409],
      ['rule scope mismatch', [{ ...rule('x', 'qr-p-a', { type: 'all' }), locationId: L2 }], 400], ['duplicate rule ids', [rule('x', 'qr-p-a', { type: 'all' }), rule('x', 'qr-p-b', { type: 'all' })], 400],
      ['unknown rule field', [{ ...rule('x', 'qr-p-a', { type: 'all' }), secret: 'x' }], 400], ['duplicate delivery types', [rule('x', 'qr-p-a', { type: 'all' }, 'include', { deliveryTypes: ['Pickup', 'Pickup'] })], 400],
      ['17 distinct printers', [...Array(17)].map((_, i) => rule(`m${i}`, `qr-many-${i}`, { type: 'all' })), 400],
      ['257 rules', [...Array(257)].map((_, i) => rule(`n${i}`, 'qr-p-a', { type: 'all' })), 400],
    ];
    before = await nstate();
    for (const [name, rules, status] of bad) { r = await put(c1, 4, rules); rec(`S9 reject: ${name}`, '345', `${status}, unchanged`, `${r.status} ${r.data?.error}`, r.status === status && before === await nstate()); }
    r = await put(c1, 4, [rule('x', 'qr-p-a', { type: 'all' })], { extra: { dispatchAuthorized: true } }); rec('S9 reject: client dispatchAuthorized field', '345', '400', r.status, r.status === 400 && before === await nstate());
    r = await put(c1, 4, [rule('x', 'qr-p-a', { type: 'all' })], { req: { origin: 'https://evil.example' } }); rec('S10 foreign Origin', '345', '403', r.status, r.status === 403);
    r = await put(c1, 4, [], { req: { ctype: 'text/plain' } }); rec('S10 non-JSON', '345', '400', r.status, r.status === 400);
    r = await call('PUT', R + '?x=1', { cookie: c1, body: { brandId: B, locationId: L, expectedRevision: 4, rules: [] } }); rec('S10 query string on PUT', '345', '400', r.status, r.status === 400);
    r = await call('PUT', R, { cookie: c1, raw: JSON.stringify({ brandId: B, locationId: L, expectedRevision: 4, rules: [], pad: 'y'.repeat(33000) }) }); rec('S10 body > 32768 bytes', '345', '400', r.status, r.status === 400 && before === await nstate());
    r = await put(c1, 0, [], { brand: B, loc: FL }); rec('S12 own brand + foreign location', '345', '4xx, no doc at FL', `${r.status} ${r.data?.error}`, r.status >= 400 && r.status < 500 && !(await snap(rdoc(FL))));
    r = await get(c1, FL, B); rec('S12 GET own brand + foreign location', '345', '4xx', `${r.status} ${r.data?.error}`, r.status >= 400 && r.status < 500);
    // stale reference repair
    r = await put(c1, 4, [rule('s1', 'qr-p-a', { type: 'product', id: 'qr-prod-1' }), rule('s2', 'qr-p-b', { type: 'category', id: 'qr-cat-2' })]);
    await db.doc('products/qr-prod-1').update({ isActive: false });
    const sg = await get(c1);
    rec('S13a GET with stale product reference', '345', '200 referencesVerified false; rules + revision 5 retained; printers []', `${sg.status} verified=${sg.data?.referencesVerified} rev${sg.data?.revision} rules=${sg.data?.rules?.length} printers=${sg.data?.printers?.length}`,
      r.status === 200 && sg.status === 200 && sg.data.referencesVerified === false && sg.data.revision === 5 && sg.data.rules.length === 2 && sg.data.printers.length === 0);
    before = await nstate(); r = await put(c1, 5, sg.data.rules); rec('S13b re-saving stale reference rejected', '345', '409 reference_unverified, unchanged', `${r.status} ${r.data?.error}`, r.status === 409 && r.data.error === 'reference_unverified' && before === await nstate());
    r = await put(c1, 5, sg.data.rules.filter(x => x.id !== 's1')); const sg2 = await get(c1);
    rec('S13c repair by removing stale rule', '345', '200 rev6; GET verified true, 1 rule', `${r.status} rev${sg2.data?.revision} verified=${sg2.data?.referencesVerified}`, r.status === 200 && sg2.data.revision === 6 && sg2.data.referencesVerified === true && sg2.data.rules.length === 1);
    // corrupt stored doc
    await db.doc(`locations/${L2}/printerRouting/original`).create({ schemaVersion: 1, id: 'original', brandId: B, locationId: L2, revision: 1, rules: [], deletedAt: null, secret: 'x' });
    r = await get(c1, L2); rec('S14 corrupt stored routing doc', '345', '409 routing_unverified, no leak', `${r.status} ${r.text}`, r.status === 409 && r.data.error === 'routing_unverified' && !/secret/.test(r.text));
    // rollback: audit collision
    await raudit().doc('7').create({ canary: 'collision' }); before = await nstate();
    r = await put(c1, 6, [rule('z', 'qr-p-a', { type: 'all' })]); rec('S15 real commit rollback (audit/7 collision)', '345', '503; doc rev6 + audits unchanged', `${r.status} ${r.text}`, r.status === 503 && before === await nstate());
    await raudit().doc('7').delete();
    // retry observed + revocation between attempts (barrier)
    async function barrier(fire, between) {
      for (const f of ['barrier', 'release', 'attempt2-waiting']) fsx.rmSync(ofile(f), { force: true });
      const target = `locations/${L}/printerRouting/original`; fsx.writeFileSync(ofile('target'), target); fsx.writeFileSync(ofile('barrier'), '1');
      const n0 = obsLines().length; let finish; const done = new Promise(x => finish = x); let locked; const lockedP = new Promise(x => locked = x);
      const holder = db.runTransaction(async tx => { await tx.get(db.doc(target)); locked(); await done; });
      await lockedP; const req = fire(); const reached = await waitFile('attempt2-waiting', 25000); finish(); await holder.catch(() => {});
      if (reached && between) await between(); fsx.writeFileSync(ofile('release'), '1'); const res = await req; await sleep(300);
      fsx.rmSync(ofile('target'), { force: true }); fsx.rmSync(ofile('barrier'), { force: true });
      return { reached, res, mine: obsLines().slice(n0).filter(l => l.matched) };
    }
    const t1 = await barrier(() => put(c1, 6, [rule('y', 'qr-p-b', { type: 'all' })]));
    rec('S16 PUT retried by SDK under real contention commits once', '345', 'attempts=2 committed; 200 rev7; audits 1..7 (one new)', `reached=${t1.reached} obs=${JSON.stringify(t1.mine)} ${t1.res.status} rev${(await snap(rdoc())).revision}`,
      t1.reached && t1.mine.length === 1 && t1.mine[0].attempts === 2 && t1.mine[0].outcome === 'committed' && t1.res.status === 200 && (await snap(rdoc())).revision === 7 && (await raudit().get()).size === 7);
    const ref = db.doc('platformAdminControl/access-v1');
    const t2 = await barrier(() => put(c2, 7, [rule('w', 'qr-p-a', { type: 'all' })]), async () => { const p = (await ref.get()).data(); p.memberships = p.memberships.map(x => x.id === 'qac-owner-2' ? { ...x, active: false } : x); await ref.set(p); });
    rec('S17 superuser revoked between attempts: retry re-authorizes and denies', '345', 'attempts=2 error; 403; doc rev7 unchanged', `reached=${t2.reached} obs=${JSON.stringify(t2.mine)} ${t2.res.status}`,
      t2.reached && t2.mine.length === 1 && t2.mine[0].attempts === 2 && t2.mine[0].outcome === 'error' && t2.res.status === 403 && (await snap(rdoc())).revision === 7);
    r = await get(c2); rec('S18 revoked superadmin GET', '345', '403', r.status, r.status === 403);
    // preview is read-only
    before = await nstate(); const docsBefore = (await db.collection(`locations/${L}/printers`).get()).size;
    r = await call('POST', R + '/preview', { cookie: c1, body: { brandId: B, locationId: L, rules: [rule('p1', 'qr-p-b', { type: 'all' })], deliveryType: 'Pickup', items: [{ productId: 'qr-prod-g', quantity: 2 }] } });
    rec('S19 preview is sample-only and writes nothing', '345/352', '200 sampleOnly, dispatchAuthorized false, target qr-p-b; routing/printers unchanged', `${r.status} sampleOnly=${r.data?.sampleOnly} dispatch=${r.data?.dispatchAuthorized} targets=${r.data?.targets?.map(t => t.printerId)}`,
      r.status === 200 && r.data.sampleOnly === true && r.data.dispatchAuthorized === false && r.data.targets?.[0]?.printerId === 'qr-p-b' && before === await nstate() && docsBefore === (await db.collection(`locations/${L}/printers`).get()).size);
    r = await call('GET', `${R}/catalog?${q({ brandId: B, locationId: L, kind: 'product' })}`, { cookie: c1 });
    rec('S20 catalog picker: only applicable active own-brand products', '352', 'qr-prod-g present; foreign/inactive/other-location absent; qr-prod-1 now inactive -> absent', `${r.status} ${r.data?.items?.map(i => i.id)}`,
      r.status === 200 && r.data.items.some(i => i.id === 'qr-prod-g') && !r.data.items.some(i => ['qr-prod-foreign', 'qr-prod-inactive', 'qr-prod-l2', 'qr-prod-1'].includes(i.id)));
  }
  // merchant + anonymous (both modes)
  for (const [name, fn] of [['GET', () => get(cm)], ['PUT', () => put(cm, 0, [])], ['catalog', () => call('GET', `${R}/catalog?${q({ brandId: B, locationId: L, kind: 'product' })}`, { cookie: cm })],
    ['preview', () => call('POST', R + '/preview', { cookie: cm, body: { brandId: B, locationId: L, rules: [], deliveryType: 'Pickup', items: [{ productId: 'qr-prod-g', quantity: 1 }] } })]]) {
    const x = await fn(); rec(`S11 ordinary merchant (catalog view/create/edit/delete) ${name}`, '345/352', '403 forbidden', `${x.status} ${x.text}`, x.status === 403 && x.text === '{"error":"forbidden"}');
    const y = await (name === 'GET' ? get('') : name === 'PUT' ? put('', 0, []) : name === 'catalog' ? call('GET', `${R}/catalog?${q({ brandId: B, locationId: L, kind: 'product' })}`) : call('POST', R + '/preview', { body: {} }));
    rec(`S11 anonymous ${name}`, '345/352', '401', y.status, y.status === 401);
  }
  rec('Z1 no-store + Vary Cookie on every API response', '345', '0 violations', headerViolations, headerViolations === 0);
  // cleanup of exactly the declared namespace, then absence
  for (const p of DECLARED) await db.recursiveDelete(db.doc(p));
  for (const uid of [s1.uid, s2.uid, m.uid]) { const x = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:delete`, { method: 'POST', headers: { authorization: 'Bearer owner', 'content-type': 'application/json' }, body: JSON.stringify({ localId: uid }) }); if (!x.ok) throw Error('auth delete'); }
  const root = (await db.listCollections()).map(c => c.id);
  const users = ((await (await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`, { method: 'POST', headers: { authorization: 'Bearer owner', 'content-type': 'application/json' }, body: JSON.stringify({ localId: [s1.uid, s2.uid, m.uid] }) })).json()).users ?? []).length;
  rec('C1 cleanup: emulator root empty, Auth users removed', '345', 'root [] users 0', `root=${JSON.stringify(root)} users=${users}`, root.length === 0 && users === 0);
  const failed = results.filter(x => !x.pass);
  console.log(JSON.stringify({ environment: 'QA0a demo-orderfly-qa0, real Next app + Auth/Firestore emulators', writesFlag: process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED, started, finished: new Date().toISOString(), total: results.length, passed: results.length - failed.length, failed: failed.length, results }));
  await db.terminate();
})().catch(e => { console.log(JSON.stringify({ fatal: String(e && e.stack || e).slice(0, 800), results })); process.exitCode = 1; });
