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
const SHOTS = path.join(__dirname, 'shots2'); fs.mkdirSync(SHOTS, { recursive: true });
const db = new Firestore({ projectId: PROJECT, host: '127.0.0.1:8088', ssl: false,
  credentials: { client_email: 'qa@demo-orderfly-qa0.invalid', private_key: 'LOCAL_EMULATOR_ONLY_NOT_A_PRIVATE_KEY' } });
const sha = s => createHash('sha256').update(s).digest('hex');
const actor = uid => sha(JSON.stringify(['firebase', uid]));
const B = 'qac-brand', FB = 'qac-foreign-brand', L = 'qac-loc', L2 = 'qac-loc-b', FL = 'qac-foreign-loc';
const results = []; const PROG = path.join(__dirname, 'browser2-progress.log'); fs.writeFileSync(PROG, '');
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
  const OFF = process.env.QA_WRITES === 'false';
  const S = await context(browser, c1); const page = await S.ctx.newPage(); page.setDefaultTimeout(45000);
  for (let attempt = 0; ; attempt++) { try { await page.goto(BASE + '/superadmin/printers', { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => document.querySelectorAll('table[aria-label="Printere"] tbody tr').length === 4, null, { timeout: 60000 }); step('loaded attempt ' + attempt); break; } catch (e) { step('load retry ' + attempt); if (attempt >= 2) throw e; } }
  const form = page.locator('form[aria-label="Tilføj printer"]'), ef = page.locator('form[aria-label="Rediger printer"]');
  if (OFF) {
    rec('O0 environment', '318', 'local app with ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED=false', process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED, process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED === 'false');
    await select(page, 'Brand', B); await select(page, 'Lokation', L);
    await page.getByRole('button', { name: 'Tilføj printer' }).click();
    await form.getByLabel('Printer-ID').fill('qac-off'); await form.getByLabel('Printernavn').fill('Off test');
    await form.getByRole('button', { name: 'Gem deaktiveret printer' }).click();
    await form.locator('[role="alert"]').waitFor();
    const t = await form.locator('[role="alert"]').innerText();
    await page.screenshot({ path: path.join(SHOTS, 'o1-writes-off.png'), fullPage: true });
    rec('O1 writes OFF (real 503 writes_unavailable): safe message, input kept, retry allowed, nothing stored', '318/373', 'message "slået fra"; fields kept; save enabled; no native doc',
      t, /slået fra/.test(t) && (await form.getByLabel('Printer-ID').inputValue()) === 'qac-off' && (await form.getByLabel('Printernavn').inputValue()) === 'Off test'
      && await form.getByRole('button', { name: 'Gem deaktiveret printer' }).isEnabled() && !(await snap(pdoc('qac-off', L))));
    await form.getByRole('button', { name: 'Annuller' }).click();
    await page.locator('table[aria-label="Printere"] tbody tr').filter({ hasText: 'Køkken' }).getByRole('button', { name: 'Slet Køkken' }).click();
    const dlg = page.getByRole('dialog', { name: 'Slet printer' }); await dlg.getByRole('button', { name: 'Slet printer' }).click();
    await dlg.locator('[role="alert"]').waitFor(); const dt = await dlg.locator('[role="alert"]').innerText();
    rec('O2 writes OFF on lifecycle dialog', '298/373', 'message "slået fra"; printer unchanged', dt, /slået fra/.test(dt) && (await snap(pdoc('qac-ui-a', L))).revision === 1 && (await snap(pdoc('qac-ui-a', L))).deletedAt === null);
    await dlg.getByRole('button', { name: 'Annuller' }).click();
    await page.getByRole('button', { name: 'Tilføj printer' }).waitFor({ timeout: 30000 });
    // session lost (401): remove cookie, then submit
    await page.getByRole('button', { name: 'Tilføj printer' }).click().catch(() => {});
    await form.getByLabel('Printer-ID').fill('qac-401'); await form.getByLabel('Printernavn').fill('401 test');
    await S.ctx.clearCookies();
    await form.getByRole('button', { name: 'Gem deaktiveret printer' }).click();
    await page.getByText('Din session er udløbet. Log ind igen.').first().waitFor();
    rec('O3 session lost (real 401) clears protected form/data', '318', 'session message; form removed; no rows', `form=${await form.count()} rows=${await page.locator('table[aria-label="Printere"] tbody tr td').count()}`,
      (await form.count()) === 0 && !(await page.locator('table[aria-label="Printere"] tbody').innerText()).includes('Køkken'));
  } else {
    // 404: printer deleted by another session while edit form is open
    await page.locator('table[aria-label="Printere"] tbody tr').filter({ hasText: 'Køkken' }).getByRole('button', { name: 'Rediger Køkken' }).click();
    await ef.getByLabel('Printernavn').fill('Køkken 404');
    const del = await fetch(BASE + '/api/merchant/printers/lifecycle', { method: 'POST', headers: { cookie: '__session=' + c2, origin: BASE, 'content-type': 'application/json' }, body: JSON.stringify({ brandId: B, locationId: L, printerId: 'qac-ui-a', revision: 1, action: 'delete' }) });
    await ef.getByRole('button', { name: 'Gem deaktiveret printer' }).click(); await ef.locator('[role="alert"]').waitFor();
    const t4 = await ef.locator('[role="alert"]').innerText();
    rec('P1 printer deleted elsewhere while editing (real 404)', '318', 'other delete 200; "findes ikke længere"; save blocked; refresh offered; tombstone not overwritten', `${del.status} ${t4}`,
      del.status === 200 && /findes ikke længere/.test(t4) && await ef.getByRole('button', { name: 'Gem deaktiveret printer' }).isDisabled() && (await snap(pdoc('qac-ui-a', L))).configuration.name === 'Køkken');
    await ef.getByRole('button', { name: 'Opdater oversigten' }).click();
    await page.waitForFunction(() => document.querySelectorAll('table[aria-label="Printere"] tbody tr').length === 3, null, { timeout: 30000 });
    // 403: superadmin access revoked while form is open
    await select(page, 'Brand', B); await select(page, 'Lokation', L);
    await page.getByRole('button', { name: 'Tilføj printer' }).click();
    await form.getByLabel('Printer-ID').fill('qac-403'); await form.getByLabel('Printernavn').fill('403 test');
    const ref = db.doc('platformAdminControl/access-v1'); const pol = (await ref.get()).data();
    pol.memberships = pol.memberships.map(x => x.id === 'm1' ? { ...x, active: false } : x); await ref.set(pol);
    await form.getByRole('button', { name: 'Gem deaktiveret printer' }).click(); await page.locator('[role="alert"]').first().waitFor();
    await page.waitForTimeout(800);
    const t3 = await page.locator('body').innerText();
    await page.screenshot({ path: path.join(SHOTS, 'p2-revoked.png'), fullPage: true });
    rec('P2 access revoked during form (real 403 or session rejection)', '318/325', 'no record; access/session message shown', t3.match(/(Du har ikke adgang[^\n]*|Din session[^\n]*)/)?.[0], !(await snap(pdoc('qac-403', L))) && /Du har ikke adgang|Din session er udløbet/.test(t3));
  }
  await S.ctx.close(); await browser.close();
  const failed = results.filter(r => !r.pass);
  console.log(JSON.stringify({ environment: 'QA0a-local-backend + Chromium, writes=' + process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED, started, finished: new Date().toISOString(), total: results.length, passed: results.length - failed.length, failed: failed.length, results }));
  await db.terminate(); process.exit(0);
})().catch(e => { fs.appendFileSync(PROG, 'FATAL ' + String(e && e.message).slice(0, 400) + '\n'); console.log(JSON.stringify({ fatal: String(e && e.stack || e).slice(0, 600), results })); process.exit(1); });
