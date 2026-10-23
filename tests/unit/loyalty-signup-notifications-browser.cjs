// Actual notification card, real browser and compiled CSS. Server action is synthetic.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {execFileSync}=require('node:child_process'),{chromium}=require('@playwright/test');
const webpackModule=require('next/dist/compiled/webpack/webpack');webpackModule.init();
let dir,browser,server,origin;const root=process.cwd();
before(async()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'club-notifications-'));
 const write=(name,body)=>{const file=path.join(dir,name);fs.writeFileSync(file,body);return file;};
 const actions=write('actions.js',`
 export async function saveSignupNotificationAction(value){window.__calls=(window.__calls||[]).concat([value]);
  await new Promise(resolve=>setTimeout(resolve,100));
  const error=new URLSearchParams(location.search).get('error');
  if(error==='network')throw new Error('transport');
  if(error)return {ok:false,error};
  return {ok:true,data:{version:value.version+1,settings:value.settings,changed:true}};
 }`);
 const entry=write('entry.js',`import React from 'react';import{createRoot}from'react-dom/client';
 import{SignupNotificationCard}from ${JSON.stringify(path.join(root,'src/app/superadmin/loyalty/stamp-card/signup-notification-card'))};
 const q=new URLSearchParams(location.search),brandId=q.get('brand')||'brand';
 createRoot(document.getElementById('root')).render(React.createElement(SignupNotificationCard,{brandId,brandName:brandId==='brand'?'Esmeralda':'Andet brand',initial:{version:0,settings:{enabled:false,recipientEmail:null},mailConfigured:!q.has('unconfigured')}}));`);
 const loader=write('loader.js',`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
 await new Promise((resolve,reject)=>webpackModule.webpack({mode:'development',devtool:false,entry,output:{path:dir,filename:'bundle.js'},resolve:{alias:{'./notification-actions$':actions,'@':path.join(root,'src'),'react$':require.resolve('next/dist/compiled/react'),'react/jsx-runtime$':require.resolve('next/dist/compiled/react/jsx-runtime'),'react-dom$':require.resolve('next/dist/compiled/react-dom'),'react-dom/client$':require.resolve('next/dist/compiled/react-dom/client')},extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules'),'node_modules']},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:[loader]},{test:/club-notifications-.*[\\/](entry|actions)\.js$/,use:[loader]}]}}).run((error,stats)=>error?reject(error):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
 execFileSync(path.join(root,'node_modules/.bin/tailwindcss'),['-c',path.join(root,'tailwind.config.ts'),'-i',path.join(root,'src/app/globals.css'),'-o',path.join(dir,'styles.css'),'--minify'],{stdio:'pipe'});
 server=http.createServer((req,res)=>{
  if(req.url==='/bundle.js'){res.setHeader('content-type','application/javascript');return res.end(fs.readFileSync(path.join(dir,'bundle.js')));}
  if(req.url==='/styles.css'){res.setHeader('content-type','text/css');return res.end(fs.readFileSync(path.join(dir,'styles.css')));}
  res.setHeader('content-type','text/html; charset=utf-8');res.end('<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><main class="p-4"><div id="root"></div></main><script src="/bundle.js"></script></body></html>');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({executablePath:process.env.CART_CHROMIUM_PATH,args:['--no-sandbox']});
});
after(async()=>{await browser?.close();await new Promise(resolve=>server?.close(resolve));if(dir)fs.rmSync(dir,{recursive:true,force:true});});
for(const width of [390,1440])test(`brand notification card validates, saves, disables and preserves version at ${width}px`,async()=>{
 const page=await browser.newPage({viewport:{width,height:900}});try{
  await page.goto(origin);const toggle=page.getByRole('switch',{name:'Send e-mail ved ny tilmelding'});
  assert.equal(await toggle.getAttribute('aria-checked'),'false');
  await toggle.click();await page.getByRole('button',{name:'Gem notifikationer'}).click();
  await page.getByRole('alert').filter({hasText:'gyldig e-mailadresse'}).waitFor();assert.equal(await page.evaluate(()=>window.__calls?.length||0),0);
  await page.getByLabel('Modtagerens e-mailadresse').fill('OWNER@EXAMPLE.COM');await page.getByRole('button',{name:'Gem notifikationer'}).click();
  await page.getByRole('status').filter({hasText:'gemt'}).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.__calls[0]),{brandId:'brand',version:0,settings:{enabled:true,recipientEmail:'owner@example.com'}});
  await toggle.click();await page.getByRole('button',{name:'Gem notifikationer'}).click();await page.getByRole('status').filter({hasText:'gemt'}).waitFor();
  assert.equal(await page.evaluate(()=>window.__calls[1].version),1);assert.equal(await page.evaluate(()=>window.__calls[1].settings.enabled),false);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 }finally{await page.close();}
});
for(const [error,text]of [['record_changed','Genindlæs'],['forbidden','Kun platformens superadmin'],['mail_configuration_required','ikke sat op'],['network','Kunne ikke gemme']])test(`action failure ${error} is visible and never claimed saved`,async()=>{
 const page=await browser.newPage();try{
  await page.goto(origin+'?error='+error);await page.getByRole('switch').click();await page.getByLabel('Modtagerens e-mailadresse').fill('admin@example.com');
  await page.getByRole('button',{name:'Gem notifikationer'}).click();await page.getByRole('alert').filter({hasText:text}).waitFor();
  assert.equal(await page.getByRole('status').count(),0);
 }finally{await page.close();}
});
test('other brand has its own target and missing configuration is clearly shown',async()=>{
 const page=await browser.newPage();try{
  await page.goto(origin+'?brand=brand2&unconfigured');await page.getByText('Mailafsendelse skal sættes op for dette brand, før notifikationer kan aktiveres.').waitFor();
  await page.getByRole('button',{name:'Gem notifikationer'}).click();await page.getByRole('status').waitFor();
  assert.equal(await page.evaluate(()=>window.__calls[0].brandId),'brand2');
 }finally{await page.close();}
});
