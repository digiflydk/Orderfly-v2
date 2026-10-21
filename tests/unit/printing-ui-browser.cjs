// Render the actual superadmin React overview with production CSS. Only API data
// and server-provided authorized selector metadata are synthetic, never a login.
// Shell regressions compose the real SuperAdminLayoutClient/sidebar and overview.
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
    import {SuperAdminLayoutClient} from ${JSON.stringify(path.join(root, 'src/components/superadmin/superadmin-layout-client.tsx'))};
    const writes = new URLSearchParams(location.search).has('writes') ? [{id:'la',brandId:'a'}] : [];
    function Fixture(){const [catalog,setCatalog]=React.useState({brands:${JSON.stringify(brands)},locations:${JSON.stringify(locations)}});window.setPrinterReadCatalog=setCatalog;const [scopes,setScopes]=React.useState(writes);const [deleteScopes,setDeleteScopes]=React.useState(writes);const [identity,setIdentity]=React.useState(0);window.resetPrinterContext=()=>setIdentity(value=>value+1);window.setPrinterWriteScopes=value=>{setScopes(value);setDeleteScopes(value);};window.setPrinterDeleteScopes=setDeleteScopes;return React.createElement(PrinterOverview,{key:identity,brands:[...catalog.brands],locations:[...catalog.locations],createLocations:scopes,editLocations:scopes,deleteLocations:deleteScopes});}
    const overview=React.createElement(Fixture);
    createRoot(document.getElementById('root')).render(location.pathname==='/shell' ? React.createElement(SuperAdminLayoutClient,{centralAdmin:true,access:{superuser:true,permissions:['orderfly.catalog:view']}},overview) : overview);`);
  const navigation = path.join(dir, 'navigation.js');
  fs.writeFileSync(navigation, `export const usePathname=()=>'/superadmin/printers';export const useRouter=()=>({push(){},refresh(){}});export const useSearchParams=()=>new URLSearchParams();`);
  const auth = path.join(dir, 'auth.js');
  fs.writeFileSync(auth, `export async function getSuperadminUserContext(){return null;}`);
  const link = path.join(dir, 'link.js');
  fs.writeFileSync(link, `import React from 'react';export default function Link({href,children,...props}){return React.createElement('a',{href,...props},children);}`);
  const picture = path.join(dir, 'image.js');
  fs.writeFileSync(picture, `import React from 'react';export default function Image({priority,fill,src,...props}){return React.createElement('img',{src:'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22232%22 height=%2254%22/%3E',...props});}`);
  const loader = path.join(dir, 'loader.js');
  fs.writeFileSync(loader, `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
  await new Promise((resolve, reject) => webpackModule.webpack({ mode: 'development', devtool: false, entry,
    output: { path: dir, filename: 'bundle.js' },
    resolve: { alias: { '@/components/superadmin/admin-link': link, '@/lib/auth/superadmin-context': auth, 'next/navigation': navigation, 'next/image': picture, '@': path.join(root, 'src') }, extensions: ['.tsx', '.ts', '.js'], modules: [path.join(root, 'node_modules'), 'node_modules'] },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [loader] }] },
  }).run((error, stats) => error ? reject(error) : stats.hasErrors() ? reject(Error(stats.toString({ all: false, errors: true }))) : resolve()));
  execFileSync(path.join(root, 'node_modules/.bin/tailwindcss'), ['-c', path.join(root, 'tailwind.config.ts'), '-i', path.join(root, 'src/app/globals.css'), '-o', path.join(dir, 'styles.css'), '--minify'], { cwd: root, stdio: 'pipe' });
  const styles = fs.readFileSync(path.join(dir, 'styles.css'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'src/styles/admin-ui.css'), 'utf8');
  server = http.createServer((req, res) => {
    if (req.url === '/bundle.js') { res.setHeader('content-type', 'application/javascript'); return res.end(fs.readFileSync(path.join(dir, 'bundle.js'))); }
    if (req.url === '/styles.css') { res.setHeader('content-type', 'text/css'); return res.end(styles); }
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end('<!doctype html><html lang="da"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body>' + (req.url.split('?')[0] === '/shell' ? '<div id="root"></div>' : '<main class="admin-shell min-h-screen bg-background p-4 md:p-8"><div id="root" class="mx-auto max-w-6xl"></div></main>') + '<script src="/bundle.js"></script></body></html>');
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
    await expect(page.getByRole('table', { name: 'Printere', exact: true })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Lokation', exact: true })).toBeEnabled();
    await expect(page.getByRole('combobox', { name: 'Printertype', exact: true })).toBeEnabled();
    await choose(page);
    await expect(page.getByText('Active', { exact: true })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Printere', exact: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Aktiveringsdato', exact: true })).toBeVisible();
    await expect(page.getByText('Ikke registreret', { exact: true })).toHaveCount(60);
    await expect(page.getByText('CloudPRNT HTTP', { exact: false })).toHaveCount(20);
    await expect(page.getByText(/58 mm/, { exact: false })).toHaveCount(20);
    assert.ok(requests.some(row => row.method === 'GET' && row.brand === 'a' && row.location === 'la' && row.limit === '20' && row.after === null));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1);
    fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
    await page.screenshot({ path: path.join(root, 'test-results', `printing-overview-${name}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Næste side' }).click();
    await expect(page.getByText('Køkken p21', { exact: true })).toBeVisible();
    await expect(page.getByText('Ikke registreret', { exact: true })).toHaveCount(3);
    assert.equal(requests.at(-1).after, 'p20');
    await page.getByRole('button', { name: 'Første side' }).click();
    await expect(page.getByRole('button', { name: 'Næste side' })).toBeVisible();
    assert.equal(requests.at(-1).after, null);
    await page.getByRole('combobox', { name: 'Brand', exact: true }).selectOption('b');
    await expect(page.getByRole('table', { name: 'Printere', exact: true })).toBeVisible();
    await expect(page.getByText('Køkken p21', { exact: true })).toHaveCount(0);
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

async function fillNew(page, printerId = 'new_printer') {
  await page.getByRole('button', { name: 'Tilføj printer', exact: true }).click();
  await page.getByRole('textbox', { name: 'Printer-ID', exact: true }).fill(printerId);
  await page.getByRole('textbox', { name: 'Printernavn', exact: true }).fill('Køkken Østerbro');
}
for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 375, 667]]) {
  test(`disabled create and revisioned edit use exact credential-free DTO at ${name} width`, async t => {
    const context = await browser.newContext({ viewport: { width, height } }); t.after(() => context.close());
    const page = await context.newPage(), mutations = []; let saved, release, started;
    const pending = new Promise(resolve => { started = resolve; });
    await page.route('**/api/merchant/printers**', async route => {
      const req = route.request();
      if (req.method() === 'GET') return route.fulfill({ json: { items: saved ? [saved] : [], nextCursor: null } });
      const body = req.postDataJSON(); mutations.push({ method: req.method(), body });
      if (req.method() === 'POST') { started(); await new Promise(resolve => { release = resolve; }); }
      saved = { configuration: body.configuration, revision: body.revision ? body.revision + 1 : 1 };
      await route.fulfill({ status: req.method() === 'POST' ? 201 : 200, json: { item: saved } });
    });
    await page.goto(origin + '?writes'); await choose(page); await fillNew(page);
    // Playwright's form-control enabled matcher does not model native<option>
    // disabledness. Assert the browser DOM property, then exercise real select
    // keyboard navigation; the subsequent exact POST proves only HTTP/58 is sent.
    assert.equal(await page.getByRole('option', { name: '80 mm', exact: true }).evaluate(option => option.disabled), true);
    assert.equal(await page.getByRole('option', { name: /CloudPRNT MQTT/ }).evaluate(option => option.disabled), true);
    const widthSelect = page.getByRole('combobox', { name: 'Papirbredde', exact: true });
    await widthSelect.focus(); await widthSelect.press('End');
    await expect(widthSelect).toHaveValue('58');
    const transportSelect = page.getByRole('combobox', { name: 'Printtransport', exact: true });
    await transportSelect.focus(); await transportSelect.press('End');
    await expect(transportSelect).toHaveValue('cloudprnt-http');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1);
    await page.screenshot({ path: path.join(root, 'test-results', `printing-config-${name}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Gem deaktiveret printer' }).click(); await pending;
    await expect(page.getByRole('button', { name: 'Gemmer…' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Annuller', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Opdater', exact: true })).toBeDisabled();
    await expect(page.getByRole('combobox', { name: 'Brand', exact: true })).toBeDisabled();
    await expect(page.getByRole('combobox', { name: 'Lokation', exact: true })).toBeDisabled();
    assert.equal(mutations.length, 1);
    release(); await expect(page.getByText('Printeropsætningen er gemt som deaktiveret.', { exact: true })).toBeVisible();
    assert.deepEqual(mutations[0], { method: 'POST', body: { configuration: { id: 'new_printer', brandId: 'a', locationId: 'la', name: 'Køkken Østerbro', manufacturer: 'star', model: 'mc-print2', transport: 'cloudprnt-http', state: 'disabled', paperWidthMm: 58 } } });
    await page.getByRole('button', { name: 'Rediger Køkken Østerbro', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Printer-ID', exact: true })).toBeDisabled();
    assert.equal(await page.getByRole('textbox', { name: 'Printer-ID', exact: true }).inputValue(), 'new_printer');
    await page.getByRole('combobox', { name: 'Printermodel', exact: true }).selectOption('mc-print3');
    await page.getByRole('combobox', { name: 'Printtransport', exact: true }).selectOption('cloudprnt-mqtt');
    await page.getByRole('combobox', { name: 'Papirbredde', exact: true }).selectOption('80');
    await expect(page.getByText(/MQTT/).filter({ hasText: 'model-' })).toHaveCount(1);
    await page.getByRole('button', { name: 'Gem deaktiveret printer' }).click();
    await expect(page.getByRole('button', { name: 'Rediger Køkken Østerbro', exact: true })).toBeVisible();
    assert.equal(mutations[1].method, 'PATCH'); assert.equal(mutations[1].body.revision, 1);
    assert.deepEqual(mutations[1].body.configuration, { ...mutations[0].body.configuration, model: 'mc-print3', transport: 'cloudprnt-mqtt', paperWidthMm: 80 });
    assert.equal(/credential|token|password|secret|email|phone|MAC|firmware/.test(JSON.stringify(mutations)), false);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1);
  });
}
test('write errors retain ordinary input, require fresh conflict data and clear an expired session', async t => {
  const context = await browser.newContext(); t.after(() => context.close()); const page = await context.newPage();
  let status = 400, writes = 0, reads = 0;
  await page.route('**/api/merchant/printers**', route => {
    if (route.request().method() === 'GET') { reads++; return route.fulfill({ json: { items: [item('prior', 'a', 'la', { state: 'disabled' })], nextCursor: null } }); }
    writes++; return route.fulfill({ status, json: { error: status === 503 ? 'writes_unavailable' : 'PRIVATE_PROVIDER_DETAIL' } });
  });
  await page.goto(origin + '?writes'); await choose(page); await fillNew(page);
  for (const [code, text] of [[400, 'Opsætningen blev afvist. Kontrollér felterne og prøv igen.'], [503, 'Lagring af printeropsætning er ikke tilgængelig. Funktionen kan være slået fra. Prøv igen senere.']]) {
    status = code; await page.getByRole('button', { name: 'Gem deaktiveret printer' }).click();
    await expect(page.getByRole('alert')).toHaveText(text);
    assert.equal(await page.getByRole('textbox', { name: 'Printernavn', exact: true }).inputValue(), 'Køkken Østerbro');
    await expect(page.getByRole('button', { name: 'Gem deaktiveret printer' })).toBeEnabled();
  }
  for (const [code, text] of [[409, /Printeren er ændret/], [403, /Du har ikke adgang til at gemme/], [404, /Printeren findes ikke længere/]]) {
    status = code; await page.getByRole('button', { name: 'Gem deaktiveret printer' }).click();
    await expect(page.getByRole('alert')).toHaveText(text);
    await expect(page.getByRole('button', { name: 'Gem deaktiveret printer' })).toBeDisabled();
    await page.getByRole('button', { name: 'Opdater oversigten', exact: true }).click(); await fillNew(page);
  }
  const readsBeforeExpiry = reads;
  status = 401; await page.getByRole('button', { name: 'Gem deaktiveret printer' }).click();
  await expect(page.getByRole('form', { name: 'Tilføj printer' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Tilføj printer', exact: true })).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveText('Din session er udløbet. Log ind igen.');
  assert.equal((await page.locator('body').innerText()).includes('PRIVATE_PROVIDER_DETAIL'), false); assert.equal(writes, 6);
  await expect(page.getByText('Køkken prior', { exact: true })).toHaveCount(0);
  // Clearing the editor and receiving fresh same-scope metadata must not
  // silently authenticate again or restore write controls after a mutation401.
  await page.evaluate(() => window.setPrinterWriteScopes([{ id: 'la', brandId: 'a' }]));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(reads, readsBeforeExpiry);
  await expect(page.getByRole('button', { name: 'Tilføj printer', exact: true })).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveText('Din session er udløbet. Log ind igen.');
  // A deliberate refresh can revalidate the current session through a fresh GET.
  await page.getByRole('button', { name: 'Opdater', exact: true }).click();
  await expect(page.getByText('Køkken prior', { exact: true })).toBeVisible();
  assert.equal(reads, readsBeforeExpiry + 1);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Tilføj printer', exact: true }).click();
  assert.equal(await page.getByRole('textbox', { name: 'Printernavn', exact: true }).inputValue(), '');
  assert.equal(await page.getByRole('textbox', { name: 'Printer-ID', exact: true }).inputValue(), '');
});
test('view-only metadata and independently scoped grants never expose unauthorized write controls', async t => {
  const context = await browser.newContext(); t.after(() => context.close()); const page = await context.newPage();
  await page.route('**/api/merchant/printers**', route => route.fulfill({ json: { items: [item('p1', 'a', 'la', { state: 'disabled' }), item('p2')], nextCursor: null } }));
  await page.goto(origin); await choose(page); await expect(page.getByText('Køkken p1', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tilføj printer', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Rediger Køkken p1', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Slet Køkken p1', exact: true })).toBeDisabled();
  await page.goto(origin + '?writes'); await choose(page);
  await expect(page.getByRole('button', { name: 'Rediger Køkken p1', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rediger Køkken p2', exact: true })).toBeDisabled();
  await choose(page, 'b', 'lb'); await expect(page.getByRole('button', { name: 'Tilføj printer', exact: true })).toHaveCount(0);
});
for (const lateStatus of [201, 401]) test(`late ${lateStatus} mutation response cannot restore form or session state after server context and scope change`, async t => {
  const context = await browser.newContext(); t.after(() => context.close()); const page = await context.newPage();
  let release, started; const pending = new Promise(resolve => { started = resolve; });
  await page.route('**/api/merchant/printers**', async route => {
    const req = route.request(); if (req.method() === 'GET') return route.fulfill({ json: { items: [], nextCursor: null } });
    const configuration = req.postDataJSON().configuration; started(); await new Promise(resolve => { release = resolve; });
    await route.fulfill({ status: lateStatus, json: { item: { configuration, revision: 1 } } }).catch(() => {});
  });
  await page.goto(origin + '?writes'); await choose(page); await fillNew(page);
  await page.getByRole('button', { name: 'Gem deaktiveret printer' }).click(); await pending;
  await expect(page.getByRole('combobox', { name: 'Brand', exact: true })).toBeDisabled();
  await page.evaluate(() => window.resetPrinterContext());
  await choose(page, 'b', 'lb'); release();
  await expect(page.getByRole('form', { name: 'Tilføj printer' })).toHaveCount(0);
  await expect(page.getByText('Printeropsætningen er gemt som deaktiveret.', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Ingen printere på denne lokation.', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await choose(page); await page.getByRole('button', { name: 'Tilføj printer', exact: true }).click();
  assert.equal(await page.getByRole('textbox', { name: 'Printernavn', exact: true }).inputValue(), '');
});

test('fresh revoked write metadata unmounts and clears a prepared form', async t => {
  const context = await browser.newContext(); t.after(() => context.close()); const page = await context.newPage();
  await page.route('**/api/merchant/printers**', route => route.fulfill({ json: { items: [], nextCursor: null } }));
  await page.goto(origin + '?writes'); await choose(page); await fillNew(page);
  await page.evaluate(() => window.setPrinterWriteScopes([]));
  await expect(page.getByRole('form', { name: 'Tilføj printer' })).toHaveCount(0);
  await page.evaluate(() => window.setPrinterWriteScopes([{ id: 'la', brandId: 'a' }]));
  await page.getByRole('button', { name: 'Tilføj printer', exact: true }).click();
  await expect(page.getByRole('form', { name: 'Tilføj printer' })).toBeVisible();
  assert.equal(await page.getByRole('textbox', { name: 'Printernavn', exact: true }).inputValue(), '');
});

test('foreign, wrong-revision or generic unavailable outcomes require refresh', async t => {
  const context = await browser.newContext(); t.after(() => context.close()); const page = await context.newPage();
  let outcome = 'foreign';
  await page.route('**/api/merchant/printers**', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { items: [], nextCursor: null } });
    const configuration = route.request().postDataJSON().configuration;
    if (outcome === 'unavailable') return route.fulfill({ status: 503, json: { error: 'PRIVATE_PROVIDER_DETAIL' } });
    return route.fulfill({ status: 201, json: { item: { configuration: { ...configuration, ...(outcome === 'foreign' ? { brandId: 'b', locationId: 'lb' } : {}) }, revision: outcome === 'foreign' ? 1 : 9 } } });
  });
  await page.goto(origin + '?writes'); await choose(page);
  for (const value of ['foreign', 'revision', 'unavailable']) {
    outcome = value; await fillNew(page); await page.getByRole('button', { name: 'Gem deaktiveret printer' }).click();
    await expect(page.getByRole('alert')).toHaveText('Kunne ikke bekræfte, om opsætningen blev gemt. Opdater oversigten før et nyt forsøg.');
    await expect(page.getByRole('button', { name: 'Gem deaktiveret printer' })).toBeDisabled();
    await expect(page.getByText('Printeropsætningen er gemt som deaktiveret.', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Opdater oversigten', exact: true }).click();
  }
});

test('initial reads gate create and an obsolete GET401 cannot interrupt write201 or uncertain503', async t => {
  for (const writeStatus of [201, 503]) {
    const context = await browser.newContext(); t.after(() => context.close()); const page = await context.newPage();
    let getCount = 0, releaseInitial, releaseOld, releaseWrite, initialStarted, oldStarted, writeStarted, oldSettled;
    const initialPending = new Promise(resolve => { initialStarted = resolve; });
    const oldPending = new Promise(resolve => { oldStarted = resolve; });
    const writePending = new Promise(resolve => { writeStarted = resolve; });
    const oldFinished = new Promise(resolve => { oldSettled = resolve; });
    await page.route('**/api/merchant/printers**', async route => {
      const request = route.request();
      if (request.method() === 'GET') {
        getCount++;
        if (getCount <= 2) {
          if (getCount === 1) { initialStarted(); await new Promise(resolve => { releaseInitial = resolve; }); }
          return route.fulfill({ json: { items: Array.from({ length: 20 }, (_, i) => item('p' + String(i + 1).padStart(2, '0'))), nextCursor: 'p20' } });
        }
        if (getCount === 3) {
          oldStarted(); await new Promise(resolve => { releaseOld = resolve; });
          await route.fulfill({ status: 401, json: { error: 'unauthorized' } }).catch(() => {}); oldSettled(); return;
        }
        return route.fulfill({ json: { items: [], nextCursor: null } });
      }
      const configuration = request.postDataJSON().configuration;
      writeStarted(); await new Promise(resolve => { releaseWrite = resolve; });
      return route.fulfill({ status: writeStatus, json: writeStatus === 201 ? { item: { configuration, revision: 1 } } : { error: 'printers_unavailable' } });
    });
    await page.goto(origin + '?writes'); await initialPending;
    await expect(page.getByRole('status')).toHaveText('Indlæser printere…');
    await expect(page.getByRole('button', { name: 'Tilføj printer', exact: true })).toHaveCount(0);
    releaseInitial(); await expect(page.getByText('Køkken p01', { exact: true })).toBeVisible();
    await page.getByRole('combobox', { name: 'Lokation', exact: true }).selectOption('la');
    await expect(page.getByRole('button', { name: 'Tilføj printer', exact: true })).toBeVisible();
    // A same-scope server metadata refresh starts a background read while the
    // last validated page is visible. Opening the editor must abort this read.
    await page.evaluate(() => window.setPrinterWriteScopes([{ id: 'la', brandId: 'a' }])); await oldPending;
    await fillNew(page);
    await expect(page.getByRole('button', { name: 'Næste side', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Gem deaktiveret printer' }).click(); await writePending;
    // New props while editing must not start any further GET or cancel POST.
    await page.evaluate(() => window.setPrinterWriteScopes([{ id: 'la', brandId: 'a' }]));
    releaseOld(); await oldFinished;
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(getCount, 3);
    await expect(page.getByRole('form', { name: 'Tilføj printer' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Gemmer…' })).toBeDisabled();
    await expect(page.getByRole('alert')).toHaveCount(0);
    releaseWrite();
    if (writeStatus === 201) {
      await expect(page.getByText('Printeropsætningen er gemt som deaktiveret.', { exact: true })).toBeVisible();
      await expect(page.getByRole('form', { name: 'Tilføj printer' })).toHaveCount(0);
    } else {
      await expect(page.getByRole('alert')).toHaveText('Kunne ikke bekræfte, om opsætningen blev gemt. Opdater oversigten før et nyt forsøg.');
      await expect(page.getByRole('form', { name: 'Tilføj printer' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Gem deaktiveret printer' })).toBeDisabled();
      await page.getByRole('button', { name: 'Opdater oversigten', exact: true }).click();
    }
    await expect(page.getByText('Ingen printere på denne lokation.', { exact: true })).toBeVisible();
    assert.equal(getCount, 4);
  }
});

test('native write-grant revocation keeps pending POST and PATCH mounted through success or uncertainty', async t => {
  for (const operation of ['create', 'edit']) for (const fails of [false, true]) {
    const context = await browser.newContext(); t.after(() => context.close());
    const page = await context.newPage(), failures = []; let release, started, mutations = 0;
    let saved = operation === 'edit' ? item('existing', 'a', 'la', { state: 'disabled' }) : null;
    const pending = new Promise(resolve => { started = resolve; });
    page.on('requestfailed', request => { if (['POST', 'PATCH'].includes(request.method())) failures.push(request.failure()?.errorText); });
    await page.route('**/api/merchant/printers**', async route => {
      const request = route.request();
      if (request.method() === 'GET') return route.fulfill({ json: { items: saved ? [saved] : [], nextCursor: null } });
      mutations++; const { configuration, revision } = request.postDataJSON();
      assert.equal(request.method(), operation === 'edit' ? 'PATCH' : 'POST');
      if (operation === 'edit') { assert.equal(configuration.id, 'existing'); assert.equal(revision, 3); }
      started(); await new Promise(resolve => { release = resolve; });
      if (!fails) saved = { configuration, revision: revision ? revision + 1 : 1 };
      return route.fulfill({ status: fails ? 503 : operation === 'edit' ? 200 : 201, json: fails
        ? { error: 'printers_unavailable' } : { item: saved } });
    });
    await page.goto(origin + '?writes'); await choose(page);
    if (operation === 'edit') await page.getByRole('button', { name: 'Rediger Køkken existing', exact: true }).click();
    else await fillNew(page);
    await page.getByRole('button', { name: 'Gem deaktiveret printer' }).click(); await pending;
    await page.evaluate(() => window.setPrinterWriteScopes([]));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const form = page.getByRole('form', { name: operation === 'edit' ? 'Rediger printer' : 'Tilføj printer', exact: true });
    await expect(form).toBeVisible();
    await expect(page.getByRole('button', { name: 'Gemmer…' })).toBeDisabled();
    await expect(page.getByRole('textbox', { name: 'Printernavn', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Annuller', exact: true })).toBeDisabled();
    assert.deepEqual(failures, []); assert.equal(mutations, 1);
    release();
    if (!fails) await expect(page.getByText('Printeropsætningen er gemt som deaktiveret.', { exact: true })).toBeVisible();
    else await expect(page.getByRole('alert')).toHaveText('Kunne ikke bekræfte, om opsætningen blev gemt. Opdater oversigten før et nyt forsøg.');
    await expect(form).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Tilføj printer', exact: true })).toHaveCount(0);
    assert.deepEqual(failures, []); assert.equal(mutations, 1);
    if (fails) {
      await page.evaluate(() => window.setPrinterWriteScopes([{ id: 'la', brandId: 'a' }]));
      await expect(page.getByRole('button', { name: 'Tilføj printer', exact: true })).toHaveCount(0);
      await expect(page.getByRole('alert')).toHaveText('Kunne ikke bekræfte, om opsætningen blev gemt. Opdater oversigten før et nyt forsøg.');
      if (operation === 'edit') await expect(page.getByRole('button', { name: 'Rediger Køkken existing', exact: true })).toBeDisabled();
      await page.getByRole('button', { name: 'Opdater', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Tilføj printer', exact: true })).toBeVisible();
      await expect(page.getByRole('alert')).toHaveCount(0);
    }
  }
});


test('server model filter finds printers beyond first unfiltered page and retains actual scope total', async t => {
 const context = await browser.newContext(); t.after(() => context.close()); const page = await context.newPage(), seen = [];
 await page.route('**/api/merchant/printers?*', route => {
   const url = new URL(route.request().url()); seen.push(Object.fromEntries(url.searchParams));
   const filtered = url.searchParams.get('model') === 'mc-print3';
   return route.fulfill({ json: { items: filtered ? [item('p21', 'a', 'la', { model: 'mc-print3', paperWidthMm: 80 })] : [item('p01')], nextCursor: null, totalPrinters: 24 } });
 });
 await page.goto(origin); await choose(page);
 await expect(page.getByRole('table', { name: 'Printere' })).toBeVisible();
 for (const name of ['Aktiveringsdato', 'Brand', 'Lokation', 'Status', 'Last used', 'Total printers', 'Printer name', 'Printertype', 'Handlinger']) await expect(page.getByRole('columnheader', { name, exact: true })).toBeVisible();
 await expect(page.getByRole('cell', { name: '24', exact: true })).toHaveCount(1);
 await expect(page.getByRole('cell', { name: 'Nord', exact: true })).toHaveCount(1);
 await expect(page.getByText('Aldrig', { exact: true })).toHaveCount(0);
 await page.getByRole('combobox', { name: 'Printertype', exact: true }).selectOption('mc-print3');
 await expect(page.getByText('Køkken p21', { exact: true })).toBeVisible();
 await expect(page.getByText('Køkken p01', { exact: true })).toHaveCount(0);
 assert.deepEqual(seen.at(-1), { brandId: 'a', locationId: 'la', limit: '20', overview: 'true', model: 'mc-print3' });
 await expect(page.getByRole('cell', { name: '24', exact: true })).toHaveCount(1);
});

test('audited deactivate and soft-delete require confirmation and exact native revision; pending blocks context changes', async t => {
 const context = await browser.newContext(); t.after(() => context.close()); const page = await context.newPage(), mutations = [];
 let saved = item('p1'), release, started; const pending = new Promise(resolve => { started = resolve; });
 await page.route('**/api/merchant/printers**', async route => {
  if (route.request().method() === 'GET') return route.fulfill({ json: { items: saved ? [saved] : [], nextCursor: null, totalPrinters: saved ? 1 : 0 } });
  const input = route.request().postDataJSON(); mutations.push(input);
  assert.equal(new URL(route.request().url()).pathname, '/api/merchant/printers/lifecycle');
  if (input.action === 'deactivate') {
   started(); await new Promise(resolve => { release = resolve; });
   saved = { ...saved, configuration: { ...saved.configuration, state: 'disabled' }, revision: 4 };
   return route.fulfill({ json: { item: saved } });
  }
  saved = null; return route.fulfill({ json: { deleted: true, printerId: input.printerId, revision: input.revision + 1 } });
 });
 await page.goto(origin + '?writes'); await choose(page);
 await page.getByRole('button', { name: 'Deaktiver Køkken p1', exact: true }).click();
 assert.equal(mutations.length, 0); await expect(page.getByRole('dialog', { name: 'Deaktiver printer' })).toBeVisible();
 await page.getByRole('button', { name: 'Deaktiver printer', exact: true }).click(); await pending;
 for (const name of ['Brand', 'Lokation', 'Printertype']) await expect(page.getByRole('combobox', { name, exact: true })).toBeDisabled();
 await expect(page.getByRole('button', { name: 'Annuller', exact: true })).toBeDisabled();
 await expect(page.getByRole('button', { name: 'Gemmer…', exact: true })).toBeDisabled(); assert.equal(mutations.length, 1);
 release(); await expect(page.getByRole('dialog')).toHaveCount(0); await expect(page.getByText('Deactive', { exact: true })).toBeVisible();
 assert.deepEqual(mutations[0], { brandId: 'a', locationId: 'la', printerId: 'p1', revision: 3, action: 'deactivate' });
 await page.getByRole('button', { name: 'Slet Køkken p1', exact: true }).click();
 await expect(page.getByText('Printeren fjernes fra oversigten. Historik og tidligere printjobs bevares.', { exact: true })).toBeVisible();
 assert.equal(mutations.length, 1); await page.getByRole('button', { name: 'Slet printer', exact: true }).click();
 await expect(page.getByText('Ingen printere på denne lokation.', { exact: true })).toBeVisible();
 assert.deepEqual(mutations[1], { brandId: 'a', locationId: 'la', printerId: 'p1', revision: 4, action: 'delete' });
 assert.equal(mutations.length, 2);
});

test('delete uses its own native grant; conflicts, output-off and uncertain lifecycle outcomes never silently replay', async t => {
 const context = await browser.newContext(); t.after(() => context.close()); const page = await context.newPage(); let status = 409, code = 'record_conflict', writes = 0;
 await page.route('**/api/merchant/printers**', route => {
  if (route.request().method() === 'GET') return route.fulfill({ json: { items: [item('p1')], nextCursor: null, totalPrinters: 1 } });
  writes++; return route.fulfill({ status, json: { error: code } });
 });
 await page.goto(origin + '?writes'); await choose(page); await page.evaluate(() => window.setPrinterDeleteScopes([]));
 await expect(page.getByRole('button', { name: 'Slet Køkken p1', exact: true })).toBeDisabled();
 await expect(page.getByRole('button', { name: 'Deaktiver Køkken p1', exact: true })).toBeEnabled();
 await page.evaluate(() => window.setPrinterDeleteScopes([{ id: 'la', brandId: 'a' }]));
 await page.getByRole('button', { name: 'Slet Køkken p1', exact: true }).click(); await page.getByRole('button', { name: 'Slet printer', exact: true }).click();
 await expect(page.getByRole('alert')).toHaveText('Printeren er ændret. Opdater oversigten før et nyt forsøg.');
 await expect(page.getByRole('button', { name: 'Slet printer', exact: true })).toBeDisabled(); assert.equal(writes, 1);
 await page.getByRole('button', { name: 'Opdater oversigten', exact: true }).click(); status = 503; code = 'writes_unavailable';
 await page.getByRole('button', { name: 'Slet Køkken p1', exact: true }).click(); await page.getByRole('button', { name: 'Slet printer', exact: true }).click();
 await expect(page.getByRole('alert')).toHaveText('Printerændringer er slået fra. Prøv igen senere.');
 await expect(page.getByRole('button', { name: 'Slet printer', exact: true })).toBeEnabled(); assert.equal(writes, 2);
 code = 'PRIVATE_PROVIDER_DETAIL'; await page.getByRole('button', { name: 'Slet printer', exact: true }).click();
 await expect(page.getByRole('alert')).toHaveText('Kunne ikke bekræfte printerhandlingen. Opdater oversigten før et nyt forsøg.');
 await expect(page.getByRole('button', { name: 'Slet printer', exact: true })).toBeDisabled(); assert.equal(writes, 3);
 assert.equal((await page.locator('body').innerText()).includes('PRIVATE_PROVIDER_DETAIL'), false);
 await page.getByRole('button', { name: 'Opdater oversigten', exact: true }).click(); status = 401;
 await page.getByRole('button', { name: 'Slet Køkken p1', exact: true }).click(); await page.getByRole('button', { name: 'Slet printer', exact: true }).click();
 await expect(page.getByRole('alert')).toHaveText('Din session er udløbet. Log ind igen.'); await expect(page.getByRole('dialog')).toHaveCount(0); await expect(page.getByText('Køkken p1', { exact: true })).toHaveCount(0);
});

test('revoking a native delete grant retains pending lifecycle until response and preserves unknown-outcome refresh', async t => {
 const context = await browser.newContext(); t.after(() => context.close()); const page = await context.newPage(); let release, started;
 const pending = new Promise(resolve => { started = resolve; });
 await page.route('**/api/merchant/printers**', async route => {
  if (route.request().method() === 'GET') return route.fulfill({ json: { items: [item('p1')], nextCursor: null } });
  started(); await new Promise(resolve => { release = resolve; }); return route.fulfill({ status: 503, json: { error: 'printers_unavailable' } });
 });
 await page.goto(origin + '?writes'); await choose(page); await page.getByRole('button', { name: 'Slet Køkken p1', exact: true }).click();
 await page.getByRole('button', { name: 'Slet printer', exact: true }).click(); await pending; await page.evaluate(() => window.setPrinterDeleteScopes([]));
 await expect(page.getByRole('dialog')).toBeVisible(); await expect(page.getByRole('button', { name: 'Gemmer…', exact: true })).toBeDisabled();
 release(); await expect(page.getByRole('dialog')).toHaveCount(0); await expect(page.getByRole('alert')).toHaveText('Kunne ikke bekræfte printerhandlingen. Opdater oversigten før et nyt forsøg.');
 await page.evaluate(() => window.setPrinterDeleteScopes([{ id: 'la', brandId: 'a' }]));
 await expect(page.getByRole('button', { name: 'Slet Køkken p1', exact: true })).toBeDisabled();
});

test('default table combines native scopes, independent optional filters and exact row actions', async t => {
 const context = await browser.newContext(); t.after(() => context.close()); const page = await context.newPage();
 const requests = [], writes = [];
 await page.route('**/api/merchant/printers**', async route => {
  const req = route.request(), url = new URL(req.url());
  if (req.method() !== 'GET') { writes.push(req.postDataJSON()); return route.fulfill({ status: 503, json: { error: 'writes_unavailable' } }); }
  const brand = url.searchParams.get('brandId'), loc = url.searchParams.get('locationId'), model = url.searchParams.get('model');
  requests.push({ brand, loc, model });
  assert.ok((brand === 'a' && loc === 'la') || (brand === 'b' && loc === 'lb'));
  return route.fulfill({ json: { items: model === 'mc-print3' && brand === 'a' ? []
    : [item('same_id', brand, loc, { name: brand === 'a' ? 'Nord printer' : 'Syd printer', model: brand === 'a' ? 'mc-print2' : 'mc-print3', state: 'disabled' })], nextCursor: null, totalPrinters: brand === 'a' ? 7 : 4 } });
 });
 await page.goto(origin + '?writes');
 await expect(page.getByRole('table', { name: 'Printere', exact: true })).toBeVisible();
 await expect(page.getByText('Nord printer', { exact: true })).toBeVisible();
 await expect(page.getByText('Syd printer', { exact: true })).toBeVisible();
 await expect(page.getByRole('cell', { name: '7', exact: true })).toHaveCount(1);
 await expect(page.getByRole('cell', { name: '4', exact: true })).toHaveCount(1);
 await expect(page.getByRole('button', { name: 'Rediger Syd printer', exact: true })).toBeDisabled();
 await expect(page.getByRole('button', { name: 'Slet Syd printer', exact: true })).toBeDisabled();
 await page.getByRole('button', { name: 'Slet Nord printer', exact: true }).click();
 await expect(page.getByRole('dialog', { name: 'Slet printer' })).toBeVisible();
 await page.getByRole('button', { name: 'Slet printer', exact: true }).click();
 await expect(page.getByRole('alert')).toHaveText('Printerændringer er slået fra. Prøv igen senere.');
 assert.deepEqual(writes, [{ brandId: 'a', locationId: 'la', printerId: 'same_id', revision: 3, action: 'delete' }]);
 await page.getByRole('button', { name: 'Annuller', exact: true }).click();
 await page.getByRole('combobox', { name: 'Printertype', exact: true }).selectOption('mc-print3');
 await expect(page.getByText('Syd printer', { exact: true })).toBeVisible();
 await expect(page.getByText('Nord printer', { exact: true })).toHaveCount(0);
 await page.getByRole('combobox', { name: 'Lokation', exact: true }).selectOption('lb');
 await expect(page.getByRole('combobox', { name: 'Brand', exact: true })).toHaveValue('');
 await expect(page.getByText('Syd printer', { exact: true })).toBeVisible();
 await page.getByRole('combobox', { name: 'Brand', exact: true }).selectOption('b');
 await expect(page.getByRole('combobox', { name: 'Lokation', exact: true })).toHaveValue('lb');
 await expect(page.getByText('Syd printer', { exact: true })).toBeVisible();
 await page.getByRole('combobox', { name: 'Brand', exact: true }).selectOption('');
 await expect(page.getByRole('combobox', { name: 'Lokation', exact: true })).toHaveValue('lb');
 await expect(page.getByText('Syd printer', { exact: true })).toBeVisible();
 await page.getByRole('combobox', { name: 'Brand', exact: true }).selectOption('a');
 await expect(page.getByRole('combobox', { name: 'Printertype', exact: true })).toHaveValue('mc-print3');
 await expect(page.getByRole('combobox', { name: 'Lokation', exact: true })).toHaveValue('');
 await expect(page.getByRole('table', { name: 'Printere', exact: true })).toBeVisible();
 await expect(page.getByRole('cell', { name: 'Ingen printere matcher filtrene på denne side.', exact: true })).toBeVisible();
 assert.equal(requests.at(-1).brand, 'a');
});

test('cross-location page boundary neither loses nor duplicates printer rows', async t => {
 const context = await browser.newContext(); t.after(() => context.close()); const page = await context.newPage(), seen = [];
 await page.route('**/api/merchant/printers?*', route => {
  const url = new URL(route.request().url()), brand = url.searchParams.get('brandId'), loc = url.searchParams.get('locationId'), after = url.searchParams.get('after');
  const all = Array.from({ length: brand === 'a' ? 15 : 20 }, (_, i) => item((brand === 'a' ? 'a' : 'b') + String(i).padStart(2, '0'), brand, loc));
  const start = after ? all.findIndex(row => row.configuration.id === after) + 1 : 0;
  seen.push({ brand, after });
  return route.fulfill({ json: { items: all.slice(start, start + 20), nextCursor: null, totalPrinters: all.length } });
 });
 await page.goto(origin);
 await expect(page.getByRole('row')).toHaveCount(21);
 await expect(page.getByText('Køkken a00', { exact: true })).toBeVisible();
 await expect(page.getByText('Køkken a14', { exact: true })).toBeVisible();
 await expect(page.getByText('Køkken b04', { exact: true })).toBeVisible();
 await expect(page.getByText('Køkken b05', { exact: true })).toHaveCount(0);
 await page.getByRole('button', { name: 'Næste side', exact: true }).click();
 await expect(page.getByRole('row')).toHaveCount(16);
 await expect(page.getByText('Køkken b05', { exact: true })).toBeVisible();
 await expect(page.getByText('Køkken b19', { exact: true })).toBeVisible();
 await expect(page.getByText('Køkken b04', { exact: true })).toHaveCount(0);
 await expect(page.getByRole('button', { name: 'Næste side', exact: true })).toHaveCount(0);
 assert.deepEqual(seen, [{ brand: 'a', after: null }, { brand: 'b', after: null }, { brand: 'b', after: 'b04' }]);
});

test('empty table keeps headers and offers continuation after eight empty native scopes', async t => {
 const context = await browser.newContext(); t.after(() => context.close()); const page = await context.newPage(), requests = [];
 await page.route('**/api/merchant/printers?*', route => {
  const url = new URL(route.request().url()), loc = url.searchParams.get('locationId'); requests.push(loc);
  return route.fulfill({ json: { items: loc === 'l8' ? [item('last', 'a', 'l8')] : [], nextCursor: null, totalPrinters: loc === 'l8' ? 1 : 0 } });
 });
 await page.goto(origin);
 await expect(page.getByRole('table', { name: 'Printere', exact: true })).toBeVisible();
 await expect(page.getByRole('cell', { name: 'Ingen printere matcher filtrene på denne side.', exact: true })).toBeVisible();
 requests.length = 0;
 await page.evaluate(() => window.setPrinterReadCatalog({ brands: [{ id: 'a', name: 'Nord' }], locations: Array.from({ length: 9 }, (_, i) => ({ id: 'l' + i, name: 'Station ' + i, brandId: 'a' })) }));
 await expect(page.getByRole('button', { name: 'Næste side', exact: true })).toBeVisible();
 await expect(page.getByRole('columnheader')).toHaveCount(9);
 assert.deepEqual(requests, Array.from({ length: 8 }, (_, i) => 'l' + i));
 await page.getByRole('button', { name: 'Næste side', exact: true }).click();
 await expect(page.getByText('Køkken last', { exact: true })).toBeVisible();
 assert.deepEqual(requests, Array.from({ length: 9 }, (_, i) => 'l' + i));
 await expect(page.getByRole('button', { name: 'Næste side', exact: true })).toHaveCount(0);
});


for (const [name, width, height] of [['desktop', 1348, 900], ['mobile', 375, 667]]) {
  test(`real admin shell contains printer table scroll in loading, empty and populated states at ${name} width`, async t => {
    const context = await browser.newContext({ viewport: { width, height } }); t.after(() => context.close());
    const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
    let populated = false, release;
    const pending = new Promise(resolve => { release = resolve; });
    await page.route('**/api/merchant/printers?*', async route => {
      await pending;
      const url = new URL(route.request().url()), brand = url.searchParams.get('brandId'), location = url.searchParams.get('locationId');
      await route.fulfill({ json: { items: populated ? [item('long_' + location, brand, location, { name: 'Køkken ' + 'langt'.repeat(18), state: 'disabled' })] : [], nextCursor: null } });
    });
    const assertContained = async state => {
      const geometry = await page.getByRole('table', { name: 'Printere', exact: true }).evaluate(table => {
        const scroll = table.parentElement, inset = document.querySelector('.admin-shell > main');
        return { pageWidth: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth,
          internalWidth: scroll.clientWidth, internalScroll: scroll.scrollWidth, tableWidth: table.getBoundingClientRect().width,
          overflowX: getComputedStyle(scroll).overflowX, insetWidth: inset.getBoundingClientRect().width };
      });
      assert.ok(geometry.pageWidth <= geometry.viewport + 1, `${name}/${state} whole-page overflow: ${JSON.stringify(geometry)}`);
      assert.ok(geometry.tableWidth >= 1100, `${name}/${state} preserves full readable table width`);
      assert.ok(geometry.internalScroll > geometry.internalWidth, `${name}/${state} table owns horizontal scrolling`);
      assert.equal(geometry.overflowX, 'auto');
      const scrolled = await page.getByRole('table', { name: 'Printere', exact: true }).evaluate(table => {
        const scroll = table.parentElement; scroll.scrollLeft = scroll.scrollWidth; return scroll.scrollLeft;
      });
      assert.ok(scrolled > 0, `${name}/${state} internal scroll is usable`);
      await page.getByRole('table', { name: 'Printere', exact: true }).evaluate(table => { table.parentElement.scrollLeft = 0; });
    };
    await page.goto(origin + '/shell');
    await expect(page.getByRole('heading', { name: 'Printere', exact: true })).toBeVisible();
    if (name === 'desktop') await expect(page.locator('[data-sidebar="sidebar"]').first()).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Indlæser printere…');
    await assertContained('loading');
    release(); await expect(page.getByText('Ingen printere matcher filtrene på denne side.', { exact: true })).toBeVisible();
    await assertContained('empty');
    populated = true;
    await page.evaluate(() => window.setPrinterReadCatalog({ brands: [{ id: 'a', name: 'Nord ' + 'langt'.repeat(18) }, { id: 'b', name: 'Syd ' + 'langt'.repeat(18) }], locations: [{ id: 'la', name: 'Station ' + 'langt'.repeat(18), brandId: 'a' }, { id: 'lb', name: 'Torv ' + 'langt'.repeat(18), brandId: 'b' }] }));
    await expect(page.getByRole('button', { name: /^Rediger Køkken / })).toHaveCount(2);
    await assertContained('populated');
    for (const label of ['Aktiveringsdato', 'Brand', 'Lokation', 'Status', 'Last used', 'Total printers', 'Printer name', 'Handlinger'])
      await expect(page.getByRole('columnheader', { name: label, exact: true })).toHaveCount(1);
    fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
    await page.screenshot({ path: path.join(root, 'test-results', `printing-real-shell-${name}.png`), fullPage: true });
    assert.deepEqual(errors, []);
  });
}
