const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { createCredentialController } = loadTs('src/app/superadmin/printers/printer-credentials-client.ts');
const scope = { brandId: 'brand', locationId: 'location', printerId: 'printer', printerRevision: 3 };
const secret = Buffer.alloc(32, 7).toString('base64url');
const meta = (patch = {}) => ({ ...scope, credentialRevision: 0, state: 'missing', dispatchAuthorized: false, activationAuthorized: false, ...patch });
const result = (command, patch = {}) => ({ ...scope, credentialRevision: command.credentialRevision + 1, revoked: command.operation === 'revoke',
  dispatchAuthorized: false, activationAuthorized: false, ...(command.operation === 'revoke' ? {} : { secret }), ...patch });
function fixture({ get = () => Response.json(meta()), post = command => Response.json(result(command), { status: command.operation === 'issue' ? 201 : 200 }), permitted = true, target = scope } = {}) {
  const calls = []; let lost = 0;
  const controller = createCredentialController(target, permitted, () => lost++, async (url, options) => {
    calls.push({ url, options }); return options.method === 'POST' ? post(JSON.parse(options.body), options) : get(options);
  });
  return { controller, calls, get lost() { return lost; }, state: () => controller.getSnapshot() };
}
test('credential UI reads only actual scoped metadata; confirmation is required before one atomic write', async () => {
  const f = fixture(); await f.controller.refresh();
  assert.equal(f.calls.length, 1); assert.equal(f.state().phase, 'ready');
  const query = new URL(f.calls[0].url, 'https://fixture.invalid').searchParams;
  assert.equal(query.get('brandId'), scope.brandId); assert.equal(query.get('locationId'), scope.locationId); assert.equal(query.get('printerId'), scope.printerId);
  assert.equal(f.calls[0].options.cache, 'no-store'); assert.equal(f.calls[0].options.credentials, 'same-origin');
  await f.controller.confirm(); assert.equal(f.calls.length, 1);
  f.controller.select('issue'); assert.equal(f.state().phase, 'confirm'); assert.equal(f.calls.length, 1);
  f.controller.cancel(); await f.controller.confirm(); assert.equal(f.calls.length, 1);
  f.controller.select('issue'); await f.controller.confirm();
  assert.equal(f.state().secret, secret); assert.equal(f.state().phase, 'secret');
  const command = JSON.parse(f.calls[1].options.body); assert.deepEqual(command, { ...scope, operation: 'issue', credentialRevision: 0 });
  assert.doesNotMatch(f.calls[1].url + f.calls[1].options.body, new RegExp(secret));
  await f.controller.refresh(); f.controller.select('rotate'); await f.controller.confirm(); assert.equal(f.calls.length, 2);
  f.controller.dismissSecret(); assert.equal(f.state().secret, null); assert.equal(f.state().metadata.credentialRevision, 1);
  f.controller.select('rotate'); await f.controller.confirm(); assert.equal(f.state().secret, secret);
  f.controller.dispose(); assert.equal(f.state().secret, null); assert.equal(f.state().metadata, null);
});
test('revoked/stale/current metadata allow only valid explicit operations; revoke never exposes a secret', async () => {
  for (const state of ['revoked', 'stale', 'current']) {
    const f = fixture({ get: () => Response.json(meta({ state, credentialRevision: 7 })) }); await f.controller.refresh();
    f.controller.select('issue'); assert.equal(f.state().phase, 'ready');
    f.controller.select('rotate'); assert.equal(f.state().phase, 'confirm'); f.controller.cancel();
    f.controller.select('revoke');
    if (state === 'revoked') { assert.equal(f.state().phase, 'ready'); continue; }
    await f.controller.confirm(); assert.equal(f.state().phase, 'ready'); assert.equal(f.state().metadata.state, 'revoked'); assert.equal(f.state().secret, null);
  }
});
test('metadata validates actual scope, row revision, safe CAS, exact schema and no authority grants', async () => {
  for (const patch of [{ brandId: 'foreign' }, { printerId: 'other' }, { printerRevision: 4 }, { credentialRevision: -1 }, { state: 'current' },
    { credentialRevision: 1 }, { secret }, { dispatchAuthorized: true }, { activationAuthorized: true }, { credentialRevision: 1.5 }]) {
    const f = fixture({ get: () => Response.json(meta(patch)) }); await f.controller.refresh();
    assert.equal(f.state().phase, 'error'); assert.equal(f.state().metadata, null); assert.equal(f.state().secret, null);
    f.controller.select('issue'); await f.controller.confirm(); assert.equal(f.calls.length, 1);
  }
  const f = fixture({ get: () => Response.json(meta({ credentialRevision: Number.MAX_SAFE_INTEGER, state: 'current' })) }); await f.controller.refresh();
  f.controller.select('rotate'); assert.equal(f.state().phase, 'ready');
});
test('no read/write without row permission or valid scope, auth loss uses fixed message and delegated callback', async () => {
  for (const options of [{ permitted: false }, { target: { ...scope, brandId: '../foreign' } }, { target: { ...scope, printerRevision: 0 } }]) {
    const f = fixture(options); await f.controller.refresh(); f.controller.select('issue'); await f.controller.confirm(); assert.equal(f.calls.length, 0);
  }
  for (const status of [401, 403]) {
    const f = fixture({ get: () => Response.json({ secret, error: secret }, { status }) }); await f.controller.refresh();
    assert.equal(f.state().phase, 'error'); assert.equal(f.lost, status === 401 ? 1 : 0); assert.doesNotMatch(JSON.stringify(f.state()), new RegExp(secret));
  }
  const f = fixture({ post: () => Response.json({ error: secret }, { status: 401 }) }); await f.controller.refresh(); f.controller.select('issue'); await f.controller.confirm();
  assert.equal(f.lost, 1); assert.equal(f.state().secret, null);
});
test('pending lock prevents duplicate submit; no plaintext is visible before response or after disposal', async () => {
  let resolve; const f = fixture({ post: command => new Promise(r => { resolve = () => r(Response.json(result(command), { status: 201 })); }) });
  await f.controller.refresh(); f.controller.select('issue'); const first = f.controller.confirm();
  await f.controller.confirm(); f.controller.select('rotate'); await f.controller.refresh(); f.controller.cancel();
  assert.equal(f.calls.length, 2); assert.equal(f.state().phase, 'writing'); assert.equal(f.state().secret, null);
  f.controller.dispose(); assert.equal(f.calls[1].options.signal.aborted, true); resolve(); await first;
  assert.equal(f.state().phase, 'disposed'); assert.equal(f.state().secret, null);
});
test('aborted read from an old mount cannot populate a new mount, including StrictMode cleanup/restart', async () => {
  let resolve, count = 0;
  const f = fixture({ get: () => ++count === 1 ? new Promise(r => { resolve = r; }) : Response.json(meta({ state: 'current', credentialRevision: 4 })) });
  const first = f.controller.refresh(); f.controller.dispose(); f.controller.activate(); await f.controller.refresh();
  resolve(Response.json(meta())); await first; assert.equal(f.state().metadata.credentialRevision, 4); assert.equal(f.state().phase, 'ready');
});
test('foreign/malformed success never displays plaintext and requires new metadata plus new confirmation', async () => {
  for (const patch of [{ printerId: 'other' }, { credentialRevision: 9 }, { revoked: true }, { dispatchAuthorized: true }, { activationAuthorized: true },
    { extra: 'foreign' }, { secret: secret.slice(0, 42) + 'B' }, { secret: 'not-a-secret' }]) {
    const f = fixture({ post: command => Response.json(result(command, patch), { status: 201 }) });
    await f.controller.refresh(); f.controller.select('issue'); await f.controller.confirm();
    assert.equal(f.state().phase, 'error'); assert.equal(f.state().secret, null); assert.equal(f.state().metadata, null);
    await f.controller.confirm(); assert.equal(f.calls.length, 2); assert.doesNotMatch(JSON.stringify(f.state()), new RegExp(secret));
  }
  const f = fixture({ get: () => Response.json(meta({ state: 'current', credentialRevision: 1 })), post: command => Response.json(result(command, { secret }), { status: 200 }) });
  await f.controller.refresh(); f.controller.select('revoke'); await f.controller.confirm(); assert.equal(f.state().phase, 'error'); assert.equal(f.state().secret, null);
});
test('conflict and unknown/lost outcomes never retry a write; refreshed existing metadata offers rotation, not retrieval', async () => {
  for (const status of [400, 403, 404, 409, 503]) {
    let reads = 0;
    const f = fixture({ get: () => Response.json(++reads === 1 ? meta() : meta({ state: 'current', credentialRevision: 1 })),
      post: () => Response.json({ error: status === 503 ? 'writes_unavailable' : secret }, { status }) });
    await f.controller.refresh(); f.controller.select('issue'); await f.controller.confirm();
    assert.equal(f.state().phase, 'error'); assert.equal(f.state().secret, null); assert.equal(f.calls.length, 2);
    await f.controller.confirm(); assert.equal(f.calls.length, 2);
    await f.controller.refresh(); assert.equal(f.state().phase, 'ready'); assert.equal(f.state().metadata.credentialRevision, 1);
    f.controller.select('issue'); assert.equal(f.state().phase, 'ready'); f.controller.select('rotate'); assert.equal(f.state().phase, 'confirm');
    assert.equal(f.calls.filter(c => c.options.method === 'POST').length, 1);
  }
  const f = fixture({ post: () => { throw Error(secret); } }); await f.controller.refresh(); f.controller.select('issue'); await f.controller.confirm();
  assert.equal(f.state().phase, 'error'); assert.doesNotMatch(JSON.stringify(f.state()), new RegExp(secret));
});
test('oversized or invalid UTF8 response bodies fail closed with no reflected body', async () => {
  for (const response of [new Response('x'.repeat(8193)), new Response(new Uint8Array([0xff]))]) {
    const f = fixture({ get: () => response }); await f.controller.refresh(); assert.equal(f.state().phase, 'error'); assert.equal(f.state().metadata, null);
  }
});

