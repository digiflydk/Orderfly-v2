const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const { createHash } = require('node:crypto');

test('browser: actual supervised controls bind one scoped testbon, hash local capture and never retry unknown response', async t => {
  const { chromium, expect } = require('@playwright/test');
  const webpackModule = require('next/dist/compiled/webpack/webpack'); webpackModule.init();
  const root = process.cwd(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'printer-pilot-ui-'));
  let browser, server;
  t.after(async () => { await browser?.close(); if (server) await new Promise(r => server.close(r)); fs.rmSync(dir, { recursive: true, force: true }); });
  const scope = { brandId: 'brand', locationId: 'location', printerId: 'p1', printerRevision: 1, credentialRevision: 2 };
  const sessionId = Buffer.alloc(32, 1).toString('base64url'), nonce = Buffer.alloc(32, 2).toString('base64url');
  const flags = { outputAuthorized: false, dispatchAuthorized: false, activationAuthorized: false, physicalCompatibilityVerified: false };
  const entry = path.join(dir, 'entry.js'), loader = path.join(dir, 'loader.js');
  fs.writeFileSync(entry, `import React from 'react';import{createRoot}from'react-dom/client';import{PrinterPilotControls}from ${JSON.stringify(path.join(root, 'src/app/superadmin/printers/pilot-controls.tsx'))};
    function App(){const[permitted,setPermitted]=React.useState(true);const[active,setActive]=React.useState(true);window.changePermission=setPermitted;window.changeActive=setActive;return React.createElement(PrinterPilotControls,{scope:${JSON.stringify(scope)},model:'mc-print3',paperWidthMm:80,active,permitted,onSessionLost:()=>{window.sessionLost=true}});}
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
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } }), commands = [], errors = [];
  page.on('pageerror', e => errors.push(e.message));
  let unknown = false;
  await page.route('**/api/superadmin/printers/pilot', async route => {
    const command = route.request().postDataJSON(); commands.push(command);
    if (command.operation === 'issue') return route.fulfill({ status: 201, json: { ...scope, sessionId, nonce, expiresAt: Date.now() + 600000, ...flags } });
    return route.fulfill({ status: unknown ? 503 : 201, json: unknown ? { error: 'qualification_unavailable' }
      : { ...scope, sessionId, jobId: sessionId, contentDigest: 'c'.repeat(64), trust: 'supervised_operator', ...flags } });
  });
  const url = 'http://127.0.0.1:' + server.address().port;
  await page.goto(url); assert.equal(commands.length, 0);
  await page.evaluate(() => window.changeActive(false));
  await expect(page.getByRole('button', { name: 'Start testforløb', exact: true })).toBeDisabled();
  assert.equal(commands.length, 0);
  await page.evaluate(() => window.changeActive(true));
  await page.getByRole('button', { name: 'Start testforløb', exact: true }).click();
  await expect(page.getByText('Testforløbet er startet', { exact: false })).toBeVisible();
  const submit = page.getByRole('button', { name: 'Bekræft og klargør én testbon' });
  await expect(submit).toBeDisabled();
  async function fill() {
    await page.getByLabel('Operatørens navn eller ID').fill('Omair');
    await page.getByLabel('Modelnummer fra printerens mærkat').fill('MCP31LB');
    await page.getByLabel('Installeret firmware fra StarIO-kontrol').fill('3.2');
    await page.getByLabel('Vælg lokal dokumentation').setInputFiles({ name: 'controlled-capture.txt', mimeType: 'text/plain', buffer: Buffer.from('actual local capture fixture') });
    await page.getByLabel('Jeg har kontrolleret printerens mærkat', { exact: false }).check();
    await page.getByLabel('Jeg har bekræftet, at denne fysiske printer', { exact: false }).check();
    await expect(submit).toBeEnabled();
  }
  await fill(); await submit.click();
  await expect(page.getByText('Én testbon er klargjort.', { exact: false })).toBeVisible();
  assert.equal(commands.length, 2); assert.deepEqual(commands[0], { operation: 'issue', ...scope });
  assert.equal(commands[1].attestation.nonce, nonce); assert.equal(commands[1].attestation.credentialRevision, 2);
  assert.equal(commands[1].attestation.captureDigest, createHash('sha256').update('actual local capture fixture').digest('hex'));
  assert.equal(JSON.stringify(commands).includes('actual local capture fixture'), false);
  assert.equal((await page.locator('body').innerText()).includes(nonce), false);
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
  await expect(submit).toHaveCount(0);
  unknown = true; await page.goto(url); await page.getByRole('button', { name: 'Start testforløb', exact: true }).click();
  await fill(); await submit.click(); await expect(page.getByText('Testforløbet er ikke tilgængeligt.', { exact: false })).toBeVisible();
  assert.equal(commands.length, 4); await expect(submit).toHaveCount(0);
  await page.evaluate(() => window.changePermission(false));
  await expect(page.getByRole('button', { name: 'Start testforløb', exact: true })).toBeDisabled();
  assert.equal(commands.length, 4); assert.deepEqual(errors, []);
});
