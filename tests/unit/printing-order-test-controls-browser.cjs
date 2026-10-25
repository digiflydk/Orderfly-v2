const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');

test('browser: supervised order window needs observed paper, writes once, recovers unknown results by read and cancels stale scope', async t => {
  const { chromium, expect } = require('@playwright/test');
  const webpackModule = require('next/dist/compiled/webpack/webpack'); webpackModule.init();
  const root = process.cwd(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'printer-order-test-ui-'));
  let browser, server;
  t.after(async () => { await browser?.close(); if (server) await new Promise(r => server.close(r)); fs.rmSync(dir, { recursive: true, force: true }); });
  const scope = { brandId: 'brand', locationId: 'location', printerId: 'p1', printerRevision: 1, credentialRevision: 2 };
  const entry = path.join(dir, 'entry.js'), loader = path.join(dir, 'loader.js');
  fs.writeFileSync(entry, `import React from 'react';import{createRoot}from'react-dom/client';import{PrinterOrderTestControls}from ${JSON.stringify(path.join(root, 'src/app/superadmin/printers/order-test-controls.tsx'))};
    function App(){const[permitted,setPermitted]=React.useState(true);const[scope,setScope]=React.useState(${JSON.stringify(scope)});window.changePermission=setPermitted;window.changeScope=setScope;return React.createElement(PrinterOrderTestControls,{scope,active:true,permitted});}
    createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode,null,React.createElement(App)));`);
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
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } }), calls = [], errors = [];
  page.on('pageerror', e => errors.push(e.message));
  let state = 'not_started', enabled = true, unknown = false, delay = false, held;
  await page.route('**/api/superadmin/printers/order-test*', async route => {
    const req = route.request(), command = req.method() === 'POST' ? req.postDataJSON() : null;
    const params = command || Object.fromEntries(new URL(req.url()).searchParams);
    calls.push({ method: req.method(), command, params });
    if (delay) { held = route; return; }
    if (command?.operation === 'startIndependent') state = 'active';
    if (command?.operation === 'stop') state = 'stopped';
    const bound = { brandId: params.brandId, locationId: params.locationId, printerId: params.printerId,
      printerRevision: Number(params.printerRevision), credentialRevision: Number(params.credentialRevision) };
    return route.fulfill({ status: unknown && command ? 503 : 200,
      json: unknown && command ? { error: 'order_test_unavailable' } : { ...bound, state,
        expiresAt: state === 'not_started' ? null : Date.now() + 3600000, enabled, unattendedAuthorized: false } });
  });
  const url = 'http://127.0.0.1:' + server.address().port;
  const read = page.getByRole('button', { name: 'Hent ordreteststatus', exact: true });
  const start = page.getByRole('button', { name: 'Start 60 minutters ordretest', exact: true });
  const stop = page.getByRole('button', { name: 'Stop ordretest', exact: true });
  async function observe() { assert.equal(await page.locator('input[type=checkbox]').count(),0); }
  await page.goto(url); assert.equal(calls.length, 0); await expect(start).toHaveCount(0);
  await read.click(); await expect(start).toBeEnabled();
  await observe(); await expect(start).toBeEnabled(); await start.dblclick();
  await expect(stop).toBeVisible();
  assert.equal(calls.filter(c => c.command?.operation === 'startIndependent').length, 1);
  assert.deepEqual(calls.find(c => c.command)?.command, { ...scope, operation: 'startIndependent' });
  await stop.click(); await expect(page.getByRole('status')).toContainText('Ordretest stoppet'); await expect(start).toHaveCount(0);
  assert.equal(calls.filter(c => c.command?.operation === 'stop').length, 1);
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);

  state = 'not_started'; enabled = false; await page.goto(url); await read.click(); await observe(); await expect(start).toBeDisabled();
  enabled = true; await read.click(); await expect(start).toBeEnabled();
  unknown = true; await start.click(); await expect(page.getByRole('alert')).toContainText('Ordretesten er ikke tilgængelig');
  await expect(start).toHaveCount(0); const writes = calls.filter(c => c.command).length;
  unknown = false; await read.click(); await expect(stop).toBeVisible(); assert.equal(calls.filter(c => c.command).length, writes);

  delay = true; await read.click(); await expect.poll(() => !!held).toBe(true);
  const changed = { ...scope, printerId: 'p2', printerRevision: 3 };
  await page.evaluate(value => window.changeScope(value), changed); await expect(read).toBeEnabled();
  await expect(stop).toHaveCount(0); await held.abort().catch(() => {}); held = null;
  delay = false; state = 'not_started'; await read.click(); await expect(start).toBeDisabled();
  assert.equal(calls.at(-1).params.printerId, 'p2'); await observe(); await expect(start).toBeEnabled();
  await page.evaluate(() => window.changePermission(false)); await expect(read).toBeDisabled(); await expect(start).toHaveCount(0);
  assert.deepEqual(errors, []);
});
