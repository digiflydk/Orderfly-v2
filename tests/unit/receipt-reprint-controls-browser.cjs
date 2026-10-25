const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');

test('receipt reprint browser: scoped device selection, explicit writes, idempotent recovery, status and stale scope', async t => {
  const { chromium, expect } = require('@playwright/test');
  const webpackModule = require('next/dist/compiled/webpack/webpack'); webpackModule.init();
  const root = process.cwd(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'receipt-reprint-ui-'));
  let browser, server;
  t.after(async () => { await browser?.close(); if (server) await new Promise(r => server.close(r)); fs.rmSync(dir, { recursive: true, force: true }); });
  const scope = { orderId: 'ORD-1', brandId: 'brand', locationId: 'location', kind: 'kitchen' };
  const entry = path.join(dir, 'entry.js'), loader = path.join(dir, 'loader.js');
  fs.writeFileSync(entry, `import React from 'react';import{createRoot}from'react-dom/client';import{ReprintControls}from ${JSON.stringify(path.join(root, 'src/components/receipts/reprint-controls.tsx'))};
    function App(){const[scope,setScope]=React.useState(${JSON.stringify(scope)});window.changeScope=setScope;return React.createElement(ReprintControls,scope);}
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
  let listStatus = 200, foreignList = false, twoPrinters = false, noPrinters = false, lostWrite = false, state = 'queued', held, delay = false, foreignResult = false;
  await page.route('**/api/merchant/printers?*', async route => {
    const params = Object.fromEntries(new URL(route.request().url()).searchParams);
    const row = id => ({ configuration: { id, name: id === 'p1' ? 'Køkken' : 'Disk', brandId: foreignList ? 'foreign' : params.brandId,
      locationId: params.locationId, state: 'active', transport: 'cloudprnt-http' }, revision: 2,
      connection: { connected: true, endpoint: 'live' } });
    await route.fulfill({ status: listStatus, json: listStatus === 200 ? { items: noPrinters ? [] : [row('p1'), ...(twoPrinters ? [row('p2')] : [])], nextCursor: null } : { error: 'forbidden' } });
  });
  await page.route('**/api/superadmin/printers/reprint*', async route => {
    const req = route.request(), command = req.method() === 'POST' ? req.postDataJSON() : { ...Object.fromEntries(new URL(req.url()).searchParams) };
    command.printerRevision = Number(command.printerRevision);
    calls.push({ method: req.method(), command });
    if (delay) { held = route; return; }
    if (lostWrite && req.method() === 'POST') return route.abort('failed');
    return route.fulfill({ status: 200, json: { ...command, ...(foreignResult ? { orderId: 'OTHER' } : {}), state, jobId: command.requestId, createdAt: Date.now(), expiresAt: Date.now() + 300000 } });
  });
  const url = 'http://127.0.0.1:' + server.address().port;
  const print = page.getByRole('button', { name: 'Genprint køkkenbon', exact: true });
  const read = page.getByRole('button', { name: 'Opdater printstatus', exact: true });
  await page.goto(url); await expect(print).toBeEnabled();
  assert.equal(calls.length, 0, 'visiting a preview never prints');
  await expect(page.getByRole('combobox', { name: 'Printer til genprint' })).toHaveValue('p1');
  await print.dblclick(); await expect(page.getByRole('status')).toContainText('lagt i kø');
  assert.equal(calls.filter(c => c.method === 'POST').length, 1, 'double click creates one request');
  const first = calls[0].command;
  assert.deepEqual(Object.keys(first).sort(), ['brandId','kind','locationId','orderId','printerId','printerRevision','requestId'].sort());
  assert.deepEqual({ ...first, requestId: undefined }, { ...scope, printerId: 'p1', printerRevision: 2, requestId: undefined });
  assert.match(first.requestId, /^[0-9a-f-]{36}$/i);
  await expect(print).toBeDisabled(); await expect(page.getByRole('combobox')).toBeDisabled();
  state = 'download_started'; await read.click(); await expect(page.getByRole('status')).toContainText('Afventer printerens svar');
  state = 'confirmed'; await read.click(); await expect(page.getByRole('status')).toContainText('meldt bonen udskrevet');
  await page.getByRole('button', { name: 'Genprint igen', exact: true }).click();
  await expect.poll(() => calls.filter(c => c.method === 'POST').length).toBe(2);
  assert.notEqual(calls.filter(c => c.method === 'POST')[1].command.requestId, first.requestId, 'explicit extra copy has new identity');

  for (const terminal of ['failed', 'expired']) {
    state = terminal; await read.click();
    await expect(page.getByRole('status')).toContainText('Kontrollér papiret');
    const count = calls.filter(c => c.method === 'POST').length;
    const previousId = calls.at(-1).command.requestId;
    await expect(page.getByRole('button', { name: 'Genprint igen', exact: true })).toBeEnabled();
    assert.equal(calls.filter(c => c.method === 'POST').length, count, 'terminal status never prints automatically');
    state = 'queued'; await page.getByRole('button', { name: 'Genprint igen', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('lagt i kø');
    assert.equal(calls.filter(c => c.method === 'POST').length, count + 1);
    assert.notEqual(calls.at(-1).command.requestId, previousId, terminal + ' explicit new copy gets new identity');
  }

  state = 'queued'; lostWrite = true;
  await page.evaluate(value => window.changeScope({ ...value, orderId: 'ORD-2', kind: 'customer' }), scope);
  const customerPrint = page.getByRole('button', { name: 'Genprint kvittering', exact: true });
  await expect(customerPrint).toBeEnabled(); await customerPrint.click();
  await expect(page.getByRole('alert')).toContainText('Resultatet er ukendt');
  const ambiguous = calls.at(-1).command;
  lostWrite = false;
  await page.getByRole('button', { name: 'Prøv samme genprint igen', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('lagt i kø');
  assert.deepEqual(calls.at(-1).command, ambiguous, 'unknown write retry preserves exact command');
  assert.equal(ambiguous.kind, 'customer');

  delay = true; await read.click(); await expect.poll(() => !!held).toBe(true);
  await page.evaluate(value => window.changeScope({ ...value, orderId: 'ORD-3' }), scope);
  await expect(print).toBeEnabled(); await expect(page.getByRole('status')).toHaveCount(0);
  await held.abort().catch(() => {}); held = null; delay = false;
  foreignResult = true; await print.click(); await expect(page.getByRole('alert')).toContainText('Resultatet er ukendt');
  await expect(page.getByRole('status')).toHaveCount(0); foreignResult = false;

  listStatus = 403; await page.evaluate(value => window.changeScope({ ...value, orderId: 'ORD-4' }), scope);
  await expect(page.getByRole('alert')).toContainText('ikke adgang'); await expect(print).toBeDisabled();
  listStatus = 200; foreignList = true; await page.evaluate(value => window.changeScope({ ...value, orderId: 'ORD-5' }), scope);
  await expect(page.getByRole('alert')).toContainText('kunne ikke indlæses'); await expect(print).toBeDisabled();
  foreignList = false; twoPrinters = true; await page.evaluate(value => window.changeScope({ ...value, orderId: 'ORD-6' }), scope);
  await expect(page.getByRole('combobox')).toBeEnabled(); await expect(print).toBeDisabled();
  await page.getByRole('combobox').selectOption('p2'); await expect(print).toBeEnabled();
  state = 'unknown'; await print.click(); await expect(page.getByRole('status')).toContainText('Kontrollér papiret');
  await expect(print).toBeDisabled(); assert.equal(calls.at(-1).command.printerId, 'p2');
  noPrinters = true; await page.evaluate(value => window.changeScope({ ...value, orderId: 'ORD-7' }), scope);
  await expect(page.getByRole('combobox')).toContainText('Ingen aktive printere'); await expect(print).toBeDisabled();
  await expect(page.getByText('Opret eller aktivér en printer', { exact: false })).toBeVisible();
  const countBefore = calls.filter(c => c.method === 'POST').length;
  listStatus = 401; await page.evaluate(value => window.changeScope({ ...value, orderId: 'ORD-8' }), scope);
  await expect(page.getByRole('alert')).toContainText('session er udløbet'); await expect(print).toBeDisabled();
  assert.equal(calls.filter(c => c.method === 'POST').length, countBefore);
  assert.deepEqual(errors, []);
});
