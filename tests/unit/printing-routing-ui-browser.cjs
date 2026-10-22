// Render the actual superadmin React overview with production CSS. Only API data
// and server-provided authorized selector metadata are synthetic, never a login.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { chromium, expect } = require('@playwright/test');
const { loadTs } = require('../helpers/load-ts.cjs');
const { printerRoutingRuleSchema } = loadTs('src/lib/printing/routing-preview.ts', { 'server-only': {} });
// Match actual PUT/GET serialization through the production server schema.
const canonicalRules = rules => rules.map(rule => printerRoutingRuleSchema.parse(rule));
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
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'printing-routing-browser-'));
  const entry = path.join(dir, 'entry.js');
  fs.writeFileSync(entry, `import React from 'react';import {createRoot} from 'react-dom/client';
    import {PrinterRoutingEditor} from ${JSON.stringify(path.join(root, 'src/app/superadmin/printers/routing/routing-editor.tsx'))};
    const writes = [{id:'la',brandId:'a'},{id:'lb',brandId:'b'}];
    function Fixture(){const [scopes,setScopes]=React.useState(writes);const [identity,setIdentity]=React.useState(0);window.resetPrinterContext=()=>setIdentity(value=>value+1);window.setPrinterWriteScopes=setScopes;return React.createElement(PrinterRoutingEditor,{key:identity,brands:${JSON.stringify(brands)},locations:${JSON.stringify(locations)},createLocations:scopes,editLocations:scopes});}
    createRoot(document.getElementById('root')).render(React.createElement(Fixture));`);
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
async function choose(page, brandId = 'a', locationId = 'la') {
  await page.getByRole('combobox', { name: 'Brand', exact: true }).selectOption(brandId);
  await page.getByRole('combobox', { name: 'Lokation', exact: true }).selectOption(locationId);
}
function fixtureRoutes(page, controls = {}) {
  const requests = [], writes = []; let saved;
  page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), body = request.method() === 'GET' ? null : request.postDataJSON();
    requests.push({ method: request.method(), url: url.pathname, body });
    const brandId = body?.brandId || url.searchParams.get('brandId'), locationId = body?.locationId || url.searchParams.get('locationId'), scope = { brandId, locationId };
    const printer = item('p1', brandId, locationId, { state: 'active' });
    if (controls.intercept && await controls.intercept({ route, request, url, body, scope, printer })) return;
    if (request.method() === 'GET' && url.pathname === '/api/merchant/printers') return route.fulfill({ json: { items: [printer], nextCursor: null } });
    if (request.method() === 'GET' && url.pathname.endsWith('/catalog')) {
      const kind = url.searchParams.get('kind');
      return route.fulfill({ json: { scope, kind, items: kind === 'product' ? [{ id: 'pizza', name: 'Pizza Margherita', categoryId: 'food' }] : [{ id: 'food', name: 'Pizzaer' }], nextCursor: null } });
    }
    if (request.method() === 'GET') return route.fulfill({ json: saved && saved.scope.brandId === brandId ? saved : { scope, revision: null, rules: [], printers: [], referencesVerified: true, dispatchAuthorized: false } });
    if (request.method() === 'PUT') {
      writes.push(body);
      saved = { scope, revision: body.expectedRevision + 1, rules: canonicalRules(body.rules), printers: body.rules.length ? [printer] : [], referencesVerified: true, dispatchAuthorized: false };
      return route.fulfill({ json: saved });
    }
    const included = body.rules.some(r => r.effect === 'include') && !body.rules.some(r => r.effect === 'exclude');
    const line = { lineId: 'sample-0', ...scope, itemType: 'product', productId: 'pizza', categoryId: 'food', name: 'Pizza Margherita', quantity: 1 };
    return route.fulfill({ json: { scope, sampleOnly: true, mode: 'preview', dispatchAuthorized: false,
      targets: included ? [{ printerId: 'p1', state: 'active', dispatchAuthorized: false, lines: [line] }] : [],
      decisions: body.rules.length ? [{ lineId: 'sample-0', printerId: 'p1', outcome: included ? 'included' : 'excluded', selectedRuleIds: body.rules.map(r => r.id), shadowedRuleIds: [] }] : [],
      unrouted: included ? [] : [{ lineId: 'sample-0', reason: 'no_included_printer' }], lines: [{ lineId: 'sample-0', name: 'Pizza Margherita', quantity: 1 }], printers: body.rules.length ? [{ id: 'p1', name: 'Køkken p1' }] : [] } });
  });
  return { requests, writes };
}
async function addCategoryRule(page) {
  await page.getByRole('combobox', { name: 'Printer', exact: true }).selectOption('p1');
  await page.getByRole('combobox', { name: 'Regeltype', exact: true }).selectOption('category');
  await page.getByRole('combobox', { name: 'Kategori', exact: true }).selectOption('food');
  await page.getByRole('button', { name: 'Tilføj regel', exact: true }).click();
}
for (const [size, width, height] of [['desktop', 1440, 900], ['mobile', 375, 667]]) {
  test(`named routing create/edit/preview/save and exact credential-free payload at ${size}`, async t => {
    const context = await browser.newContext({ viewport: { width, height } }); t.after(() => context.close());
    const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    const f = fixtureRoutes(page); await page.goto(origin); await choose(page);
    await expect(page.getByText('Ingen routingregler. Tilføj en regel for at fordele produkter.')).toBeVisible();
    await addCategoryRule(page); await expect(page.getByRole('cell', { name: 'Pizzaer', exact: true })).toBeVisible();
    await expect(page.getByText(/Ugemte ændringer/)).toBeVisible();
    await page.getByRole('combobox', { name: 'Eksempelprodukt', exact: true }).selectOption('pizza');
    await page.getByRole('button', { name: 'Vis fordeling', exact: true }).click();
    await expect(page.getByLabel('Fordeling', { exact: true })).toContainText('Køkken p1: 1 × Pizza Margherita');
    await page.getByRole('button', { name: 'Rediger regel', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Gem routingregler', exact: true })).toBeDisabled();
    await page.getByRole('combobox', { name: 'Handling', exact: true }).selectOption('exclude');
    await page.getByRole('button', { name: 'Gem regelændring', exact: true }).click();
    await expect(page.getByRole('cell', { name: 'Udelad', exact: true })).toBeVisible();
    await expect(page.getByLabel('Fordeling', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Vis fordeling', exact: true }).click();
    await expect(page.getByLabel('Fordeling', { exact: true })).toContainText('Ingen printer valgt af reglerne.');
    await page.getByRole('button', { name: 'Rediger regel', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Gem routingregler', exact: true })).toBeDisabled();
    await page.getByRole('combobox', { name: 'Handling', exact: true }).selectOption('include');
    await page.getByRole('button', { name: 'Gem regelændring', exact: true }).click();
    fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
    await page.screenshot({ path: path.join(root, 'test-results', `printing-config-routing-${size}.png`), fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1);
    await page.getByRole('button', { name: 'Gem routingregler', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Routingreglerne er gemt.');
    assert.deepEqual(f.writes, [{ brandId: 'a', locationId: 'la', expectedRevision: 0, rules: [{ id: 'rule-1', brandId: 'a', locationId: 'la', printerId: 'p1', effect: 'include', match: { type: 'category', id: 'food' } }] }]);
    assert.equal(/credential|token|password|secret|customer|email|phone/.test(JSON.stringify(f.writes)), false);
    await page.getByRole('button', { name: 'Genindlæs', exact: true }).click();
    await expect(page.getByRole('cell', { name: 'Pizzaer', exact: true })).toBeVisible();
    await expect(page.getByText('Gemt version 1', { exact: true })).toBeVisible(); assert.deepEqual(errors, []);
  });
}
test('scope/session/read races fail closed and never retain stale routing rows', async t => {
  const context = await browser.newContext(); t.after(() => context.close()); const page = await context.newPage();
  let release, started; const first = new Promise(resolve => { started = resolve; });
  fixtureRoutes(page, { intercept: async ({ route, request, url, scope }) => {
    if (request.method() === 'GET' && url.pathname === '/api/superadmin/printers/routing' && scope.brandId === 'a') { started(); await new Promise(resolve => { release = resolve; });
      await route.fulfill({ status: 401, json: { error: 'PRIVATE' } }).catch(() => {}); return true; }
    return false;
  } });
  await page.goto(origin); await choose(page); await first; await choose(page, 'b', 'lb');
  await expect(page.getByText('Ingen routingregler. Tilføj en regel for at fordele produkter.')).toBeVisible();
  release(); await expect(page.getByRole('button', { name: 'Gem routingregler', exact: true })).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0); assert.equal((await page.locator('body').innerText()).includes('PRIVATE'), false);
});
test('conflict, defaultOFF and uncertain save require manual refresh; expired session clears data', async t => {
  const context = await browser.newContext(); t.after(() => context.close()); const page = await context.newPage(); let failure = 409, writes = 0;
  fixtureRoutes(page, { intercept: async ({ route, request }) => {
    if (request.method() !== 'PUT') return false;
    writes++; if (failure === 'network') await route.abort(); else await route.fulfill({ status: failure, json: { error: 'PRIVATE' } }); return true;
  } });
  await page.goto(origin); await choose(page); await addCategoryRule(page);
  for (const [code, text] of [[409, /Genindlæs før du gemmer igen/], [503, /Lagring er ikke tilgængelig/], ['network', /uklart, om reglerne blev gemt/]]) {
    failure = code; await page.getByRole('button', { name: 'Gem routingregler', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText(text); await expect(page.getByRole('button', { name: 'Gem routingregler', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Genindlæs', exact: true }).click();
    await expect(page.getByText('Ingen routingregler. Tilføj en regel for at fordele produkter.')).toBeVisible(); await addCategoryRule(page);
  }
  failure = 401; await page.getByRole('button', { name: 'Gem routingregler', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Din session er udløbet. Log ind igen.');
  await expect(page.getByRole('table')).toHaveCount(0); await expect(page.getByRole('button', { name: 'Gem routingregler', exact: true })).toHaveCount(0);
  assert.equal(writes, 4); assert.equal((await page.locator('body').innerText()).includes('PRIVATE'), false);
});
test('pending save locks scope and retains result after write grant revocation without retry', async t => {
  const context = await browser.newContext(); t.after(() => context.close()); const page = await context.newPage(); let release, started, writes = 0;
  const wait = new Promise(resolve => { started = resolve; });
  fixtureRoutes(page, { intercept: async ({ route, request, body, scope, printer }) => {
    if (request.method() !== 'PUT') return false; writes++; started(); await new Promise(resolve => { release = resolve; });
    await route.fulfill({ json: { scope, revision: 1, rules: canonicalRules(body.rules), printers: [printer], referencesVerified: true, dispatchAuthorized: false } }); return true;
  } });
  await page.goto(origin); await choose(page); await addCategoryRule(page);
  await page.getByRole('button', { name: 'Gem routingregler', exact: true }).click(); await wait;
  await expect(page.getByRole('combobox', { name: 'Brand', exact: true })).toBeDisabled();
  await expect(page.getByRole('combobox', { name: 'Lokation', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Genindlæs', exact: true })).toBeDisabled();
  await page.evaluate(() => window.setPrinterWriteScopes([])); release();
  await expect(page.getByRole('status')).toHaveText('Routingreglerne er gemt.');
  await expect(page.getByRole('button', { name: 'Gem routingregler', exact: true })).toBeDisabled(); assert.equal(writes, 1);
});
test('foreign saved DTO fails closed before exposing or editing routing', async t => {
  const context = await browser.newContext(); t.after(() => context.close()); const page = await context.newPage();
  fixtureRoutes(page, { intercept: async ({ route, request, url }) => {
    if (request.method() === 'GET' && url.pathname === '/api/superadmin/printers/routing') {
      await route.fulfill({ json: { scope: { brandId: 'FOREIGN', locationId: 'FOREIGN' }, revision: null, rules: [], printers: [], referencesVerified: true, dispatchAuthorized: false } }); return true;
    } return false;
  } });
  await page.goto(origin); await choose(page); await expect(page.getByRole('alert')).toHaveText('Routing kunne ikke indlæses. Prøv igen.');
  await expect(page.getByRole('button', { name: 'Gem routingregler', exact: true })).toHaveCount(0);
});
test('malformed preview never displays injected provider details and keeps editable rules', async t => {
  const context = await browser.newContext(); t.after(() => context.close()); const page = await context.newPage();
  fixtureRoutes(page, { intercept: async ({ route, request, url }) => {
    if (request.method() === 'POST' && url.pathname.endsWith('/preview')) { await route.fulfill({ json: { PRIVATE_PROVIDER_DETAIL: true } }); return true; } return false;
  } });
  await page.goto(origin); await choose(page); await addCategoryRule(page);
  await page.getByRole('combobox', { name: 'Eksempelprodukt', exact: true }).selectOption('pizza');
  await page.getByRole('button', { name: 'Vis fordeling', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Eksempelvisningen kunne ikke beregnes. Prøv igen.');
  await expect(page.getByLabel('Fordeling', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('cell', { name: 'Pizzaer', exact: true })).toBeVisible();
  assert.equal((await page.locator('body').innerText()).includes('PRIVATE_PROVIDER_DETAIL'), false);
});


const staleWarning = 'Gemte regler har utilgængelige referencer. Fjern eller erstat dem, og gem igen før eksempelvisning.';
for (const [size, width, height] of [['desktop', 1440, 900], ['mobile', 375, 667]]) for (const missing of ['printer', 'product', 'category']) {
  test(`stale ${missing} management rules stay repairable with exact CAS and canonical readback at ${size}`, async t => {
    const context = await browser.newContext({ viewport: { width, height } }); t.after(() => context.close());
    const page = await context.newPage(), mutations = []; let canonical;
    const legacy = { id: 'legacy', brandId: 'a', locationId: 'la', printerId: missing === 'printer' ? 'removed-printer' : 'p1', effect: 'include',
      match: missing === 'printer' ? { type: 'all' } : { type: missing, id: 'removed-' + missing } };
    const f = fixtureRoutes(page, { intercept: async ({ route, request, url, body, scope, printer }) => {
      if (url.pathname !== '/api/superadmin/printers/routing') return false;
      if (request.method() === 'GET') { await route.fulfill({ json: canonical || { scope, revision: 9, rules: [legacy], printers: [], referencesVerified: false, dispatchAuthorized: false } }); return true; }
      if (request.method() === 'PUT') { mutations.push(body); canonical = { scope, revision: 10, rules: canonicalRules(body.rules), printers: body.rules.length ? [printer] : [], referencesVerified: true, dispatchAuthorized: false };
        await route.fulfill({ json: canonical }); return true; }
      return false;
    } });
    await page.goto(origin); await choose(page);
    await expect(page.getByText(staleWarning, { exact: true }).or(page.getByRole('alert'))).toBeVisible();
    fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
    await page.screenshot({ path: path.join(root, 'test-results', `printing-overview-routing-stale-${missing}-${size}.png`), fullPage: true });
    assert.equal(await page.getByText(staleWarning, { exact: true }).count(), 1, 'owned referencesVerified:false GET must expose repair state, not a generic load failure');
    await expect(page.getByText(staleWarning, { exact: true })).toBeVisible();
    await expect(page.getByText('Gemt version 9', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Gem routingregler', exact: true })).toBeEnabled();
    await page.getByRole('combobox', { name: 'Eksempelprodukt', exact: true }).selectOption('pizza');
    await expect(page.getByRole('button', { name: 'Vis fordeling', exact: true })).toBeDisabled();
    const unavailable = missing === 'printer' ? 'Printer ikke tilgængelig' : missing === 'product' ? 'Produkt ikke tilgængeligt (gemt valg)' : 'Kategori ikke tilgængelig (gemt valg)';
    await expect(page.getByRole('cell', { name: unavailable, exact: true })).toBeVisible();
    if (missing === 'category') await page.getByRole('button', { name: 'Fjern regel', exact: true }).click();
    else {
      await page.getByRole('button', { name: 'Rediger regel', exact: true }).click();
      if (missing === 'printer') { await expect(page.getByRole('option', { name: 'Printer ikke tilgængelig (gemt valg)', exact: true })).toHaveCount(1); await page.getByRole('combobox', { name: 'Printer', exact: true }).selectOption('p1'); }
      else { await expect(page.getByRole('option', { name: 'Produkt ikke tilgængeligt (gemt valg)', exact: true })).toHaveCount(1); await page.getByRole('combobox', { name: 'Produkt', exact: true }).selectOption('pizza'); }
      await page.getByRole('button', { name: 'Gem regelændring', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Gem routingregler', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Routingreglerne er gemt.');
    await expect(page.getByText(staleWarning, { exact: true })).toHaveCount(0);
    assert.equal(mutations.length, 1); assert.equal(mutations[0].expectedRevision, 9); assert.equal(mutations[0].referencesVerified, undefined);
    assert.deepEqual(Object.keys(mutations[0]).sort(), ['brandId', 'expectedRevision', 'locationId', 'rules']);
    assert.equal(mutations[0].rules.length, missing === 'category' ? 0 : 1);
    if (missing !== 'category') assert.equal(mutations[0].rules[0].printerId, 'p1');
    assert.equal(f.requests.filter(r => r.url.endsWith('/preview')).length, 0);
    await page.getByRole('button', { name: 'Genindlæs', exact: true }).click();
    await expect(page.getByText('Gemt version 10', { exact: true })).toBeVisible();
    await expect(page.getByText(staleWarning, { exact: true })).toHaveCount(0);
    if (missing === 'category') await expect(page.getByText('Ingen routingregler. Tilføj en regel for at fordele produkter.')).toBeVisible();
    else await expect(page.getByRole('cell', { name: 'Køkken p1', exact: true })).toBeVisible();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1);
    fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
    await page.screenshot({ path: path.join(root, 'test-results', `printing-overview-routing-repair-${missing}-${size}.png`), fullPage: true });
  });
}
test('management false DTO never admits hydrated printers, missing revisions or foreign/duplicate stored identities', async t => {
  const scope = { brandId: 'a', locationId: 'la' }, legacy = { id: 'legacy', ...scope, printerId: 'missing', effect: 'include', match: { type: 'all' } };
  for (const patch of [{ printers: [item('p1')] }, { revision: null }, { rules: [legacy, legacy] }, { rules: [{ ...legacy, brandId: 'foreign' }] }, { referencesVerified: 'false' }, { dispatchAuthorized: true }]) {
    const context = await browser.newContext(); t.after(() => context.close()); const page = await context.newPage();
    fixtureRoutes(page, { intercept: async ({ route, request, url }) => {
      if (request.method() === 'GET' && url.pathname === '/api/superadmin/printers/routing') { await route.fulfill({ json: { scope, revision: 9, rules: [legacy], printers: [], referencesVerified: false, dispatchAuthorized: false, ...patch } }); return true; } return false;
    } });
    await page.goto(origin); await choose(page); await expect(page.getByRole('alert')).toHaveText('Routing kunne ikke indlæses. Prøv igen.');
    await expect(page.getByRole('button', { name: 'Gem routingregler', exact: true })).toHaveCount(0);
  }
});
test('an unverified PUT response is uncertain and requires manual refresh before another save', async t => {
  const context = await browser.newContext(); t.after(() => context.close()); const page = await context.newPage(); let writes = 0;
  fixtureRoutes(page, { intercept: async ({ route, request, body, scope }) => {
    if (request.method() !== 'PUT') return false; writes++;
    await route.fulfill({ json: { scope, revision: 1, rules: canonicalRules(body.rules), printers: [], referencesVerified: false, dispatchAuthorized: false } }); return true;
  } });
  await page.goto(origin); await choose(page); await addCategoryRule(page); await page.getByRole('button', { name: 'Gem routingregler', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Det er uklart, om reglerne blev gemt. Genindlæs før du prøver igen.');
  await expect(page.getByRole('button', { name: 'Gem routingregler', exact: true })).toBeDisabled(); assert.equal(writes, 1);
});


test('canonical server rule order preserves loaded edit success while changed rule values stay uncertain', async t => {
  for (const changed of [false, true]) {
    const context = await browser.newContext(); t.after(() => context.close()); const page = await context.newPage();
    const scope = { brandId: 'a', locationId: 'la' };
    const stored = printerRoutingRuleSchema.parse({ id: 'loaded', ...scope, printerId: 'p1', effect: 'include', match: { type: 'category', id: 'food' } });
    let canonical = { scope, revision: 9, rules: [stored], printers: [item('p1')], referencesVerified: true, dispatchAuthorized: false }, writes = 0;
    fixtureRoutes(page, { intercept: async ({ route, request, url, body }) => {
      if (url.pathname !== '/api/superadmin/printers/routing') return false;
      if (request.method() === 'GET') { await route.fulfill({ json: canonical }); return true; }
      if (request.method() === 'PUT') {
        writes++; assert.equal(body.expectedRevision, 9);
        const parsed = canonicalRules(body.rules);
        assert.deepEqual(Object.keys(parsed[0]), ['id', 'brandId', 'locationId', 'printerId', 'match', 'effect']);
        assert.ok(Object.keys(body.rules[0]).indexOf('effect') < Object.keys(body.rules[0]).indexOf('match'));
        canonical = { ...canonical, revision: 10, rules: changed ? parsed.map(rule => ({ ...rule, effect: 'include' })) : parsed };
        await route.fulfill({ json: canonical }); return true;
      }
      return false;
    } });
    await page.goto(origin); await choose(page);
    await expect(page.getByText('Gemt version 9', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Rediger regel', exact: true }).click();
    await page.getByRole('combobox', { name: 'Handling', exact: true }).selectOption('exclude');
    await page.getByRole('button', { name: 'Gem regelændring', exact: true }).click();
    await page.getByRole('button', { name: 'Gem routingregler', exact: true }).click();
    if (changed) {
      await expect(page.getByRole('alert')).toHaveText('Det er uklart, om reglerne blev gemt. Genindlæs før du prøver igen.');
      await expect(page.getByRole('button', { name: 'Gem routingregler', exact: true })).toBeDisabled();
    } else {
      await expect(page.getByRole('status')).toHaveText('Routingreglerne er gemt.');
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expect(page.getByText('Gemt version 10', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Genindlæs', exact: true }).click();
      await expect(page.getByText('Gemt version 10', { exact: true })).toBeVisible();
      await expect(page.getByRole('cell', { name: 'Udelad', exact: true })).toBeVisible();
    }
    assert.equal(writes, 1);
  }
});
