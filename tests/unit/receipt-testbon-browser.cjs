const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const { loadTs } = require('../helpers/load-ts.cjs');

test('testbon browser: loading, profile changes, stale responses and explicit error retry only use GET', async t => {
  const { chromium, expect } = require('@playwright/test');
  const webpackModule = require('next/dist/compiled/webpack/webpack'); webpackModule.init();
  const root = process.cwd(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'receipt-testbon-'));
  let browser, server;
  t.after(async () => { await browser?.close(); if (server) await new Promise(r => server.close(r)); fs.rmSync(dir, { recursive: true, force: true }); });
  const entry = path.join(dir, 'entry.js'), loader = path.join(dir, 'loader.js');
  fs.writeFileSync(entry, `import React from 'react';import{createRoot}from'react-dom/client';import{TestBonPreview}from ${JSON.stringify(path.join(root, 'src/components/receipts/testbon-preview.tsx'))};createRoot(document.getElementById('root')).render(React.createElement(TestBonPreview));`);
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
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  const calls = [], errors = []; let mode = 'delay', pending;
  page.on('pageerror', error => errors.push(error.message));
  const { createSyntheticTestBonContent: create } = loadTs('src/lib/printing/job-content.ts', { 'server-only': {} });
  const fulfill = route => {
    const query = new URL(route.request().url()).searchParams;
    const content = create({ brandId: 'preview', locationId: 'preview', printerId: 'preview', printerRevision: 1,
      model: query.get('model'), paperWidthMm: Number(query.get('paperWidthMm')) });
    return route.fulfill({ contentType: 'image/png', body: Buffer.from(content.payloadBase64, 'base64') });
  };
  await page.route('**/api/**', route => {
    calls.push({ method: route.request().method(), url: route.request().url() });
    if (mode === 'delay') { pending = route; return; }
    if (mode === 'error') return route.fulfill({ status: 503, json: { error: 'preview_unavailable' } });
    if (mode === 'wrongtype') return route.fulfill({ status: 200, contentType: 'text/html', body: 'login' });
    return fulfill(route);
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await expect(page.getByRole('status')).toHaveText('Henter testbon…');
  await expect.poll(() => calls.length).toBe(1);
  mode = 'ok'; await fulfill(pending);
  const image = page.getByRole('img', { name: 'Fast syntetisk Orderfly-testbon med danske bogstaver' });
  await expect(image).toBeVisible(); await expect.poll(() => image.evaluate(img => img.naturalWidth)).toBe(576);
  await page.getByLabel('Printer og papirbredde').selectOption('mc-print2:58');
  await expect.poll(() => image.evaluate(img => img.naturalWidth)).toBe(384);
  assert.ok(calls.at(-1).url.includes('model=mc-print2&paperWidthMm=58'));
  mode = 'error'; await page.getByLabel('Printer og papirbredde').selectOption('mc-print3:58');
  await expect(page.getByRole('alert')).toContainText('Testbonnen kunne ikke hentes'); await expect(image).toHaveCount(0);
  const count = calls.length; mode = 'ok'; await page.getByRole('button', { name: 'Prøv igen' }).click();
  await expect(image).toBeVisible(); assert.equal(calls.length, count + 1);
  mode = 'wrongtype'; await page.getByLabel('Printer og papirbredde').selectOption('mc-print3:80');
  await expect(page.getByRole('alert')).toBeVisible(); await expect(image).toHaveCount(0);
  mode = 'delay'; pending = undefined; await page.getByRole('button', { name: 'Prøv igen' }).click();
  await expect(page.getByRole('status')).toBeVisible(); await expect.poll(() => Boolean(pending?.request().url().includes('paperWidthMm=80'))).toBe(true);
  const stale = pending; mode = 'ok'; await page.getByLabel('Printer og papirbredde').selectOption('mc-print3:58');
  await expect.poll(() => image.evaluate(img => img.naturalWidth)).toBe(384);
  await fulfill(stale); await expect.poll(() => image.evaluate(img => img.naturalWidth)).toBe(384);
  assert.ok(calls.every(call => call.method === 'GET' && new URL(call.url).pathname === '/api/superadmin/receipts/testbon'));
  assert.deepEqual(errors, []);
});
