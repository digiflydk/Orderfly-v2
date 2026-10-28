const {test,before,after,beforeEach,afterEach}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require('@playwright/test');
const webpackModule=require('next/dist/compiled/webpack/webpack');webpackModule.init();
let dir,bundle,browser;
const validCode='c'.repeat(64)+'.'+'d'.repeat(64),unrelatedCode='e'.repeat(64)+'.'+'f'.repeat(64);
before(async()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'mpanel-launch-browser-'));const root=process.cwd();
 const entry=path.join(dir,'entry.js'),loader=path.join(dir,'loader.js');
 fs.writeFileSync(entry,`import React from 'react';import{createRoot}from'react-dom/client';import Login from ${JSON.stringify(path.join(root,'src/app/admin-login/mpanel/page.tsx'))};createRoot(document.getElementById('root')).render(<Login/>);`);
 fs.writeFileSync(loader,`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
 await new Promise((resolve,reject)=>webpackModule.webpack({mode:'development',devtool:false,entry,output:{path:dir,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules'),'node_modules']},module:{rules:[{test:/\.[jt]sx?$/,exclude:/node_modules/,use:[loader]}]}}).run((err,stats)=>err?reject(err):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
 bundle=fs.readFileSync(path.join(dir,'bundle.js'),'utf8');
});
beforeEach(async()=>{
 browser=await chromium.launch({headless:true,executablePath:process.env.CART_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
});
afterEach(async()=>{await browser?.close();});
after(async()=>{fs.rmSync(dir,{recursive:true,force:true});});
async function fixture(width,{denied=false,wrongType=false,hold=false,openerOrigin='https://www.esmeraldapizza.dk',claimedOrigin=openerOrigin}={}) {
 const context=await browser.newContext({viewport:{width,height:900}}),commands=[],redeemedCodes=[];
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.pathname==='/bundle.js')return route.fulfill({contentType:'application/javascript',body:bundle});
  if(url.pathname==='/api/admin/mpanel'){
   assert.equal(request.headers().origin,'https://orderfly.dk');const body=request.postDataJSON();commands.push(body.action);
   if(body.action==='start')return route.fulfill({json:{challenge:'b'.repeat(64)}});
   assert.match(body.code,/^[a-f0-9]{64}\.[a-f0-9]{64}$/);redeemedCodes.push(body.code);
   return route.fulfill({status:denied?403:200,json:denied?{error:'Denied'}:{path:'/superadmin/products'}});
  }
  if(url.origin===openerOrigin)return route.fulfill({contentType:'text/html',body:`<button id="open">Open</button><script>let child;window.handoffReady=false;window.sendControl=()=>child.postMessage({type:'orderfly-launch-code',code:${JSON.stringify(validCode)}},'https://orderfly.dk');document.querySelector('button').onclick=()=>child=open('https://orderfly.dk/admin-login/mpanel?origin='+encodeURIComponent(${JSON.stringify(claimedOrigin)}),'_blank');window.addEventListener('message',e=>{if(e.origin==='https://orderfly.dk'&&e.source===child&&e.data.type==='orderfly-launch-ready'){if(e.data.challenge!=='${'b'.repeat(64)}')throw Error('unexpected challenge');${wrongType?"child.postMessage({type:'unrelated',code:"+JSON.stringify(unrelatedCode)+"},'https://orderfly.dk');":hold?"":"window.sendControl();"}window.handoffReady=true;}});</script>`});
  if(url.pathname.startsWith('/superadmin/'))return route.fulfill({contentType:'text/html',body:'<h1>Products</h1>'});
  return route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script src="/bundle.js"></script>'});
 });
 const opener=await context.newPage();await opener.goto(openerOrigin+'/mpanel');const opened=opener.waitForEvent('popup');await opener.getByRole('button',{name:'Open'}).click();const popup=await opened;
 return {context,opener,popup,commands,redeemedCodes};
}
for(const openerOrigin of ['https://www.esmeraldapizza.dk','https://esmeraldapizza.dk','https://mpanel.esmeraldapizza.dk'])for(const width of [390,1440])test('receiving page binds '+openerOrigin+' opener and opens permitted destination at '+width,async()=>{
 const f=await fixture(width,{openerOrigin});try{await f.popup.waitForURL('https://orderfly.dk/superadmin/products');assert.deepEqual(f.commands,['start','redeem']);assert.equal(await f.popup.evaluate(()=>window.opener),null);}finally{await f.context.close();}
});
test('denial stays on the recoverable handoff page, never on a protected destination',async()=>{
 const f=await fixture(390,{denied:true,openerOrigin:'https://mpanel.esmeraldapizza.dk'});try{await f.popup.getByRole('alert').waitFor();assert.equal(new URL(f.popup.url()).pathname,'/admin-login/mpanel');assert.equal(await f.popup.getByRole('link').getAttribute('href'),'https://www.esmeraldapizza.dk/mpanel');}finally{await f.context.close();}
});
test('unrelated messages never redeem, and a direct visit cannot acquire a challenge',async()=>{
 const f=await fixture(1440,{wrongType:true,openerOrigin:'https://mpanel.esmeraldapizza.dk'});try{
  // A rendered status precedes useEffect/start. Wait for the opener's actual ready
  // handshake, which also confirms the unrelated code was posted first.
  await f.opener.waitForFunction(()=>window.handoffReady===true);
  await f.opener.evaluate(()=>window.sendControl());
  await f.popup.waitForURL('https://orderfly.dk/superadmin/products');
  // Messages from this same opener are ordered. Successful control redemption is
  // the positive processing barrier: accepting the earlier unrelated token fails.
  assert.deepEqual(f.commands,['start','redeem']);assert.deepEqual(f.redeemedCodes,[validCode]);
  for(const origin of ['https://evil.test','https://www.esmeraldapizza.dk','https://esmeraldapizza.dk','https://mpanel.esmeraldapizza.dk']){
   const direct=await f.context.newPage();await direct.goto('https://orderfly.dk/admin-login/mpanel?origin='+encodeURIComponent(origin));await direct.getByRole('alert').waitFor();
   assert.equal(new URL(direct.url()).pathname,'/admin-login/mpanel');assert.deepEqual(f.commands,['start','redeem']);assert.deepEqual(f.redeemedCodes,[validCode]);await direct.close();
  }
 }finally{await f.context.close();}
});

test('new origin still rejects foreign source, mismatched origin and malformed token before valid control',async()=>{
 const origin='https://mpanel.esmeraldapizza.dk';
 const f=await fixture(390,{openerOrigin:origin,hold:true});try{
  await f.opener.waitForFunction(()=>window.handoffReady===true);
  await f.popup.evaluate(({origin,code})=>{
   const frame=document.createElement('iframe');document.body.append(frame);
   const send=(source,eventOrigin,eventCode)=>window.dispatchEvent(new MessageEvent('message',{source,origin:eventOrigin,data:{type:'orderfly-launch-code',code:eventCode}}));
   send(frame.contentWindow,origin,code);
   send(window.opener,'https://www.esmeraldapizza.dk',code);
   send(window.opener,origin,'malformed');
   frame.remove();
  },{origin,code:unrelatedCode});
  // dispatchEvent is synchronous, so all invalid events ran their handler guards.
  assert.deepEqual(f.commands,['start']);assert.deepEqual(f.redeemedCodes,[]);
  await f.opener.evaluate(()=>window.sendControl());
  await f.popup.waitForURL('https://orderfly.dk/superadmin/products');
  assert.deepEqual(f.commands,['start','redeem']);assert.deepEqual(f.redeemedCodes,[validCode]);
 }finally{await f.context.close();}
});

test('lookalike, HTTP, port and path origins cannot start the handshake even with an opener',async()=>{
 for(const claimedOrigin of ['https://mpanel.esmeraldapizza.dk.evil.test','https://evil-mpanel.esmeraldapizza.dk','http://mpanel.esmeraldapizza.dk','https://mpanel.esmeraldapizza.dk:444','https://mpanel.esmeraldapizza.dk/']){
  const f=await fixture(390,{openerOrigin:'https://mpanel.esmeraldapizza.dk',claimedOrigin,hold:true});try{
   await f.popup.getByRole('alert').waitFor();
   assert.deepEqual(f.commands,[]);assert.deepEqual(f.redeemedCodes,[]);
   assert.equal(new URL(f.popup.url()).pathname,'/admin-login/mpanel');
  }finally{await f.context.close();}
 }
});
