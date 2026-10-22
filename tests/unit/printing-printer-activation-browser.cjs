const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');

test('browser: reviewed activation is explicit, scope-bound and never retries an uncertain resume', async t => {
  const { chromium, expect } = require('@playwright/test');
  const webpackModule = require('next/dist/compiled/webpack/webpack'); webpackModule.init();
  const root = process.cwd(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'printer-activation-ui-'));
  let browser, server;
  t.after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); fs.rmSync(dir, { recursive: true, force: true }); });
  const configuration = { id: 'p1', brandId: 'brand', locationId: 'location', name: 'Pilot', manufacturer: 'star',
    model: 'mc-print3', transport: 'cloudprnt-http', state: 'disabled', paperWidthMm: 80 };
  const item = { configuration, revision: 1 }, scope = { brandId: 'brand', locationId: 'location', printerId: 'p1' };
  const receipt = Buffer.alloc(32, 1).toString('base64url');
  const entry = path.join(dir, 'entry.js'), loader = path.join(dir, 'loader.js');
  fs.writeFileSync(entry, `import React from 'react';import{createRoot}from'react-dom/client';import{PrinterActivationPanel}from ${JSON.stringify(path.join(root, 'src/app/superadmin/printers/printer-activation-panel.tsx'))};import{PrinterCredentialsPanel}from ${JSON.stringify(path.join(root, 'src/app/superadmin/printers/printer-credentials-panel.tsx'))};
    function App(){const[permitted,setPermitted]=React.useState(true);const[mode,setMode]=React.useState('activation');const[transport,setTransport]=React.useState('cloudprnt-http');window.changeTransport=setTransport;window.changePermission=setPermitted;window.showCredentials=()=>setMode('credentials');if(mode==='credentials')return React.createElement(PrinterCredentialsPanel,{scope:${JSON.stringify({ ...scope, printerRevision: 2 })},printerName:'Pilot',pilotProfile:{model:'mc-print3',paperWidthMm:80,transport:'cloudprnt-http',state:'active'},permitted,onSessionLost:()=>{},onClose:()=>{}});return React.createElement(PrinterActivationPanel,{item:{...${JSON.stringify(item)},configuration:{...${JSON.stringify(configuration)},transport}},permitted,onPendingChange:v=>{window.pending=v},onCancel:()=>{window.cancelled=true},onSessionLost:()=>{window.sessionLost=true},onSaved:()=>{window.saved=true}})}
    createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode,null,React.createElement(App)));`);
  fs.writeFileSync(loader, `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
  await new Promise((resolve, reject) => webpackModule.webpack({ mode: 'development', devtool: false, entry,
    output: { path: dir, filename: 'bundle.js' }, resolve: { alias: { '@': path.join(root, 'src') }, extensions: ['.tsx', '.ts', '.js'], modules: [path.join(root, 'node_modules'), 'node_modules'] },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [loader] }] },
  }).run((error, stats) => error ? reject(error) : stats.hasErrors() ? reject(Error(stats.toString({ all: false, errors: true }))) : resolve()));
  server = http.createServer((req, res) => {
    if (req.url === '/bundle.js') { res.setHeader('content-type', 'application/javascript'); return res.end(fs.readFileSync(path.join(dir, 'bundle.js'))); }
    res.setHeader('content-type', 'text/html; charset=utf-8'); res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } }), calls = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let mode = 'success', queueOverride = {}, receiptOverride = {};
  await page.route('**/api/merchant/printers/**', async route => {
    const request = route.request(), pathname = new URL(request.url()).pathname;
    const body = request.method() === 'POST' ? request.postDataJSON() : null;
    calls.push({ pathname, method: request.method(), body });
    if (pathname.endsWith('/queue')) return route.fulfill({ status: 200, json: { ...scope, printerState: 'disabled', printerRevision: 1,
      resumeAuthorized: false, evaluatedAt: Date.now(), status: 'verified', reason: null, queueRevision: 1,
      summary: { pendingCount: 0, oldestCreatedAt: null, newestCreatedAt: null, oldestAgeMs: null, newestAgeMs: null }, ...queueOverride } });
    if (pathname.endsWith('/review')) return route.fulfill({ status: 200, json: { receipt, ...scope, decision: 'resume_empty',
      printerRevision: 1, queueRevision: 1, expiresAt: Date.now() + 120000, resumeAuthorized: false, ...receiptOverride } });
    return route.fulfill({ status: mode === 'unknown' ? 503 : 200, json: mode === 'unknown' ? { error: 'printers_unavailable' }
      : { item: { configuration: { ...configuration, state: 'active' }, revision: 2 } } });
  });
  const secret = Buffer.alloc(32, 4).toString('base64url'), credentialCalls = [];
  await page.route('**/api/superadmin/printers/device-credentials*', route => {
    const command = route.request().method() === 'POST' ? route.request().postDataJSON() : null;
    credentialCalls.push(command);
    return route.fulfill({ status: 200, json: command ? { ...scope, printerRevision: 2, credentialRevision: 2, revoked: false,
      dispatchAuthorized: false, activationAuthorized: false, secret } : { ...scope, printerRevision: 2, credentialRevision: 1,
      state: 'stale', dispatchAuthorized: false, activationAuthorized: false } });
  });
  await page.route('https://activation.test/**', async route => {
    if (new URL(route.request().url()).pathname.startsWith('/api/')) return route.fallback();
    return new URL(route.request().url()).pathname === '/bundle.js'
      ? route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(dir, 'bundle.js')) })
      : route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>' });
  });
  const url = 'https://activation.test';
  await page.goto(url); assert.equal(calls.length, 0);
  await expect(page.getByLabel('CloudPRNT-pilotadresse', { exact: true })).toHaveValue('https://activation.test/api/cloudprnt-pilot/brand/location/p1');
  await expect(page.getByText('orderfly', { exact: true })).toBeVisible();
  await page.evaluate(() => window.changeTransport('cloudprnt-mqtt'));
  await expect(page.getByLabel('CloudPRNT-pilotadresse', { exact: true })).toHaveCount(0);
  await page.evaluate(() => window.changeTransport('cloudprnt-http'));
  await expect(page.getByLabel('CloudPRNT-pilotadresse', { exact: true })).toHaveValue('https://activation.test/api/cloudprnt-pilot/brand/location/p1');
  const check = page.getByRole('button', { name: 'Kontrollér printkø', exact: true });
  await check.click(); await expect(page.getByRole('button', { name: 'Bekræft aktivering', exact: true })).toBeVisible();
  assert.equal(calls.length, 1); assert.equal(calls[0].method, 'GET');
  await page.getByRole('button', { name: 'Bekræft aktivering', exact: true }).dblclick();
  await expect.poll(() => page.evaluate(() => window.saved)).toBe(true);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[1].body, { ...scope, printerRevision: 1, queueRevision: 1, decision: 'resume_empty' });
  assert.deepEqual(calls[2].body, { ...scope, revision: 1, action: 'resume', receipt, queueRevision: 1 });
  assert.equal((await page.locator('body').innerText()).includes(receipt), false);
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);

  mode = 'unknown'; await page.goto(url); await check.click(); await page.getByRole('button', { name: 'Bekræft aktivering', exact: true }).click();
  await expect(page.getByText('Handlingen kunne ikke bekræftes.', { exact: false })).toBeVisible();
  assert.equal(calls.length, 6); await expect(check).toBeDisabled();
  await page.getByRole('button', { name: 'Opdater oversigten', exact: true }).click(); assert.equal(calls.length, 6);
  for (const override of [{ printerId: 'foreign' }, { status: 'blocked', reason: 'missing_metadata', queueRevision: null, summary: null }, { summary: { pendingCount: 1 } }]) {
    queueOverride = override; await page.goto(url); await check.click();
    await expect(check).toBeDisabled(); assert.equal(calls.at(-1).method, 'GET');
    await expect(page.getByRole('button', { name: 'Bekræft aktivering', exact: true })).toHaveCount(0);
  }
  queueOverride = {}; receiptOverride = { printerId: 'foreign' }; await page.goto(url); await check.click();
  const before = calls.length; await page.getByRole('button', { name: 'Bekræft aktivering', exact: true }).click(); await expect(check).toBeDisabled();
  assert.equal(calls.length, before + 1); assert.equal(calls.at(-1).pathname.endsWith('/review'), true);
  await page.goto(url); await page.evaluate(() => window.changePermission(false)); await expect(check).toBeDisabled();
  await page.goto(url); await page.evaluate(() => window.showCredentials());
  const address = page.getByLabel('CloudPRNT-pilotadresse', { exact: true });
  await expect(address).toHaveValue('https://activation.test/api/cloudprnt-pilot/brand/location/p1');
  await page.getByRole('button', { name: 'Erstat adgangskode', exact: true }).click();
  await page.getByRole('button', { name: 'Erstat adgangskode', exact: true }).click();
  await expect(page.getByLabel('Engangsvist adgangskode')).toHaveText(secret);
  await expect(address).toHaveValue('https://activation.test/api/cloudprnt-pilot/brand/location/p1');
  assert.equal((await address.inputValue()).includes(secret), false);
  assert.equal(credentialCalls.filter(Boolean).length, 1); assert.equal(credentialCalls.find(Boolean).operation, 'rotate');
  assert.deepEqual(errors, []);
});
