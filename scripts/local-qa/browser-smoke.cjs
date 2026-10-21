'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { chromium } = require('playwright');
const { guardedContext } = require('./browser-boundary.cjs');
const BASE = 'http://127.0.0.1:3100';
const headers = ['Aktiveringsdato', 'Brand', 'Lokation', 'Status', 'Last used', 'Total printers', 'Printer name', 'Printertype', 'Handlinger'];
async function login(page, actor) {
  await page.goto(BASE + '/admin-login');
  await page.getByRole('button', { name: 'Log ind med en separat Orderfly-konto', exact: true }).click();
  await page.getByLabel('E-mail', { exact: true }).fill(actor.email);
  await page.getByLabel('Adgangskode', { exact: true }).fill(actor.password);
  const session = page.waitForResponse(response => response.url() === BASE + '/api/admin/session' && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'LOG IND', exact: true }).click();
  assert.equal((await session).status(), 200, 'actual browser login must establish a real native session');
  await page.waitForURL(url => url.pathname !== '/admin-login');
}
async function status(page, url) { return page.evaluate(async target => (await fetch(target)).status, url); }
async function runBrowserSmoke({ admin, merchant, ids }) {
  if (process.env.ORDERFLY_LOCAL_QA_BROWSER !== 'true' || process.env.GCLOUD_PROJECT !== 'demo-orderfly-qa0'
    || Reflect.get(globalThis, Symbol.for('orderfly.qa0.loopback-guard')) !== true) throw Error('QA0 browser boundary missing');
  const artifacts = path.resolve(__dirname, '../../test-results'); fs.mkdirSync(artifacts, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--disable-background-networking', '--disable-component-update', '--no-pings'] });
  const contexts = []; let blocked = 0, stage = 'admin-login';
  try {
    const adminScope = await guardedContext(browser, { width: 1348, height: 900 }); contexts.push(adminScope);
    const page = await adminScope.context.newPage(); page.setDefaultTimeout(20000);
    await login(page, admin);
    stage = 'admin-table';
    await page.goto(BASE + '/superadmin/printers');
    const table = page.getByRole('table', { name: 'Printere', exact: true });
    const row = table.getByRole('row').filter({ hasText: 'QA0 Disabled ÆØÅ' }); await row.waitFor();
    assert.deepEqual(await table.getByRole('columnheader').allTextContents(), headers);
    for (const name of ['Brand', 'Lokation', 'Printertype']) assert.equal(await page.getByRole('combobox', { name, exact: true }).inputValue(), '');
    assert.match(await row.textContent(), /Deactive/);
    stage = 'edit-cancel';
    await row.getByRole('button', { name: 'Rediger QA0 Disabled ÆØÅ', exact: true }).click();
    const form = page.getByRole('form', { name: 'Rediger printer', exact: true }); await form.waitFor();
    assert.equal(await form.getByLabel('Printernavn', { exact: true }).inputValue(), 'QA0 Disabled ÆØÅ');
    await form.getByRole('button', { name: 'Annuller', exact: true }).click(); await row.waitFor();
    stage = 'foreign-and-retired-boundaries';
    assert.equal(await status(page, '/api/merchant/printers?brandId=' + ids.brand + '&locationId=' + ids.foreignLocation), 403);
    const retired = await page.goto(BASE + '/merchant/printers'); assert.equal(retired.status(), 404);
    await page.goto(BASE + '/superadmin/printers'); await row.waitFor();
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
    const memberPage = await merchantScope.context.newPage(); memberPage.setDefaultTimeout(20000); await login(memberPage, merchant);
    await memberPage.goto(BASE + '/superadmin/printers'); await memberPage.getByText('Access Denied', { exact: true }).waitFor();
    assert.equal(await status(memberPage, '/api/merchant/printers?brandId=' + ids.brand + '&locationId=' + ids.location), 403);
    stage = 'anonymous-denial';
    const anonymousScope = await guardedContext(browser, { width: 375, height: 812 }); contexts.push(anonymousScope);
    const anonymousPage = await anonymousScope.context.newPage(); await anonymousPage.goto(BASE + '/admin-login');
    assert.equal(await status(anonymousPage, '/api/merchant/printers?brandId=' + ids.brand + '&locationId=' + ids.location), 401);
    blocked = contexts.reduce((sum, scope) => sum + scope.blockedRequests(), 0);
    return { browser: 'Chromium/Playwright1.62', browserVersion: browser.version(), realVisibleLoginsPerPass: 2, tableHeaders: headers.length, desktopWidth: 1348, mobileWidth: 375,
      editCancel: true, merchantDenied: true, anonymousDenied: true, foreignScopeDenied: true, retiredRoute404: true, blockedExternalRequests: blocked };
  } catch {
    fs.writeFileSync(path.join(artifacts, 'local-qa-browser-failure.json'), JSON.stringify({ environment: 'QA0b2-local-browser', status: 'failed', stage, productionAcceptance: false, physicalPrintVerified: false }), { mode: 0o600 });
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
