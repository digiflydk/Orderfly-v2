const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');

test('kitchen receipt editor: explicit scoped saves, conflict recovery, unknown outcomes and stale brand responses', async t => {
  const { chromium, expect } = require('@playwright/test');
  const webpackModule = require('next/dist/compiled/webpack/webpack'); webpackModule.init();
  const root = process.cwd(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kitchen-editor-'));
  let browser, server;
  t.after(async () => { await browser?.close(); if (server) await new Promise(r => server.close(r)); fs.rmSync(dir, { recursive: true, force: true }); });
  const entry = path.join(dir, 'entry.js'), loader = path.join(dir, 'loader.js');
  fs.writeFileSync(entry, `import React from 'react';import{createRoot}from'react-dom/client';import{KitchenEditor}from ${JSON.stringify(path.join(root, 'src/app/superadmin/receipts/kitchen-editor.tsx'))};createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode,null,React.createElement(KitchenEditor,{brands:[{id:'a',name:'Brand A'},{id:'b',name:'Brand B'}]})));`);
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
  const settings = { paperWidthMm: 80, heading: 'Køkkenbon', showBrandName: true, showLocationName: true, showCustomer: true, showPhone: false, groupByCategory: true, textSize: 'large' };
  let revision = 0, stored = { ...settings }, mode = 'ok', delayed, delayA = false;
  await page.route('**/api/superadmin/receipts/kitchen**', async route => {
    const req = route.request();
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
  const save = page.getByRole('button', { name: 'Gem køkkenbon', exact: true });
  await expect(page.getByLabel('Overskrift', { exact: true })).toHaveValue('Køkkenbon');
  await expect(save).toBeDisabled(); assert.equal(writes.length, 0);
  await expect(page.getByRole('link', { name: 'Kundekvittering', exact: true })).toHaveAttribute('href', '/superadmin/receipts?brandId=a');
  await expect(page.getByRole('link', { name: 'Køkkenbon', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.getByLabel('Overskrift', { exact: true }).fill('Velkommen');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByLabel('Brand', { exact: true }).selectOption('b');
  await expect(page.getByLabel('Brand', { exact: true })).toHaveValue('a');
  await expect(page.getByLabel('Overskrift', { exact: true })).toHaveValue('Velkommen');
  await page.getByLabel('Papirbredde', { exact: true }).selectOption('58');
  await page.getByLabel('Kundens navn', { exact: true }).check();
  const preview = page.getByRole('article', { name: 'Forhåndsvisning af køkkenbon' });
  await expect(preview).toContainText('Eksempelkunde');
  await page.getByLabel('Kundens navn', { exact: true }).uncheck();
  await expect(preview).not.toContainText('Eksempelkunde');
  await expect(preview).toContainText('EKSEMPEL-1042');
  await expect(preview).not.toContainText('DKK');
  await expect(preview).not.toContainText('Moms');
  await page.getByLabel('Tekststørrelse', { exact: true }).selectOption('normal');
  await page.getByLabel('Gruppér retter efter kategori', { exact: true }).uncheck();
  await expect(preview).toContainText('Uden løg');
  await expect(preview).toContainText('Ekstra ost');
  await expect(preview).toContainText('Pak de to menuer i hver sin pose.');
  await page.getByLabel('Kundens navn', { exact: true }).check();
  await expect(page.getByRole('region', { name: 'Forhåndsvisning af køkkenbon' }).locator('svg').getByText('Velkommen', { exact: true })).toBeVisible();
  assert.equal(writes.length, 0);
  await save.click(); await expect(page.getByText('Køkkenbonens indstillinger er gemt.', { exact: true })).toBeVisible();
  assert.equal(writes.length, 1); assert.equal(writes[0].brandId, 'a'); assert.equal(writes[0].expectedRevision, 0);
  assert.equal(writes[0].settings.paperWidthMm, 58); assert.equal(writes[0].settings.showCustomer, true);
  assert.equal(writes[0].settings.textSize, 'normal'); assert.equal(writes[0].settings.groupByCategory, false);
  await expect(save).toBeDisabled();
  mode = 'conflict'; await page.getByLabel('Overskrift', { exact: true }).fill('Lokal version'); await save.click();
  await expect(page.getByRole('alert')).toContainText('En anden har ændret'); await expect(save).toBeDisabled();
  await expect(page.getByLabel('Overskrift', { exact: true })).toHaveValue('Lokal version');
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Genindlæs indstillinger' }).click();
  await expect(page.getByLabel('Overskrift', { exact: true })).toHaveValue('Ny serverversion');
  mode = 'unknown'; await page.getByLabel('Overskrift', { exact: true }).fill('Nyt køkken'); await save.click();
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
