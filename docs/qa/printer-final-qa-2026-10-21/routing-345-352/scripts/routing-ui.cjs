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
const SHOTS = path.join(__dirname, 'shots-routing'); fs.mkdirSync(SHOTS, { recursive: true });
const db = new Firestore({ projectId: PROJECT, host: '127.0.0.1:8088', ssl: false,
  credentials: { client_email: 'qa@demo-orderfly-qa0.invalid', private_key: 'LOCAL_EMULATOR_ONLY_NOT_A_PRIVATE_KEY' } });
const sha = s => createHash('sha256').update(s).digest('hex');
const actor = uid => sha(JSON.stringify(['firebase', uid]));
const B = 'qac-brand', FB = 'qac-foreign-brand', L = 'qac-loc', L2 = 'qac-loc-b', FL = 'qac-foreign-loc';
const results = []; const PROG = path.join(__dirname, 'routing-ui-progress.log'); fs.writeFileSync(PROG, '');
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

  const OFF = process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED === 'false'; const sleep = ms => new Promise(x => setTimeout(x, ms));
  const sb = db.batch();
  for (const [id, name, cat] of [['qr-prod-1', 'Margherita', 'qr-cat-1'], ['qr-prod-2', 'Cola', 'qr-cat-2']]) sb.create(db.doc(`products/${id}`), { id, brandId: B, productName: name, categoryId: cat, isActive: true, locationIds: [L] });
  for (const [id, name] of [['qr-cat-1', 'Pizza'], ['qr-cat-2', 'Drikke']]) sb.create(db.doc(`categories/${id}`), { id, categoryName: name, isActive: true, locationIds: [L] });
  await sb.commit();
  await seedPrinter('qr-ui-act', L, B, { name: 'Ekspedition', state: 'active' });
  const R = '/api/superadmin/printers/routing', rdoc = db.doc(`locations/${L}/printerRouting/original`), raud = db.collection(`locations/${L}/printerRouting/original/audit`);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--no-proxy-server'] });
  const S = await context(browser, c1); const page = await S.ctx.newPage(); page.setDefaultTimeout(45000);
  const puts = []; page.on('request', r => { if (r.method() === 'PUT' && r.url().includes(R)) puts.push(r.postDataJSON()); });
  const bar = page.locator('.admin-filter-bar'), rulesSec = page.locator('section[aria-label="Regler"]');
  const btn = (n, scope = page) => scope.getByRole('button', { name: n, exact: true });
  async function open() {
    for (let a = 0; ; a++) { try { await page.goto(BASE + '/superadmin/printers/routing', { waitUntil: 'load', timeout: 120000 }); await page.getByRole('heading', { name: 'Routingregler' }).waitFor({ timeout: 60000 }); break; } catch (e) { if (a >= 2) throw e; } }
    // Wait for hydration: a select changed before React attaches does not update state.
    for (let i = 0; i < 20; i++) { await sel(bar, 'Brand').selectOption(B); await page.waitForTimeout(500); if (await sel(bar, 'Lokation').isEnabled()) break; await sel(bar, 'Brand').selectOption(''); }
    await sel(bar, 'Lokation').selectOption(L); await rulesSec.waitFor({ timeout: 60000 });
  }
  async function addRule(printer, kind, matchId, effect = 'include', fulfillment = 'both') {
    await sel(rulesSec, 'Printer').selectOption(printer); await sel(rulesSec, 'Regeltype').selectOption(kind);
    if (kind !== 'all') await sel(rulesSec, kind === 'product' ? 'Produkt' : 'Kategori').selectOption(matchId);
    await sel(rulesSec, 'Handling').selectOption(effect); await sel(rulesSec, 'Ordretype').selectOption(fulfillment); await btn('Tilføj regel').click();
  }
  const status = () => rulesSec.locator('h2 + span').innerText();
  const alertText = async () => (await page.locator('p[role="alert"]').allInnerTexts()).join(' | ');
  await open();
  rec('V1 routing editor loads for superadmin with empty native routing', '352', '"Ingen gemte regler" + empty-state text', await status(), /Ingen gemte regler/.test(await status()));
  if (OFF) {
    await addRule('qac-ui-a', 'all');
    await btn('Gem routingregler').click(); await page.locator('p[role="alert"]').waitFor();
    const t = await alertText(); await page.screenshot({ path: path.join(SHOTS, 'off-503.png'), fullPage: true });
    rec('OFF1 save with writes flag OFF (real 503)', '352', '"Lagring er ikke tilgængelig…"; save blocked; no routing doc', t, /Lagring er ikke tilgængelig/.test(t) && await btn('Gem routingregler').isDisabled() && !(await snap(rdoc)));
    await btn('Genindlæs').click(); await page.waitForFunction(() => /Ingen gemte regler/.test(document.querySelector('section[aria-label="Regler"] h2 + span')?.textContent || ''));
    await addRule('qac-ui-a', 'all'); await S.ctx.clearCookies(); await btn('Gem routingregler').click();
    await page.getByText('Din session er udløbet. Log ind igen.').first().waitFor();
    rec('OFF2 session lost (real 401) clears routing data', '352', 'session message; rules section gone', `rulesSection=${await rulesSec.count()}`, (await rulesSec.count()) === 0);
  } else {
    await addRule('qr-ui-act', 'all'); await addRule('qac-ui-b', 'category', 'qr-cat-1', 'include', 'Pickup');
    rec('V2 rules added locally are marked unsaved', '352', '"Ugemte ændringer"; 2 rows with native names', `${await status()} | ${(await rulesSec.locator('tbody tr').allInnerTexts()).join(' / ').replace(/\s+/g, ' ')}`,
      /Ugemte ændringer/.test(await status()) && (await rulesSec.locator('tbody tr').count()) === 2 && /Pizza/.test(await rulesSec.innerText()) && /Ekspedition/.test(await rulesSec.innerText()));
    await btn('Gem routingregler').click(); await page.getByText('Routingreglerne er gemt.').waitFor();
    let d = await snap(rdoc);
    rec('V3 save creates revision 1 with canonical native rules + audit', '352/345', 'PUT expectedRevision 0; native rev1 2 rules; audit/1 actor super1; "Gemt version 1"', `put=${JSON.stringify({ e: puts[0]?.expectedRevision, n: puts[0]?.rules?.length })} rev${d?.revision} ${await status()}`,
      puts[0]?.expectedRevision === 0 && d?.revision === 1 && d.rules.length === 2 && (await snap(raud.doc('1')))?.actorId === actor(s1.uid) && /Gemt version 1/.test(await status()) && !/Ugemte/.test(await status()));
    await page.screenshot({ path: path.join(SHOTS, 'v3-saved.png'), fullPage: true });
    // preview (sample only)
    await sel(page.locator('section[aria-label="Eksempelordre"]'), 'Eksempelprodukt').selectOption('qr-prod-1');
    await btn('Vis fordeling').click(); await page.locator('[aria-label="Fordeling"]').waitFor();
    const pv = await page.locator('[aria-label="Fordeling"]').innerText();
    rec('V4 preview uses candidate rules, writes nothing', '352', 'active Ekspedition gets 1 × Margherita; disabled Kasse reported as deaktiveret (never receives); rev still 1, 1 audit', pv.replace(/\s+/g, ' '),
      /Ekspedition: 1 × Margherita/.test(pv) && /deaktiveret/.test(pv) && (await snap(rdoc)).revision === 1 && (await raud.get()).size === 1);
    // reload readback
    await open();
    rec('V5 reload shows canonical saved rules with names', '352', '"Gemt version 1"; rows Køkken/Alle produkter and Kasse/Pizza/Afhentning', `${await status()} | ${(await rulesSec.locator('tbody').innerText()).replace(/\s+/g, ' ')}`,
      /Gemt version 1/.test(await status()) && /Ekspedition/.test(await rulesSec.innerText()) && /Afhentning/.test(await rulesSec.innerText()));
    // edit
    await rulesSec.locator('tbody tr').first().getByRole('button', { name: 'Rediger regel' }).click();
    await sel(rulesSec, 'Handling').selectOption('exclude'); await btn('Gem regelændring').click();
    await btn('Gem routingregler').click(); await page.getByText('Routingreglerne er gemt.').waitFor();
    d = await snap(rdoc);
    rec('V6 edit rule and save', '352', 'rev2; first rule exclude; audit/2 before include', `rev${d.revision} effect=${d.rules[0].effect}`, d.revision === 2 && d.rules[0].effect === 'exclude' && (await snap(raud.doc('2'))).before[0].effect === 'include' && /Gemt version 2/.test(await status()));
    // remove
    await rulesSec.locator('tbody tr').nth(1).getByRole('button', { name: 'Fjern regel' }).click();
    await btn('Gem routingregler').click(); await page.getByText('Routingreglerne er gemt.').waitFor();
    d = await snap(rdoc); rec('V7 remove rule and save', '352', 'rev3; 1 rule left', `rev${d.revision} rules=${d.rules.length}`, d.revision === 3 && d.rules.length === 1);
    // pending PUT
    let rel; const gate = new Promise(x => rel = x);
    await page.route(`**${R}`, async route => { if (route.request().method() !== 'PUT') return route.fallback(); const real = await route.fetch(); await gate; await route.fulfill({ response: real }); }, { times: 1 });
    await addRule('qac-ui-b', 'product', 'qr-prod-2');
    const nPut = puts.length; await btn('Gem routingregler').click(); await btn('Arbejder…').waitFor();
    const locked = { brand: await sel(bar, 'Brand').isDisabled(), loc: await sel(bar, 'Lokation').isDisabled(), reload: await btn('Genindlæs').isDisabled(), save: await btn('Arbejder…').isDisabled(), fieldset: await rulesSec.locator('fieldset').evaluate(f => f.disabled) };
    await btn('Arbejder…').click({ force: true, timeout: 1500 }).catch(() => {});
    let committed = false; for (let i = 0; i < 100 && !committed; i++) { committed = (await snap(rdoc)).revision === 4; if (!committed) await sleep(100); }
    const stillPending = await btn('Arbejder…').isVisible();
    await page.screenshot({ path: path.join(SHOTS, 'v8-pending.png'), fullPage: true });
    rel(); await page.getByText('Routingreglerne er gemt.').waitFor();
    rec('V8 pending PUT locks scope, reload, form and save; one request', '352', 'all locked; 1 PUT; native rev4 committed while UI pending', JSON.stringify({ ...locked, puts: puts.length - nPut, committed, stillPending }), Object.values(locked).every(Boolean) && puts.length - nPut === 1 && committed && stillPending);
    // conflict
    await addRule('qac-ui-a', 'category', 'qr-cat-2');
    const other = await fetch(BASE + R, { method: 'PUT', headers: { cookie: '__session=' + c2, origin: BASE, 'content-type': 'application/json' }, body: JSON.stringify({ brandId: B, locationId: L, expectedRevision: 4, rules: [{ id: 'other', brandId: B, locationId: L, printerId: 'qac-ui-b', match: { type: 'all' }, effect: 'include' }] }) });
    await btn('Gem routingregler').click(); await page.locator('p[role="alert"]').waitFor();
    const ct = await alertText(); d = await snap(rdoc);
    await page.screenshot({ path: path.join(SHOTS, 'v9-conflict.png'), fullPage: true });
    rec('V9 stale editor after another session saved -> 409, no overwrite, explicit reload', '352/345', 'other 200; "Opsætningen eller kataloget er ændret…"; save blocked; native rev5 = other session rules', `${other.status} ${ct} rev${d.revision} rule=${d.rules[0]?.id}`,
      other.status === 200 && /ændret/.test(ct) && await btn('Gem routingregler').isDisabled() && d.revision === 5 && d.rules.length === 1 && d.rules[0].id === 'other');
    await btn('Genindlæs').click(); await page.waitForFunction(() => /Gemt version 5/.test(document.querySelector('section[aria-label="Regler"] h2 + span')?.textContent || ''));
    rec('V10 reload shows native truth after conflict', '352', '"Gemt version 5"', await status(), /Gemt version 5/.test(await status()) && !/Ugemte/.test(await status()));
    // response lost after commit
    await page.route(`**${R}`, async route => { if (route.request().method() !== 'PUT') return route.fallback(); await route.fetch(); await route.abort('failed'); }, { times: 1 });
    await addRule('qac-ui-a', 'all'); const a0 = (await raud.get()).size, p0 = puts.length;
    await btn('Gem routingregler').click(); await page.locator('p[role="alert"]').waitFor();
    const lt = await alertText(); d = await snap(rdoc);
    await page.screenshot({ path: path.join(SHOTS, 'v11-response-lost.png'), fullPage: true });
    rec('V11 save committed but response lost -> uncertainty, blocked, single commit', '352', '"Det er uklart, om reglerne blev gemt…"; save blocked; native rev6 + exactly 1 new audit; 1 PUT', `${lt} rev${d.revision} newAudits=${(await raud.get()).size - a0} puts=${puts.length - p0}`,
      /uklart/.test(lt) && await btn('Gem routingregler').isDisabled() && d.revision === 6 && (await raud.get()).size - a0 === 1 && puts.length - p0 === 1);
    await btn('Genindlæs').click(); await page.waitForFunction(() => /Gemt version 6/.test(document.querySelector('section[aria-label="Regler"] h2 + span')?.textContent || ''));
    rec('V12 manual reload reconciles to committed version', '352', '"Gemt version 6", no automatic retry', `${await status()} puts=${puts.length - p0}`, /Gemt version 6/.test(await status()) && puts.length - p0 === 1);
    // malformed success
    await page.route(`**${R}`, async route => { if (route.request().method() !== 'PUT') return route.fallback(); await route.fetch(); await route.fulfill({ status: 200, contentType: 'application/json', body: '{"revision":99}' }); }, { times: 1 });
    await rulesSec.locator('tbody tr').first().getByRole('button', { name: 'Fjern regel' }).click();
    await btn('Gem routingregler').click(); await page.locator('p[role="alert"]').waitFor();
    const mt = await alertText();
    rec('V13 malformed success response is not accepted', '352', 'uncertainty message; blocked; no "gemt" notice', mt, /uklart/.test(mt) && (await page.getByText('Routingreglerne er gemt.').count()) === 0 && await btn('Gem routingregler').isDisabled());
    await btn('Genindlæs').click(); await page.waitForFunction(() => /Gemt version 7/.test(document.querySelector('section[aria-label="Regler"] h2 + span')?.textContent || ''));
    // stale-reference repair
    await addRule('qac-ui-a', 'product', 'qr-prod-1'); await btn('Gem routingregler').click(); await page.getByText('Routingreglerne er gemt.').waitFor();
    await db.doc('products/qr-prod-1').update({ isActive: false });
    await btn('Genindlæs').click(); await page.locator('[role="note"]').waitFor();
    const note = await page.locator('[role="note"]').innerText(), rowsTxt = await rulesSec.locator('tbody').innerText();
    await page.screenshot({ path: path.join(SHOTS, 'v14-stale-reference.png'), fullPage: true });
    rec('V14 stale product reference surfaced, preview disabled, rules retained', '352', 'amber note; "Produkt ikke tilgængeligt (gemt valg)"; Vis fordeling disabled', `${note} | ${rowsTxt.replace(/\s+/g, ' ')}`,
      /utilgængelige referencer/.test(note) && /Produkt ikke tilgængeligt/.test(rowsTxt) && await btn('Vis fordeling').isDisabled());
    const rev0 = (await snap(rdoc)).revision;
    await rulesSec.locator('tbody tr').filter({ hasText: 'Produkt ikke tilgængeligt' }).getByRole('button', { name: 'Fjern regel' }).click();
    await btn('Gem routingregler').click(); await page.getByText('Routingreglerne er gemt.').waitFor();
    d = await snap(rdoc);
    rec('V15 repair by removing stale rule and saving', '352/345', `rev${rev0 + 1}; note gone; no product rule`, `rev${d.revision} note=${await page.locator('[role="note"]').count()}`, d.revision === rev0 + 1 && (await page.locator('[role="note"]').count()) === 0 && !d.rules.some(x => x.match.type === 'product'));
    // mobile
    await page.setViewportSize({ width: 375, height: 812 }); await page.waitForTimeout(600);
    const mm = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, vw: window.innerWidth }));
    await page.screenshot({ path: path.join(SHOTS, 'v16-mobile.png'), fullPage: true });
    rec('V16 375px: no page overflow', '352', 'doc <= viewport', JSON.stringify(mm), mm.doc <= mm.vw);
    await page.setViewportSize({ width: 1366, height: 900 });
    const dm = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, vw: window.innerWidth }));
    rec('V17 1366px: no page overflow', '352', 'doc <= viewport', JSON.stringify(dm), dm.doc <= dm.vw);
  }
  rec('V18 browser made no non-loopback requests', 'all', '0', S.blocked(), S.blocked() === 0);
  await S.ctx.close();
  const M = await context(browser, cm); const mp = await M.ctx.newPage(); mp.setDefaultTimeout(60000);
  await mp.goto(BASE + '/superadmin/printers/routing', { waitUntil: 'load' }); await mp.waitForTimeout(2500);
  const mt2 = await mp.locator('body').innerText();
  rec('V19 ordinary merchant /superadmin/printers/routing', '352', 'Access Denied, no editor', /Access Denied/.test(mt2), /Access Denied/.test(mt2) && (await mp.locator('section[aria-label="Regler"]').count()) === 0);
  await M.ctx.close(); await browser.close();
  const failed = results.filter(r => !r.pass);
  console.log(JSON.stringify({ environment: 'QA0a demo-orderfly-qa0 + Chromium; response-level fault injection with REAL request forwarding where stated', writesFlag: process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED, started, finished: new Date().toISOString(), total: results.length, passed: results.length - failed.length, failed: failed.length, results }));
  await db.terminate(); process.exit(0);
})().catch(e => { fs.appendFileSync(PROG, 'FATAL ' + String(e && e.message).slice(0, 400) + '\n'); console.log(JSON.stringify({ fatal: String(e && e.stack || e).slice(0, 800), results })); process.exit(1); });
