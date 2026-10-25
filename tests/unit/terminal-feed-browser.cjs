const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const { chromium, expect } = require('@playwright/test');

test('terminal feed: baseline, repeat/append suppression, auth clearing, offline recovery and scope races', async t => {
  const root = process.cwd(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'terminal-feed-'));
  let browser, server;
  t.after(async () => { await browser?.close(); if (server) await new Promise(r => server.close(r)); fs.rmSync(dir, { recursive: true, force: true }); });
  const entry = path.join(dir, 'entry.js'), loader = path.join(dir, 'loader.js');
  fs.writeFileSync(entry, `import React from 'react';import{createRoot}from'react-dom/client';import{useTerminalFeed}from ${JSON.stringify(path.join(root, 'src/app/merchant/orders/use-terminal-feed.ts'))};function App(){const[scope,setScope]=React.useState('a');const f=useTerminalFeed({brandId:scope,view:'board'});const shadow=useTerminalFeed({brandId:'shadow',view:'history'});return React.createElement('div',null,React.createElement('pre',{id:'state'},JSON.stringify({ids:f.data?.orders.map(o=>o.id)||[],newOrders:f.newOrders,loading:f.loading,error:f.error,offline:f.offline,stale:f.stale,denied:f.deniedRevision,authorized:f.authorizedRevision,shadowAuthorized:shadow.authorizedRevision,shadowError:shadow.error})),React.createElement('button',{onClick:shadow.refresh},'ShadowRefresh'),React.createElement('button',{onClick:f.refresh},'Refresh'),React.createElement('button',{onClick:f.loadMore},'More'),React.createElement('button',{onClick:()=>setScope(scope==='a'?'b':'a')},'Scope'));}createRoot(document.getElementById('root')).render(React.createElement(App));`);
  fs.writeFileSync(loader, `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
  const webpack = require('next/dist/compiled/webpack/webpack'); webpack.init();
  await new Promise((resolve,reject)=>webpack.webpack({mode:'development',devtool:false,entry,output:{path:dir,filename:'bundle.js'},resolve:{alias:{'@':path.join(root,'src')},extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules'),'node_modules']},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:[loader]}]}}).run((err,stats)=>err?reject(err):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
  server=http.createServer((req,res)=>{if(req.url==='/bundle.js'){res.setHeader('content-type','application/javascript');return res.end(fs.readFileSync(path.join(dir,'bundle.js')));}res.setHeader('content-type','text/html');res.end('<div id="root"></div><script src="/bundle.js"></script>');});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  browser=await chromium.launch({headless:true,executablePath:process.env.CART_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let ids=['old'],mode='ok',held,calls=0,shadowHold=false,heldShadow,shadowStatus=200,shadowCalls=0;
  const result=(list=ids)=>({orders:list.map(id=>({id,status:'Received'})),locations:[],selectedBrandId:'a',selectedLocationId:'l',canEdit:true,serverTime:'2026-10-25T18:00:00Z',nextCursor:null,hasMore:false});
  await page.route('**/api/merchant/orders?**',async route=>{calls++;const u=new URL(route.request().url());if(u.searchParams.get('brandId')==='shadow'){shadowCalls++;if(shadowHold){heldShadow=route;return;}return route.fulfill({status:shadowStatus,json:shadowStatus===200?result(['shadow']):{error:'unavailable'}});}if(mode==='hold'&&u.searchParams.get('brandId')==='a'){held=route;return;}if(mode==='denied')return route.fulfill({status:403,json:{error:'forbidden'}});const value=result(u.searchParams.get('brandId')==='b'?['brand-b']:u.searchParams.has('cursor')?['older-page']:ids);if(u.searchParams.get('brandId')==='a'&&!u.searchParams.has('cursor')){value.nextCursor='next';value.hasMore=true;}return route.fulfill({json:value});});
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const state=async()=>JSON.parse(await page.locator('#state').textContent());
  await expect.poll(async()=> (await state()).ids).toEqual(['old','older-page']); assert.equal((await state()).newOrders,0);
  ids=['new','old'];await page.getByText('Refresh',{exact:true}).click();await expect.poll(async()=>(await state()).newOrders).toBe(1);
  await page.getByText('Refresh',{exact:true}).click();await expect.poll(async()=>(await state()).loading).toBe(false);assert.equal((await state()).newOrders,1);
  await page.getByText('More',{exact:true}).click();await expect.poll(async()=>(await state()).ids).toContain('older-page');assert.equal((await state()).newOrders,1);
  mode='denied';await page.getByText('Refresh',{exact:true}).click();await expect.poll(async()=>(await state()).error).toContain('adgang');assert.deepEqual((await state()).ids,[]);
  mode='ok';await page.getByText('Refresh',{exact:true}).click();await expect.poll(async()=>(await state()).ids).toContain('new');
  await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,value:false});window.dispatchEvent(new Event('offline'));});
  await expect.poll(async()=>(await state()).offline).toBe(true);const before=calls;await page.getByText('Refresh',{exact:true}).click();assert.equal(calls,before);
  await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,value:true});window.dispatchEvent(new Event('online'));});await expect.poll(async()=>(await state()).offline).toBe(false);
  mode='hold';held=undefined;await page.getByText('Refresh',{exact:true}).click();await expect.poll(()=>!!held).toBe(true);
  await page.getByText('Refresh',{exact:true}).click();mode='ok';ids=['after-mutation'];await held.fulfill({json:result(['before-mutation'])});await expect.poll(async()=>(await state()).ids).toEqual(['after-mutation','older-page']);
  mode='hold';held=undefined;await page.getByText('Refresh',{exact:true}).click();await expect.poll(()=>!!held).toBe(true);await page.getByText('Refresh',{exact:true}).click();const busyCalls=calls;await page.waitForTimeout(30);assert.equal(calls,busyCalls);
  await page.getByText('Scope',{exact:true}).click();await expect.poll(async()=>(await state()).ids).toEqual(['brand-b']);assert.equal((await state()).newOrders,0);
  await held.fulfill({json:result(['stale-a'])}).catch(()=>{});await page.waitForTimeout(30);assert.deepEqual((await state()).ids,['brand-b']);
  // A second feed's request began before revocation. Its late200 must not be
  // promoted to fresh authorization; a subsequent new request is required.
  shadowHold=true;await page.getByText('ShadowRefresh',{exact:true}).click();await expect.poll(()=>!!heldShadow).toBe(true);
  const previousDenial=(await state()).denied;mode='denied';await page.getByText('Refresh',{exact:true}).click();await expect.poll(async()=>(await state()).denied).toBeGreaterThan(previousDenial);
  const denial=(await state()).denied, beforeShadow=shadowCalls;
  shadowHold=false;shadowStatus=503;await heldShadow.fulfill({json:result(['pre-denial-success'])});
  await expect.poll(()=>shadowCalls).toBeGreaterThan(beforeShadow);await expect.poll(async()=>(await state()).shadowError).toContain('opdateres');
  assert.ok((await state()).shadowAuthorized<=denial,'pre-denial success cannot satisfy new authorization');
  mode='ok';shadowStatus=200;await page.getByText('Refresh',{exact:true}).click();await page.getByText('ShadowRefresh',{exact:true}).click();
  await expect.poll(async()=>(await state()).authorized).toBeGreaterThan(denial);await expect.poll(async()=>(await state()).shadowAuthorized).toBeGreaterThan(denial);
  assert.deepEqual(errors,[]);
});
