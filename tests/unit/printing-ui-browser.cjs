// Render the actual read-only React overview with production CSS. Only API data
// and server-provided authorized selector metadata are synthetic, never a login.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { chromium, expect } = require('@playwright/test');
const webpackModule = require('next/dist/compiled/webpack/webpack');
webpackModule.init();
const root = process.cwd();
let dir, server, browser, origin;
const brands = [{ id: 'a', name: 'Nord' }, { id: 'b', name: 'Syd' }];
const locations = [{ id: 'la', name: 'Nord Station', brandId: 'a' }, { id: 'lb', name: 'Syd Torv', brandId: 'b' }];
function item(id, brandId = 'a', locationId = 'la', extra = {}) {
  return { configuration: { id, brandId, locationId, name: `Køkken ${id}`, manufacturer: 'star', model: 'mc-print2',
    transport: 'cloudprnt-http', state: 'paused', paperWidthMm: 58, ...extra }, revision: 3 };
}
before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'printing-ui-browser-'));
  const entry = path.join(dir, 'entry.js');
  fs.writeFileSync(entry, `import React from 'react';import {createRoot} from 'react-dom/client';
    import {PrinterOverview} from ${JSON.stringify(path.join(root, 'src/app/superadmin/printers/printer-overview.tsx'))};
    createRoot(document.getElementById('root')).render(React.createElement(PrinterOverview,{brands:${JSON.stringify(brands)},locations:${JSON.stringify(locations)}}));`);
  const loader = path.join(dir, 'loader.js');
  fs.writeFileSync(loader, `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
  await new Promise((resolve, reject) => webpackModule.webpack({ mode: 'development', devtool: false, entry,
    output: { path: dir, filename: 'bundle.js' },
    resolve: { alias: { '@': path.join(root, 'src') }, extensions: ['.tsx', '.ts', '.js'], modules: [path.join(root, 'node_modules'), 'node_modules'] },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [loader] }] },
  }).run((error, stats) => error ? reject(error) : stats.hasErrors() ? reject(Error(stats.toString({ all: false, errors: true }))) : resolve()));
  execFileSync(path.join(root, 'node_modules/.bin/tailwindcss'), ['-c', path.join(root, 'tailwind.config.ts'), '-i', path.join(root, 'src/app/globals.css'), '-o', path.join(dir, 'styles.css'), '--minify'], { cwd: root, stdio: 'pipe' });
  const styles = fs.readFileSync(path.join(dir, 'styles.css'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'src/styles/admin-ui.css'), 'utf8');
  server = http.createServer((req, res) => {
    if (req.url === '/bundle.js') { res.setHeader('content-type', 'application/javascript'); return res.end(fs.readFileSync(path.join(dir, 'bundle.js'))); }
    if (req.url === '/styles.css') { res.setHeader('content-type', 'text/css'); return res.end(styles); }
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end('<!doctype html><html lang="da"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><main class="admin-shell min-h-screen bg-background p-4 md:p-8"><div id="root" class="mx-auto max-w-6xl"></div></main><script src="/bundle.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ headless: true, executablePath: process.env.CART_CHROMIUM_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
});
after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); if (dir) fs.rmSync(dir, { recursive: true, force: true }); });
async function choose(page, brand = 'a', location = 'la') {
  await page.getByRole('combobox', { name: 'Brand', exact: true }).selectOption(brand);
  await page.getByRole('combobox', { name: 'Lokation', exact: true }).selectOption(location);
}
for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 375, 667]]) {
  test(`printer overview uses scoped GET pages and separates status at ${name} width`, async t => {
    const context = await browser.newContext({ viewport: { width, height } }); t.after(() => context.close());
    const page = await context.newPage(), requests = [], errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/api/merchant/printers?*', async route => {
      const request = route.request(), url = new URL(request.url()); requests.push({ method: request.method(), brand: url.searchParams.get('brandId'), location: url.searchParams.get('locationId'), limit: url.searchParams.get('limit'), after: url.searchParams.get('after') });
      const second = url.searchParams.has('after');
      await route.fulfill({ json: second ? { items: [item('p21')], nextCursor: null }
        : { items: Array.from({ length: 20 }, (_, i) => item('p' + String(i + 1).padStart(2, '0'), 'a', 'la', i === 0 ? { name: 'Køkken ' + 'x'.repeat(70), state: 'active' } : {})), nextCursor: 'p20' } });
    });
    await page.goto(origin);
    await expect(page.getByRole('heading', { name: 'Printere', exact: true })).toBeVisible();
    assert.equal(requests.length, 0);
    await expect(page.getByRole('combobox', { name: 'Lokation', exact: true })).toBeDisabled();
    await choose(page);
    await expect(page.getByText('Aktiv', { exact: true })).toBeVisible();
    await expect(page.getByText('Ikke verificeret', { exact: true })).toHaveCount(20);
    await expect(page.getByText('CloudPRNT HTTP', { exact: true })).toHaveCount(20);
    await expect(page.getByText('58 mm', { exact: true })).toHaveCount(20);
    assert.deepEqual(requests[0], { method: 'GET', brand: 'a', location: 'la', limit: '20', after: null });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1);
    fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
    await page.screenshot({ path: path.join(root, 'test-results', `printing-overview-${name}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Næste side' }).click();
    await expect(page.getByText('Køkken p21', { exact: true })).toBeVisible();
    await expect(page.getByText('Ikke verificeret', { exact: true })).toHaveCount(1);
    assert.equal(requests[1].after, 'p20');
    await page.getByRole('button', { name: 'Første side' }).click();
    await expect(page.getByRole('button', { name: 'Næste side' })).toBeVisible();
    assert.equal(requests[2].after, null);
    await page.getByRole('combobox', { name: 'Brand', exact: true }).selectOption('b');
    await expect(page.getByText('Ikke verificeret', { exact: true })).toHaveCount(0);
    assert.equal(await page.getByRole('combobox', { name: 'Lokation', exact: true }).inputValue(), '');
    await expect(page.getByRole('combobox', { name: 'Lokation', exact: true }).locator('option[value="la"]')).toHaveCount(0);
    assert.deepEqual(errors, []);
  });
}
test('loading, denied, unauthorized, unavailable and retry never retain stale rows', async t => {
  const context = await browser.newContext(); t.after(() => context.close()); const page = await context.newPage();
  let status = 200, release; let hold = true;
  await page.route('**/api/merchant/printers?*', async route => {
    if (hold) await new Promise(resolve => { release = resolve; });
    await route.fulfill({ status, json: status === 200 ? { items: [item('p1')], nextCursor: null } : { error: 'PRIVATE_PROVIDER_DETAIL' } });
  });
  await page.goto(origin); await choose(page);
  await expect(page.getByRole('status')).toHaveText('Indlæser printere…');
  hold = false; release(); await expect(page.getByText('Køkken p1', { exact: true })).toBeVisible();
  for (const [code, message] of [[403, 'Du har ikke adgang til printerne på denne lokation.'], [401, 'Din session er udløbet. Log ind igen.'], [503, 'Printerne kunne ikke indlæses. Prøv igen.']]) {
    status = code; await page.getByRole('button', { name: 'Opdater' }).click();
    await expect(page.getByRole('alert')).toHaveText(message);
    await expect(page.getByText('Køkken p1', { exact: true })).toHaveCount(0);
    assert.equal((await page.locator('body').innerText()).includes('PRIVATE_PROVIDER_DETAIL'), false);
  }
  status = 200; await page.getByRole('button', { name: 'Opdater' }).click();
  await expect(page.getByText('Køkken p1', { exact: true })).toBeVisible();
});
test('foreign, oversized and malformed responses fail closed; scoped empty page is explicit', async t => {
  const context = await browser.newContext(); t.after(() => context.close()); const page = await context.newPage();
  let response = { items: [item('foreign', 'b', 'lb')], nextCursor: null };
  await page.route('**/api/merchant/printers?*', route => route.fulfill({ json: response }));
  await page.goto(origin); await choose(page);
  for (const value of [response, { items: Array.from({ length: 21 }, (_, i) => item('p' + i)), nextCursor: null }, { items: [item('p1', 'a', 'la', { state: 'online' })], nextCursor: null }]) {
    response = value; await page.getByRole('button', { name: 'Opdater' }).click();
    await expect(page.getByRole('alert')).toHaveText('Printerne kunne ikke indlæses. Prøv igen.');
    await expect(page.locator('dl')).toHaveCount(0);
  }
  response = { items: [], nextCursor: null }; await page.getByRole('button', { name: 'Opdater' }).click();
  await expect(page.getByText('Ingen printere på denne lokation.', { exact: true })).toBeVisible();
});
test('old in-flight location response cannot overwrite a new scope', async t => {
  const context = await browser.newContext(); t.after(() => context.close()); const page = await context.newPage();
  let release, started;
  const firstStarted = new Promise(resolve => { started = resolve; });
  await page.route('**/api/merchant/printers?*', async route => {
    const url = new URL(route.request().url()), brandId = url.searchParams.get('brandId');
    if (brandId === 'a') { started(); await new Promise(resolve => { release = resolve; }); }
    await route.fulfill({ json: { items: [item(brandId === 'a' ? 'OLD' : 'NEW', brandId, brandId === 'a' ? 'la' : 'lb')], nextCursor: null } }).catch(() => {});
  });
  await page.goto(origin); await choose(page); await firstStarted;
  await choose(page, 'b', 'lb'); await expect(page.getByText('Køkken NEW', { exact: true })).toBeVisible();
  release(); await expect(page.getByText('Køkken OLD', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Køkken NEW', { exact: true })).toBeVisible();
});
