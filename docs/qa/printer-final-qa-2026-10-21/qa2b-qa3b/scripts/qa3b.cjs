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

async function corePass() {
  headerViolations = 0;
  const [s1, s2, m] = await Promise.all([user('superadmin1'), user('superadmin2'), user('merchant')]);
  const a1 = actor(s1.uid), a2 = actor(s2.uid), am = actor(m.uid);
  const policy = {
    principals: [{ id: a1, active: true, name: 'QAC Super 1' }, { id: a2, active: true, name: 'QAC Super 2' }, { id: am, active: true, name: 'QAC Merchant' }],
    companies: [{ id: 'qac-company', active: true, locationIds: [L, L2], orderflyBrandIds: [B] },
      { id: 'qac-foreign-company', active: true, locationIds: [FL], orderflyBrandIds: [FB] }],
    roles: [{ id: 'qac-owner', name: 'QAC Owner', companyId: null, kind: 'superuser', permissions: [], active: true },
      { id: 'qac-member', name: 'QAC Member', companyId: 'qac-company', kind: 'company_user',
        permissions: ['orderfly.catalog:view', 'orderfly.catalog:create', 'orderfly.catalog:edit', 'orderfly.catalog:delete', 'orderfly.orders:view'], active: true }],
    memberships: [{ id: 'qac-owner-1', principalId: a1, companyId: null, locationIds: null, roleIds: ['qac-owner'], active: true },
      { id: 'qac-owner-2', principalId: a2, companyId: null, locationIds: null, roleIds: ['qac-owner'], active: true },
      { id: 'qac-member', principalId: am, companyId: 'qac-company', locationIds: [L, L2], roleIds: ['qac-member'], active: true }],
  };
  const batch = db.batch(); batch.create(db.doc('platformAdminControl/access-v1'), policy);
  for (const [id, name] of [[B, 'QAC Own'], [FB, 'QAC Foreign']]) batch.create(db.doc(`brands/${id}`), { id, name, status: 'active', isActive: true });
  for (const [id, brand] of [[L, B], [L2, B], [FL, FB]]) batch.create(db.doc(`locations/${id}`), { id, brandId: brand, name: id, isActive: true });
  await batch.commit();
  await seedPrinter('qac-seed'); await seedLedger('qac-seed');
  const [c1, c2, cm] = await Promise.all([session(s1.idToken), session(s2.idToken), session(m.idToken)]);

  // ---------- A: reads / access (#295, #325) ----------
  let r = await list(c1); rec('A1 superadmin own-scope list', '295', '200, 1 row, totalPrinters 1', `${r.status}/${r.data?.items?.length}/${r.data?.totalPrinters}`, r.status === 200 && r.data.items.length === 1 && r.data.totalPrinters === 1);
  r = await detail(c1, 'qac-seed');
  const keys = r.data?.item ? Object.keys(r.data.item).sort().join(',') + '|' + Object.keys(r.data.item.configuration).sort().join(',') : '';
  rec('A2 superadmin detail persisted record', '295', '200 {configuration,revision}, strict credential-free keys', `${r.status} ${keys}`,
    r.status === 200 && keys === 'configuration,revision|brandId,id,locationId,manufacturer,model,name,paperWidthMm,state,transport' && !credentialWords.test(r.text));
  r = await detail(c1, 'qac-seed', B, FL); rec('A3 detail own brand + foreign location', '295', '403 only {error}', `${r.status} ${r.text}`, r.status === 403 && r.text === '{"error":"forbidden"}');
  r = await detail(c1, 'qac-seed', FB, L); rec('A4 detail foreign brand + own location', '295', '403', `${r.status} ${r.text}`, r.status === 403 && r.text === '{"error":"forbidden"}');
  r = await detail(c1, 'qac-seed', 'qac-unknown-brand', 'qac-unknown-loc'); rec('A5 unknown scope', '295', '403 no metadata', `${r.status} ${r.text}`, r.status === 403 && r.text === '{"error":"forbidden"}');
  r = await detail(c1, 'qac-missing'); rec('A6 unknown printer id in own scope', '295', '404 not_found', `${r.status} ${r.text}`, r.status === 404 && r.text === '{"error":"not_found"}');
  r = await detail(c1, 'bad id!'); rec('A7 malformed printer id', '295', '400', `${r.status}`, r.status === 400);
  r = await call('GET', `${P()}?brandId=${B}&brandId=${B}&locationId=${L}`, { cookie: c1 }); rec('A8 duplicate query keys', '295', '400', `${r.status}`, r.status === 400);
  await pdoc('qac-corrupt', L2).create({ schemaVersion: 1, configuration: { ...conf('qac-corrupt', { locationId: L2 }), secret: 'x' }, revision: 1, deletedAt: null });
  r = await detail(c1, 'qac-corrupt', B, L2); rec('A9 malformed/legacy record with extra secret field (detail)', '295', '404, nothing leaked', `${r.status} ${r.text}`, r.status === 404 && !/secret|"x"/.test(r.text));
  r = await call('GET', `${P()}?${q({ brandId: B, locationId: L2 })}`, { cookie: c1 }); rec('A10 list containing malformed record fails closed', '295', '503 printers_unavailable, nothing leaked', `${r.status} ${r.text}`, r.status === 503 && !/secret|qac-corrupt/.test(r.text));
  await pdoc('qac-corrupt', L2).delete();
  r = await call('GET', `${P()}?${q({ brandId: B, locationId: L2, overview: 'true' })}`, { cookie: c1 }); rec('A11 empty authorized scope', '295', '200 items [] total 0', `${r.status} ${r.text}`, r.status === 200 && r.data.items.length === 0 && r.data.totalPrinters === 0 && r.data.nextCursor === null);
  const merchantCalls = [
    ['GET list', () => list(cm)], ['GET detail', () => detail(cm, 'qac-seed')],
    ['POST create', () => call('POST', P(), { cookie: cm, body: { configuration: conf('qac-merchant') } })],
    ['PATCH edit', () => call('PATCH', P(), { cookie: cm, body: { configuration: conf('qac-seed'), revision: 1 } })],
    ['POST lifecycle', () => life(cm, 'qac-seed', 1, 'delete')], ['GET queue', () => queueGet(cm, 'qac-seed')],
    ['POST queue review', () => review(cm, 'qac-seed', 1, 1)],
    ['GET routing', () => call('GET', `/api/superadmin/printers/routing?${q({ brandId: B, locationId: L })}`, { cookie: cm })],
  ];
  for (const [name, fn] of merchantCalls) { r = await fn(); rec(`A12 ordinary merchant (own scope, catalog view/create/edit/delete grants) ${name}`, '325', '403 {error:forbidden}', `${r.status} ${r.text.slice(0, 40)}`, r.status === 403 && r.text === '{"error":"forbidden"}'); }
  rec('A13 merchant calls caused no native change', '325', 'qac-merchant absent, qac-seed rev 1', '', !(await snap(pdoc('qac-merchant'))) && (await snap(pdoc('qac-seed'))).revision === 1);
  for (const [name, fn] of [['GET list', () => list('')], ['POST create', () => call('POST', P(), { body: { configuration: conf('qac-anon') } })], ['POST lifecycle', () => life('', 'qac-seed', 1, 'delete')], ['GET queue', () => queueGet('', 'qac-seed')]]) {
    r = await fn(); rec(`A14 anonymous ${name}`, '325', '401', `${r.status}`, r.status === 401); }
  r = await call('GET', '/superadmin/printers', { cookie: cm });
  rec('A15 merchant session GET /superadmin/printers (HTTP, not browser)', '325', 'no printer page (redirect/403/404)', `${r.status}`, r.status !== 200 || !/Printere|printer-overview/i.test(r.text));

  // ---------- B: create/edit (#296) ----------
  const cap = id => db.doc(`locations/${L}/printerCapabilityVerifications/${id}`);
  r = await call('POST', P(), { cookie: c1, body: { configuration: conf('qac-p1') } });
  let doc = await snap(pdoc('qac-p1')); let audit1 = await snap(db.doc(`locations/${L}/printers/qac-p1/audit/1`));
  rec('B1 create disabled printer', '296', '201 rev1', `${r.status} rev${r.data?.item?.revision}`, r.status === 201 && r.data.item.revision === 1);
  rec('B2 native record after create', '296', 'schemaVersion1, rev1, deletedAt null, server Timestamp createdAt/updatedAt, state disabled', '',
    doc && doc.schemaVersion === 1 && doc.revision === 1 && doc.deletedAt === null && doc.createdAt instanceof Timestamp && doc.updatedAt instanceof Timestamp && doc.configuration.state === 'disabled');
  rec('B3 create audit', '296', 'audit/1 printer.create, actor=super1, before null, after=config, capabilityInvalidated', '',
    audit1 && audit1.action === 'printer.create' && audit1.actorId === a1 && audit1.before === null && JSON.stringify(audit1.after) === JSON.stringify(conf('qac-p1')) && audit1.capabilityInvalidated === true && audit1.createdAt instanceof Timestamp);
  rec('B4 create creates no ledger/jobs/credentials', '296', 'no queue/jobs/cap docs', '', !(await snap(db.doc(`locations/${L}/printers/qac-p1/queue/state`))) && (await count(`locations/${L}/printers/qac-p1/jobs`)) === 0);
  r = await detail(c1, 'qac-p1'); rec('B5 reload/readback after create', '296', '200 same config rev1', `${r.status}`, r.status === 200 && JSON.stringify(r.data.item.configuration) === JSON.stringify(conf('qac-p1')) && r.data.item.revision === 1);
  const invalid = [
    ['state active', { configuration: conf('qac-bad', { state: 'active' }) }], ['state paused', { configuration: conf('qac-bad', { state: 'paused' }) }],
    ['mC-Print2 + MQTT', { configuration: conf('qac-bad', { model: 'mc-print2', transport: 'cloudprnt-mqtt', paperWidthMm: 58 }) }],
    ['mC-Print2 + 80mm', { configuration: conf('qac-bad', { model: 'mc-print2', paperWidthMm: 80 }) }],
    ['paper 72mm', { configuration: conf('qac-bad', { paperWidthMm: 72 }) }], ['unknown model', { configuration: conf('qac-bad', { model: 'tsp100' }) }],
    ['unknown config field (password)', { configuration: { ...conf('qac-bad'), password: 'x' } }], ['unknown top-level field', { configuration: conf('qac-bad'), enabled: true }],
    ['blank name', { configuration: conf('qac-bad', { name: '   ' }) }], ['name 81 chars', { configuration: conf('qac-bad', { name: 'x'.repeat(81) }) }],
    ['control char in name', { configuration: conf('qac-bad', { name: 'a\u0007b' }) }], ['bad id', { configuration: conf('bad id') }],
  ];
  for (const [name, body] of invalid) { r = await call('POST', P(), { cookie: c1, body }); rec(`B6 invalid create: ${name}`, '296', '400, no record', `${r.status}`, r.status === 400 && !(await snap(pdoc('qac-bad')))); }
  r = await call('POST', P(), { cookie: c1, body: { configuration: conf('qac-bad', { brandId: B, locationId: FL }) } });
  rec('B7 create with own brand + foreign location (reparent)', '296', '4xx, no record anywhere', `${r.status} ${r.text}`, r.status >= 400 && r.status < 500 && !(await snap(pdoc('qac-bad', FL))) && !(await snap(pdoc('qac-bad'))));
  r = await call('POST', P(), { cookie: c1, body: { configuration: conf('qac-bad', { brandId: FB, locationId: L }) } });
  rec('B8 create with foreign brand + own location', '296', '4xx, no record', `${r.status} ${r.text}`, r.status >= 400 && r.status < 500 && !(await snap(pdoc('qac-bad'))));
  r = await call('POST', P(), { cookie: c1, body: { configuration: conf('qac-bad', { brandId: 'qac-x', locationId: 'qac-y' }) } });
  rec('B9 create in unknown scope', '296', '4xx', `${r.status} ${r.text}`, r.status >= 400 && r.status < 500);
  r = await call('POST', P(), { cookie: c1, body: { configuration: conf('qac-bad') }, origin: 'https://evil.example' }); rec('B10 foreign Origin', '296', '403', `${r.status}`, r.status === 403 && !(await snap(pdoc('qac-bad'))));
  r = await call('POST', P(), { cookie: c1, body: { configuration: conf('qac-bad') }, ctype: 'text/plain' }); rec('B11 non-JSON content type', '296', '400', `${r.status}`, r.status === 400);
  r = await call('POST', P() + '?x=1', { cookie: c1, body: { configuration: conf('qac-bad') } }); rec('B12 query string on write', '296', '400', `${r.status}`, r.status === 400);
  r = await call('POST', P(), { cookie: c1, raw: JSON.stringify({ configuration: conf('qac-bad', { name: 'x' }), pad: 'y'.repeat(9000) }) }); rec('B13 body > 8192 bytes', '296', '400', `${r.status}`, r.status === 400 && !(await snap(pdoc('qac-bad'))));
  let before = await nativeState('qac-p1');
  r = await call('POST', P(), { cookie: c1, body: { configuration: conf('qac-p1', { name: 'overwrite' }) } }); rec('B14 create existing id', '296', '409 record_conflict, unchanged', `${r.status} ${r.text}`, r.status === 409 && before === await nativeState('qac-p1'));
  await cap('qac-p1').create({ canary: true });
  const created = (await snap(pdoc('qac-p1'))).createdAt;
  r = await call('PATCH', P(), { cookie: c1, body: { configuration: conf('qac-p1', { name: 'QA edited ÆØÅ', model: 'mc-print2', paperWidthMm: 58 }), revision: 1 } });
  doc = await snap(pdoc('qac-p1')); const audit2 = await snap(db.doc(`locations/${L}/printers/qac-p1/audit/2`));
  rec('B15 edit with current revision', '296', '200 rev2', `${r.status} rev${r.data?.item?.revision}`, r.status === 200 && r.data.item.revision === 2);
  rec('B16 edit native + audit', '296', 'rev2, createdAt preserved, updatedAt advanced, audit/2 before/after, capability invalidated', '',
    doc.revision === 2 && doc.createdAt.isEqual(created) && doc.updatedAt.toMillis() >= created.toMillis() && audit2?.action === 'printer.edit' && audit2.before.name === 'QA qac-p1' && audit2.after.name === 'QA edited ÆØÅ' && audit2.actorId === a1 && !(await snap(cap('qac-p1'))));
  r = await detail(c1, 'qac-p1'); rec('B17 reload after edit', '296', 'name/model/width persisted', `${r.data?.item?.configuration?.name}/${r.data?.item?.configuration?.model}/${r.data?.item?.configuration?.paperWidthMm}`, r.data?.item?.configuration?.name === 'QA edited ÆØÅ' && r.data.item.configuration.paperWidthMm === 58);
  before = await nativeState('qac-p1');
  r = await call('PATCH', P(), { cookie: c1, body: { configuration: conf('qac-p1', { name: 'stale' }), revision: 1 } }); rec('B18 stale revision edit', '296', '409, no overwrite', `${r.status} ${r.text}`, r.status === 409 && before === await nativeState('qac-p1'));
  r = await call('PATCH', P(), { cookie: c1, body: { configuration: conf('qac-p1', { locationId: L2 }), revision: 2 } }); rec('B19 edit reparent to other own location', '296', '404, no doc at L2, original unchanged', `${r.status}`, r.status === 404 && !(await snap(pdoc('qac-p1', L2))) && before === await nativeState('qac-p1'));
  r = await call('PATCH', P(), { cookie: c1, body: { configuration: conf('qac-p1', { brandId: FB }), revision: 2 } }); rec('B20 edit reparent to foreign brand', '296', '4xx unchanged', `${r.status}`, r.status >= 400 && r.status < 500 && before === await nativeState('qac-p1'));
  r = await call('PATCH', P(), { cookie: c1, body: { configuration: conf('qac-missing'), revision: 1 } }); rec('B21 edit missing printer', '296', '404', `${r.status}`, r.status === 404);
  // concurrent edits at same revision (two real sessions)
  const [e1, e2] = await Promise.all([
    call('PATCH', P(), { cookie: c1, body: { configuration: conf('qac-p1', { name: 'race A' }), revision: 2 } }),
    call('PATCH', P(), { cookie: c2, body: { configuration: conf('qac-p1', { name: 'race B' }), revision: 2 } })]);
  doc = await snap(pdoc('qac-p1'));
  const auditIds = (await db.collection(`locations/${L}/printers/qac-p1/audit`).get()).docs.map(d => d.id).sort().join(',');
  rec('B22 concurrent edits same revision (two superadmin sessions)', '296', 'exactly one 200 + one 409, rev3, audits 1,2,3, winner name persisted', `${e1.status}/${e2.status} rev${doc.revision} audits ${auditIds}`,
    [e1.status, e2.status].sort().join() === '200,409' && doc.revision === 3 && auditIds === '1,2,3' && doc.configuration.name === (e1.status === 200 ? 'race A' : 'race B'));
  const [d1, d2] = await Promise.all([call('POST', P(), { cookie: c1, body: { configuration: conf('qac-p2') } }), call('POST', P(), { cookie: c2, body: { configuration: conf('qac-p2', { name: 'dup' }) } })]);
  rec('B23 concurrent duplicate creates', '296', 'one 201 + one 409, one audit', `${d1.status}/${d2.status}`, [d1.status, d2.status].sort().join() === '201,409' && (await count(`locations/${L}/printers/qac-p2/audit`)) === 1);
  // real atomic rollback: audit/(rev+1) collision makes the edit transaction fail at commit
  await db.doc(`locations/${L}/printers/qac-p2/audit/2`).create({ canary: 'collision' }); await cap('qac-p2').create({ canary: true });
  before = await nativeState('qac-p2');
  r = await call('PATCH', P(), { cookie: c1, body: { configuration: conf('qac-p2', { name: 'should roll back' }), revision: 1 } });
  rec('B24 audit atomicity (audit collision at commit)', '296', '503 safe error; config, revision, capability, audits unchanged', `${r.status} ${r.text}`, r.status === 503 && before === await nativeState('qac-p2') && !/collision|canary/.test(r.text));
  await db.doc(`locations/${L}/printers/qac-p2/audit/2`).delete();

  // ---------- D: queue summary (#301) ----------
  const qp1 = await queueGet(c1, 'qac-p1');
  rec('D1 missing ledger is BLOCKED, not empty', '301', '200 status blocked missing_metadata, queueRevision null, summary null', `${qp1.status} ${qp1.data?.status}/${qp1.data?.reason}`,
    qp1.status === 200 && qp1.data.status === 'blocked' && qp1.data.reason === 'missing_metadata' && qp1.data.queueRevision === null && qp1.data.summary === null && qp1.data.resumeAuthorized === false);
  r = await review(c1, 'qac-p1', 3, 1); rec('D2 review on missing ledger', '301/305', '409 queue_review_blocked, no receipt', `${r.status} ${r.text}`, r.status === 409 && r.data?.error === 'queue_review_blocked' && (await count(`locations/${L}/printers/qac-p1/queueReviews`)) === 0);
  const now = Date.now();
  const variants = [
    ['qac-q-foreign-meta', async id => seedLedger(id, { printerId: 'other' }), 'invalid_metadata'],
    ['qac-q-bad-meta', async id => seedLedger(id, { pendingCount: -1 }), 'invalid_metadata'],
    ['qac-q-inconsistent', async id => seedLedger(id, { pendingCount: 1, oldestPendingAt: 5 }), 'inconsistent_metadata'],
    ['qac-q-uncertain', async id => { const j = await seedJob(id, 'qac-order-u', now - 5000); await seedLedger(id, { pendingCount: 1, oldestPendingAt: j.createdAt });
      await db.doc(`locations/${L}/printers/${id}/jobs/${j.id}`).update({ state: 'uncertain' }); }, 'unknown_outcome_jobs'],
    ['qac-q-dispatching', async id => { const j = await seedJob(id, 'qac-order-d', now - 5000); await seedLedger(id, { pendingCount: 1, oldestPendingAt: j.createdAt });
      await db.doc(`locations/${L}/printers/${id}/jobs/${j.id}`).update({ state: 'dispatching' }); }, 'unknown_outcome_jobs'],
    ['qac-q-expired', async id => { const j = await seedJob(id, 'qac-order-e', now - 5000); await seedLedger(id, { pendingCount: 1, oldestPendingAt: j.createdAt });
      await db.doc(`locations/${L}/printers/${id}/jobs/${j.id}`).update({ state: 'expired' }); }, 'expired_jobs'],
    ['qac-q-future', async id => { const j = await seedJob(id, 'qac-order-f', now + 3600000); await seedLedger(id, { pendingCount: 1, oldestPendingAt: j.createdAt }); }, 'clock_invalid'],
    ['qac-q-badjob', async id => { await seedJob(id, 'qac-order-b', now - 5000, { id: 'f'.repeat(64) }); await seedLedger(id, { pendingCount: 1, oldestPendingAt: now - 5000 }); }, 'invalid_jobs'],
  ];
  for (const [id, setup, reason] of variants) {
    await seedPrinter(id); await setup(id); const pre = await nativeState(id);
    const g = await queueGet(c1, id); const rv = await review(c1, id, 1, 1);
    rec(`D3 ${id}`, '301/305', `GET blocked ${reason}; review 409 queue_review_blocked; unchanged`, `${g.status} ${g.data?.status}/${g.data?.reason}; review ${rv.status} ${rv.data?.error}`,
      g.status === 200 && g.data.status === 'blocked' && g.data.reason === reason && g.data.summary === null && rv.status === 409 && rv.data.error === 'queue_review_blocked' && pre === await nativeState(id));
  }
  await seedPrinter('qac-q-big'); { const wb = []; let b = db.batch(), n = 0;
    for (let i = 0; i < 501; i++) { const j = { schemaVersion: 1, brandId: B, locationId: L, printerId: 'qac-q-big', orderId: `qac-o${i}`, kind: 'kitchen', revision: 0, printerRevision: 1, state: 'queued', attempts: 0, createdAt: now - 1000, updatedAt: 1 };
      j.id = jobId(j); b.create(db.doc(`locations/${L}/printers/qac-q-big/jobs/${j.id}`), j); if (++n === 400) { wb.push(b.commit()); b = db.batch(); n = 0; } }
    wb.push(b.commit()); await Promise.all(wb); await seedLedger('qac-q-big', { pendingCount: 501, oldestPendingAt: now - 1000 }); }
  r = await queueGet(c1, 'qac-q-big'); rec('D4 501 jobs (over bound)', '301', 'blocked queue_too_large', `${r.data?.status}/${r.data?.reason}`, r.data?.status === 'blocked' && r.data.reason === 'queue_too_large');
  await seedPrinter('qac-q-two'); const j1 = await seedJob('qac-q-two', 'qac-order-1', now - 60000); const j2 = await seedJob('qac-q-two', 'qac-order-2', now - 10000);
  await seedLedger('qac-q-two', { pendingCount: 2, oldestPendingAt: j1.createdAt, revision: 7 });
  r = await queueGet(c1, 'qac-q-two'); const s = r.data?.summary;
  rec('D5 valid nonempty queue: count/age/revision vs native', '301', 'verified, Q7, count2, oldest/newest createdAt match, ages = evaluatedAt - createdAt',
    `${r.data?.status} Q${r.data?.queueRevision} n${s?.pendingCount} oldestAge${s?.oldestAgeMs} newestAge${s?.newestAgeMs}`,
    r.data?.status === 'verified' && r.data.queueRevision === 7 && s.pendingCount === 2 && s.oldestCreatedAt === j1.createdAt && s.newestCreatedAt === j2.createdAt
    && s.oldestAgeMs === r.data.evaluatedAt - j1.createdAt && s.newestAgeMs === r.data.evaluatedAt - j2.createdAt && r.data.printerRevision === 1 && r.data.resumeAuthorized === false);
  before = await nativeState('qac-q-two'); r = await review(c1, 'qac-q-two', 1, 7);
  rec('D6 review of nonempty queue', '305', '409 queue_not_empty, no receipt, no job change', `${r.status} ${r.data?.error}`, r.status === 409 && r.data.error === 'queue_not_empty' && before === await nativeState('qac-q-two'));
  r = await queueGet(c1, 'qac-seed'); rec('D7 valid empty queue', '301', 'verified, count 0, ages null', `${r.data?.status} n${r.data?.summary?.pendingCount}`, r.data?.status === 'verified' && r.data.summary.pendingCount === 0 && r.data.summary.oldestAgeMs === null && r.data.summary.oldestCreatedAt === null);
  r = await call('GET', `/api/merchant/printers/queue?${q({ brandId: B, locationId: FL, printerId: 'qac-seed' })}`, { cookie: c1 }); rec('D8 queue read foreign location', '301', '403', `${r.status}`, r.status === 403);
  r = await call('GET', `/api/merchant/printers/queue?${q({ brandId: B, locationId: L, printerId: 'qac-seed', extra: '1' })}`, { cookie: c1 }); rec('D9 queue read unknown param', '301', '400', `${r.status}`, r.status === 400);
  r = await queueGet(c1, 'qac-missing'); rec('D10 queue read missing printer', '301', '404', `${r.status}`, r.status === 404);

  // ---------- E/F: receipt + resume (#305, #306) on qac-p1 (disabled, rev3) ----------
  await seedLedger('qac-p1'); await cap('qac-p1').create({ canary: true });
  let g = await queueGet(c1, 'qac-p1'); const P1 = g.data.printerRevision;
  before = await nativeState('qac-p1');
  r = await review(c1, 'qac-p1', P1, 1, { pendingCount: 0 }); rec('E1 client-asserted count field', '305', '400', `${r.status}`, r.status === 400);
  r = await review(c1, 'qac-p1', P1, 1, { decision: 'resume_all' }); rec('E2 unknown decision', '305', '400', `${r.status}`, r.status === 400);
  r = await review(c1, 'qac-p1', P1, 1, { issuedAt: Date.now() }); rec('E3 client timestamp field', '305', '400', `${r.status}`, r.status === 400);
  r = await review(c1, 'qac-p1', P1 - 1, 1); rec('E4 stale printer revision', '305', '409 record_conflict', `${r.status} ${r.data?.error}`, r.status === 409 && r.data.error === 'record_conflict');
  r = await review(c1, 'qac-p1', P1, 2); rec('E5 wrong queue revision', '305', '409 record_conflict', `${r.status} ${r.data?.error}`, r.status === 409 && r.data.error === 'record_conflict');
  r = await call('POST', '/api/merchant/printers/queue/review', { cookie: c1, origin: 'https://evil.example', body: { brandId: B, locationId: L, printerId: 'qac-p1', printerRevision: P1, queueRevision: 1, decision: 'resume_empty' } });
  rec('E6 review with foreign Origin', '305', '403', `${r.status}`, r.status === 403);
  rec('E7 rejected reviews left no trace', '305', 'state unchanged', '', before === await nativeState('qac-p1'));
  const rv1 = await review(c1, 'qac-p1', P1, 1); const T1 = rv1.data?.receipt; const H1 = T1 ? sha(T1) : '';
  const rdoc = H1 ? await snap(db.doc(`locations/${L}/printers/qac-p1/queueReviews/${H1}`)) : null;
  const radt = H1 ? await snap(db.doc(`locations/${L}/printers/qac-p1/queueReviewAudit/${H1}`)) : null;
  rec('E8 server-issued receipt', '305', '200, 43-char opaque receipt, resumeAuthorized false, expiresAt', `${rv1.status} len${T1?.length} resumeAuthorized:${rv1.data?.resumeAuthorized}`, rv1.status === 200 && /^[A-Za-z0-9_-]{43}$/.test(T1) && rv1.data.resumeAuthorized === false);
  rec('E9 native receipt binding', '305', 'hash-addressed, actor super1, scope, state disabled, P/Q, decision, TTL 120000, consumedAt null, no plaintext token', '',
    rdoc && rdoc.tokenHash === H1 && rdoc.actorId === a1 && rdoc.printerId === 'qac-p1' && rdoc.printerState === 'disabled' && rdoc.printerRevision === P1 && rdoc.queueRevision === 1
    && rdoc.decision === 'resume_empty' && rdoc.expiresAt - rdoc.issuedAt === 120000 && rdoc.consumedAt === null && !JSON.stringify(rdoc).includes(T1) && radt?.action === 'printer.queue_review_issued' && !JSON.stringify(radt).includes(T1));
  const afterIssue = JSON.parse(await nativeState('qac-p1'));
  rec('E10 issuance has no resume/job side effects', '305', 'printer still disabled rev P1, jobs 0, ledger unchanged', '', afterIssue.p.configuration.state === 'disabled' && afterIssue.p.revision === P1 && afterIssue.jobs === 0 && afterIssue.cap === true);
  before = await nativeState('qac-p1');
  r = await life(c2, 'qac-p1', P1, 'resume', { receipt: T1, queueRevision: 1 }); rec('F1 other superadmin uses receipt', '306', '409 queue_review_required, unchanged', `${r.status} ${r.data?.error}`, r.status === 409 && r.data.error === 'queue_review_required' && before === await nativeState('qac-p1'));
  r = await life(c1, 'qac-p1', P1, 'resume', { receipt: randomBytes(32).toString('base64url'), queueRevision: 1 }); rec('F2 fabricated receipt', '306', '409, unchanged', `${r.status} ${r.data?.error}`, r.status === 409 && before === await nativeState('qac-p1'));
  r = await life(c1, 'qac-p1', P1, 'resume', { receipt: T1, queueRevision: 2 }); rec('F3 wrong queue revision with valid receipt', '306', '409, unchanged', `${r.status} ${r.data?.error}`, r.status === 409 && before === await nativeState('qac-p1'));
  r = await life(c1, 'qac-p1', P1, 'resume'); rec('F4 resume without receipt (blind resume)', '298/306', '409 queue_review_required', `${r.status} ${r.data?.error}`, r.status === 409 && r.data.error === 'queue_review_required');
  r = await life(c1, 'qac-p1', P1, 'resume', { receipt: T1 }); rec('F5 receipt without queueRevision', '306', '400', `${r.status}`, r.status === 400);
  r = await life(c1, 'qac-p1', P1 - 1, 'resume', { receipt: T1, queueRevision: 1 }); rec('F6 stale printer revision on resume', '306', '409, unchanged', `${r.status}`, r.status === 409 && before === await nativeState('qac-p1'));
  const ledgerBefore = JSON.stringify(await snap(db.doc(`locations/${L}/printers/qac-p1/queue/state`)));
  const [x1, x2] = await Promise.all([life(c1, 'qac-p1', P1, 'resume', { receipt: T1, queueRevision: 1 }), life(c1, 'qac-p1', P1, 'resume', { receipt: T1, queueRevision: 1 })]);
  const after = JSON.parse(await nativeState('qac-p1')); const ra = await snap(db.doc(`locations/${L}/printers/qac-p1/audit/${P1 + 1}`));
  const consumed = await snap(db.doc(`locations/${L}/printers/qac-p1/queueReviews/${H1}`));
  rec('F7 concurrent consumption of one receipt', '306', 'exactly one 200 + one 409', `${x1.status}/${x2.status}`, [x1.status, x2.status].sort().join() === '200,409');
  rec('F8 atomic resume result', '306', `active rev ${P1 + 1}; receipt consumedAt set; audit printer.resume with queueReview; capability invalidated; ledger unchanged; 0 jobs`, `state ${after.p.configuration.state} rev${after.p.revision}`,
    after.p.configuration.state === 'active' && after.p.revision === P1 + 1 && Number.isSafeInteger(consumed.consumedAt) && ra?.action === 'printer.resume' && ra.actorId === a1 && ra.queueReview?.tokenHash === H1
    && after.cap === false && after.jobs === 0 && JSON.stringify(after.audit) === JSON.stringify([...Array(P1 + 1)].map((_, i) => String(i + 1)).sort()) && JSON.stringify(await snap(db.doc(`locations/${L}/printers/qac-p1/queue/state`))) === ledgerBefore);
  const okBody = (x1.status === 200 ? x1 : x2).data;
  rec('F9 resume response grants no dispatch authority', '306', 'only {item:{configuration,revision}}', Object.keys(okBody || {}).join(','), JSON.stringify(Object.keys(okBody)) === '["item"]' && !/dispatch|output|token|receipt/i.test(JSON.stringify(okBody)));
  before = await nativeState('qac-p1');
  r = await life(c1, 'qac-p1', P1 + 1, 'resume', { receipt: T1, queueRevision: 1 }); rec('F10 replay consumed receipt', '306', '409, unchanged', `${r.status} ${r.data?.error}`, r.status === 409 && before === await nativeState('qac-p1'));
  r = await review(c1, 'qac-p1', P1 + 1, 1); rec('F11 review on active printer', '305', '409', `${r.status}`, r.status === 409);

  // ---------- G: lifecycle (#298) on active qac-p1 ----------
  let R = P1 + 1;
  r = await call('PATCH', P(), { cookie: c1, body: { configuration: conf('qac-p1'), revision: R } }); rec('G1 config edit of active printer', '298', '409 (edit cannot bypass lifecycle)', `${r.status}`, r.status === 409);
  r = await call('PATCH', P(), { cookie: c1, body: { configuration: conf('qac-p1', { state: 'paused' }), revision: R } }); rec('G2 edit attempting state change', '298', '400', `${r.status}`, r.status === 400);
  r = await life(c1, 'qac-p1', R, 'pause'); rec('G3 pause active', '298', `200 paused rev${R + 1}`, `${r.status} ${r.data?.item?.configuration?.state} rev${r.data?.item?.revision}`, r.status === 200 && r.data.item.configuration.state === 'paused' && r.data.item.revision === R + 1); R++;
  r = await life(c1, 'qac-p1', R, 'pause'); rec('G4 pause already paused', '298', '409', `${r.status}`, r.status === 409);
  r = await life(c1, 'qac-p1', R - 1, 'deactivate'); rec('G5 stale deactivate', '298', '409', `${r.status}`, r.status === 409);
  r = await life(c1, 'qac-p1', R, 'deactivate'); rec('G6 deactivate paused', '298', `200 disabled rev${R + 1}`, `${r.status} ${r.data?.item?.configuration?.state}`, r.status === 200 && r.data.item.configuration.state === 'disabled'); R++;
  r = await life(c1, 'qac-p1', R, 'deactivate'); rec('G7 deactivate already disabled', '298', '409', `${r.status}`, r.status === 409);
  r = await life(c1, 'qac-p1', R, 'pause'); rec('G8 pause disabled', '298', '409', `${r.status}`, r.status === 409);
  r = await life(c1, 'qac-p1', R, 'archive'); rec('G9 unknown action', '298', '400', `${r.status}`, r.status === 400);
  r = await call('POST', '/api/merchant/printers/lifecycle', { cookie: c1, body: { brandId: B, locationId: FL, printerId: 'qac-p1', revision: R, action: 'delete' } }); rec('G10 delete with foreign location', '298', '403', `${r.status}`, r.status === 403);
  const totalBefore = (await list(c1)).data.totalPrinters;
  const reviewsBefore = await count(`locations/${L}/printers/qac-p1/queueReviews`);
  r = await life(c1, 'qac-p1', R, 'delete'); const tomb = await snap(pdoc('qac-p1'));
  rec('G11 soft-delete', '298', `200 {deleted:true, printerId, revision ${R + 1}}`, `${r.status} ${r.text}`, r.status === 200 && r.data.deleted === true && r.data.printerId === 'qac-p1' && r.data.revision === R + 1); R++;
  const auditsNow = (await db.collection(`locations/${L}/printers/qac-p1/audit`).get()).docs.map(d => d.data());
  rec('G12 tombstone keeps identity/history', '298', 'doc exists, deletedAt Timestamp, state disabled, full audit chain incl. printer.delete, receipts + ledger retained', `audits ${auditsNow.length}`,
    tomb && tomb.deletedAt instanceof Timestamp && tomb.configuration.state === 'disabled' && tomb.configuration.id === 'qac-p1' && auditsNow.length === R && auditsNow.some(a => a.action === 'printer.delete' && a.deleted === true)
    && (await count(`locations/${L}/printers/qac-p1/queueReviews`)) === reviewsBefore && !!(await snap(db.doc(`locations/${L}/printers/qac-p1/queue/state`))));
  r = await detail(c1, 'qac-p1'); rec('G13 detail of deleted printer', '298', '404', `${r.status}`, r.status === 404);
  r = await list(c1); rec('G14 list excludes deleted; total decremented', '298/361', `total ${totalBefore - 1}`, `total ${r.data?.totalPrinters} ids ${r.data?.items?.map(i => i.configuration.id).includes('qac-p1')}`, r.data.totalPrinters === totalBefore - 1 && !r.data.items.some(i => i.configuration.id === 'qac-p1'));
  before = await nativeState('qac-p1');
  r = await call('POST', P(), { cookie: c1, body: { configuration: conf('qac-p1') } }); rec('G15 re-create deleted printer id', '298', '409, tombstone unchanged', `${r.status} ${r.data?.error}`, r.status === 409 && before === await nativeState('qac-p1'));
  r = await call('PATCH', P(), { cookie: c1, body: { configuration: conf('qac-p1'), revision: R } }); rec('G16 edit deleted printer', '298', '404', `${r.status}`, r.status === 404);
  for (const act of ['pause', 'deactivate', 'delete', 'resume']) { r = await life(c1, 'qac-p1', R, act); rec(`G17 ${act} on deleted printer`, '298', '404', `${r.status}`, r.status === 404); }
  r = await queueGet(c1, 'qac-p1'); rec('G18 queue read deleted printer', '298', '404', `${r.status}`, r.status === 404);
  rec('G19 deleted-printer attempts unchanged native', '298', 'unchanged', '', before === await nativeState('qac-p1'));
  // delete of an active printer directly + no hard delete of jobs
  await seedPrinter('qac-active', 'active'); await seedLedger('qac-active');
  r = await life(c1, 'qac-active', 1, 'delete'); rec('G20 delete active printer', '298', '200 tombstone disabled', `${r.status}`, r.status === 200 && (await snap(pdoc('qac-active'))).configuration.state === 'disabled');
  r = await life(c1, 'qac-q-two', 1, 'delete'); rec('G21 soft-delete keeps job references', '298', '200, 2 jobs still present', `${r.status} jobs ${await count(`locations/${L}/printers/qac-q-two/jobs`)}`, r.status === 200 && (await count(`locations/${L}/printers/qac-q-two/jobs`)) === 2);

  // ---------- F extra: expiry, stale P/Q after issue, revocation, rollback, double receipts ----------
  for (const id of ['qac-exp', 'qac-stale-p', 'qac-stale-q', 'qac-rev', 'qac-rb', 'qac-two-r', 'qac-paused']) { await seedPrinter(id, id === 'qac-paused' ? 'paused' : 'disabled'); await seedLedger(id); }
  const tExp = (await review(c1, 'qac-exp', 1, 1)).data.receipt;
  const tSP = (await review(c1, 'qac-stale-p', 1, 1)).data.receipt;
  r = await call('PATCH', P(), { cookie: c1, body: { configuration: conf('qac-stale-p', { name: 'moved' }), revision: 1 } });
  before = await nativeState('qac-stale-p');
  r = await life(c1, 'qac-stale-p', 2, 'resume', { receipt: tSP, queueRevision: 1 }); rec('F12 receipt after printer edited (stale printer revision)', '306', '409 queue_review_required, receipt unconsumed', `${r.status} ${r.data?.error}`, r.status === 409 && before === await nativeState('qac-stale-p'));
  const tSQ = (await review(c1, 'qac-stale-q', 1, 1)).data.receipt;
  await db.doc(`locations/${L}/printers/qac-stale-q/queue/state`).update({ revision: 2 });
  before = await nativeState('qac-stale-q');
  r = await life(c1, 'qac-stale-q', 1, 'resume', { receipt: tSQ, queueRevision: 1 }); rec('F13 queue advanced after review (stale queue revision)', '306', '409 queue_review_blocked, unchanged', `${r.status} ${r.data?.error}`, r.status === 409 && before === await nativeState('qac-stale-q'));
  const tRB = (await review(c1, 'qac-rb', 1, 1)).data.receipt;
  await db.doc(`locations/${L}/printers/qac-rb/audit/2`).create({ canary: 'collision' }); await cap('qac-rb').create({ canary: true });
  before = await nativeState('qac-rb');
  r = await life(c1, 'qac-rb', 1, 'resume', { receipt: tRB, queueRevision: 1 }); rec('F14 real commit rollback (audit collision)', '306', '503; receipt unconsumed; printer disabled rev1; capability kept', `${r.status} ${r.text}`, r.status === 503 && before === await nativeState('qac-rb'));
  const [tA, tB] = [(await review(c1, 'qac-two-r', 1, 1)).data.receipt, (await review(c1, 'qac-two-r', 1, 1)).data.receipt];
  const ra1 = await life(c1, 'qac-two-r', 1, 'resume', { receipt: tA, queueRevision: 1 }); const rb1 = await life(c1, 'qac-two-r', 2, 'resume', { receipt: tB, queueRevision: 1 });
  rec('F15 two receipts for same P/Q', '306', 'first 200; second 409 (bound to old revision), not consumed', `${ra1.status}/${rb1.status}`, ra1.status === 200 && rb1.status === 409 && (await snap(db.doc(`locations/${L}/printers/qac-two-r/queueReviews/${sha(tB)}`))).consumedAt === null);
  const rp = await review(c1, 'qac-paused', 1, 1); const rp2 = await life(c1, 'qac-paused', 1, 'resume', { receipt: rp.data?.receipt, queueRevision: 1 });
  rec('F16 resume from paused with valid receipt', '306', '200 active rev2', `${rp.status}/${rp2.status} ${rp2.data?.item?.configuration?.state}`, rp.status === 200 && rp2.status === 200 && rp2.data.item.configuration.state === 'active' && rp2.data.item.revision === 2);
  const tRev = (await review(c2, 'qac-rev', 1, 1)).data.receipt;
  const pol = (await db.doc('platformAdminControl/access-v1').get()).data();
  pol.memberships = pol.memberships.map(x => x.id === 'qac-owner-2' ? { ...x, active: false } : x);
  await db.doc('platformAdminControl/access-v1').set(pol);
  before = await nativeState('qac-rev');
  r = await life(c2, 'qac-rev', 1, 'resume', { receipt: tRev, queueRevision: 1 }); rec('F17 access revoked after issuance', '306', '403, receipt unconsumed, printer unchanged', `${r.status}`, r.status === 403 && before === await nativeState('qac-rev'));
  r = await review(c2, 'qac-seed', 1, 1); rec('F18 revoked actor cannot issue', '305', '403', `${r.status}`, r.status === 403);
  // natural expiry: wait past the 120s TTL of the receipt issued above
  const expDoc = await snap(db.doc(`locations/${L}/printers/qac-exp/queueReviews/${sha(tExp)}`));
  const wait = expDoc.expiresAt - Date.now() + 1500; if (wait > 0) await sleep(wait);
  before = await nativeState('qac-exp');
  r = await life(c1, 'qac-exp', 1, 'resume', { receipt: tExp, queueRevision: 1 }); rec('F19 natural expiry (>120s)', '306', '409 queue_review_blocked, unconsumed, unchanged', `${r.status} ${r.data?.error} waited ${Math.round(wait / 1000)}s`, r.status === 409 && r.data.error === 'queue_review_blocked' && before === await nativeState('qac-exp'));

  // ---------- H: overview total independent of model filter (#361 data part) ----------
  r = await list(c1, { model: 'mc-print2' }); const all = await list(c1);
  const nonDeleted = (await db.collection(`locations/${L}/printers`).where('deletedAt', '==', null).get()).size;
  rec('H1 totalPrinters ignores model filter and counts non-deleted', '361', `total = native non-deleted (${nonDeleted}) for both`, `${r.data?.totalPrinters}/${all.data?.totalPrinters}`, r.data.totalPrinters === nonDeleted && all.data.totalPrinters === nonDeleted && r.data.items.every(i => i.configuration.model === 'mc-print2'));

  // global invariants
  rec('Z1 Cache-Control no-store + Vary Cookie on every API response', 'all', '0 violations', `${headerViolations}`, headerViolations === 0);
  let jobsCreated = 0; for (const id of ['qac-p1', 'qac-p2', 'qac-paused', 'qac-two-r', 'qac-active', 'qac-seed']) jobsCreated += await count(`locations/${L}/printers/${id}/jobs`);
  rec('Z2 no print job created by any operation (resume included)', '306', '0 jobs', `${jobsCreated}`, jobsCreated === 0);
  await retryCases({ c1, c2, a2 });
  return [s1.uid, s2.uid, m.uid];
}

