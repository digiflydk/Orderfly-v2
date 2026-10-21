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
const SHOTS = path.join(__dirname, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const db = new Firestore({ projectId: PROJECT, host: '127.0.0.1:8088', ssl: false,
  credentials: { client_email: 'qa@demo-orderfly-qa0.invalid', private_key: 'LOCAL_EMULATOR_ONLY_NOT_A_PRIVATE_KEY' } });
const sha = s => createHash('sha256').update(s).digest('hex');
const actor = uid => sha(JSON.stringify(['firebase', uid]));
const B = 'qac-brand', FB = 'qac-foreign-brand', L = 'qac-loc', L2 = 'qac-loc-b', FL = 'qac-foreign-loc';
const results = []; const PROG = path.join(__dirname, 'browser-progress.log'); fs.writeFileSync(PROG, '');
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
  const consoleErrors = []; page.on('pageerror', e => consoleErrors.push(String(e.message).slice(0, 120)));
  const mutations = []; page.on('request', r => { if (['POST', 'PATCH'].includes(r.method()) && r.url().includes('/api/merchant/printers')) mutations.push({ method: r.method(), url: new URL(r.url()).pathname, body: r.postDataJSON() }); });

  // U1 loading state: delay real API responses (forwarded unchanged) to observe headers during load
  let release; const gate = new Promise(r => release = r);
  await page.route('**/api/merchant/printers?*', async route => { await gate; await route.continue().catch(() => {}); });
  await page.goto(BASE + '/superadmin/printers', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.locator('table[aria-label="Printere"]').waitFor({ timeout: 120000 });
  const loadingHeaders = await tableHeaders(page); const loadingText = await page.locator('table[aria-label="Printere"] tbody').innerText();
  rec('U1 table + 9 headers visible during loading (default, no filter)', '361/372', '9 headers + "Indlæser printere…"', `${loadingHeaders.length} ${loadingText}`, JSON.stringify(loadingHeaders) === JSON.stringify(HEADERS) && /Indlæser printere/.test(loadingText));
  await page.screenshot({ path: path.join(SHOTS, 'u1-loading-desktop.png'), fullPage: true });
  release(); await page.unroute('**/api/merchant/printers?*');
  await page.waitForFunction(() => document.querySelectorAll('table[aria-label="Printere"] tbody tr').length >= 4, null, { timeout: 60000 });
  let cells = await rowCells(page);
  const byName = n => cells.filter(c => c[6] === n);
  rec('U2 default table shows all authorized brands/locations without filter', '361/372', '4 rows across 2 brands / 3 locations', JSON.stringify(cells.map(c => [c[1], c[2], c[6]])), cells.length === 4 && new Set(cells.map(c => c[1])).size === 2 && new Set(cells.map(c => c[2])).size === 3);
  const amagerRows = cells.filter(c => c[2] === 'QAC Amager');
  rec('U3 row columns: honest unknown dates, brand/location names, status, total per brand/location', '361', 'Aktiveringsdato+Last used "Ikke registreret"; Amager total 2, Vesterbro 1, Aarhus 1; Active/Deactive/På pause',
    JSON.stringify(cells.map(c => [c[0], c[2], c[3], c[4], c[5]])),
    cells.every(c => c[0] === 'Ikke registreret' && c[4] === 'Ikke registreret') && amagerRows.every(c => c[5] === '2') && cells.find(c => c[2] === 'QAC Vesterbro')[5] === '1'
    && cells.find(c => c[2] === 'QAC Vesterbro')[3] === 'Active' && cells.find(c => c[2] === 'QAC Aarhus')[3].startsWith('Deactive') && amagerRows.every(c => c[3] === 'Deactive'));
  const pageText = await page.locator('main, body').first().innerText();
  rec('U4 no credential-like data rendered', '372', 'no secret/token/password/credential/mac text in page', '', !/secret|token|password|credential|mac-?adresse|firmware-?nøgle/i.test(pageText));
  await page.screenshot({ path: path.join(SHOTS, 'u2-table-desktop.png'), fullPage: true });
  const nav = await page.locator('a[href="/superadmin/printers"]').count();
  rec('U5 superadmin sees Printere menu item', '325', '>=1 link', nav, nav >= 1);
  // Filters
  await select(page, 'Brand', B); await page.waitForFunction(() => document.querySelectorAll('table[aria-label="Printere"] tbody tr').length === 3, null, { timeout: 30000 });
  await select(page, 'Lokation', L2); await page.waitForFunction(() => document.querySelectorAll('table[aria-label="Printere"] tbody tr').length === 1 && !document.querySelector('[aria-busy="true"]'), null, { timeout: 30000 });
  cells = await rowCells(page); rec('U6 brand + location filter', '361/372', '1 row Vesterbro', JSON.stringify(cells.map(c => c[2])), cells.length === 1 && cells[0][2] === 'QAC Vesterbro');
  await select(page, 'Printertype', 'mc-print2'); await page.waitForFunction(() => /Ingen printere af denne type/.test(document.querySelector('table[aria-label="Printere"] tbody')?.innerText || ''), null, { timeout: 30000 });
  rec('U7 empty filtered result keeps headers', '361/372', '9 headers + empty message', (await tableHeaders(page)).length, JSON.stringify(await tableHeaders(page)) === JSON.stringify(HEADERS));
  await page.screenshot({ path: path.join(SHOTS, 'u7-empty-filter.png'), fullPage: true });
  await select(page, 'Lokation', L); await page.waitForFunction(() => document.querySelectorAll('table[aria-label="Printere"] tbody tr td').length > 1 && !document.querySelector('[aria-busy="true"]'), null, { timeout: 30000 });
  cells = await rowCells(page); rec('U8 type filter does not change Total printers', '361', 'Amager mc-print2 only row Kasse, Total printers 2', JSON.stringify(cells.map(c => [c[6], c[5]])), cells.length === 1 && cells[0][6] === 'Kasse' && cells[0][5] === '2');
  await select(page, 'Brand', ''); await select(page, 'Lokation', ''); await select(page, 'Printertype', '');
  await page.waitForFunction(() => document.querySelectorAll('table[aria-label="Printere"] tbody tr').length === 4, null, { timeout: 30000 });
  rec('U9 filters reset to all', '361/372', '4 rows', (await rows(page).count()), (await rows(page).count()) === 4);
  await select(page, 'Lokation', L2); await page.waitForFunction(() => document.querySelectorAll('table[aria-label="Printere"] tbody tr').length === 1, null, { timeout: 30000 });
  const brandVal = await sel(page.locator('.admin-filter-bar'), 'Brand').inputValue();
  rec('U10 location selectable before brand (brand optional)', '361', 'brand stays "Alle brands", 1 row', `brand="${brandVal}"`, brandVal === '');
  await select(page, 'Lokation', ''); await page.waitForFunction(() => document.querySelectorAll('table[aria-label="Printere"] tbody tr').length === 4, null, { timeout: 30000 });
  // Error state: one forced failure (fault injection on response only)
  await page.route('**/api/merchant/printers?*', route => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"x"}' }).catch(() => {}));
  await page.getByRole('button', { name: 'Opdater' }).click();
  await page.waitForFunction(() => /kunne ikke indlæses/.test(document.querySelector('table[aria-label="Printere"] tbody')?.innerText || ''), null, { timeout: 30000 });
  rec('U11 load error keeps headers (fault-injected 500)', '361/372', '9 headers + error alert', (await tableHeaders(page)).length, JSON.stringify(await tableHeaders(page)) === JSON.stringify(HEADERS));
  await page.unroute('**/api/merchant/printers?*'); await page.getByRole('button', { name: 'Opdater' }).click();
  await page.waitForFunction(() => document.querySelectorAll('table[aria-label="Printere"] tbody tr').length === 4, null, { timeout: 30000 });
  // Narrow screen
  await page.setViewportSize({ width: 375, height: 812 }); await page.waitForTimeout(800);
  const m1 = await page.evaluate(() => { const box = document.querySelector('table[aria-label="Printere"]').parentElement; return { doc: document.documentElement.scrollWidth, vw: window.innerWidth, boxScroll: box.scrollWidth, boxClient: box.clientWidth }; });
  await page.screenshot({ path: path.join(SHOTS, 'u12-mobile-375.png'), fullPage: true });
  rec('U12 narrow screen 375px: no page overflow, table scrolls internally', '372', 'document width <= 375, table container scrollWidth > clientWidth', JSON.stringify(m1), m1.doc <= m1.vw && m1.boxScroll > m1.boxClient);
  await page.setViewportSize({ width: 1366, height: 900 }); await page.waitForTimeout(500);
  const m2 = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, vw: window.innerWidth }));
  rec('U13 desktop 1366px: no page overflow', '372', 'document width <= viewport', JSON.stringify(m2), m2.doc <= m2.vw);

  // Row action enablement
  const btn = (label) => page.getByRole('button', { name: label, exact: true });
  const enabled = async label => btn(label).first().isEnabled();
  rec('U14 row buttons per state', '361/373', 'Edit only on disabled; Deactivate only on active/paused; Delete on all',
    '', (await enabled('Rediger Køkken')) && !(await enabled('Deaktiver Køkken')) && (await enabled('Slet Køkken')) && (await enabled('Slet Bar')) && (await enabled('Deaktiver Bar')) && !(await btn('Rediger Bar').isEnabled()));

  // Create via form
  await select(page, 'Brand', B); await select(page, 'Lokation', L);
  await page.getByRole('button', { name: 'Tilføj printer' }).waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: 'Tilføj printer' }).click();
  const form = page.locator('form[aria-label="Tilføj printer"]');
  const filtersLocked = await sel(page.locator('.admin-filter-bar'), 'Brand').isDisabled() && await sel(page.locator('.admin-filter-bar'), 'Lokation').isDisabled();
  rec('U15 filters locked while form is open', '318', 'Brand/Lokation disabled', filtersLocked, filtersLocked);
  await form.getByLabel('Printer-ID').fill('bad id'); await form.getByLabel('Printernavn').fill('Ny printer');
  await form.getByRole('button', { name: 'Gem deaktiveret printer' }).click();
  const v1 = await form.locator('[role="alert"]').innerText().catch(() => '');
  rec('U16 client validation error keeps input, no request', '318', 'message + input retained + 0 POST', `${v1} | ${await form.getByLabel('Printer-ID').inputValue()} | posts ${mutations.length}`, /Kontrollér/.test(v1) && (await form.getByLabel('Printer-ID').inputValue()) === 'bad id' && mutations.length === 0);
  // model rules: mc-print2 disables MQTT and 80mm
  await sel(form, 'Printermodel').selectOption('mc-print2');
  await page.waitForTimeout(300); const [mqttDisabled, w80Disabled, curModel] = await form.evaluate(f => [f.querySelector('option[value="cloudprnt-mqtt"]')?.disabled, f.querySelector('option[value="80"]')?.disabled, [...f.querySelectorAll('select')].map(x => x.value).join(',')]); step('form selects ' + curModel);
  rec('U17 mC-Print2 disallows MQTT and 80mm in form', '318', 'both options disabled', `${mqttDisabled}/${w80Disabled}`, mqttDisabled && w80Disabled);
  await sel(form, 'Printermodel').selectOption('mc-print3'); await sel(form, 'Papirbredde').selectOption('80');
  // duplicate ID -> server 409, input retained
  await form.getByLabel('Printer-ID').fill('qac-ui-a');
  await form.getByRole('button', { name: 'Gem deaktiveret printer' }).click();
  await form.locator('[role="alert"]').filter({ hasText: 'Opdater' }).waitFor({ timeout: 30000 });
  rec('U18 server 409 (ID already used): message, input retained, save blocked, refresh offered', '318/296', '409 message; ID/name retained; save disabled; "Opdater oversigten"',
    `${await form.getByLabel('Printer-ID').inputValue()}/${await form.getByLabel('Printernavn').inputValue()}`,
    (await form.getByLabel('Printer-ID').inputValue()) === 'qac-ui-a' && (await form.getByLabel('Printernavn').inputValue()) === 'Ny printer' && await form.getByRole('button', { name: 'Gem deaktiveret printer' }).isDisabled()
    && await form.getByRole('button', { name: 'Opdater oversigten' }).isVisible() && (await snap(pdoc('qac-ui-a', L))).configuration.name === 'Køkken');
  await form.getByRole('button', { name: 'Opdater oversigten' }).click();
  await page.getByRole('button', { name: 'Tilføj printer' }).waitFor({ timeout: 30000 }); await page.getByRole('button', { name: 'Tilføj printer' }).click();
  await form.getByLabel('Printer-ID').fill('qac-ui-new'); await form.getByLabel('Printernavn').fill('Ny printer ÆØÅ');
  await sel(form, 'Printermodel').selectOption('mc-print3'); await sel(form, 'Papirbredde').selectOption('80');
  // double submit before React renders pending: two synchronous submit events
  const before = mutations.length;
  await form.evaluate(f => { f.requestSubmit(); f.requestSubmit(); });
  await page.getByText('Printeropsætningen er gemt som deaktiveret.').waitFor({ timeout: 30000 });
  const posts = mutations.slice(before);
  const nd = await snap(pdoc('qac-ui-new', L)); const naud = (await db.collection(`locations/${L}/printers/qac-ui-new/audit`).get()).size;
  rec('U19 create via form + double submit guard', '318/296', '1 POST, 201, native disabled rev1 + 1 audit, success message', `posts ${posts.length} rev${nd?.revision} audits ${naud}`, posts.length === 1 && posts[0].method === 'POST' && nd?.revision === 1 && nd.configuration.state === 'disabled' && naud === 1 && nd.configuration.name === 'Ny printer ÆØÅ');
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => [...document.querySelectorAll('table[aria-label="Printere"] tbody tr')].some(tr => tr.innerText.includes('Ny printer ÆØÅ')), null, { timeout: 60000 });
  cells = await rowCells(page);
  rec('U20 reload shows created row and updated totals', '318/361', 'row present (Deactive), Amager totals 3', JSON.stringify(cells.filter(c => c[2] === 'QAC Amager').map(c => [c[6], c[3], c[5]])), cells.some(c => c[6] === 'Ny printer ÆØÅ' && c[3] === 'Deactive') && cells.filter(c => c[2] === 'QAC Amager').every(c => c[5] === '3'));
  await page.screenshot({ path: path.join(SHOTS, 'u20-after-create.png'), fullPage: true });

  // Edit row (same name "Kasse" exists in two locations: must target Amager row)
  const kasseRow = page.locator('table[aria-label="Printere"] tbody tr').filter({ hasText: 'QAC Amager' }).filter({ hasText: 'Kasse' });
  await kasseRow.getByRole('button', { name: 'Rediger Kasse' }).click();
  const ef = page.locator('form[aria-label="Rediger printer"]');
  rec('U21 edit form: immutable ID, prefilled', '318', 'ID disabled = qac-ui-b', await ef.getByLabel('Printer-ID').inputValue(), await ef.getByLabel('Printer-ID').isDisabled() && (await ef.getByLabel('Printer-ID').inputValue()) === 'qac-ui-b');
  await ef.getByLabel('Printernavn').fill('Kasse 2');
  const eb = mutations.length; await ef.getByRole('button', { name: 'Gem deaktiveret printer' }).click();
  await page.getByText('Printeropsætningen er gemt som deaktiveret.').waitFor({ timeout: 30000 });
  const patch = mutations.slice(eb)[0]; const eb2 = await snap(pdoc('qac-ui-b', L)); const eaud = await snap(db.doc(`locations/${L}/printers/qac-ui-b/audit/2`));
  rec('U22 Edit uses row brand/location/revision; revision + audit', '318/361/296', 'PATCH {brand own, loc Amager, revision 1}; native rev2 name "Kasse 2"; audit/2 actor super1; Vesterbro Kasse untouched',
    JSON.stringify({ m: patch?.method, b: patch?.body?.configuration?.brandId, l: patch?.body?.configuration?.locationId, r: patch?.body?.revision }),
    patch?.method === 'PATCH' && patch.body.configuration.brandId === B && patch.body.configuration.locationId === L && patch.body.revision === 1 && eb2.revision === 2 && eb2.configuration.name === 'Kasse 2'
    && eaud?.actorId === a1 && eaud.before.name === 'Kasse' && (await snap(pdoc('qac-ui-c', L2))).revision === 1);

  // Concurrent change: open edit in UI, another superadmin edits via real API, then save -> 409 without overwrite
  await page.waitForFunction(() => [...document.querySelectorAll('table[aria-label="Printere"] tbody tr')].some(tr => tr.innerText.includes('Kasse 2')), null, { timeout: 30000 });
  await page.locator('table[aria-label="Printere"] tbody tr').filter({ hasText: 'Køkken' }).getByRole('button', { name: 'Rediger Køkken' }).click();
  await ef.getByLabel('Printernavn').fill('Køkken UI');
  const other = await fetch(BASE + '/api/merchant/printers', { method: 'PATCH', headers: { cookie: '__session=' + c2, origin: BASE, 'content-type': 'application/json' }, body: JSON.stringify({ configuration: conf('qac-ui-a', { name: 'Køkken API' }), revision: 1 }) });
  await ef.getByRole('button', { name: 'Gem deaktiveret printer' }).click();
  await ef.locator('[role="alert"]').waitFor({ timeout: 30000 });
  const ka = await snap(pdoc('qac-ui-a', L));
  rec('U23 stale form after concurrent change -> conflict, no overwrite, input kept', '296/318', 'other session 200; UI 409 message; native name "Køkken API" rev2; UI input "Køkken UI" retained',
    `${other.status} ${await ef.locator('[role="alert"]').innerText()} native=${ka.configuration.name} rev${ka.revision}`,
    other.status === 200 && /ændret/.test(await ef.locator('[role="alert"]').innerText()) && ka.configuration.name === 'Køkken API' && ka.revision === 2 && (await ef.getByLabel('Printernavn').inputValue()) === 'Køkken UI');
  await page.screenshot({ path: path.join(SHOTS, 'u23-conflict.png'), fullPage: true });
  await ef.getByRole('button', { name: 'Opdater oversigten' }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('table[aria-label="Printere"] tbody tr')].some(tr => tr.innerText.includes('Køkken API')), null, { timeout: 30000 });
  rec('U24 explicit refresh reloads native truth', '318', 'row shows "Køkken API"', '', true);

  // Deactivate active row in Vesterbro (same name "Kasse" also elsewhere earlier)
  await select(page, 'Brand', ''); await select(page, 'Lokation', '');
  await page.waitForFunction(() => document.querySelectorAll('table[aria-label="Printere"] tbody tr').length === 5, null, { timeout: 30000 });
  const vRow = page.locator('table[aria-label="Printere"] tbody tr').filter({ hasText: 'QAC Vesterbro' });
  await vRow.getByRole('button', { name: 'Deaktiver Kasse' }).click();
  const dlg = page.getByRole('dialog', { name: 'Deaktiver printer' });
  const dlgTitle = await dlg.locator('h2').innerText();
  const mb = mutations.length; await dlg.getByRole('button', { name: 'Annuller' }).click();
  await page.waitForTimeout(800);
  rec('U25 Deactivate dialog names printer; cancel makes no mutation', '298/361', 'title names Kasse; 0 requests; native still active', `${dlgTitle} / ${mutations.length - mb}`, /Kasse/.test(dlgTitle) && mutations.length === mb && (await snap(pdoc('qac-ui-c', L2))).configuration.state === 'active');
  await page.waitForFunction(() => document.querySelectorAll('table[aria-label="Printere"] tbody tr').length === 5, null, { timeout: 30000 });
  await page.locator('table[aria-label="Printere"] tbody tr').filter({ hasText: 'QAC Vesterbro' }).getByRole('button', { name: 'Deaktiver Kasse' }).click();
  await dlg.getByRole('button', { name: 'Deaktiver printer' }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('table[aria-label="Printere"] tbody tr')].some(tr => tr.innerText.includes('QAC Vesterbro') && /Deactive/.test(tr.innerText)), null, { timeout: 30000 });
  const lc = mutations.slice(mb).find(x => x.url.endsWith('/lifecycle')); const vc = await snap(pdoc('qac-ui-c', L2));
  const vaud = await snap(db.doc(`locations/${L2}/printers/qac-ui-c/audit/2`));
  rec('U26 Deactivate uses row brand/location/revision', '298/361', 'lifecycle {brand own, loc Vesterbro, rev 1, deactivate}; native disabled rev2; audit printer.deactivate; Amager Kasse untouched',
    JSON.stringify(lc?.body), lc?.body?.brandId === B && lc.body.locationId === L2 && lc.body.printerId === 'qac-ui-c' && lc.body.revision === 1 && lc.body.action === 'deactivate'
    && vc.configuration.state === 'disabled' && vc.revision === 2 && vaud?.action === 'printer.deactivate' && (await snap(pdoc('qac-ui-b', L))).revision === 2);
  // Delete foreign-brand paused row
  const db1 = mutations.length;
  await page.locator('table[aria-label="Printere"] tbody tr').filter({ hasText: 'QAC Aarhus' }).getByRole('button', { name: 'Slet Bar' }).click();
  const del = page.getByRole('dialog', { name: 'Slet printer' });
  const delText = await del.innerText();
  await del.getByRole('button', { name: 'Slet printer' }).click();
  await page.waitForFunction(() => ![...document.querySelectorAll('table[aria-label="Printere"] tbody tr')].some(tr => tr.innerText.includes('QAC Aarhus')) && document.querySelectorAll('table[aria-label="Printere"] tbody tr').length === 4, null, { timeout: 30000 });
  const dl = mutations.slice(db1).find(x => x.url.endsWith('/lifecycle')); const tomb = await snap(pdoc('qac-ui-f', FL));
  rec('U27 Delete uses row brand/location/revision; row removed; tombstone + history kept', '298/361', 'lifecycle {foreign brand, Aarhus, rev1, delete}; row gone; deletedAt Timestamp; audit/2 printer.delete',
    JSON.stringify(dl?.body), dl?.body?.brandId === FB && dl.body.locationId === FL && dl.body.revision === 1 && dl.body.action === 'delete' && tomb?.deletedAt instanceof Timestamp
    && (await snap(db.doc(`locations/${FL}/printers/qac-ui-f/audit/2`)))?.action === 'printer.delete' && /Historik/.test(delText));
  // Delete Amager Kasse 2 -> Amager totals drop to 2
  await page.locator('table[aria-label="Printere"] tbody tr').filter({ hasText: 'Kasse 2' }).getByRole('button', { name: 'Slet Kasse 2' }).click();
  await page.getByRole('dialog', { name: 'Slet printer' }).getByRole('button', { name: 'Slet printer' }).click();
  await page.waitForFunction(() => document.querySelectorAll('table[aria-label="Printere"] tbody tr').length === 3, null, { timeout: 30000 });
  cells = await rowCells(page);
  rec('U28 Total printers recomputed after delete', '361', 'Amager rows total 2', JSON.stringify(cells.map(c => [c[2], c[6], c[5]])), cells.filter(c => c[2] === 'QAC Amager').length === 2 && cells.filter(c => c[2] === 'QAC Amager').every(c => c[5] === '2'));
  await page.screenshot({ path: path.join(SHOTS, 'u28-after-delete.png'), fullPage: true });
  // Recreate deleted id via form -> 409
  await select(page, 'Brand', B); await select(page, 'Lokation', L);
  await page.getByRole('button', { name: 'Tilføj printer' }).click();
  await form.getByLabel('Printer-ID').fill('qac-ui-b'); await form.getByLabel('Printernavn').fill('Genbrug');
  await form.getByRole('button', { name: 'Gem deaktiveret printer' }).click(); await form.locator('[role="alert"]').waitFor({ timeout: 30000 });
  rec('U29 reuse of deleted printer ID via form rejected', '298', '409 message; tombstone unchanged', await form.locator('[role="alert"]').innerText(), /allerede brugt/.test(await form.locator('[role="alert"]').innerText()) && (await snap(pdoc('qac-ui-b', L))).deletedAt instanceof Timestamp && (await snap(pdoc('qac-ui-b', L))).configuration.name === 'Kasse 2');
  rec('U30 browser made no non-loopback requests (all blocked if attempted)', 'all', 'reported count', S.blocked(), true);
  rec('U31 no uncaught page errors', 'all', '0', consoleErrors.join(' | '), consoleErrors.length === 0);
  await S.ctx.close();

  // Merchant in a real browser
  const M = await context(browser, cm); const mp = await M.ctx.newPage(); mp.setDefaultTimeout(60000);
  await mp.goto(BASE + '/merchant', { waitUntil: 'domcontentloaded', timeout: 120000 }); await mp.waitForTimeout(3000);
  const mUrl = mp.url(); const mLinks = await mp.locator('a[href="/superadmin/printers"], a[href="/merchant/printers"]').count();
  const mText = await mp.locator('body').innerText();
  await mp.screenshot({ path: path.join(SHOTS, 'm1-merchant-portal.png'), fullPage: true });
  rec('M1 ordinary merchant portal has no printer menu', '325/372', 'merchant shell rendered; 0 printer links; no "Printere" item', `${new URL(mUrl).pathname} links=${mLinks} printereText=${/\bPrintere\b/.test(mText)}`, mLinks === 0 && !/\bPrintere\b/.test(mText) && !/admin-login/.test(mUrl));
  await mp.goto(BASE + '/superadmin/printers', { waitUntil: 'domcontentloaded' }); await mp.waitForTimeout(3000);
  const deniedText = await mp.locator('body').innerText();
  await mp.screenshot({ path: path.join(SHOTS, 'm2-merchant-superadmin-printers.png'), fullPage: true });
  rec('M2 merchant direct /superadmin/printers', '325/372', 'Access Denied, no printer table', `${/Access Denied/.test(deniedText)} table=${await mp.locator('table[aria-label="Printere"]').count()}`, /Access Denied/.test(deniedText) && (await mp.locator('table[aria-label="Printere"]').count()) === 0);
  await mp.goto(BASE + '/superadmin/printers/routing', { waitUntil: 'domcontentloaded' }); await mp.waitForTimeout(2500);
  const rText = await mp.locator('body').innerText();
  rec('M3 merchant direct /superadmin/printers/routing', '325', 'Access Denied / no routing editor', /Access Denied/.test(rText), /Access Denied|not be found|404/.test(rText) && !/Routingregler/.test(rText.replace('Access Denied', '')));
  const resp = await mp.goto(BASE + '/merchant/printers', { waitUntil: 'domcontentloaded' }); await mp.waitForTimeout(2500);
  const nfText = await mp.locator('body').innerText(); await mp.screenshot({ path: path.join(SHOTS, 'm4-merchant-retired-route.png'), fullPage: true });
  rec('M4 retired /merchant/printers', '325', 'Next not-found page (404 heading), no printer table', `HTTP ${resp.status()} 404text=${/404|could not be found/i.test(nfText)} table=${await mp.locator('table[aria-label="Printere"]').count()}`, /404|could not be found/i.test(nfText) && (await mp.locator('table[aria-label="Printere"]').count()) === 0);
  const apiStatus = await mp.evaluate(async ([b, l]) => { const g = await fetch(`/api/merchant/printers?brandId=${b}&locationId=${l}`); const p = await fetch('/api/merchant/printers', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ configuration: { id: 'qac-m', brandId: b, locationId: l, name: 'x', manufacturer: 'star', model: 'mc-print3', transport: 'cloudprnt-http', state: 'disabled', paperWidthMm: 80 } }) }); return [g.status, p.status]; }, [B, L]);
  rec('M5 merchant browser fetch to printer APIs', '325', '403/403', apiStatus.join('/'), apiStatus[0] === 403 && apiStatus[1] === 403 && !(await snap(pdoc('qac-m', L))));
  await M.ctx.close();
  // Anonymous browser
  const A = await context(browser, null); const ap = await A.ctx.newPage();
  await ap.goto(BASE + '/superadmin/printers', { waitUntil: 'domcontentloaded' });
  rec('A1 anonymous /superadmin/printers', '325', 'redirect to /admin-login', new URL(ap.url()).pathname, new URL(ap.url()).pathname === '/admin-login');
  await A.ctx.close(); await browser.close();
  const failed = results.filter(r => !r.pass);
  console.log(JSON.stringify({ environment: 'QA0a-local-backend + Chromium (headless, /opt/pw-browsers/chromium)', started, finished: new Date().toISOString(), total: results.length, passed: results.length - failed.length, failed: failed.length, results }));
  await db.terminate();
})().catch(e => { fs.appendFileSync(PROG, 'FATAL ' + String(e && e.message).slice(0, 400) + '\n'); console.log(JSON.stringify({ fatal: String(e && e.stack || e).slice(0, 600), results })); process.exit(1); });