test('browser: actual credential panel confirms once, clears secret on row/permission change and works in StrictMode', async t => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
  const { chromium, expect } = require('@playwright/test');
  const webpackModule = require('next/dist/compiled/webpack/webpack'); webpackModule.init();
  const root = process.cwd(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'printer-credentials-ui-'));
  let browser, server;
  t.after(async () => { await browser?.close(); if (server) await new Promise(r => server.close(r)); fs.rmSync(dir, { recursive: true, force: true }); });
  const entry = path.join(dir, 'entry.js'), loader = path.join(dir, 'loader.js');
  fs.writeFileSync(entry, `import React from 'react';import{createRoot}from'react-dom/client';import{PrinterCredentialsPanel}from ${JSON.stringify(path.join(root, 'src/app/superadmin/printers/printer-credentials-panel.tsx'))};import{PrinterOverview}from ${JSON.stringify(path.join(root, 'src/app/superadmin/printers/printer-overview.tsx'))};
    function App(){const [scope,setScope]=React.useState(${JSON.stringify(scope)});const [permitted,setPermitted]=React.useState(true);const[open,setOpen]=React.useState(true);window.changeScope=setScope;window.changePermission=setPermitted;
    return open?React.createElement(PrinterCredentialsPanel,{scope,permitted,printerName:'Køkken ÆØÅ',onSessionLost:()=>{window.sessionLost=true},onClose:()=>setOpen(false)}):React.createElement('p',null,'Lukket');}
    function Overview(){const[permitted,setPermitted]=React.useState(true);window.changeOverviewPermission=setPermitted;return React.createElement(PrinterOverview,{brands:[{id:'brand',name:'Brand'},{id:'other-brand',name:'Other'}],locations:[{id:'location',brandId:'brand',name:'Lokation'}],editLocations:permitted?[{id:'location',brandId:'brand'}]:[],deleteLocations:[{id:'location',brandId:'brand'}]});}
    createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode,null,React.createElement(location.pathname==='/overview'?Overview:App)));`);
  fs.writeFileSync(loader, `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
  await new Promise((resolve, reject) => webpackModule.webpack({ mode: 'development', devtool: false, entry, output: { path: dir, filename: 'bundle.js' },
    resolve: { alias: { '@': path.join(root, 'src') }, extensions: ['.tsx', '.ts', '.js'], modules: [path.join(root, 'node_modules'), 'node_modules'] },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [loader] }] },
  }).run((error, stats) => error ? reject(error) : stats.hasErrors() ? reject(Error(stats.toString({ all: false, errors: true }))) : resolve()));
  server = http.createServer((req, res) => {
    if (req.url === '/bundle.js') { res.setHeader('content-type', 'application/javascript'); return res.end(fs.readFileSync(path.join(dir, 'bundle.js'))); }
    res.setHeader('content-type', 'text/html; charset=utf-8');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  let writes = 0;
  await page.route('**/api/superadmin/printers/device-credentials*', async route => {
    if (route.request().method() === 'POST') { writes++; const command = route.request().postDataJSON(); return route.fulfill({ status: command.operation === 'issue' ? 201 : 200, json: result(command) }); }
    return route.fulfill({ json: meta() });
  });
  await page.goto('http://127.0.0.1:' + server.address().port);
  await expect(page.getByText('Status: Ikke oprettet')).toBeVisible(); assert.equal(writes, 0);
  await page.getByRole('button', { name: 'Opret printeradgang', exact: true }).click(); assert.equal(writes, 0);
  await expect(page.getByText('Opret en ny adgangskode til denne printer?')).toBeVisible();
  await page.getByRole('button', { name: 'Opret printeradgang', exact: true }).click();
  await expect(page.getByLabel('Engangsvist adgangskode')).toHaveText(secret); assert.equal(writes, 1);
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
  await page.evaluate(() => window.changeScope({ brandId: 'brand', locationId: 'location', printerId: 'other', printerRevision: 3 }));
  await expect(page.getByLabel('Engangsvist adgangskode')).toHaveCount(0);
  await page.evaluate(() => window.changeScope({ brandId: 'brand', locationId: 'location', printerId: 'printer', printerRevision: 3 }));
  await expect(page.getByText('Status: Ikke oprettet')).toBeVisible();
  await page.evaluate(() => window.changePermission(false));
  await expect(page.getByRole('button', { name: 'Opret printeradgang', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Engangsvist adgangskode')).toHaveCount(0); assert.equal(writes, 1);
  await page.getByRole('button', { name: 'Luk', exact: true }).click(); await expect(page.getByText('Lukket')).toBeVisible();
  // Actual overview integration: original row actions remain, scope comes from
  // the row even with no selected brand/location, and filters dispose secrets.
  const row = { configuration: { id: scope.printerId, brandId: scope.brandId, locationId: scope.locationId, name: 'Køkken ÆØÅ', manufacturer: 'star',
    model: 'mc-print2', transport: 'cloudprnt-http', state: 'disabled', paperWidthMm: 58 }, revision: scope.printerRevision };
  await page.route('**/api/merchant/printers?*', route => route.fulfill({ json: { items: [row], nextCursor: null, totalPrinters: 1 } }));
  await page.goto('http://127.0.0.1:' + server.address().port + '/overview');
  await expect(page.getByRole('columnheader')).toHaveCount(9);
  await expect(page.getByRole('button', { name: 'Rediger Køkken ÆØÅ', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Deaktiver Køkken ÆØÅ', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Slet Køkken ÆØÅ', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Printeradgang Køkken ÆØÅ', exact: true }).click();
  await expect(page.getByText('Status: Ikke oprettet')).toBeVisible();
  await page.getByRole('button', { name: 'Opret printeradgang', exact: true }).click();
  await page.getByRole('button', { name: 'Opret printeradgang', exact: true }).click();
  await expect(page.getByLabel('Engangsvist adgangskode')).toHaveText(secret); assert.equal(writes, 2);
  await page.getByRole('combobox', { name: 'Printertype', exact: true }).selectOption('mc-print2');
  await expect(page.getByLabel('Engangsvist adgangskode')).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Printeradgang', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Printeradgang Køkken ÆØÅ', exact: true }).click();
  await expect(page.getByText('Status: Ikke oprettet')).toBeVisible();
  await page.evaluate(() => window.changeOverviewPermission(false));
  await expect(page.getByRole('dialog', { name: 'Printeradgang', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Printeradgang Køkken ÆØÅ', exact: true })).toBeDisabled();
});