// ---------------- QA3b: observed SDK retry, barrier-controlled fresh reads, same-lifetime repeat ----------------
const OBS = process.env.QA_OBSERVER_DIR;
const ofile = n => require('node:path').join(OBS, n);
const fsx = require('node:fs');
const obsLines = () => { try { return fsx.readFileSync(ofile('attempts.log'), 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch { return []; } };
async function waitFile(name, ms) { const until = Date.now() + ms; while (Date.now() < until) { if (fsx.existsSync(ofile(name))) return true; await sleep(50); } return false; }
// Holds a REAL Firestore transaction with a read lock on `docPath` until `done` resolves (genuine contention source).
function holdReadLock(docPath, done) {
  let locked; const lockedP = new Promise(r => locked = r); let n = 0;
  const p = db.runTransaction(async tx => { n++; await tx.get(db.doc(docPath)); locked(); await done; }).then(() => 'committed', e => 'error ' + (e.code ?? ''));
  return { lockedP, p, attempts: () => n };
}
async function barrierCase(id, printerPath, fire, between) {
  for (const f of ['barrier', 'release', 'attempt2-waiting']) fsx.rmSync(ofile(f), { force: true });
  fsx.writeFileSync(ofile('target'), printerPath); fsx.writeFileSync(ofile('barrier'), '1');
  const before = obsLines().length;
  let finish; const done = new Promise(r => finish = r);
  const holder = holdReadLock(printerPath, done); await holder.lockedP;
  const req = fire();
  const reached = await waitFile('attempt2-waiting', 25000);
  finish(); const holderResult = await holder.p;
  if (reached && between) await between();
  fsx.writeFileSync(ofile('release'), '1');
  const response = await req;
  await sleep(300);
  fsx.rmSync(ofile('target'), { force: true }); fsx.rmSync(ofile('barrier'), { force: true });
  const mine = obsLines().slice(before).filter(l => l.matched);
  return { reached, holderResult, response, mine };
}
async function retryCases({ c1, c2, a2 }) {
  // R0 natural (no barrier): two concurrent real resumes with one receipt; report observed attempt counts honestly
  await seedPrinter('qac-r-nat'); await seedLedger('qac-r-nat');
  const tn = (await review(c1, 'qac-r-nat', 1, 1)).data.receipt;
  fsx.writeFileSync(ofile('target'), `locations/${L}/printers/qac-r-nat`); const b0 = obsLines().length;
  const [n1, n2] = await Promise.all([life(c1, 'qac-r-nat', 1, 'resume', { receipt: tn, queueRevision: 1 }), life(c1, 'qac-r-nat', 1, 'resume', { receipt: tn, queueRevision: 1 })]);
  await sleep(300); fsx.rmSync(ofile('target'), { force: true });
  const nat = obsLines().slice(b0).filter(l => l.matched);
  rec('R0 natural contention, two concurrent resumes, no barrier (informational)', '374', 'one 200 + one 409; attempt counts reported as observed', `${n1.status}/${n2.status} attempts=${JSON.stringify(nat.map(l => l.attempts))}`, [n1.status, n2.status].sort().join() === '200,409');
  // R1 genuine contention -> SDK retry -> fresh read -> single commit
  await seedPrinter('qac-r-ok'); await seedLedger('qac-r-ok');
  const tok = (await review(c1, 'qac-r-ok', 1, 1)).data.receipt;
  const r1 = await barrierCase('R1', `locations/${L}/printers/qac-r-ok`, () => life(c1, 'qac-r-ok', 1, 'resume', { receipt: tok, queueRevision: 1 }));
  const p1 = await snap(pdoc('qac-r-ok')); const au1 = (await db.collection(`locations/${L}/printers/qac-r-ok/audit`).get()).docs.map(d => d.data().action);
  rec('R1 real contention: SAME resume request retried by SDK, then committed once', '374/306', 'attempt-2 barrier reached; observer attempts=2 committed; 200; rev2 active; exactly one printer.resume audit; receipt consumed once',
    `reached=${r1.reached} holder=${r1.holderResult} obs=${JSON.stringify(r1.mine)} status=${r1.response.status} rev${p1.revision} audits=${au1.join(',')}`,
    r1.reached && r1.mine.length === 1 && r1.mine[0].attempts === 2 && r1.mine[0].outcome === 'committed' && r1.response.status === 200 && p1.revision === 2 && p1.configuration.state === 'active'
    && au1.filter(a => a === 'printer.resume').length === 1 && Number.isSafeInteger((await snap(db.doc(`locations/${L}/printers/qac-r-ok/queueReviews/${sha(tok)}`))).consumedAt));
  // R2 fresh read between attempts: queue revision advanced while attempt 2 is held -> stale queue rejected
  await seedPrinter('qac-r-stale'); await seedLedger('qac-r-stale');
  const tst = (await review(c1, 'qac-r-stale', 1, 1)).data.receipt;
  const r2 = await barrierCase('R2', `locations/${L}/printers/qac-r-stale`, () => life(c1, 'qac-r-stale', 1, 'resume', { receipt: tst, queueRevision: 1 }),
    () => db.doc(`locations/${L}/printers/qac-r-stale/queue/state`).update({ revision: 2 }));
  const p2 = await snap(pdoc('qac-r-stale')); const rv2 = await snap(db.doc(`locations/${L}/printers/qac-r-stale/queueReviews/${sha(tst)}`));
  rec('R2 queue changed between attempts: attempt 2 re-reads and fails closed', '374/306', 'attempts=2; 409 queue_review_blocked; printer disabled rev1; receipt unconsumed',
    `reached=${r2.reached} obs=${JSON.stringify(r2.mine)} status=${r2.response.status} ${r2.response.data?.error}`,
    r2.reached && r2.mine.length === 1 && r2.mine[0].attempts === 2 && r2.response.status === 409 && r2.response.data?.error === 'queue_review_blocked' && p2.revision === 1 && p2.configuration.state === 'disabled' && rv2.consumedAt === null);
  // R3 access revoked between attempts (restore super2 first; core F17 revoked it)
  const ref = db.doc('platformAdminControl/access-v1'); let pol = (await ref.get()).data();
  pol.memberships = pol.memberships.map(x => x.id === 'qac-owner-2' ? { ...x, active: true } : x); await ref.set(pol);
  await seedPrinter('qac-r-rev'); await seedLedger('qac-r-rev');
  const trv = (await review(c2, 'qac-r-rev', 1, 1)).data?.receipt;
  const r3 = await barrierCase('R3', `locations/${L}/printers/qac-r-rev`, () => life(c2, 'qac-r-rev', 1, 'resume', { receipt: trv, queueRevision: 1 }),
    async () => { const p = (await ref.get()).data(); p.memberships = p.memberships.map(x => x.id === 'qac-owner-2' ? { ...x, active: false } : x); await ref.set(p); });
  const p3 = await snap(pdoc('qac-r-rev')); const rv3 = trv ? await snap(db.doc(`locations/${L}/printers/qac-r-rev/queueReviews/${sha(trv)}`)) : null;
  rec('R3 native access revoked between attempts: attempt 2 re-authorizes and is denied', '374/306', 'receipt issued; attempts=2; 403; printer disabled rev1; receipt unconsumed',
    `issued=${!!trv} reached=${r3.reached} obs=${JSON.stringify(r3.mine)} status=${r3.response.status}`,
    !!trv && r3.reached && r3.mine.length === 1 && r3.mine[0].attempts === 2 && r3.mine[0].outcome === 'error' && r3.response.status === 403 && p3.revision === 1 && p3.configuration.state === 'disabled' && rv3?.consumedAt === null);
  // R4 lifecycle (deactivate) and config edit retry with single audit
  await seedPrinter('qac-r-edit');
  const r4 = await barrierCase('R4', `locations/${L}/printers/qac-r-edit`, () => call('PATCH', P(), { cookie: c1, body: { configuration: conf('qac-r-edit', { name: 'retried edit' }), revision: 1 } }));
  const p4 = await snap(pdoc('qac-r-edit')); const au4 = (await db.collection(`locations/${L}/printers/qac-r-edit/audit`).get()).size;
  rec('R4 config edit retried by SDK commits exactly once', '374/296', 'attempts=2; 200; rev2; exactly 1 audit', `reached=${r4.reached} obs=${JSON.stringify(r4.mine)} status=${r4.response.status} rev${p4.revision} audits=${au4}`,
    r4.reached && r4.mine.length === 1 && r4.mine[0].attempts === 2 && r4.response.status === 200 && p4.revision === 2 && p4.configuration.name === 'retried edit' && au4 === 1);
}

// ---------------- cleanup of exactly the declared disposable namespace ----------------
const DECLARED = ['platformAdminControl/access-v1', `brands/${B}`, `brands/${FB}`, `locations/${L}`, `locations/${L2}`, `locations/${FL}`];
async function cleanupAndVerify(uids, label) {
  for (const p of DECLARED) await db.recursiveDelete(db.doc(p));
  for (const uid of uids) { const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:delete`, { method: 'POST', headers: { authorization: 'Bearer owner', 'content-type': 'application/json' }, body: JSON.stringify({ localId: uid }) }); if (!r.ok) throw Error('auth delete failed'); }
  const remainingDocs = []; for (const p of DECLARED) { if ((await db.doc(p).get()).exists) remainingDocs.push(p); if ((await db.doc(p).listCollections()).length) remainingDocs.push(p + '/*'); }
  const rootCollections = (await db.listCollections()).map(c => c.id);
  const lookup = await (await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`, { method: 'POST', headers: { authorization: 'Bearer owner', 'content-type': 'application/json' }, body: JSON.stringify({ localId: uids }) })).json();
  const usersLeft = (lookup.users ?? []).length;
  rec(`C ${label} cleanup: declared docs, subcollections and Auth users absent; emulator root empty`, '374', 'no declared doc/subcollection, 0 users, root collections []', `docs=${JSON.stringify(remainingDocs)} root=${JSON.stringify(rootCollections)} users=${usersLeft}`,
    remainingDocs.length === 0 && usersLeft === 0 && rootCollections.length === 0);
}

(async () => {
  const started = new Date().toISOString();
  if (!fsx.existsSync(ofile('observer-loaded'))) throw Error('observer not loaded in app');
  const pre = (await db.listCollections()).map(c => c.id);
  rec('C0 emulator empty before pass 1', '374', 'root collections []', JSON.stringify(pre), pre.length === 0);
  for (PASS = 1; PASS <= 2; PASS++) { const uids = await corePass(); await cleanupAndVerify(uids, `pass ${PASS}`); }
  PASS = 'all';
  const obs = obsLines();
  rec('O1 observer saw transactions in the real app process', '374', '>0 transactions logged; only counts/outcomes', `${obs.length} tx, retried(attempts>=2)=${obs.filter(l => l.attempts >= 2).length}`, obs.length > 0);
  const failed = results.filter(x => !x.pass);
  console.log(JSON.stringify({ environment: 'QA0a demo-orderfly-qa0, real Next app + Auth/Firestore emulators, ONE emulator/app lifetime, two full passes', started, finished: new Date().toISOString(), total: results.length, passed: results.length - failed.length, failed: failed.length, results }));
  await db.terminate();
})().catch(e => { console.log(JSON.stringify({ fatal: String(e && e.message), results })); process.exitCode = 1; });
