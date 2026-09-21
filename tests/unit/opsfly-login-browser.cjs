// Real login/logout components and session route; only native auth and storage use synthetic fixtures.
const {test,before,after,beforeEach,afterEach}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {chromium}=require('@playwright/test');const {loadTs}=require('../helpers/load-ts.cjs');
const webpackModule=require('next/dist/compiled/webpack/webpack');webpackModule.init();
let dir,server,browser,origin,route,cookieValue,attempts=[],revocations=0;
const root=process.cwd(),token='a'.repeat(64),identity={provider:'opsfly',organizationId:'11111111-1111-4111-8111-111111111111',subject:'22222222-2222-4222-8222-222222222222'};
process.env.MPANEL_PLATFORM_ADMIN_SECRET='synthetic-browser-session-test-secret-only';
const auth=loadTs('src/lib/access/opsfly-login.ts',{'server-only':{}});
function file(name,code){const target=path.join(dir,name+'.js');fs.writeFileSync(target,code);return target;}
before(async()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'opsfly-login-browser-'));
 const entry=file('entry',`import React from 'react';import{createRoot}from'react-dom/client';import Login from ${JSON.stringify(path.join(root,'src/app/admin-login/page.tsx'))};import{LogoutButton}from ${JSON.stringify(path.join(root,'src/components/superadmin/logout-button.tsx'))};createRoot(document.getElementById('root')).render(location.pathname.startsWith('/superadmin')?<><h1>Administration</h1><LogoutButton/></>:<Login/>);`);
 const loader=file('ts-loader',`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
 await new Promise((resolve,reject)=>webpackModule.webpack({mode:'development',devtool:false,entry,output:{path:dir,filename:'bundle.js'},plugins:[new webpackModule.webpack.optimize.LimitChunkCountPlugin({maxChunks:1})],resolve:{alias:{'@/lib/firebase':file('firebase-config','window.firebaseLoaded=(window.firebaseLoaded||0)+1;'),'@':path.join(root,'src')},extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules'),'node_modules']},module:{rules:[{test:/\.[jt]sx?$/,exclude:/node_modules/,use:[loader]}]}}).run((err,stats)=>err?reject(err):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
 let granted=true;
 route=loadTs('src/app/api/admin/session/route.ts',{'server-only':{},'next/headers':{cookies:async()=>({get:()=>cookieValue?{value:cookieValue}:undefined})},'@/lib/url':{getOrigin:async()=>origin},'@/lib/firebase-admin':{getAdminDb:()=>({}),getAdminApp:()=>{throw Error('Firebase must not be used');}},'@/lib/access/authority':{executeAuthority:async()=>({superuser:granted,permissions:[]})},'@/lib/access/opsfly-login':{...auth,loginOpsfly:async(identifier,pin)=>{attempts.push({identifier,pin});if(identifier==='Throttled')throw new auth.OpsflyLoginError(429);if(pin!=='123456')throw new auth.OpsflyLoginError(403);granted=identifier!=='No access';return {token,identity,expires_at:new Date(Date.now()+60000).toISOString()};},logoutOpsfly:async()=>{revocations++;}}});
 server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,origin);
  if(url.pathname==='/bundle.js'){res.setHeader('Content-Type','application/javascript');return res.end(fs.readFileSync(path.join(dir,'bundle.js')));}
  if(url.pathname==='/api/admin/session'){
   cookieValue=(req.headers.cookie||'').match(/(?:^|;\s*)__session=([^;]+)/)?.[1];let raw='';for await(const c of req)raw+=c;
   const response=await route[req.method](new Request(url,{method:req.method,headers:req.headers,...(raw?{body:raw}:{})}));res.statusCode=response.status;response.headers.forEach((v,k)=>res.setHeader(k,v));return res.end(await response.text());
  }
  if(url.pathname.startsWith('/superadmin')){const value=(req.headers.cookie||'').match(/(?:^|;\s*)__session=([^;]+)/)?.[1];try{auth.readOpsflyCookie(value||'');}catch{res.writeHead(302,{Location:'/admin-login'});return res.end();}}
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script src="/bundle.js"></script>');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
});
beforeEach(async()=>{
 browser=await chromium.launch({headless:true,executablePath:process.env.CART_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage',...(process.env.CART_CHROMIUM_PATH?['--no-zygote','--single-process','--disable-gpu']:[])]});
});
afterEach(async()=>{await browser?.close();});
after(async()=>{await new Promise(resolve=>server?server.close(resolve):resolve());fs.rmSync(dir,{recursive:true,force:true});});
for(const width of [390,1440])test('Opsfly login and logout complete at '+width+'px',async()=>{
 const page=await browser.newPage({viewport:{width,height:900}});await page.goto(origin+'/admin-login');
 await page.getByLabel('E-mail eller brugernavn').fill('Fixture');await page.getByLabel('PIN (6 cifre)').fill('123456');
 assert.equal(await page.getByLabel('PIN (6 cifre)').getAttribute('type'),'password');await page.getByRole('button',{name:'Log ind',exact:true}).click();
 await page.waitForURL('**/superadmin/sales/orders');assert.equal(await page.getByRole('heading',{name:'Administration'}).count(),1);
 assert.equal(await page.evaluate(()=>window.firebaseLoaded||0),0);await page.getByRole('button',{name:'Log ud',exact:true}).click();await page.waitForURL('**/admin-login');
 await page.goto(origin+'/superadmin/sales/orders');await page.waitForURL('**/admin-login');assert.equal(await page.getByLabel('E-mail eller brugernavn').count(),1);await page.close();
});
for(const [name,pin] of [['Fixture','000000'],['No access','123456'],['Throttled','123456']])test('denied login stays on form for '+name,async()=>{
 const page=await browser.newPage();await page.goto(origin+'/admin-login');await page.getByLabel('E-mail eller brugernavn').fill(name);await page.getByLabel('PIN (6 cifre)').fill(pin);await page.getByRole('button',{name:'Log ind',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(new URL(page.url()).pathname,'/admin-login');assert.equal(await page.getByRole('button',{name:'Log ind',exact:true}).isEnabled(),true);await page.close();
});
test('method switch clears credentials and preserves the separate Firebase option',async()=>{
 const page=await browser.newPage();await page.goto(origin+'/admin-login');await page.getByLabel('E-mail eller brugernavn').fill('Fixture');await page.getByLabel('PIN (6 cifre)').fill('123456');await page.getByRole('button',{name:'Log ind med en separat Orderfly-konto'}).click();assert.equal(await page.getByLabel('Adgangskode',{exact:true}).inputValue(),'');assert.equal(await page.getByLabel('E-mail',{exact:true}).getAttribute('type'),'email');await page.getByRole('button',{name:'Log ind med Opsfly',exact:true}).click();assert.equal(await page.getByLabel('PIN (6 cifre)').inputValue(),'');assert.ok(revocations>=3);await page.close();
});
