const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {execFileSync}=require('node:child_process'),{chromium}=require('@playwright/test');
const webpackModule=require('next/dist/compiled/webpack/webpack');webpackModule.init();
let dir,browser,server,origin;const root=process.cwd();
before(async()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'club-admin-'));
 const write=(name,body)=>{const file=path.join(dir,name);fs.writeFileSync(file,body);return file;};
 const actions=write('actions.js',`
 import {defaultCampaignSettings} from ${JSON.stringify(path.join(root,'src/lib/loyalty/stamp-card/campaign-rules'))};
 export async function loadClubCampaignAction(brandId){
  await new Promise(resolve=>setTimeout(resolve,30));
  if(brandId==='denied')return {ok:false,error:'forbidden'};
  return {ok:true,campaign:{brandId,version:0,updatedAt:null,settings:{...defaultCampaignSettings(),checkoutMode:'newsletter'}}};
 }
 export async function saveClubCampaignAction(value){window.__calls=(window.__calls||[]).concat([value]);
  if(new URLSearchParams(location.search).has('conflict'))return {ok:false,error:'campaign_changed'};
  return {ok:true,campaign:{brandId:value.brandId,version:value.version+1,updatedAt:1,settings:value.settings}};
 }`);
 const entry=write('entry.js',`import React from 'react';import{createRoot}from'react-dom/client';
 import{ClubCampaignPanel}from ${JSON.stringify(path.join(root,'src/app/superadmin/discounts/club-campaign-panel'))};
 createRoot(document.getElementById('root')).render(React.createElement(ClubCampaignPanel,{brands:[{id:'brand',name:'Esmeralda'},{id:'denied',name:'Adgang afvist'}]}));`);
 const loader=write('loader.js',`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
 await new Promise((resolve,reject)=>webpackModule.webpack({mode:'development',devtool:false,entry,output:{path:dir,filename:'bundle.js'},resolve:{alias:{'./club-campaign-actions$':actions,'@':path.join(root,'src'),'react$':require.resolve('next/dist/compiled/react'),'react/jsx-runtime$':require.resolve('next/dist/compiled/react/jsx-runtime'),'react-dom$':require.resolve('next/dist/compiled/react-dom'),'react-dom/client$':require.resolve('next/dist/compiled/react-dom/client')},extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules'),'node_modules']},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:[loader]},{test:/club-admin-.*[\\/](entry|actions)\.js$/,use:[loader]}]}}).run((error,stats)=>error?reject(error):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
 execFileSync(path.join(root,'node_modules/.bin/tailwindcss'),['-c',path.join(root,'tailwind.config.ts'),'-i',path.join(root,'src/app/globals.css'),'-o',path.join(dir,'styles.css'),'--minify'],{stdio:'pipe'});
 server=http.createServer((req,res)=>{
  if(req.url==='/bundle.js'){res.setHeader('content-type','application/javascript');return res.end(fs.readFileSync(path.join(dir,'bundle.js')));}
  if(req.url==='/styles.css'){res.setHeader('content-type','text/css');return res.end(fs.readFileSync(path.join(dir,'styles.css')));}
  res.setHeader('content-type','text/html; charset=utf-8');res.end('<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="root" style="padding:16px"></div><script src="/bundle.js"></script></body></html>');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({executablePath:process.env.CART_CHROMIUM_PATH,args:['--no-sandbox']});
});
after(async()=>{await browser?.close();await new Promise(resolve=>server?.close(resolve));if(dir)fs.rmSync(dir,{recursive:true,force:true});});
for(const width of [390,1440])test(`campaign panel selects one mode and saves only explicitly at ${width}px`,async()=>{
 const page=await browser.newPage({viewport:{width,height:1100}});
 page.setDefaultTimeout(5000); page.on('pageerror', error=>console.error('PANEL ERROR',error.message));
 try{
  await page.goto(origin);await page.getByLabel('Brand for Club-kampagner').selectOption('brand');
  await page.getByRole('form',{name:'Indstillinger for Club-kampagner'}).waitFor();
  assert.equal(await page.getByLabel('Tilmeldingstilbud i checkout').inputValue(),'newsletter');
  assert.equal(await page.getByLabel('Aktivér velkomststempler').isChecked(),false);
  assert.equal(await page.getByLabel('Aktivér profilbonus').isChecked(),false);
  assert.equal(await page.evaluate(()=>window.__calls?.length||0),0);
  await page.getByLabel('Tilmeldingstilbud i checkout').selectOption('club');
  await page.getByLabel('Aktivér velkomststempler').check();
  await page.getByLabel('Aktivér profilbonus').check();
  await page.getByLabel('Antal profilstempler').fill('2');
  await page.getByRole('button',{name:'Gem Club-kampagner'}).click();
  await page.getByRole('status').filter({hasText:'Club-kampagner er gemt.'}).waitFor();
  const calls=await page.evaluate(()=>window.__calls);assert.equal(calls.length,1);assert.equal(calls[0].settings.checkoutMode,'club');assert.equal(calls[0].settings.welcome.enabled,true);assert.equal(calls[0].settings.profile.stamps,2);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 }finally{await page.close();}
});
test('profile requires at least one field and conflict preserves unsaved choices until explicit reload',async()=>{
 const page=await browser.newPage();page.setDefaultTimeout(5000); page.on('pageerror', error=>console.error('PANEL ERROR',error.message));
 try{
  await page.goto(origin+'/?conflict');await page.getByLabel('Brand for Club-kampagner').selectOption('brand');await page.getByRole('form').waitFor();
  for(const label of ['Telefonnummer','Fødselsdato','Køn'])await page.getByLabel(label,{exact:true}).uncheck();
  await page.getByRole('button',{name:'Gem Club-kampagner'}).click();await page.getByRole('alert').filter({hasText:'Kontrollér'}).waitFor();assert.equal(await page.evaluate(()=>window.__calls?.length||0),0);
  await page.getByLabel('Telefonnummer',{exact:true}).check();await page.getByLabel('Tilmeldingstilbud i checkout').selectOption('club');
  await page.getByRole('button',{name:'Gem Club-kampagner'}).click();await page.getByRole('alert').filter({hasText:'ændret af en anden'}).waitFor();
  assert.equal(await page.getByLabel('Tilmeldingstilbud i checkout').inputValue(),'club');
  await page.getByRole('button',{name:'Genindlæs'}).click();await page.getByRole('form').waitFor();assert.equal(await page.getByLabel('Tilmeldingstilbud i checkout').inputValue(),'newsletter');
 }finally{await page.close();}
});
test('denied brand reveals no campaign form or save control',async()=>{
 const page=await browser.newPage();page.setDefaultTimeout(5000); page.on('pageerror', error=>console.error('PANEL ERROR',error.message));
 try{
  await page.goto(origin);await page.getByLabel('Brand for Club-kampagner').selectOption('denied');await page.getByRole('alert').filter({hasText:'ikke adgang'}).waitFor();
  assert.equal(await page.getByRole('form').count(),0);assert.equal(await page.getByRole('button',{name:'Gem Club-kampagner'}).count(),0);
 }finally{await page.close();}
});
