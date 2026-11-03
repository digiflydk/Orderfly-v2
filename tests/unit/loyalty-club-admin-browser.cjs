const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {execFileSync}=require('node:child_process'),{chromium}=require('@playwright/test');
const webpackModule=require('next/dist/compiled/webpack/webpack');webpackModule.init();
let dir,browser,server,origin;const root=process.cwd();
// Renders the actual Club & newsletter overview and fixed-brand campaign panel with synthetic data.
before(async()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'club-overview-'));
 const write=(name,body)=>{const file=path.join(dir,name);fs.writeFileSync(file,body);return file;};
 const actions=write('actions.js',`
 import {defaultCampaignSettings} from ${JSON.stringify(path.join(root,'src/lib/loyalty/stamp-card/campaign-rules'))};
 export async function loadClubCampaignAction(brandId){window.__loads=(window.__loads||[]).concat([brandId]);
  return {ok:true,campaign:{brandId,version:2,updatedAt:1,settings:{...defaultCampaignSettings(),checkoutMode:'club'}}};}
 export async function saveClubCampaignAction(value){window.__calls=(window.__calls||[]).concat([value]);return {ok:true,campaign:{brandId:value.brandId,version:value.version+1,updatedAt:2,settings:value.settings}};}`);
 const link=write('link.js',`import React from 'react';export default function Link({href,children,...props}){return React.createElement('a',{href,...props},children);}`);
 const entry=write('entry.js',`import React from 'react';import{createRoot}from'react-dom/client';
 import{ClubSummary}from ${JSON.stringify(path.join(root,'src/app/superadmin/loyalty/club/club-summary'))};
 import{ClubCampaignPanel}from ${JSON.stringify(path.join(root,'src/app/superadmin/loyalty/club/club-campaign-panel'))};
 const bonus={enabled:true,activeNow:true,stamps:2,startsAt:Date.parse('2026-11-01T08:00:00Z'),endsAt:null};
 const full={brandId:'brand',brandName:'Esmeralda',permissions:{settings:true,discountsView:true,discountsEdit:true},
  campaign:{checkoutMode:'club',saved:true,invalid:false,welcome:bonus,profile:{...bonus,enabled:false,requiredFields:['phone']}},
  discounts:[{id:'club',applicationType:'club_signup',description:'Velkomstrabat',discountType:'percentage',discountValue:15,endsAt:null}],
  texts:{programExists:true,programActive:true,ready:false,missingPlaceholders:['supportEmail'],invalidFields:[]},omnisend:'connected'};
 const limited={...full,permissions:{settings:true,discountsView:false,discountsEdit:false},campaign:null,discounts:null,omnisend:null};
 const mode=new URLSearchParams(location.search).get('mode');
 createRoot(document.getElementById('root')).render(React.createElement('div',null,
  React.createElement(ClubSummary,{summary:mode==='limited'?limited:full}),
  mode==='limited'?null:React.createElement(ClubCampaignPanel,{brands:[{id:'brand',name:'Esmeralda'}],fixedBrandId:'brand'})));`);
 const loader=write('loader.js',`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
 await new Promise((resolve,reject)=>webpackModule.webpack({mode:'development',devtool:false,entry,output:{path:dir,filename:'bundle.js'},resolve:{alias:{'./club-campaign-actions$':actions,'@/components/superadmin/admin-link$':link,'@':path.join(root,'src'),'react$':require.resolve('next/dist/compiled/react'),'react/jsx-runtime$':require.resolve('next/dist/compiled/react/jsx-runtime'),'react-dom$':require.resolve('next/dist/compiled/react-dom'),'react-dom/client$':require.resolve('next/dist/compiled/react-dom/client')},extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules'),'node_modules']},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:[loader]},{test:/club-overview-.*[\\/](entry|actions|link)\.js$/,use:[loader]}]}}).run((error,stats)=>error?reject(error):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
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
const region=page=>page.getByRole('region',{name:'Status for Club og nyhedsbrev'});
for(const width of [390,1440])test(`overview shows every card with edit links and the fixed-brand panel at ${width}px`,async()=>{
 const page=await browser.newPage({viewport:{width,height:1200}});page.setDefaultTimeout(5000);
 page.on('pageerror',error=>console.error('OVERVIEW ERROR',error.message));
 try{
  await page.goto(origin);
  for(const name of ['Tilbud i checkout','Tilmeldingsrabat','Velkomststempel','Stempel for udfyldt profil','Club-tekster','Omnisend'])
   await region(page).getByRole('region',{name}).waitFor();
  assert.match(await region(page).getByRole('region',{name:'Tilbud i checkout'}).innerText(),/Club/);
  assert.match(await region(page).getByRole('region',{name:'Tilmeldingsrabat'}).innerText(),/15 %/);
  assert.equal(await page.getByRole('link',{name:'Rediger stempelkort og tekster'}).getAttribute('href'),'/superadmin/loyalty/stamp-card?tab=settings&edit=brand');
  assert.equal(await page.getByRole('link',{name:'Opret tilmeldingsrabat'}).getAttribute('href'),'/superadmin/discounts/new');
  assert.equal(await page.getByRole('link',{name:/Omnisend/}).getAttribute('href'),'/superadmin/marketing');
  // The page owns the brand choice: the panel loads it directly and shows no selector of its own.
  await page.getByRole('form',{name:'Indstillinger for Club-kampagner'}).waitFor();
  assert.equal(await page.getByLabel('Brand for Club-kampagner').count(),0);
  assert.deepEqual(await page.evaluate(()=>window.__loads),['brand']);
  assert.equal(await page.getByLabel('Tilmeldingstilbud i checkout').inputValue(),'club');
  await page.getByLabel('Tilmeldingstilbud i checkout').selectOption('newsletter');
  await page.getByRole('button',{name:'Gem Club-kampagner'}).click();
  await page.getByRole('status').filter({hasText:'Club-kampagner er gemt.'}).waitFor();
  const calls=await page.evaluate(()=>window.__calls);assert.equal(calls.length,1);assert.equal(calls[0].brandId,'brand');assert.equal(calls[0].settings.checkoutMode,'newsletter');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 }finally{await page.close();}
});
for(const width of [390,1440])test(`missing permissions are named per card and Omnisend stays hidden at ${width}px`,async()=>{
 const page=await browser.newPage({viewport:{width,height:1000}});page.setDefaultTimeout(5000);
 try{
  await page.goto(origin+'/?mode=limited');
  await region(page).waitFor();
  assert.match(await region(page).getByRole('region',{name:'Tilbud i checkout'}).getByRole('note').innerText(),/Kræver: Rediger rabatter/);
  assert.match(await region(page).getByRole('region',{name:'Tilmeldingsrabat'}).getByRole('note').innerText(),/Kræver: Se rabatter/);
  assert.match(await region(page).getByRole('region',{name:'Club-tekster'}).innerText(),/Mangler oplysninger/);
  assert.equal(await region(page).getByRole('region',{name:'Omnisend'}).count(),0);
  assert.equal(await page.getByRole('link',{name:'Opret tilmeldingsrabat'}).count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 }finally{await page.close();}
});
