const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');

test('receipt navigation requires platform superuser and never exposes a merchant route', () => {
  const { loadTs } = require('../helpers/load-ts.cjs');
  const { canNavigate, filterNavigation } = loadTs('src/lib/access/navigation.ts');
  const destinations = [{ href: '/superadmin/receipts' }];
  for (const access of [null, { superuser: false, permissions: [] }, { superuser: false, permissions: ['orderfly.catalog:view', 'orderfly.orders:view', 'orderfly.catalog:edit'] }]) {
    assert.equal(canNavigate('/superadmin/receipts', access), false);
    assert.equal(canNavigate('/superadmin/receipts/anything', access), false);
    assert.deepEqual(filterNavigation(destinations, access), []);
  }
  const owner = { superuser: true, permissions: [] };
  assert.equal(canNavigate('/superadmin/receipts', owner), true);
  assert.equal(canNavigate('/merchant/receipts', owner), false);
  assert.deepEqual(filterNavigation(destinations, owner), destinations);
});

test('receipt editor: explicit scoped saves, conflict recovery, unknown outcomes and stale brand responses', async t => {
  const { chromium, expect } = require('@playwright/test');
  const webpackModule = require('next/dist/compiled/webpack/webpack'); webpackModule.init();
  const root = process.cwd(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'receipt-editor-'));
  let browser, server;
  t.after(async () => { await browser?.close(); if (server) await new Promise(r => server.close(r)); fs.rmSync(dir, { recursive: true, force: true }); });
  const entry = path.join(dir, 'entry.js'), loader = path.join(dir, 'loader.js');
  fs.writeFileSync(entry, `import React from 'react';import{createRoot}from'react-dom/client';import{ReceiptEditor}from ${JSON.stringify(path.join(root, 'src/app/superadmin/receipts/receipt-editor.tsx'))};createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode,null,React.createElement(ReceiptEditor,{brands:[{id:'a',name:'Brand A'},{id:'b',name:'Brand B'}]})));`);
  fs.writeFileSync(loader, `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
  await new Promise((resolve, reject) => webpackModule.webpack({ mode: 'development', devtool: false, entry, output: { path: dir, filename: 'bundle.js' },
    resolve: { alias: { '@': path.join(root, 'src') }, extensions: ['.tsx', '.ts', '.js'], modules: [path.join(root, 'node_modules'), 'node_modules'] },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [loader] }] },
  }).run((error, stats) => error ? reject(error) : stats.hasErrors() ? reject(Error(stats.toString({ all: false, errors: true }))) : resolve()));
  server = http.createServer((req, res) => {
    if (req.url === '/bundle.js') { res.setHeader('content-type', 'application/javascript'); return res.end(fs.readFileSync(path.join(dir, 'bundle.js'))); }
    res.setHeader('content-type', 'text/html; charset=utf-8'); res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  browser = await chromium.launch({ headless: true, executablePath: process.env.CART_CHROMIUM_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } }), writes = [], errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const settings = { paperWidthMm: 80, heading: 'Kvittering', footer: 'Tak for din bestilling', address: '', phone: '', website: '', showBrandName: true, showLocationName: true, showCustomer: false, showContact: false, showModifiers: true, showNotes: true };
  let revision = 0, stored = { ...settings }, mode = 'ok', delayed, delayA = false;
  await page.route('**/api/superadmin/receipts**', async route => {
    const req = route.request();
    if (new URL(req.url()).pathname.endsWith('/testbon')) return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64') });
    if (req.method() === 'GET') {
      const brandId = new URL(req.url()).searchParams.get('brandId');
      if (brandId === 'a' && delayA) { delayed = route; return; }
      return route.fulfill({ json: { brandId, revision, settings: brandId === 'a' ? stored : { ...settings, heading: 'Brand B bon' } } });
    }
    const body = req.postDataJSON(); writes.push(body);
    if (mode === 'conflict') { revision++; stored = { ...stored, heading: 'Ny serverversion' }; return route.fulfill({ status: 409, json: { error: 'revision_conflict' } }); }
    if (mode === 'unknown') return route.abort('failed');
    stored = body.settings; revision++;
    return route.fulfill({ json: { brandId: body.brandId, revision, settings: stored } });
  });
  await page.goto('http://127.0.0.1:' + server.address().port);
  const save = page.getByRole('button', { name: 'Gem kvittering', exact: true });
  await expect(page.getByLabel('Overskrift', { exact: true })).toHaveValue('Kvittering');
  await expect(save).toBeDisabled(); assert.equal(writes.length, 0);
  await page.getByLabel('Overskrift', { exact: true }).fill('Velkommen');
  await page.getByLabel('Papirbredde').selectOption('58');
  await page.getByLabel('Kundens navn', { exact: true }).check();
  const preview = page.getByRole('article', { name: 'Forhåndsvisning af kvittering' });
  await expect(preview).toContainText('Eksempelkunde');
  await page.getByLabel('Kundens navn', { exact: true }).uncheck();
  await expect(preview).not.toContainText('Eksempelkunde');
  await expect(preview).toContainText('EKSEMPEL-1042');
  await expect(preview).toContainText('208,00');
  await page.getByLabel('Kundens navn', { exact: true }).check();
  await expect(page.getByRole('region', { name: 'Forhåndsvisning af kundekvittering' }).getByText('Velkommen', { exact: true })).toBeVisible();
  assert.equal(writes.length, 0);
  await save.click(); await expect(page.getByText('Kvitteringsindstillingerne er gemt.', { exact: true })).toBeVisible();
  assert.equal(writes.length, 1); assert.equal(writes[0].brandId, 'a'); assert.equal(writes[0].expectedRevision, 0);
  assert.equal(writes[0].settings.paperWidthMm, 58); assert.equal(writes[0].settings.showCustomer, true);
  await expect(save).toBeDisabled();
  mode = 'conflict'; await page.getByLabel('Overskrift', { exact: true }).fill('Lokal version'); await save.click();
  await expect(page.getByRole('alert')).toContainText('En anden har ændret'); await expect(save).toBeDisabled();
  await expect(page.getByLabel('Overskrift', { exact: true })).toHaveValue('Lokal version');
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Genindlæs indstillinger' }).click();
  await expect(page.getByLabel('Overskrift', { exact: true })).toHaveValue('Ny serverversion');
  mode = 'unknown'; await page.getByLabel('Bundtekst', { exact: true }).fill('Ny tak'); await save.click();
  await expect(page.getByRole('alert')).toBeVisible(); await expect(save).toBeDisabled(); assert.equal(writes.length, 3);
  page.once('dialog', dialog => dialog.accept()); await page.getByLabel('Brand', { exact: true }).selectOption('b');
  await expect(page.getByLabel('Overskrift', { exact: true })).toHaveValue('Brand B bon');
  delayA = true; await page.getByLabel('Brand', { exact: true }).selectOption('a');
  await expect.poll(() => !!delayed).toBe(true);
  await page.getByLabel('Brand', { exact: true }).selectOption('b');
  await expect(page.getByLabel('Overskrift', { exact: true })).toHaveValue('Brand B bon');
  await delayed.fulfill({ json: { brandId: 'a', revision: 99, settings: { ...settings, heading: 'Forkert brand' } } }).catch(() => {});
  await expect(page.getByLabel('Overskrift', { exact: true })).toHaveValue('Brand B bon');
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
  assert.deepEqual(errors, []);
});
