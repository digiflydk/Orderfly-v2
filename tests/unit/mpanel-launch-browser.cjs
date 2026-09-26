const {test,before,after,beforeEach,afterEach}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require('@playwright/test');
const webpackModule=require('next/dist/compiled/webpack/webpack');webpackModule.init();
let dir,bundle,browser;
before(async()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'mpanel-launch-browser-'));const root=process.cwd();
 const entry=path.join(dir,'entry.js'),loader=path.join(dir,'loader.js');
 fs.writeFileSync(entry,`import React from 'react';import{createRoot}from'react-dom/client';import Login from ${JSON.stringify(path.join(root,'src/app/admin-login/mpanel/page.tsx'))};createRoot(document.getElementById('root')).render(<Login/>);`);
 fs.writeFileSync(loader,`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
 await new Promise((resolve,reject)=>webpackModule.webpack({mode:'development',devtool:false,entry,output:{path:dir,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules'),'node_modules']},module:{rules:[{test:/\.[jt]sx?$/,exclude:/node_modules/,use:[loader]}]}}).run((err,stats)=>err?reject(err):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
 bundle=fs.readFileSync(path.join(dir,'bundle.js'),'utf8');
});
beforeEach(async()=>{
 browser=await chromium.launch({headless:true,executablePath:process.env.CART_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage',...(process.env.CART_CHROMIUM_PATH?['--no-zygote','--single-process','--disable-gpu']:[])]});
});
afterEach(async()=>{await browser?.close();});
after(async()=>{fs.rmSync(dir,{recursive:true,force:true});});
async function fixture(width,{denied=false,wrongSource=false}={}) {
 const context=await browser.newContext({viewport:{width,height:900}}),commands=[];let transferred=0;
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.pathname==='/bundle.js')return route.fulfill({contentType:'application/javascript',body:bundle});
  if(url.pathname==='/api/admin/mpanel'){
   assert.equal(request.headers().origin,'https://orderfly.dk');const body=request.postDataJSON();commands.push(body.action);
   if(body.action==='start')return route.fulfill({json:{challenge:'b'.repeat(64)}});
   assert.match(body.code,/^[a-f0-9]{64}\.[a-f0-9]{64}$/);
   return route.fulfill({status:denied?403:200,json:denied?{error:'Denied'}:{path:'/superadmin/products'}});
  }
  if(url.origin==='https://www.esmeraldapizza.dk')return route.fulfill({contentType:'text/html',body:`<button id="open">Open</button><script>let child;document.querySelector('button').onclick=()=>child=open('https://orderfly.dk/admin-login/mpanel?origin='+encodeURIComponent(location.origin),'_blank');window.addEventListener('message',e=>{if(e.origin==='https://orderfly.dk'&&e.source===child&&e.data.type==='orderfly-launch-ready'){${wrongSource?"child.postMessage({type:'unrelated',code:'"+'c'.repeat(64)+'.'+'d'.repeat(64)+"'},'https://orderfly.dk');":"child.postMessage({type:'orderfly-launch-code',code:'"+'c'.repeat(64)+'.'+'d'.repeat(64)+"'},'https://orderfly.dk');"}}});</script>`});
  if(url.pathname.startsWith('/superadmin/'))return route.fulfill({contentType:'text/html',body:'<h1>Products</h1>'});
  return route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script src="/bundle.js"></script>'});
 });
 const opener=await context.newPage();await opener.goto('https://www.esmeraldapizza.dk/mpanel');const opened=opener.waitForEvent('popup');await opener.getByRole('button',{name:'Open'}).click();const popup=await opened;
 return {context,popup,commands};
}
for(const width of [390,1440])test('receiving page binds the opener and opens permitted destination at '+width,async()=>{
 const f=await fixture(width);try{await f.popup.waitForURL('https://orderfly.dk/superadmin/products');assert.deepEqual(f.commands,['start','redeem']);assert.equal(await f.popup.evaluate(()=>window.opener),null);}finally{await f.context.close();}
});
test('denial stays on the recoverable handoff page, never on a protected destination',async()=>{
 const f=await fixture(390,{denied:true});try{await f.popup.getByRole('alert').waitFor();assert.equal(new URL(f.popup.url()).pathname,'/admin-login/mpanel');assert.equal(await f.popup.getByRole('link').getAttribute('href'),'https://www.esmeraldapizza.dk/mpanel');}finally{await f.context.close();}
});
test('unrelated messages never redeem, and a direct visit cannot acquire a challenge',async()=>{
 const f=await fixture(1440,{wrongSource:true});try{await f.popup.getByRole('status').waitFor();assert.deepEqual(f.commands,['start']);const direct=await f.context.newPage();await direct.goto('https://orderfly.dk/admin-login/mpanel?origin=https://evil.test');await direct.getByRole('alert').waitFor();assert.deepEqual(f.commands,['start']);}finally{await f.context.close();}
});
