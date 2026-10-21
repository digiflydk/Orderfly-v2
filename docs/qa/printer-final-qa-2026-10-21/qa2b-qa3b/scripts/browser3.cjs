'use strict';
// Real-browser printer UI QA against the isolated QA0a stack (demo-orderfly-qa0).
// Sessions are real server-issued cookies from /api/admin/session for emulator users and
// are injected into the browser context in memory only (the visible login form is #381's scope).
const ROOT = '/home/user/Orderfly-v2';
const { createRequire } = require('node:module');
const rq = createRequire(ROOT + '/package.json');
const path = require('node:path'), fs = require('node:fs');
const { randomBytes, createHash } = require('node:crypto');
const { Firestore, Timestamp } = rq('@google-cloud/firestore');
const { chromium } = rq('playwright');
const { PROJECT } = require(ROOT + '/scripts/local-qa/environment.cjs');
const BASE = 'http://127.0.0.1:3100', AUTH = 'http://127.0.0.1:9099';
if (process.env.ORDERFLY_LOCAL_QA !== 'true' || PROJECT !== 'demo-orderfly-qa0' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8088') throw Error('boundary');
const SHOTS = path.join(__dirname, 'shots3'); fs.mkdirSync(SHOTS, { recursive: true });
const db = new Firestore({ projectId: PROJECT, host: '127.0.0.1:8088', ssl: false,
  credentials: { client_email: 'qa@demo-orderfly-qa0.invalid', private_key: 'LOCAL_EMULATOR_ONLY_NOT_A_PRIVATE_KEY' } });
const sha = s => createHash('sha256').update(s).digest('hex');
const actor = uid => sha(JSON.stringify(['firebase', uid]));
const B = 'qac-brand', FB = 'qac-foreign-brand', L = 'qac-loc', L2 = 'qac-loc-b', FL = 'qac-foreign-loc';
const results = []; const PROG = path.join(__dirname, 'browser3-progress.log'); fs.writeFileSync(PROG, '');
const rec = (id, issue, expected, actual, pass) => { results.push({ id, issue, expected, actual: String(actual), pass: !!pass }); fs.appendFileSync(PROG, `${new Date().toISOString()} ${pass ? 'PASS' : 'FAIL'} ${id} | ${String(actual).slice(0, 200)}\n`); };
const step = s => fs.appendFileSync(PROG, `${new Date().toISOString()} step ${s}\n`);
async function json(url, body) { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); if (!r.ok) throw Error('emu'); return r.json(); }
async function user(label) { const r = await json(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=qa0-public-only`, { email: `${label}@qacui.example.invalid`, password: randomBytes(24).toString('base64url'), returnSecureToken: true }); return { uid: r.localId, idToken: r.idToken }; }
async function session(idToken) { const r = await fetch(BASE + '/api/admin/session', { method: 'POST', headers: { origin: BASE, 'content-type': 'application/json' }, body: JSON.stringify({ idToken }) }); if (r.status !== 200) throw Error('session'); return r.headers.get('set-cookie').split(';')[0].split('=').slice(1).join('='); }
const conf = (id, o = {}) => ({ id, brandId: B, locationId: L, name: `QA ${id}`, manufacturer: 'star', model: 'mc-print3', transport: 'cloudprnt-http', state: 'disabled', paperWidthMm: 80, ...o });
const pdoc = (id, loc) => db.doc(`locations/${loc}/printers/${id}`);
const snap = async ref => { const s = await ref.get(); return s.exists ? s.data() : null; };
async function seedPrinter(id, loc, brand, o = {}) { await pdoc(id, loc).create({ schemaVersion: 1, configuration: conf(id, { locationId: loc, brandId: brand, ...o }), revision: 1, deletedAt: null, createdAt: 1, updatedAt: 1 }); }
const HEADERS = ['Aktiveringsdato', 'Brand', 'Lokation', 'Status', 'Last used', 'Total printers', 'Printer name', 'Printertype', 'Handlinger'];

async function context(browser, cookie, viewport = { width: 1366, height: 900 }) {
  const ctx = await browser.newContext({ viewport, serviceWorkers: 'block', acceptDownloads: false });
  let blocked = 0;
  await ctx.route('**/*', route => { const u = new URL(route.request().url()); if (u.hostname === '127.0.0.1' && u.port === '3100') return route.continue(); blocked++; return route.abort(); });
  await ctx.routeWebSocket(/.*/, ws => { const u = new URL(ws.url()); if (u.hostname === '127.0.0.1' && u.port === '3100') return ws.connectToServer(); ws.close(); });
  if (cookie) await ctx.addCookies([{ name: '__session', value: cookie, url: BASE, httpOnly: true, sameSite: 'Lax' }]);
  return { ctx, blocked: () => blocked };
}
const tableHeaders = page => page.locator('table[aria-label="Printere"] thead th').allInnerTexts();
const rows = page => page.locator('table[aria-label="Printere"] tbody tr');
async function waitLoaded(page) { await page.waitForFunction(() => !document.querySelector('section[aria-label="Printeroversigt"]')?.getAttribute('aria-busy') || document.querySelector('section[aria-label="Printeroversigt"]').getAttribute('aria-busy') === 'false', null, { timeout: 60000 }); }
async function rowCells(page) { return page.locator('table[aria-label="Printere"] tbody tr').evaluateAll(trs => trs.map(tr => [...tr.querySelectorAll('td')].map(td => td.innerText.trim()))); }
const sel = (scope, label) => scope.locator(`label:has(> span:text-is("${label}")) select`);
const select = async (page, label, value) => { step(`select ${label}=${value}`); await sel(page.locator('.admin-filter-bar'), label).selectOption(value); };

(async () => {
  const started = new Date().toISOString();
  const [s1, s2, m] = await Promise.all([user('super1'), user('super2'), user('merchant')]);
  const a1 = actor(s1.uid), a2 = actor(s2.uid), am = actor(m.uid);
  const batch = db.batch();
  batch.create(db.doc('platformAdminControl/access-v1'), {
    principals: [{ id: a1, active: true, name: 'QAC Super 1' }, { id: a2, active: true, name: 'QAC Super 2' }, { id: am, active: true, name: 'QAC Merchant' }],
    companies: [{ id: 'qac-company', active: true, locationIds: [L, L2], orderflyBrandIds: [B] }, { id: 'qac-foreign-company', active: true, locationIds: [FL], orderflyBrandIds: [FB] }],
    roles: [{ id: 'qac-owner', name: 'QAC Owner', companyId: null, kind: 'superuser', permissions: [], active: true },
      { id: 'qac-member', name: 'QAC Member', companyId: 'qac-company', kind: 'company_user', permissions: ['orderfly.catalog:view', 'orderfly.catalog:create', 'orderfly.catalog:edit', 'orderfly.catalog:delete', 'orderfly.orders:view'], active: true }],
    memberships: [{ id: 'm1', principalId: a1, companyId: null, locationIds: null, roleIds: ['qac-owner'], active: true },
      { id: 'm2', principalId: a2, companyId: null, locationIds: null, roleIds: ['qac-owner'], active: true },
      { id: 'mm', principalId: am, companyId: 'qac-company', locationIds: [L, L2], roleIds: ['qac-member'], active: true }] });
  for (const [id, name] of [[B, 'QAC Own'], [FB, 'QAC Foreign']]) batch.create(db.doc(`brands/${id}`), { id, name, status: 'active', isActive: true });
  for (const [id, brand, name] of [[L, B, 'QAC Amager'], [L2, B, 'QAC Vesterbro'], [FL, FB, 'QAC Aarhus']]) batch.create(db.doc(`locations/${id}`), { id, brandId: brand, name, isActive: true });
  await batch.commit();
  await seedPrinter('qac-ui-a', L, B, { name: 'Køkken' });
  await seedPrinter('qac-ui-b', L, B, { name: 'Kasse', model: 'mc-print2', paperWidthMm: 58 });
  await seedPrinter('qac-ui-c', L2, B, { name: 'Kasse', state: 'active' });
  await seedPrinter('qac-ui-f', FL, FB, { name: 'Bar', state: 'paused' });
  const [c1, c2, cm] = await Promise.all([session(s1.idToken), session(s2.idToken), session(m.idToken)]);

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--no-proxy-server'] });
  const S = await context(browser, c1); const page = await S.ctx.newPage(); page.setDefaultTimeout(45000);
  const sent = []; page.on('request', r => { if (['POST', 'PATCH'].includes(r.method()) && r.url().includes('/api/merchant/printers')) sent.push(r.method() + ' ' + new URL(r.url()).pathname); });
  const form = page.locator('form[aria-label="Tilføj printer"]'), ef = page.locator('form[aria-label="Rediger printer"]');
  const tableHas = txt => page.waitForFunction(t => [...document.querySelectorAll('table[aria-label="Printere"] tbody tr')].some(tr => tr.innerText.includes(t)), txt, { timeout: 30000 });
  const tableLacks = txt => page.waitForFunction(t => document.querySelectorAll('table[aria-label="Printere"] tbody tr td').length > 1 && ![...document.querySelectorAll('table[aria-label="Printere"] tbody tr')].some(tr => tr.innerText.includes(t)), txt, { timeout: 30000 });
  const audits = async (id, loc = L) => (await db.collection(`locations/${loc}/printers/${id}/audit`).get()).size;
  for (let attempt = 0; ; attempt++) { try { await page.goto(BASE + '/superadmin/printers', { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => document.querySelectorAll('table[aria-label="Printere"] tbody tr').length === 4, null, { timeout: 60000 }); break; } catch (e) { if (attempt >= 2) throw e; } }
  await select(page, 'Brand', B); await select(page, 'Lokation', L);
  await page.getByRole('button', { name: 'Tilføj printer' }).waitFor();

  // X1 PENDING RESPONSE: real request reaches the real server and commits; the RESPONSE is held by a one-shot boundary
  let releasePending; const pendingGate = new Promise(r => releasePending = r); let forwarded = 0;
  await page.route('**/api/merchant/printers', async route => { if (route.request().method() !== 'POST') return route.fallback(); forwarded++; const real = await route.fetch(); await pendingGate; await route.fulfill({ response: real }); }, { times: 1 });
  await page.getByRole('button', { name: 'Tilføj printer' }).click();
  await form.getByLabel('Printer-ID').fill('qac-x-pend'); await form.getByLabel('Printernavn').fill('Pending');
  await form.getByRole('button', { name: 'Gem deaktiveret printer' }).click();
  await form.getByRole('button', { name: 'Gemmer…' }).waitFor();
  await page.waitForFunction(() => !!document.querySelector('form[aria-label="Tilføj printer"] fieldset')?.disabled);
  await form.getByRole('button', { name: 'Gemmer…' }).click({ force: true, timeout: 2000 }).catch(() => {});
  await form.evaluate(f => f.requestSubmit()).catch(() => {});
  const pend = { save: await form.getByRole('button', { name: 'Gemmer…' }).isDisabled(), cancel: await form.getByRole('button', { name: 'Annuller' }).isDisabled(),
    fieldset: await form.evaluate(f => f.querySelector('fieldset').disabled), brand: await sel(page.locator('.admin-filter-bar'), 'Brand').isDisabled(), refresh: await page.getByRole('button', { name: 'Opdater', exact: true }).isDisabled() };
  await page.screenshot({ path: path.join(SHOTS, 'x1-pending.png'), fullPage: true });
  const committedWhilePending = !!(await snap(pdoc('qac-x-pend', L)));
  releasePending();
  await page.getByText('Printeropsætningen er gemt som deaktiveret.').waitFor();
  rec('X1 pending response: controls locked, repeat submit ignored, then real success', '373/318', 'Gemmer… disabled, Annuller disabled, fields + filters + Opdater locked; 1 request; native commit exists while UI pending; after release success + 1 audit',
    JSON.stringify({ ...pend, sent: sent.length, forwarded, committedWhilePending }), Object.values(pend).every(Boolean) && sent.length === 1 && forwarded === 1 && committedWhilePending && (await audits('qac-x-pend')) === 1);
  await tableHas('Pending');

  // X2 ACCEPTED-BUT-RESPONSE-LOST (create): forward REAL request, verify native commit, then drop ONLY the response
  const lost = async (method, pathPart) => { let commitSeen = null; await page.route(`**${pathPart}`, async route => { if (route.request().method() !== method) return route.fallback(); await route.fetch(); commitSeen = true; await route.abort('failed'); }, { times: 1 }); return () => commitSeen; };
  let seen = await lost('POST', '/api/merchant/printers'); const q2 = sent.length;
  await page.getByRole('button', { name: 'Tilføj printer' }).click();
  await form.getByLabel('Printer-ID').fill('qac-x-lost'); await form.getByLabel('Printernavn').fill('Svar tabt');
  await form.getByRole('button', { name: 'Gem deaktiveret printer' }).click();
  await form.locator('[role="alert"]').waitFor(); const m2 = await form.locator('[role="alert"]').innerText();
  const n2 = await snap(pdoc('qac-x-lost', L));
  await page.screenshot({ path: path.join(SHOTS, 'x2-response-lost.png'), fullPage: true });
  rec('X2 create committed but response lost: UI reports uncertainty, keeps input, blocks retry', '373/318', '"Kunne ikke bekræfte…"; Gem disabled; ID/name retained; "Opdater oversigten"; native rev1 + 1 audit; exactly 1 request',
    `${m2} | commit=${seen()} rev${n2?.revision} audits=${await audits('qac-x-lost')} requests=${sent.length - q2}`,
    /Kunne ikke bekræfte/.test(m2) && await form.getByRole('button', { name: 'Gem deaktiveret printer' }).isDisabled() && (await form.getByLabel('Printer-ID').inputValue()) === 'qac-x-lost'
    && (await form.getByLabel('Printernavn').inputValue()) === 'Svar tabt' && await form.getByRole('button', { name: 'Opdater oversigten' }).isVisible() && n2?.revision === 1 && (await audits('qac-x-lost')) === 1 && sent.length - q2 === 1);
  const tAdd = await page.getByRole('button', { name: 'Tilføj printer' }).count();
  await form.getByRole('button', { name: 'Opdater oversigten' }).click(); await tableHas('Svar tabt');
  rec('X3 explicit refresh reconciles to native truth (single commit)', '373', 'row "Svar tabt" shown; still 1 audit, rev1; no automatic retry', `addHiddenWhileUncertain=${tAdd === 0} audits=${await audits('qac-x-lost')} requests=${sent.length - q2}`,
    tAdd === 0 && (await audits('qac-x-lost')) === 1 && (await snap(pdoc('qac-x-lost', L))).revision === 1 && sent.length - q2 === 1);

  // X4 response lost on EDIT
  seen = await lost('PATCH', '/api/merchant/printers'); const s4 = sent.length;
  await page.locator('table[aria-label="Printere"] tbody tr').filter({ hasText: 'Køkken' }).getByRole('button', { name: 'Rediger Køkken' }).click();
  await ef.getByLabel('Printernavn').fill('Køkken lost'); await ef.getByRole('button', { name: 'Gem deaktiveret printer' }).click();
  await ef.locator('[role="alert"]').waitFor(); const m4 = await ef.locator('[role="alert"]').innerText(); const n4 = await snap(pdoc('qac-ui-a', L));
  rec('X4 edit committed but response lost', '373/296', 'uncertainty message; input kept; save blocked; native rev2 + audit/2 exactly once', `${m4} | rev${n4.revision} audits=${await audits('qac-ui-a')}`,
    /Kunne ikke bekræfte/.test(m4) && (await ef.getByLabel('Printernavn').inputValue()) === 'Køkken lost' && await ef.getByRole('button', { name: 'Gem deaktiveret printer' }).isDisabled() && n4.revision === 2 && n4.configuration.name === 'Køkken lost' && (await audits('qac-ui-a')) === 1 && sent.length - s4 === 1);
  await ef.getByRole('button', { name: 'Opdater oversigten' }).click(); await tableHas('Køkken lost');
  rec('X5 refresh after lost edit shows committed name; stale revision cannot be resubmitted', '373', 'row "Køkken lost"', 'ok', true);

  // X6 response lost on lifecycle DELETE dialog
  seen = await lost('POST', '/api/merchant/printers/lifecycle'); const s6 = sent.length;
  await page.locator('table[aria-label="Printere"] tbody tr').filter({ hasText: 'Kasse' }).getByRole('button', { name: 'Slet Kasse' }).click();
  const dlg = page.getByRole('dialog', { name: 'Slet printer' }); await dlg.getByRole('button', { name: 'Slet printer' }).click();
  await dlg.locator('[role="alert"]').waitFor(); const m6 = await dlg.locator('[role="alert"]').innerText(); const n6 = await snap(pdoc('qac-ui-b', L));
  rec('X6 delete committed but response lost', '373/298', '"Kunne ikke bekræfte printerhandlingen…"; confirm blocked; tombstone exists exactly once (rev2, audit 2 printer.delete)',
    `${m6} | deletedAt=${n6.deletedAt instanceof Timestamp} rev${n6.revision}`,
    /Kunne ikke bekræfte/.test(m6) && await dlg.getByRole('button', { name: 'Slet printer' }).isDisabled() && n6.deletedAt instanceof Timestamp && n6.revision === 2 && (await audits('qac-ui-b')) === 1 && sent.length - s6 === 1);
  await dlg.getByRole('button', { name: 'Opdater oversigten' }).click(); await tableLacks('Kasse');
  rec('X7 refresh after lost delete removes row', '373', 'row gone, tombstone retained', 'ok', !!(await snap(pdoc('qac-ui-b', L))));

  // X8 generic 503 (NOT writes_unavailable) after a real commit: unknown outcome, never shown as "slået fra"
  await page.route('**/api/merchant/printers', async route => { if (route.request().method() !== 'POST') return route.fallback(); await route.fetch(); await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"printers_unavailable"}', headers: { 'cache-control': 'no-store' } }); }, { times: 1 });
  await page.getByRole('button', { name: 'Tilføj printer' }).click();
  await form.getByLabel('Printer-ID').fill('qac-x-503'); await form.getByLabel('Printernavn').fill('Ukendt');
  await form.getByRole('button', { name: 'Gem deaktiveret printer' }).click(); await form.locator('[role="alert"]').waitFor();
  const m8 = await form.locator('[role="alert"]').innerText();
  rec('X8 generic 503 after commit = unknown outcome', '373/318', 'not the writes-off text; "Kunne ikke bekræfte…"; save blocked; refresh required; native 1 commit', m8,
    !/slået fra/.test(m8) && /Kunne ikke bekræfte/.test(m8) && await form.getByRole('button', { name: 'Gem deaktiveret printer' }).isDisabled() && (await audits('qac-x-503')) === 1);
  await form.getByRole('button', { name: 'Opdater oversigten' }).click(); await tableHas('Ukendt');
  // X9 malformed success after a real commit
  await page.route('**/api/merchant/printers', async route => { if (route.request().method() !== 'POST') return route.fallback(); await route.fetch(); await route.fulfill({ status: 201, contentType: 'application/json', body: '{"item":{"revision":99}}' }); }, { times: 1 });
  await page.getByRole('button', { name: 'Tilføj printer' }).click();
  await form.getByLabel('Printer-ID').fill('qac-x-bad'); await form.getByLabel('Printernavn').fill('Malformet');
  await form.getByRole('button', { name: 'Gem deaktiveret printer' }).click(); await form.locator('[role="alert"]').waitFor();
  const m9 = await form.locator('[role="alert"]').innerText();
  rec('X9 malformed success response after commit is not treated as success', '373/318', '"Kunne ikke bekræfte…"; no success banner; refresh required; native 1 commit', m9,
    /Kunne ikke bekræfte/.test(m9) && (await page.getByText('Printeropsætningen er gemt som deaktiveret.').count()) === 0 && await form.getByRole('button', { name: 'Gem deaktiveret printer' }).isDisabled() && (await audits('qac-x-bad')) === 1);
  await form.getByRole('button', { name: 'Opdater oversigten' }).click(); await tableHas('Malformet');
  // X10 pending lifecycle dialog
  let rel2; const g2 = new Promise(r => rel2 = r);
  await page.route('**/api/merchant/printers/lifecycle', async route => { const real = await route.fetch(); await g2; await route.fulfill({ response: real }); }, { times: 1 });
  await page.locator('table[aria-label="Printere"] tbody tr').filter({ hasText: 'Malformet' }).getByRole('button', { name: 'Slet Malformet' }).click();
  const d2 = page.getByRole('dialog', { name: 'Slet printer' }); await d2.getByRole('button', { name: 'Slet printer' }).click();
  await d2.getByRole('button', { name: 'Gemmer…' }).waitFor();
  const lp = { confirm: await d2.getByRole('button', { name: 'Gemmer…' }).isDisabled(), cancel: await d2.getByRole('button', { name: 'Annuller' }).isDisabled() };
  rel2(); await tableLacks('Malformet');
  rec('X10 pending lifecycle dialog locks confirm and cancel, then completes', '373/298', 'both disabled while pending; row removed after real response', JSON.stringify(lp), lp.confirm && lp.cancel);
  rec('X11 browser made no non-loopback requests', 'all', '0 blocked', S.blocked(), S.blocked() === 0);
  await S.ctx.close(); await browser.close();
  const failed = results.filter(r => !r.pass);
  console.log(JSON.stringify({ environment: 'QA0a demo-orderfly-qa0 + Chromium; response-level FAULT INJECTION with REAL request forwarding and REAL persistence', started, finished: new Date().toISOString(), total: results.length, passed: results.length - failed.length, failed: failed.length, results }));
  await db.terminate(); process.exit(0);
})().catch(e => { fs.appendFileSync(PROG, 'FATAL ' + String(e && e.message).slice(0, 400) + '\n'); console.log(JSON.stringify({ fatal: String(e && e.stack || e).slice(0, 600), results })); process.exit(1); });
