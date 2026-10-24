'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { chromium } = require('playwright');
const { guardedContext } = require('./browser-boundary.cjs');
const { diagnostics, loginAlert, fieldDom } = require('./browser-diagnostics.cjs');
const { withCaughtLoginExceptions } = require('./caught-login-exceptions.cjs');
const { runLoginFirstClickProof } = require('./login-first-click-proof.cjs');
const BASE = 'http://127.0.0.1:3100';
const headers = ['Aktiveringsdato', 'Brand', 'Lokation', 'Status', 'Last used', 'Total printers', 'Printer name', 'Printertype', 'Handlinger'];
async function login(page, actor, role, diagnostic) {
  page.on('response', response => diagnostic.response(role, response.url(), response.status()));
  page.on('pageerror', error => diagnostic.uncaught(role, error));
  const fields = async point => { diagnostic.path(role, page.url()); diagnostic.fields(role, await fieldDom(page), point); };
  diagnostic.mark(role, 'page-ready');
  await page.goto(BASE + '/admin-login');
  await fields('preClickDom');
  diagnostic.mark(role, 'toggle');
  await page.getByRole('button', { name: 'Log ind med en separat Orderfly-konto', exact: true }).click();
  await fields();
  diagnostic.mark(role, 'fields-email');
  try { await page.getByLabel('E-mail', { exact: true }).fill(actor.email); } catch (error) { await fields(); throw error; }
  diagnostic.mark(role, 'fields-password');
  try { await page.getByLabel('Adgangskode', { exact: true }).fill(actor.password); } catch (error) { await fields(); throw error; }
  await withCaughtLoginExceptions(page, diagnostic, role, async () => {
    const session = page.waitForResponse(response => response.url() === BASE + '/api/admin/session' && response.request().method() === 'POST');
    diagnostic.mark(role, 'submit');
    await page.getByRole('button', { name: 'LOG IND', exact: true }).click();
    diagnostic.mark(role, 'session-response');
    const result = await Promise.race([session.then(response => ({ response })), loginAlert(page).waitFor({ state: 'visible' }).then(async () => {
      diagnostic.alert(role, await loginAlert(page).textContent()); return { rejected: true };
    })]);
    if (result.rejected) throw Error('QA0 login UI rejected');
    assert.equal(result.response.status(), 200, 'actual browser login must establish a real native session');
    // Observe through the app's own post-login navigation; teardown then runs on a loaded page.
    diagnostic.mark(role, 'navigation');
    await page.waitForURL(url => url.pathname !== '/admin-login');
    await page.waitForLoadState('load');
  });
}
async function status(page, url) { return page.evaluate(async target => (await fetch(target)).status, url); }
async function runBrowserSmoke({ admin, merchant, ids }) {
  if (process.env.ORDERFLY_LOCAL_QA_BROWSER !== 'true' || process.env.GCLOUD_PROJECT !== 'demo-orderfly-qa0'
    || Reflect.get(globalThis, Symbol.for('orderfly.qa0.loopback-guard')) !== true) throw Error('QA0 browser boundary missing');
  const artifacts = path.resolve(__dirname, '../../test-results'); fs.mkdirSync(artifacts, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--disable-background-networking', '--disable-component-update', '--no-pings'] });
  const contexts = []; const diagnostic = diagnostics(); let blocked = 0, stage = 'login-first-click';
  try {
    // Next DEV compiles /admin-login on its first request; doing that while the held-script
    // proof page is open raced an HMR reload/stale chunk. Precompile with one plain loopback
    // GET (no browser, no credentials); the proof itself is unchanged.
    stage = 'login-route-warmup';
    assert.equal((await fetch(BASE + '/admin-login', { signal: AbortSignal.timeout(45000) })).status, 200);
    stage = 'login-first-click';
    const firstClick = await runLoginFirstClickProof(browser, artifacts);
    stage = 'admin-login';
    const adminScope = await guardedContext(browser, { width: 1348, height: 900 }); contexts.push(adminScope);
    const page = await adminScope.context.newPage(); page.setDefaultTimeout(20000);
    await login(page, admin, 'admin', diagnostic);
    stage = 'admin-overview';
    await page.goto(BASE + '/superadmin/printers');
    await page.getByRole('heading', { name: 'QA0 Disabled ÆØÅ', exact: true }).waitFor();
    assert.equal(await page.getByRole('table', { name: 'Printere', exact: true }).count(), 0);
    assert.ok(await page.getByText('Ikke forbundet', { exact: true }).count() > 0);
    stage = 'admin-table';
    await page.getByRole('button', { name: 'Avanceret administration', exact: true }).click();
    const table = page.getByRole('table', { name: 'Printere', exact: true });
    const row = table.getByRole('row').filter({ hasText: 'QA0 Disabled ÆØÅ' }); await row.waitFor();
    assert.deepEqual(await table.getByRole('columnheader').allTextContents(), headers);
    for (const name of ['Brand', 'Lokation', 'Printertype']) assert.equal(await page.getByRole('combobox', { name, exact: true }).inputValue(), '');
    assert.match(await row.textContent(), /Deaktiveret/);
    stage = 'edit-cancel';
    await row.getByRole('button', { name: 'Rediger QA0 Disabled ÆØÅ', exact: true }).click();
    const form = page.getByRole('form', { name: 'Rediger printer', exact: true }); await form.waitFor();
    assert.equal(await form.getByLabel('Printernavn', { exact: true }).inputValue(), 'QA0 Disabled ÆØÅ');
    await form.getByRole('button', { name: 'Annuller', exact: true }).click(); await row.waitFor();
    stage = 'foreign-and-retired-boundaries';
    assert.equal(await status(page, '/api/merchant/printers?brandId=' + ids.brand + '&locationId=' + ids.foreignLocation), 403);
    // Next streams this notFound() page (HTTP 200 in DEV); assert the actual not-found UI and record the status as observed.
    const retired = await page.goto(BASE + '/merchant/printers'); const retiredStatus = retired.status();
    assert.ok([200, 404].includes(retiredStatus)); await page.getByRole('heading', { name: '404', exact: true }).waitFor();
    assert.equal(await page.getByRole('table', { name: 'Printere', exact: true }).count(), 0);
    await page.goto(BASE + '/superadmin/printers');
    await page.getByRole('button', { name: 'Avanceret administration', exact: true }).click(); await row.waitFor();
    stage = 'desktop-mobile-layout';
    const geometry = () => page.evaluate(() => ({ doc: document.documentElement.scrollWidth, viewport: innerWidth }));
    let size = await geometry(); assert.ok(size.doc <= size.viewport + 1, 'desktop document must remain contained');
    await page.screenshot({ path: path.join(artifacts, `local-qa-${process.pid}-desktop.png`) });
    await page.setViewportSize({ width: 375, height: 812 }); await row.waitFor();
    size = await geometry(); assert.ok(size.doc <= size.viewport + 1, 'mobile document must remain contained');
    assert.equal(await table.evaluate(element => { const scroller = element.parentElement; scroller.scrollLeft = scroller.scrollWidth; return scroller.scrollWidth > scroller.clientWidth && scroller.scrollLeft > 0; }), true, 'mobile table must scroll within its container');
    await page.screenshot({ path: path.join(artifacts, `local-qa-${process.pid}-mobile.png`) });
    stage = 'merchant-login-and-denial';
    const merchantScope = await guardedContext(browser, { width: 1348, height: 900 }); contexts.push(merchantScope);
    const memberPage = await merchantScope.context.newPage(); memberPage.setDefaultTimeout(20000); await login(memberPage, merchant, 'merchant', diagnostic);
    await memberPage.goto(BASE + '/superadmin/printers'); await memberPage.getByText('Access Denied', { exact: true }).waitFor();
    assert.equal(await status(memberPage, '/api/merchant/printers?brandId=' + ids.brand + '&locationId=' + ids.location), 403);
    stage = 'anonymous-denial';
    const anonymousScope = await guardedContext(browser, { width: 375, height: 812 }); contexts.push(anonymousScope);
    const anonymousPage = await anonymousScope.context.newPage(); await anonymousPage.goto(BASE + '/admin-login');
    assert.equal(await status(anonymousPage, '/api/merchant/printers?brandId=' + ids.brand + '&locationId=' + ids.location), 401);
    blocked = contexts.reduce((sum, scope) => sum + scope.blockedRequests(), 0);
    return { firstClick, browser: 'Chromium/Playwright1.62', browserVersion: browser.version(), realVisibleLoginsPerPass: 2, tableHeaders: headers.length, desktopWidth: 1348, mobileWidth: 375,
      editCancel: true, merchantDenied: true, anonymousDenied: true, foreignScopeDenied: true, retiredRouteNotFoundUi: true, retiredRouteHttpStatus: retiredStatus, blockedExternalRequests: blocked };
  } catch (error) {
    fs.writeFileSync(path.join(artifacts, 'local-qa-browser-failure.json'), JSON.stringify({ environment: 'QA0b2-local-browser', status: 'failed', stage, ...diagnostic.snapshot(error), productionAcceptance: false, physicalPrintVerified: false }), { mode: 0o600 });
    throw Error('QA0 real browser scenario failed');
  }
  finally {
    let closeFailed = false;
    for (const scope of contexts.reverse()) { try { await scope.context.close(); } catch { closeFailed = true; } }
    try { await browser.close(); } catch { closeFailed = true; }
    if (closeFailed) throw Error('QA0 browser teardown failed');
  }
}
module.exports = { runBrowserSmoke };
