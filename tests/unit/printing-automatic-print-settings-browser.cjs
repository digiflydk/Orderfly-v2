const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');

test('automatic print settings: explicit save, failure, scope switching and revoked access', async t => {
  const { chromium, expect } = require('@playwright/test');
  const webpackModule = require('next/dist/compiled/webpack/webpack'); webpackModule.init();
  const root = process.cwd(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kitchen-layout-'));
  let browser, server;
  t.after(async () => { await browser?.close(); if (server) await new Promise(r => server.close(r)); fs.rmSync(dir, { recursive: true, force: true }); });
  const entry = path.join(dir, 'entry.js'), loader = path.join(dir, 'loader.js');
  fs.writeFileSync(entry, `import React from 'react';import{createRoot}from'react-dom/client';import{AutomaticPrintSettings}from ${JSON.stringify(path.join(root, 'src/components/superadmin/automatic-print-settings.tsx'))};function App(){const[brand,setBrand]=React.useState('brandA');const[allowed,setAllowed]=React.useState(true);window.changeBrand=setBrand;window.setAllowed=setAllowed;return allowed?React.createElement(AutomaticPrintSettings,{brandId:brand,brandName:brand}):null}createRoot(document.getElementById('root')).render(React.createElement(App));`);
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
  const calls = [], stored={brandA:{brandId:'brandA',enabled:false,revision:0,enabledAt:null},brandB:{brandId:'brandB',enabled:false,revision:0,enabledAt:null}};
  let mode='normal', pending;
  await page.route('**/api/superadmin/printers/automatic-print*',async route=>{
    const request=route.request(),url=new URL(request.url()),body=request.method()==='POST'?request.postDataJSON():null;
    calls.push({method:request.method(),body,brand:url.searchParams.get('brandId')});
    if(mode==='read-denied' || mode==='denied' && body) return route.fulfill({status:403,json:{error:'forbidden'}});
    if(mode==='foreign' && !body) return route.fulfill({json:stored.brandB});
    if(mode==='delay' && body){pending=route;return;}
    if(mode==='conflict' && body) return route.fulfill({status:409,json:{error:'automatic_print_conflict'}});
    if(body){stored[body.brandId]={brandId:body.brandId,enabled:body.enabled,revision:body.expectedRevision+1,enabledAt:body.enabled?1792926000000:null};if(mode==='unknown')return route.fulfill({status:503,json:{error:'automatic_print_unavailable'}});return route.fulfill({json:stored[body.brandId]});}
    return route.fulfill({json:stored[url.searchParams.get('brandId')]});
  });
  await page.goto('http://127.0.0.1:' + server.address().port);
  const toggle=page.getByRole('switch',{name:'Automatisk print'}),save=page.getByRole('button',{name:'Gem automatisk print'}),reload=page.getByRole('button',{name:'Genindlæs',exact:true});
  await expect(toggle).not.toBeChecked(); await expect(save).toBeEnabled();
  await expect(page.getByText('Gemt status: Ikke indstillet',{exact:true})).toBeVisible();
  await expect(page.getByText('Gem Deaktiveret for også at stoppe en tidligere ordretest.')).toBeVisible();
  await save.click(); await expect(page.getByText('Gemt status: Deaktiveret',{exact:true})).toBeVisible();
  assert.deepEqual(calls.find(c=>c.method==='POST').body,{brandId:'brandA',enabled:false,expectedRevision:0});
  await expect(save).toBeDisabled();
  await expect(page.getByText('Gem Deaktiveret for også at stoppe en tidligere ordretest.')).toHaveCount(0);
  await toggle.check(); assert.equal(calls.filter(c=>c.method==='POST').length,1);
  await expect(page.getByText('Gemt status: Deaktiveret',{exact:true})).toBeVisible();
  await save.dblclick(); await expect(page.getByText('Gemt status: Aktiveret',{exact:true})).toBeVisible();
  assert.equal(calls.filter(c=>c.method==='POST').length,2);
  assert.deepEqual(calls.filter(c=>c.method==='POST').at(-1).body,{brandId:'brandA',enabled:true,expectedRevision:1});
  await reload.click(); await expect(toggle).toBeChecked();
  mode='unknown'; await toggle.uncheck(); await save.click();
  await expect(page.getByRole('alert')).toContainText('Gemningen kunne ikke bekræftes');
  await expect(toggle).toBeDisabled(); await expect(save).toBeDisabled();
  mode='normal'; await reload.click(); await expect(toggle).not.toBeChecked();
  await expect(page.getByText('Gemt status: Deaktiveret',{exact:true})).toBeVisible();
  mode='conflict'; await toggle.check(); await save.click();
  await expect(page.getByRole('alert')).toContainText('ændret af en anden'); await expect(save).toBeDisabled();
  mode='normal'; await reload.click(); await expect(toggle).toBeEnabled();
  mode='denied'; await toggle.check(); await save.click();
  await expect(page.getByRole('alert')).toContainText('Adgangen er ændret'); await expect(toggle).toBeDisabled();
  mode='normal'; await reload.click(); await expect(toggle).toBeEnabled();
  mode='delay'; await toggle.check(); await save.click(); await expect.poll(()=>!!pending).toBe(true);
  mode='normal'; await page.evaluate(()=>window.changeBrand('brandB')); await expect(toggle).not.toBeChecked();
  await pending.fulfill({json:{brandId:'brandA',enabled:true,revision:10,enabledAt:1792926000000}});
  await expect(page.getByText('Gemt status: Ikke indstillet',{exact:true})).toBeVisible();
  await toggle.check(); await save.click(); await expect(page.getByText('Gemt status: Aktiveret',{exact:true})).toBeVisible();
  assert.deepEqual(calls.filter(c=>c.method==='POST').at(-1).body,{brandId:'brandB',enabled:true,expectedRevision:0});
  mode='foreign'; await page.evaluate(()=>window.changeBrand('brandA')); await expect(page.getByRole('alert')).toContainText('kunne ikke indlæses'); await expect(toggle).toHaveCount(0);
  mode='read-denied'; await reload.click(); await expect(page.getByRole('alert')).toContainText('ikke adgang'); await expect(save).toBeDisabled();
  mode='normal'; await reload.click(); await expect(toggle).toBeEnabled();
  await page.screenshot({path:'/tmp/automatic-print-settings-ui.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.evaluate(()=>window.setAllowed(false)); await expect(save).toHaveCount(0);
  assert.deepEqual(errors,[]);
});
