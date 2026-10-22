'use strict';
// Final printer QA driver (HTTP + native readback) against the accepted QA0a stack.
// Runs ONLY against demo-orderfly-qa0 loopback emulators. Credentials, cookies and
// receipts stay in memory; only case ids, statuses and boolean invariants are printed.
const ROOT = process.env.QA_ROOT;
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

// ================= #344 activity metadata acceptance (isolated real app/auth/persistence + Chromium) =================
const fsx = require('node:fs'), pth = require('node:path');
const { chromium } = rq('playwright');
const SHOTS = pth.join(__dirname, 'shots'); fsx.mkdirSync(SHOTS, { recursive: true });
const mdoc = (id, loc = L) => db.doc(`locations/${loc}/printers/${id}/statusMetadata/current`);
const full = async (id, loc = L) => JSON.stringify({ p: await snap(pdoc(id, loc)), m: await snap(mdoc(id, loc)),
  a: (await db.collection(`locations/${loc}/printers/${id}/audit`).get()).docs.map(d => d.id).sort(),
  r: (await db.collection(`locations/${loc}/printers/${id}/queueReviews`).get()).docs.map(d => [d.id, d.data().consumedAt]) });
const rowOf = (resp, id) => resp.data?.items?.find(i => i.configuration.id === id);
const actOk = a => a && JSON.stringify(Object.keys(a).sort()) === '["activatedAt","lastConfirmedPrintAt","printHistory"]';
const metaBase = (id, o = {}) => ({ schemaVersion: 1, brandId: B, locationId: L, printerId: id, activatedAt: null, activationRevision: null, printHistory: 'unknown', lastConfirmedPrintAt: null, lastConfirmedJobId: null, ...o });
async function resumeFlow(cookie, id) {
  const g = await queueGet(cookie, id); const P0 = g.data?.printerRevision, Q0 = g.data?.queueRevision;
  const rv = await review(cookie, id, P0, Q0); return { P0, Q0, receipt: rv.data?.receipt, rv };
}
(async () => {
  const started = new Date().toISOString();
  const pre = (await db.listCollections()).map(c => c.id); rec('C0 emulator empty', '344', '[]', JSON.stringify(pre), pre.length === 0);
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
  for (const [id, brand, name] of [[L, B, 'QAC Amager'], [L2, B, 'QAC Vesterbro'], [FL, FB, 'QAC Aarhus']]) b.create(db.doc(`locations/${id}`), { id, brandId: brand, name, isActive: true });
  await b.commit();
  const [c1, c2, cm] = await Promise.all([session(s1.idToken), session(s2.idToken), session(m.idToken)]);

  // S1 new DISABLED printer via real API
  let r = await call('POST', P(), { cookie: c1, body: { configuration: conf('qm-new', { name: 'Ny printer' }) } });
  let md = await snap(mdoc('qm-new'));
  rec('S1a create writes initial activity atomically', '344', '201; statusMetadata {activatedAt null, activationRevision null, printHistory never, lastConfirmed* null}; audit/1', `${r.status} ${JSON.stringify(md)}`,
    r.status === 201 && JSON.stringify(md) === JSON.stringify(metaBase('qm-new', { printHistory: 'never' })) && !!(await snap(db.doc(`locations/${L}/printers/qm-new/audit/1`))));
  r = await list(c1); let row = rowOf(r, 'qm-new');
  rec('S1b overview projection for new printer', '344', 'activity {activatedAt null, lastConfirmedPrintAt null, printHistory never}; exactly 3 keys; no job id', JSON.stringify(row?.activity),
    r.status === 200 && actOk(row?.activity) && row.activity.activatedAt === null && row.activity.lastConfirmedPrintAt === null && row.activity.printHistory === 'never' && !/lastConfirmedJobId|activationRevision/.test(r.text));
  // S2 legacy printer without activity doc
  await seedPrinter('qm-legacy', 'disabled', L, B, 3);
  r = await list(c1); row = rowOf(r, 'qm-legacy');
  rec('S2a legacy printer without metadata', '344', 'unknown/null/null', JSON.stringify(row?.activity), row?.activity?.printHistory === 'unknown' && row.activity.activatedAt === null && row.activity.lastConfirmedPrintAt === null);
  r = await call('PATCH', P(), { cookie: c1, body: { configuration: conf('qm-legacy', { name: 'Legacy redigeret' }), revision: 3 } });
  const lrow = rowOf(await list(c1), 'qm-legacy');
  rec('S2b ordinary edit of legacy printer invents nothing', '344', '200 rev4; no statusMetadata doc created; still unknown/null (createdAt not used)', `${r.status} doc=${JSON.stringify(await snap(mdoc('qm-legacy')))} ${JSON.stringify(lrow?.activity)}`,
    r.status === 200 && !(await snap(mdoc('qm-legacy'))) && lrow?.activity?.printHistory === 'unknown' && lrow.activity.activatedAt === null);
  r = await call('PATCH', P(), { cookie: c1, body: { configuration: conf('qm-new', { name: 'Ny printer 2' }), revision: 1 } });
  rec('S2c edit of new printer keeps never', '344', 'statusMetadata unchanged (never)', JSON.stringify(await snap(mdoc('qm-new'))), r.status === 200 && JSON.stringify(await snap(mdoc('qm-new'))) === JSON.stringify(metaBase('qm-new', { printHistory: 'never' })));
  // S3 authorized resume -> atomic activation metadata
  await seedLedger('qm-new'); let f = await resumeFlow(c1, 'qm-new'); const t0 = Date.now();
  r = await life(c1, 'qm-new', f.P0, 'resume', { receipt: f.receipt, queueRevision: f.Q0 }); const t1 = Date.now();
  md = await snap(mdoc('qm-new')); const pr = await snap(pdoc('qm-new')); const au = await snap(db.doc(`locations/${L}/printers/qm-new/audit/${f.P0 + 1}`));
  rec('S3a resume commits activation with printer revision + audit', '344', `200; activationRevision=${f.P0 + 1}=printer revision; activatedAt server time within request; printHistory stays never; audit printer.resume`,
    `${r.status} ${JSON.stringify({ ...md, activatedAt: md?.activatedAt ? 'set' : md?.activatedAt })} rev${pr.revision}`,
    r.status === 200 && md.activationRevision === pr.revision && pr.revision === f.P0 + 1 && md.activatedAt >= t0 - 1000 && md.activatedAt <= t1 + 1000 && md.printHistory === 'never' && md.lastConfirmedPrintAt === null && au?.action === 'printer.resume');
  row = rowOf(await list(c1), 'qm-new');
  rec('S3b overview shows activation', '344', 'activatedAt = stored value; never', JSON.stringify(row?.activity), row?.activity?.activatedAt === md.activatedAt && row.activity.printHistory === 'never');
  // legacy resume keeps unknown
  await seedLedger('qm-legacy'); f = await resumeFlow(c1, 'qm-legacy');
  r = await life(c1, 'qm-legacy', f.P0, 'resume', { receipt: f.receipt, queueRevision: f.Q0 }); md = await snap(mdoc('qm-legacy'));
  rec('S3c legacy resume: activation set, history stays unknown', '344', '200; printHistory unknown; activationRevision = new rev', `${r.status} ${md?.printHistory} rev${md?.activationRevision}`, r.status === 200 && md.printHistory === 'unknown' && md.activationRevision === f.P0 + 1 && md.activatedAt > 0);
  // confirmed metadata preserved on resume (ISOLATED SEEDED DATA, not a physical acknowledgement)
  const CONF_AT = Date.UTC(2026, 9, 21, 22, 30, 0), JOB = 'a'.repeat(64);
  await seedPrinter('qm-conf', 'disabled', L, B, 2); await mdoc('qm-conf').create(metaBase('qm-conf', { printHistory: 'confirmed', lastConfirmedPrintAt: CONF_AT, lastConfirmedJobId: JOB }));
  await seedLedger('qm-conf'); f = await resumeFlow(c1, 'qm-conf');
  r = await life(c1, 'qm-conf', f.P0, 'resume', { receipt: f.receipt, queueRevision: f.Q0 }); md = await snap(mdoc('qm-conf'));
  rec('S3d resume preserves existing confirmed use (seeded fixture)', '344', 'lastConfirmedPrintAt/jobId/printHistory confirmed unchanged; activation set', `${r.status} ${md?.printHistory} ${md?.lastConfirmedPrintAt === CONF_AT}`, r.status === 200 && md.printHistory === 'confirmed' && md.lastConfirmedPrintAt === CONF_AT && md.lastConfirmedJobId === JOB && md.activationRevision === f.P0 + 1);
  row = rowOf(await list(c1), 'qm-conf');
  rec('S3e confirmed projection hides job id', '344', 'confirmed + timestamp, no lastConfirmedJobId in DTO', JSON.stringify(row?.activity), actOk(row?.activity) && row.activity.printHistory === 'confirmed' && row.activity.lastConfirmedPrintAt === CONF_AT);
  // S4 failures leave nothing partial
  await seedPrinter('qm-fail'); await seedLedger('qm-fail'); f = await resumeFlow(c1, 'qm-fail');
  let before = await full('qm-fail');
  r = await life(c1, 'qm-fail', f.P0 + 1, 'resume', { receipt: f.receipt, queueRevision: f.Q0 }); rec('S4a stale printer revision', '344', '409, nothing changed (no metadata doc)', `${r.status}`, r.status === 409 && before === await full('qm-fail'));
  r = await life(c1, 'qm-fail', f.P0, 'resume', { receipt: randomBytes(32).toString('base64url'), queueRevision: f.Q0 }); rec('S4b fabricated receipt', '344', '409, nothing changed', `${r.status}`, r.status === 409 && before === await full('qm-fail'));
  r = await life(c2, 'qm-fail', f.P0, 'resume', { receipt: f.receipt, queueRevision: f.Q0 }); rec('S4c other superadmin uses receipt', '344', '409, nothing changed', `${r.status}`, r.status === 409 && before === await full('qm-fail'));
  r = await call('POST', '/api/merchant/printers/lifecycle', { cookie: c1, body: { brandId: B, locationId: FL, printerId: 'qm-fail', revision: f.P0, action: 'resume', receipt: f.receipt, queueRevision: f.Q0 } }); rec('S4d wrong scope', '344', '403, nothing changed', `${r.status}`, r.status === 403 && before === await full('qm-fail'));
  await db.doc(`locations/${L}/printers/qm-fail/audit/${f.P0 + 1}`).create({ canary: 'collision' }); before = await full('qm-fail');
  r = await life(c1, 'qm-fail', f.P0, 'resume', { receipt: f.receipt, queueRevision: f.Q0 }); rec('S4e real commit failure (audit collision)', '344', '503; no metadata doc, printer, receipt, audit unchanged', `${r.status} meta=${JSON.stringify(await snap(mdoc('qm-fail')))}`, r.status === 503 && before === await full('qm-fail') && !(await snap(mdoc('qm-fail'))));
  await db.doc(`locations/${L}/printers/qm-fail/audit/${f.P0 + 1}`).delete();
  const ref = db.doc('platformAdminControl/access-v1'); let pol = (await ref.get()).data();
  const f2 = await resumeFlow(c2, 'qm-fail');
  pol.memberships = pol.memberships.map(x => x.id === 'qac-owner-2' ? { ...x, active: false } : x); await ref.set(pol); before = await full('qm-fail');
  r = await life(c2, 'qm-fail', f2.P0, 'resume', { receipt: f2.receipt, queueRevision: f2.Q0 }); rec('S4f revoked access after review', '344', '403, nothing changed', `${r.status}`, f2.receipt && r.status === 403 && before === await full('qm-fail'));
  pol.memberships = pol.memberships.map(x => x.id === 'qac-owner-2' ? { ...x, active: true } : x); await ref.set(pol);
  // S5 concurrent overview reads during resume
  await seedPrinter('qm-race'); await seedLedger('qm-race'); f = await resumeFlow(c1, 'qm-race');
  const reads = [...Array(12)].map((_, i) => sleep(i * 40).then(() => list(c1)));
  const [rr, ...lists] = await Promise.all([life(c1, 'qm-race', f.P0, 'resume', { receipt: f.receipt, queueRevision: f.Q0 }), ...reads]);
  const bad = lists.filter(x => x.status !== 200).map(x => x.status);
  const incoherent = lists.filter(x => x.status === 200).map(x => rowOf(x, 'qm-race')).filter(x => !x || (x.configuration.state === 'active') !== (x.activity.activatedAt !== null));
  rec('S5 overview reads concurrent with resume are snapshot-consistent', '344', 'resume 200; all 12 reads 200; each row either disabled+no activation or active+activation', `resume ${rr.status} non200=${JSON.stringify(bad)} incoherent=${incoherent.length} states=${lists.map(x => rowOf(x, 'qm-race')?.configuration.state?.[0]).join('')}`,
    rr.status === 200 && bad.length === 0 && incoherent.length === 0);
  // S7 malformed / foreign / future / inconsistent metadata fail closed (L2 isolated location)
  const variants = [
    ['extra field', id => metaBase(id, { locationId: L2, secret: 'x' })], ['foreign printerId', id => metaBase('someone-else', { locationId: L2 })],
    ['future activatedAt (+5min)', id => metaBase(id, { locationId: L2, activatedAt: Date.now() + 300000, activationRevision: 1 })],
    ['activation without revision', id => metaBase(id, { locationId: L2, activatedAt: 1000, activationRevision: null })],
    ['activationRevision > printer revision', id => metaBase(id, { locationId: L2, activatedAt: 1000, activationRevision: 9 })],
    ['confirmed without job id', id => metaBase(id, { locationId: L2, printHistory: 'confirmed', lastConfirmedPrintAt: 1000 })],
    ['never with timestamp', id => metaBase(id, { locationId: L2, printHistory: 'never', lastConfirmedPrintAt: 1000, lastConfirmedJobId: JOB })]];
  for (const [name, make] of variants) {
    const id = 'qm-bad'; await seedPrinter(id, 'disabled', L2); await mdoc(id, L2).create(make(id));
    const x = await call('GET', `${P()}?${q({ brandId: B, locationId: L2, overview: 'true' })}`, { cookie: c1 });
    rec(`S7 metadata ${name}`, '344', '503 printers_unavailable; nothing leaked', `${x.status} ${x.text.slice(0, 60)}`, x.status === 503 && !/secret|someone-else/.test(x.text));
    await db.recursiveDelete(pdoc(id, L2));
  }
  await seedPrinter('qm-skew', 'disabled', L2); await mdoc('qm-skew', L2).create(metaBase('qm-skew', { locationId: L2, activatedAt: Date.now() + 20000, activationRevision: 1 }));
  r = await call('GET', `${P()}?${q({ brandId: B, locationId: L2, overview: 'true' })}`, { cookie: c1 });
  rec('S7 small server clock skew (+20s) tolerated', '344', '200', r.status, r.status === 200);
  await db.recursiveDelete(pdoc('qm-skew', L2));
  r = await list(cm); rec('S7 ordinary merchant overview', '344', '403', r.status, r.status === 403);
  r = await call('GET', `${P()}?${q({ brandId: B, locationId: FL, overview: 'true' })}`, { cookie: c1 }); rec('S7 foreign location overview', '344', '403', r.status, r.status === 403);
  // S7b bounded: more than one page -> only returned rows carry activity
  for (let i = 0; i < 21; i++) await seedPrinter(`qm-pg-${String(i).padStart(2, '0')}`, 'disabled', L2);
  r = await call('GET', `${P()}?${q({ brandId: B, locationId: L2, overview: 'true' })}`, { cookie: c1 });
  rec('S7c pagination unchanged with metadata', '344', '200; 20 items each with activity; nextCursor; total 21', `${r.status} n=${r.data?.items?.length} cursor=${!!r.data?.nextCursor} total=${r.data?.totalPrinters}`,
    r.status === 200 && r.data.items.length === 20 && r.data.items.every(i => actOk(i.activity)) && !!r.data.nextCursor && r.data.totalPrinters === 21);

  for (let i = 0; i < 21; i++) await db.recursiveDelete(pdoc(`qm-pg-${String(i).padStart(2, '0')}`, L2)); // pagination fixture done; keep browser page 1 on Amager rows
  // ---------- Browser (S1/S2/S3/S6/S8) ----------
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--no-proxy-server'] });
  async function ctx(tz, vp = { width: 1366, height: 900 }) {
    const c = await browser.newContext({ viewport: vp, timezoneId: tz, serviceWorkers: 'block' }); let blocked = 0;
    await c.route('**/*', rt => { const u = new URL(rt.request().url()); if (u.hostname === '127.0.0.1' && u.port === '3100') return rt.continue(); blocked++; return rt.abort(); });
    await c.routeWebSocket(/.*/, ws => { const u = new URL(ws.url()); if (u.hostname === '127.0.0.1' && u.port === '3100') return ws.connectToServer(); ws.close(); });
    await c.addCookies([{ name: '__session', value: c1.split('=').slice(1).join('='), url: BASE, httpOnly: true, sameSite: 'Lax' }]);
    return { c, blocked: () => blocked };
  }
  const rowCells = page => page.locator('table[aria-label="Printere"] tbody tr').evaluateAll(trs => trs.map(tr => [...tr.querySelectorAll('td')].map(td => td.innerText.trim())));
  const NY = await ctx('America/New_York'); const page = await NY.c.newPage(); page.setDefaultTimeout(60000);
  for (let a = 0; ; a++) { try { await page.goto(BASE + '/superadmin/printers', { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => document.querySelectorAll('table[aria-label="Printere"] tbody tr td').length > 9, null, { timeout: 60000 }); break; } catch (e) { if (a >= 2) throw e; } }
  try { await page.waitForFunction(() => [...document.querySelectorAll('table[aria-label="Printere"] tbody tr')].some(tr => tr.innerText.includes('Ny printer 2')), null, { timeout: 60000 }); }
  catch (e) { await page.screenshot({ path: pth.join(SHOTS, 'debug-missing-row.png'), fullPage: true }); rec('B0 DEBUG rows when expected row missing', '344', '-', JSON.stringify((await rowCells(page)).map(c => [c[2], c[6], c[0], c[4]])).slice(0, 1500), false); throw e; }
  let cells = await rowCells(page); const byName = n => cells.find(c => c[6] === n);
  const headers = await page.locator('table[aria-label="Printere"] thead th').allInnerTexts();
  await page.screenshot({ path: pth.join(SHOTS, 'm1-table-newyork-tz.png'), fullPage: true });
  const newAct = (await snap(mdoc('qm-new'))).activatedAt;
  const expected = new Intl.DateTimeFormat('da-DK', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Copenhagen' }).format(newAct);
  rec('B1 resumed new printer: activation date (Copenhagen) and "Aldrig printet"', '344', `Aktiveringsdato "${expected}", Last used "Aldrig printet"`, JSON.stringify(byName('Ny printer 2')?.slice(0, 5)),
    byName('Ny printer 2')?.[0] === expected && byName('Ny printer 2')?.[4] === 'Aldrig printet');
  rec('B2 legacy printer: activation from resume, last used "Ikke registreret"', '344', 'Last used "Ikke registreret" (unknown, not "Aldrig")', JSON.stringify(byName('Legacy redigeret')?.slice(0, 5)), byName('Legacy redigeret')?.[4] === 'Ikke registreret' && byName('Legacy redigeret')?.[0] !== 'Ikke registreret');
  rec('B3 never-activated disabled printer: "Ikke registreret"', '344', 'Aktiveringsdato "Ikke registreret"', JSON.stringify(byName('QA qm-pg-00')?.slice(0, 5) || byName('QA qm-fail')?.slice(0, 5)), (byName('QA qm-fail')?.[0]) === 'Ikke registreret');
  const confCell = byName('QA qm-conf');
  const confISO = await page.locator('table[aria-label="Printere"] tbody tr').filter({ hasText: 'QA qm-conf' }).locator('time').evaluateAll(ts => ts.map(t => t.getAttribute('datetime')));
  rec('B4 confirmed (SEEDED ISOLATED fixture) across UTC midnight shows Copenhagen date in a New York browser', '344', 'Last used "22.10.2026, 00.30"; <time datetime> = 2026-10-21T22:30:00.000Z', `${confCell?.[4]} ${JSON.stringify(confISO)}`,
    confCell?.[4] === '22.10.2026, 00.30' && confISO.includes('2026-10-21T22:30:00.000Z'));
  rec('B5 table regressions: 9 headers', '344', '9 headers', headers.length, headers.length === 9);
  await page.setViewportSize({ width: 375, height: 812 }); await page.waitForTimeout(600);
  const mm = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, vw: innerWidth }));
  await page.screenshot({ path: pth.join(SHOTS, 'm2-mobile.png'), fullPage: true });
  rec('B6 mobile 375 no page overflow', '344', 'doc <= vw', JSON.stringify(mm), mm.doc <= mm.vw);
  const UTCc = await ctx('UTC'); const p2 = await UTCc.c.newPage(); p2.setDefaultTimeout(60000);
  await p2.goto(BASE + '/superadmin/printers', { waitUntil: 'load' });
  await p2.waitForFunction(() => [...document.querySelectorAll('table[aria-label="Printere"] tbody tr')].some(tr => tr.innerText.includes('QA qm-conf')), null, { timeout: 60000 });
  const c2cells = await rowCells(p2);
  rec('B7 same Copenhagen rendering in a UTC browser', '344', '"22.10.2026, 00.30"', c2cells.find(c => c[6] === 'QA qm-conf')?.[4], c2cells.find(c => c[6] === 'QA qm-conf')?.[4] === '22.10.2026, 00.30');
  // malformed metadata in one scope -> whole page fails closed in UI with headers kept
  await seedPrinter('qm-badui'); await mdoc('qm-badui').create(metaBase('qm-badui', { secret: 'x' }));
  await p2.reload({ waitUntil: 'load' }); await p2.waitForFunction(() => /kunne ikke indlæses/i.test(document.querySelector('table[aria-label="Printere"] tbody')?.innerText || ''), null, { timeout: 60000 });
  const btxt = await p2.locator('table[aria-label="Printere"]').innerText();
  rec('B8 malformed metadata fails closed in UI', '344', 'error row, headers kept, no secret', btxt.slice(0, 80).replace(/\s+/g, ' '), /kunne ikke indlæses/i.test(btxt) && !/secret/.test(btxt) && (await p2.locator('table[aria-label="Printere"] thead th').count()) === 9);
  rec('B9 no non-loopback browser requests', '344', '0', NY.blocked() + UTCc.blocked(), NY.blocked() + UTCc.blocked() === 0);
  await browser.close();
  rec('Z1 no-store + Vary Cookie on every API response', '344', '0', headerViolations, headerViolations === 0);
  const failed = results.filter(x => !x.pass);
  console.log(JSON.stringify({ environment: 'QA0a demo-orderfly-qa0, real Next app + Auth/Firestore emulators + Chromium', started, finished: new Date().toISOString(), total: results.length, passed: results.length - failed.length, failed: failed.length, results }));
  await db.terminate(); process.exit(0);
})().catch(e => { console.log(JSON.stringify({ fatal: String(e && e.stack || e).slice(0, 900), results })); process.exit(1); });
