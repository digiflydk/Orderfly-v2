const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');

test('merchant reprint controls: explicit confirmation, scope-only picker, safe retry and unknown state', async t => {
  const { chromium, expect } = require('@playwright/test');
  const webpackModule = require('next/dist/compiled/webpack/webpack'); webpackModule.init();
  const root = process.cwd(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'receipt-reprint-ui-'));
  let browser, server;
  t.after(async () => { await browser?.close(); if (server) await new Promise(r => server.close(r)); fs.rmSync(dir, { recursive: true, force: true }); });
  const scope = { merchant:true, orderId: 'ORD-1', brandId: 'brand', locationId: 'location', kind: 'kitchen' };
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
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || process.env.CART_CHROMIUM_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } }), calls = [], errors = [];
  page.on('pageerror', e => errors.push(e.message));

  let lostWrite=false,state='queued';
  await page.route('**/api/merchant/orders/reprint*', async route=>{
    const req=route.request(), query=Object.fromEntries(new URL(req.url()).searchParams);
    if(req.method()==='GET'&&!query.requestId){
      assert.deepEqual(Object.keys(query).sort(),['brandId','locationId','orderId']);
      return route.fulfill({json:{items:[{configuration:{id:'p1',name:'Køkken',brandId:'brand',locationId:'location',state:'active',transport:'cloudprnt-http'},revision:1,connection:{connected:true,endpoint:'live'}}],nextCursor:null}});
    }
    const command=req.method()==='POST'?req.postDataJSON():{...query,printerRevision:Number(query.printerRevision)};
    calls.push({method:req.method(),command});
    if(lostWrite&&req.method()==='POST')return route.abort('failed');
    return route.fulfill({json:{...command,state,jobId:command.requestId,createdAt:Date.now(),expiresAt:Date.now()+600000}});
  });
  const url='http://127.0.0.1:'+server.address().port;
  await page.goto(url);
  const print=page.getByRole('button',{name:'Genprint køkkenbon',exact:true});
  await expect(print).toBeEnabled();assert.equal(calls.length,0);
  page.once('dialog',d=>d.dismiss());await print.click();assert.equal(calls.length,0,'cancel never writes');
  lostWrite=true;page.once('dialog',d=>d.accept());await print.click();
  await expect(page.getByRole('alert')).toContainText('Resultatet er ukendt');
  const original=calls.at(-1).command;assert.equal('merchant' in original,false);
  lostWrite=false;await page.getByRole('button',{name:'Prøv samme genprint igen'}).click();
  await expect(page.getByRole('status')).toContainText('lagt i kø');assert.deepEqual(calls.at(-1).command,original);
  state='unknown';await page.getByRole('button',{name:'Opdater printstatus'}).click();
  await expect(page.getByRole('status')).toContainText('resultat er ukendt');
  await expect(print).toBeDisabled();assert.equal(calls.filter(c=>c.method==='POST').length,2);
  assert.deepEqual(errors,[]);
});
