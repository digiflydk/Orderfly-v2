const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const { chromium, expect } = require('@playwright/test');
let dir, server, browser, origin;
before(async () => {
  const root=process.cwd();dir=fs.mkdtempSync(path.join(os.tmpdir(),'location-terminal-login-'));
  const entry=path.join(dir,'entry.js'), loader=path.join(dir,'loader.js');
  fs.writeFileSync(entry,`import React from 'react';import{createRoot}from'react-dom/client';import{LocationTerminalLogin}from ${JSON.stringify(path.join(root,'src/components/superadmin/location-terminal-login.tsx'))};function App(){const[id,setId]=React.useState('loc-a');return React.createElement('div',null,React.createElement('button',{onClick:()=>setId('loc-b')},'Switch scope'),React.createElement(LocationTerminalLogin,{locationId:id,locationName:'Fixture restaurant'}));}createRoot(document.getElementById('root')).render(React.createElement(App));`);
  fs.writeFileSync(loader,`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
  const webpack=require('next/dist/compiled/webpack/webpack');webpack.init();
  await new Promise((resolve,reject)=>webpack.webpack({mode:'development',devtool:false,entry,output:{path:dir,filename:'bundle.js'},resolve:{alias:{'@':path.join(root,'src')},extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules'),'node_modules']},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:[loader]}]}}).run((error,stats)=>error?reject(error):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
  server=http.createServer((req,res)=>{if(req.url==='/bundle.js'){res.setHeader('content-type','application/javascript');return res.end(fs.readFileSync(path.join(dir,'bundle.js')));}res.setHeader('content-type','text/html; charset=utf-8');res.end('<div id="root"></div><script src="/bundle.js"></script>');});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));origin=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true,executablePath:process.env.CART_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
});
after(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));if(dir)fs.rmSync(dir,{recursive:true,force:true});});
async function fixture(t,initial={configured:false,enabled:false,username:'',revision:0,canEdit:true}) {
  const page=await browser.newPage({viewport:{width:768,height:1024}});t.after(()=>page.close());
  const calls=[],errors=[],state={value:initial,getStatus:200,putStatus:200,holdGet:false,holdPut:false,heldGet:null,heldPut:null};
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.__storageWrites=[];const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){window.__storageWrites.push([key,value]);return original.call(this,key,value);};});
  await page.route('**/api/superadmin/locations/*/terminal-login',async route=>{
    const req=route.request(),location=new URL(req.url()).pathname.split('/')[4];calls.push({method:req.method(),location,body:req.method()==='PUT'?req.postDataJSON():null});
    if(req.method()==='GET') {if(state.holdGet){state.heldGet=route;return;}return route.fulfill({status:state.getStatus,json:state.getStatus===200?state.value:{error:'unavailable'}});}
    if(state.holdPut){state.heldPut=route;return;}
    if(state.putStatus!==200)return route.fulfill({status:state.putStatus,json:{error:'conflict',message:'Do not reflect unsafe backend text'}});
    const body=req.postDataJSON();assert.equal(body.expectedRevision,state.value.revision);state.value={configured:true,enabled:body.enabled,username:body.username,revision:state.value.revision+1,canEdit:true};return route.fulfill({json:state.value});
  });
  return{page,state,calls,errors,open:()=>page.goto(origin)};
}
test('loads, configures and resets a secret without browser storage or secret echo',async t=>{
  const f=await fixture(t);f.state.holdGet=true;await f.open();await expect(f.page.getByText('Henter…',{exact:true})).toBeVisible();
  await expect.poll(()=>!!f.state.heldGet).toBe(true);f.state.holdGet=false;await f.state.heldGet.fulfill({json:f.state.value});
  await f.page.getByLabel('Brugernavn til terminal').fill('  Kitchen.A  ');await f.page.getByLabel('Ny adgangskode').fill('fixture-secret-12345');await f.page.getByRole('button',{name:'Opret terminal-login',exact:true}).click();
  await expect(f.page.getByRole('status')).toContainText('gemt');await expect(f.page.getByLabel('Ny adgangskode')).toHaveValue('');assert.equal(f.calls.at(-1).body.username,'kitchen.a');assert.equal(f.calls.at(-1).body.password,'fixture-secret-12345');
  assert.deepEqual(await f.page.evaluate(()=>window.__storageWrites),[]);assert.equal(await f.page.getByLabel('Ny adgangskode').getAttribute('autocomplete'),'new-password');
  await f.page.getByRole('button',{name:'Gem terminal-login',exact:true}).click();await expect.poll(()=>f.state.value.revision).toBe(2);assert.equal('password' in f.calls.at(-1).body,false);
  await f.page.getByLabel('Ny adgangskode').fill('replacement-fixture-999');await f.page.getByRole('button',{name:'Gem terminal-login',exact:true}).click();await expect.poll(()=>f.state.value.revision).toBe(3);await expect(f.page.getByLabel('Ny adgangskode')).toHaveValue('');
  assert.ok(!(await f.page.locator('body').innerText()).includes('replacement-fixture-999'));assert.deepEqual(f.errors,[]);
});
test('disable requires explicit confirmation and uses saved username, not an unsaved draft',async t=>{
  const f=await fixture(t,{configured:true,enabled:true,username:'saved.user',revision:4,canEdit:true});await f.open();await f.page.getByLabel('Brugernavn til terminal').fill('unsaved.user');await f.page.getByLabel('Ny adgangskode').fill('unsaved-secret-123');
  await f.page.getByRole('button',{name:'Deaktivér terminal-login',exact:true}).click();assert.equal(f.calls.filter(c=>c.method==='PUT').length,0);await f.page.getByRole('button',{name:'Bekræft deaktivering',exact:true}).click();
  await expect(f.page.getByRole('status')).toContainText('deaktiveret');const body=f.calls.find(c=>c.method==='PUT').body;assert.deepEqual(body,{username:'saved.user',enabled:false,expectedRevision:4});await expect(f.page.getByLabel('Ny adgangskode')).toHaveValue('');
});
test('conflict and uncertain results clear password and block replay until a fresh GET',async t=>{
  const f=await fixture(t,{configured:true,enabled:true,username:'saved.user',revision:4,canEdit:true});await f.open();await f.page.getByLabel('Ny adgangskode').fill('fixture-password-123');f.state.putStatus=409;await f.page.getByRole('button',{name:'Gem terminal-login',exact:true}).click();
  await expect(f.page.getByRole('alert')).toContainText('brugernavnet er optaget');await expect(f.page.getByLabel('Ny adgangskode')).toHaveValue('');await expect(f.page.getByRole('button',{name:'Gem terminal-login',exact:true})).toBeDisabled();
  f.state.value.revision=5;await f.page.getByRole('button',{name:'Hent aktuel status',exact:true}).click();await expect(f.page.getByRole('button',{name:'Gem terminal-login',exact:true})).toBeEnabled();
  f.state.putStatus=503;await f.page.getByLabel('Ny adgangskode').fill('another-fixture-secret');await f.page.getByRole('button',{name:'Gem terminal-login',exact:true}).click();await expect(f.page.getByRole('alert')).toContainText('kunne ikke bekræftes');await expect(f.page.getByLabel('Ny adgangskode')).toHaveValue('');assert.deepEqual(await f.page.evaluate(()=>window.__storageWrites),[]);
});
test('read-only and revoked sessions expose no write controls or password after rejection',async t=>{
  const f=await fixture(t,{configured:true,enabled:true,username:'saved.user',revision:4,canEdit:false});await f.open();await expect(f.page.getByText('Du har læseadgang.',{exact:false})).toBeVisible();await expect(f.page.getByRole('button',{name:'Gem terminal-login',exact:true})).toHaveCount(0);await expect(f.page.getByLabel('Ny adgangskode')).toBeDisabled();
  f.state.getStatus=401;await f.page.getByRole('button',{name:'Switch scope',exact:true}).click();await expect(f.page.getByRole('alert')).toContainText('session er udløbet');await expect(f.page.getByLabel('Ny adgangskode')).toHaveCount(0);await expect(f.page.getByRole('link',{name:'Log ind igen',exact:true})).toBeVisible();assert.equal(f.calls.filter(c=>c.method==='PUT').length,0);
});
test('changing location during a pending write clears secrets and ignores the stale response',async t=>{
  const f=await fixture(t,{configured:true,enabled:true,username:'location.a',revision:4,canEdit:true});await f.open();await f.page.getByLabel('Ny adgangskode').fill('scope-fixture-secret');f.state.holdPut=true;await f.page.getByRole('button',{name:'Gem terminal-login',exact:true}).click();await expect.poll(()=>!!f.state.heldPut).toBe(true);
  f.state.value={configured:true,enabled:false,username:'location.b',revision:8,canEdit:true};await f.page.getByRole('button',{name:'Switch scope',exact:true}).click();await expect(f.page.getByLabel('Brugernavn til terminal')).toHaveValue('location.b');await expect(f.page.getByLabel('Ny adgangskode')).toHaveValue('');await f.state.heldPut.fulfill({json:{configured:true,enabled:true,username:'old.response',revision:5,canEdit:true}}).catch(()=>{});await expect(f.page.getByLabel('Brugernavn til terminal')).toHaveValue('location.b');await expect(f.page.getByRole('button',{name:'Gem terminal-login',exact:true})).toBeEnabled();assert.deepEqual(f.errors,[]);
});
