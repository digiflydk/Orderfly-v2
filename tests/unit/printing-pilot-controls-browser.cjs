const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const { createHash } = require('node:crypto');

test('browser: one-click test needs no fields or uploads, follows status and never automatically retries', async t => {
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
  let unknown = false, pilotState = 'none', statusReads = 0, holdStatus = false, expired = false;
  const oldCreatedAt=Date.now()-700000;
  const heldReads = [];
  await page.route('**/api/superadmin/printers/pilot*', async route => {
    if (route.request().method() === 'GET') {
      statusReads++;
      if (holdStatus) { heldReads.push(route); return; }
      const params = Object.fromEntries(new URL(route.request().url()).searchParams);
      assert.deepEqual(params, Object.fromEntries(Object.entries(scope).map(([k, v]) => [k, String(v)])));
      return route.fulfill({ status: 200, json: { ...scope, state: pilotState, createdAt: expired ? oldCreatedAt : Date.now() - 10000,
        expiresAt: expired ? oldCreatedAt+600000 : Date.now() + 500000, confirmedAt: pilotState === 'confirmed' ? Date.now() - 100 : null, physicalCompatibilityVerified: false } });
    }
    holdStatus = false;
    const command = route.request().postDataJSON(); commands.push(command);
    assert.equal(command.operation, 'print');
    assert.match(command.requestId,/^[A-Za-z0-9_-]{43}$/);
    if (!unknown) pilotState = 'queued';
    return route.fulfill({ status: unknown ? 503 : 201, json: unknown ? { error: 'qualification_unavailable' }
      : { ...scope, jobId: sessionId, physicalCompatibilityVerified: false } });
  });
  const url = 'http://127.0.0.1:' + server.address().port;
  await page.goto(url);
  const print=page.getByRole('button',{name:'Print testbon',exact:true});
  const refresh=page.getByRole('button',{name:'Opdater testbonens status'});
  await expect(print).toBeEnabled(); assert.equal(commands.length,0);
  assert.equal(await page.locator('input').count(),0);
  await page.evaluate(()=>window.changeActive(false));await expect(print).toBeDisabled();
  await page.evaluate(()=>window.changeActive(true));await expect(print).toBeEnabled();
  // A slow status poll must not silently swallow the operator's one click.
  holdStatus=true;await refresh.click();await expect.poll(()=>heldReads.length).toBe(1);
  await print.click();await expect(page.getByText('Testbonen venter på printeren.',{exact:true})).toBeVisible();
  for(const route of heldReads) await route.abort().catch(()=>{});
  assert.equal(commands.length,1);assert.deepEqual(Object.keys(commands[0]).sort(),[...Object.keys(scope),'operation','requestId'].sort());
  await expect(print).toBeDisabled();
  pilotState='download_started';await refresh.click();
  await expect(page.getByText('Overførsel af testbonen er startet.',{exact:false})).toBeVisible();await expect(print).toBeDisabled();
  pilotState='confirmed';await refresh.click();await expect(print).toBeEnabled();
  await expect(page.getByText('Printeren har meldt testbonen udskrevet.',{exact:false})).toBeVisible();
  assert.equal(commands.length,1);
  await page.goto(url);await expect(print).toBeEnabled();assert.equal(commands.length,1);
  unknown=true;pilotState='none';await refresh.click();await print.click();
  await expect(page.getByText('Testprint er ikke tilgængeligt.',{exact:false})).toBeVisible();
  await expect(print).toBeDisabled();assert.equal(commands.length,2);
  await refresh.click();await expect(page.getByText('Ingen testbon er klargjort.',{exact:true})).toBeVisible();
  const retry=page.getByRole('button',{name:'Prøv samme testbon igen'});await expect(retry).toBeEnabled();
  const failedId=commands[1].requestId;unknown=false;await retry.click();
  await expect(page.getByText('Testbonen venter på printeren.',{exact:true})).toBeVisible();
  assert.equal(commands.length,3);assert.equal(commands[2].requestId,failedId);await expect(retry).toHaveCount(0);
  pilotState='unknown';await refresh.click();
  const recovery=page.getByRole('button',{name:'Print en ny testbon',exact:true});
  await expect(recovery).toHaveCount(0);
  expired=true;await refresh.click();await expect(recovery).toBeEnabled();
  assert.equal(commands.length,3);await expect(print).toBeDisabled();
  unknown=true;await recovery.click();await expect(retry).toBeEnabled();
  assert.equal(commands[3].replaceExpiredCreatedAt,oldCreatedAt);
  unknown=false;await retry.click();await expect(retry).toHaveCount(0);
  assert.deepEqual(commands[4],commands[3]);
  await expect(recovery).toHaveCount(0);await expect(print).toBeDisabled();
  await page.evaluate(()=>window.changePermission(false));await expect(print).toBeDisabled();await expect(refresh).toBeDisabled();
  assert.equal(commands.length,5);assert.deepEqual(errors,[]);
});
