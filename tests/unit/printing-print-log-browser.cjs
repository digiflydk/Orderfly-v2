const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');

test('print log: brand isolation, statuses, pagination, failures and mobile layout', async t => {
  const { chromium, expect } = require('@playwright/test');
  const webpackModule = require('next/dist/compiled/webpack/webpack'); webpackModule.init();
  const root = process.cwd(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kitchen-layout-'));
  let browser, server;
  t.after(async () => { await browser?.close(); if (server) await new Promise(r => server.close(r)); fs.rmSync(dir, { recursive: true, force: true }); });
  const entry = path.join(dir, 'entry.js'), loader = path.join(dir, 'loader.js');
  fs.writeFileSync(entry, `import React from 'react';import{createRoot}from'react-dom/client';import{PrintLogOverview}from ${JSON.stringify(path.join(root, 'src/app/superadmin/print-log/print-log-overview.tsx'))};createRoot(document.getElementById('root')).render(React.createElement(PrintLogOverview,{brands:[{id:'brandA',name:'Brand A'},{id:'brandB',name:'Brand B'}],locations:[]}));`);
  fs.writeFileSync(loader, `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
  await new Promise((resolve, reject) => webpackModule.webpack({ mode: 'development', devtool: false, entry, output: { path: dir, filename: 'bundle.js' },
    resolve: { alias: { '@': path.join(root, 'src') }, extensions: ['.tsx', '.ts', '.js'], modules: [path.join(root, 'node_modules'), 'node_modules'] },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [loader] }] },
  }).run((error, stats) => error ? reject(error) : stats.hasErrors() ? reject(Error(stats.toString({ all: false, errors: true }))) : resolve()));
  // Compile the project's actual config and global CSS, rather than recreating its layout in a test.
  const css = (await require('postcss')([require('tailwindcss')(path.join(root, 'tailwind.config.ts'))]).process(fs.readFileSync(path.join(root, 'src/app/globals.css'), 'utf8'), { from: path.join(root, 'src/app/globals.css') })).css;
  server = http.createServer((req, res) => {
    if (req.url.startsWith('/fonts/orderfly/')) { const font = path.basename(req.url); if (!['DejaVuSansMono.ttf', 'DejaVuSansMono-Bold.ttf'].includes(font)) { res.statusCode = 404; return res.end(); } res.setHeader('content-type', 'font/ttf'); return res.end(fs.readFileSync(path.join(root, 'public/fonts/orderfly', font))); }
    if (req.url === '/bundle.js') { res.setHeader('content-type', 'application/javascript'); return res.end(fs.readFileSync(path.join(dir, 'bundle.js'))); }
    if (req.url === '/style.css') { res.setHeader('content-type', 'text/css'); return res.end(css); }
    res.setHeader('content-type', 'text/html; charset=utf-8'); res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><main style="padding:16px"><div id="root"></div></main><script src="/bundle.js"></script></body></html>');
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  browser = await chromium.launch({ headless: true, executablePath: process.env.CART_CHROMIUM_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const calls = [];
  let mode = 'normal', pending;
  const item = { id:'manual-job',brandId:'brandA',locationId:'locationA',locationName:'Amager',printerId:'printerA',printerName:'Køkken',orderId:'ORD-123',kind:'kitchen',source:'manual',status:'confirmed',createdAt:1792926000000,updatedAt:1792926005000,error:null };
  await page.route('**/api/superadmin/print-log?*', async route => {
    const url = new URL(route.request().url());
    calls.push({ method:route.request().method(), brand:url.searchParams.get('brandId'), cursor:url.searchParams.get('cursor') });
    if (mode === 'delay') { pending=route; return; }
    if (mode === 'error') return route.fulfill({status:503,json:{error:'unavailable'}});
    if (mode === 'large') return route.fulfill({status:503,json:{error:'print_log_scope_too_large'}});
    if (mode === 'denied') return route.fulfill({status:403,json:{error:'forbidden'}});
    if (mode === 'foreign') return route.fulfill({json:{items:[item],nextCursor:null}});
    const brandId=url.searchParams.get('brandId'), next=url.searchParams.has('cursor');
    return route.fulfill({json:{items:[{...item,brandId,orderId:brandId==='brandB'?'ORD-B':next?'ORD-456':'ORD-123',status:next?'failed':brandId==='brandB'?'download_started':'confirmed',error:next?'Printeren meldte fejl.':null}],nextCursor:next?null:'page2'}});
  });
  await page.goto('http://127.0.0.1:' + server.address().port);
  await expect(page.getByText('Vælg et brand for at se printloggen.')).toBeVisible();
  assert.equal(calls.length,0);
  await page.getByRole('combobox').selectOption('brandA');
  await expect(page.getByRole('link',{name:'ORD-123'})).toBeVisible();
  await expect(page.getByText('Bekræftet af printer',{exact:true})).toBeVisible();
  await page.screenshot({path:'/tmp/print-log-ui.png',fullPage:true});
  assert.equal(await page.getByRole('link',{name:'ORD-123'}).getAttribute('href'),'/superadmin/sales/orders/ORD-123/kitchen-receipt');
  await expect(page.getByRole('button',{name:'Forrige'})).toBeDisabled();
  await page.getByRole('button',{name:'Næste'}).click();
  await expect(page.getByRole('link',{name:'ORD-456'})).toBeVisible();
  await expect(page.getByText('Fejlet',{exact:true})).toBeVisible();
  await expect(page.getByText('Printeren meldte fejl.')).toBeVisible();
  assert.equal(calls.at(-1).cursor,'page2');
  await page.getByRole('button',{name:'Forrige'}).click();
  await expect(page.getByRole('link',{name:'ORD-123'})).toBeVisible();
  await page.getByRole('combobox').selectOption('brandB');
  await expect(page.getByRole('link',{name:'ORD-B'})).toBeVisible();
  await expect(page.getByRole('link',{name:'ORD-123'})).toHaveCount(0);
  await expect(page.getByText('Overførsel startet',{exact:true})).toBeVisible();
  assert.equal(calls.at(-1).cursor,null);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth),false);
  mode='error'; await page.getByRole('button',{name:'Opdater',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('kunne ikke indlæses');
  await expect(page.getByRole('link',{name:'ORD-B'})).toHaveCount(0);
  mode='foreign'; await page.getByRole('button',{name:'Opdater',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('kunne ikke indlæses');
  await expect(page.getByRole('link',{name:'ORD-123'})).toHaveCount(0);
  mode='large'; await page.getByRole('button',{name:'Opdater',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('flere lokationer eller printere');
  mode='denied'; await page.getByRole('button',{name:'Opdater',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Log ind igen som superadmin');
  mode='delay'; await page.getByRole('button',{name:'Opdater',exact:true}).click();
  await expect.poll(()=>!!pending).toBe(true);
  mode='normal'; await page.getByRole('combobox').selectOption('brandA');
  await expect(page.getByRole('link',{name:'ORD-123'})).toBeVisible();
  await pending.fulfill({json:{items:[{...item,brandId:'brandB',orderId:'STALE'}],nextCursor:null}}).catch(()=>{});
  await expect(page.getByRole('link',{name:'STALE'})).toHaveCount(0);
  assert.ok(calls.every(call=>call.method==='GET'));
  assert.deepEqual(errors,[]);
});
