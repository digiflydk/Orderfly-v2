const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {execFileSync}=require('node:child_process'),{chromium}=require('@playwright/test');
const webpackModule=require('next/dist/compiled/webpack/webpack');webpackModule.init();
let dir,browser,server,origin;const root=process.cwd();
// Renders the actual campaign overview, delete dialog and merchant view with synthetic data and a mocked delete action.
before(async()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'club-overview-'));
 const write=(name,body)=>{const file=path.join(dir,name);fs.writeFileSync(file,body);return file;};
 const actions=write('actions.js',`
 export async function deleteClubCampaignAction(value){window.__deletes=(window.__deletes||[]).concat([value]);
  await new Promise(resolve=>setTimeout(resolve,20));
  if(new URLSearchParams(location.search).has('conflict'))return {ok:false,error:'campaign_changed'};
  return {ok:true,campaign:{brandId:value.brandId,version:value.version+1,updatedAt:1,settings:{}}};}
 export async function loadClubCampaignAction(){return {ok:false,error:'unavailable'};}
 export async function saveClubCampaignAction(){return {ok:false,error:'unavailable'};}`);
 const nav=write('nav.js',`export function useRouter(){return {refresh(){window.__refreshes=(window.__refreshes||0)+1;},push(href){window.__pushed=href;}};}`);
 const link=write('link.js',`import React from 'react';const Link=React.forwardRef(function Link({href,children,prefetch,...props},ref){return React.createElement('a',{href,ref,...props},children);});export default Link;`);
 const entry=write('entry.js',`import React from 'react';import{createRoot}from'react-dom/client';
 import{ClubOverview}from ${JSON.stringify(path.join(root,'src/app/superadmin/loyalty/club/club-overview'))};
 import * as View from ${JSON.stringify(path.join(root,'src/app/superadmin/loyalty/club/merchant-view'))};
 const rows=[
  {brandId:'esm',brandName:'Esmeralda Pizza',createdAt:Date.parse('2026-10-20T10:00:00Z'),type:'club',discount:'',live:true,omnisend:'active',canEdit:true,canDelete:true,version:4},
  {brandId:'two',brandName:'Anden Merchant',createdAt:null,type:'newsletter_default',discount:'Procent · 10 %',live:true,omnisend:'inactive',canEdit:true,canDelete:true,version:0},
  {brandId:'three',brandName:'Tredje Merchant',createdAt:null,type:'none',discount:null,live:false,omnisend:'inactive',canEdit:false,canDelete:false,version:0}];
 const bonus={enabled:true,activeNow:true,stamps:1,startsAt:null,endsAt:null};
 const summary={brandId:'esm',brandName:'Esmeralda Pizza',checkoutMode:'club',campaignSaved:true,live:true,createdAt:Date.parse('2026-10-20T10:00:00Z'),programName:'Esmeralda Club',
  permissions:{settings:true,discountsView:true,discountsEdit:false,discountsCreate:false},campaign:null,
  discounts:[{id:'n',applicationType:'newsletter_signup',description:'',discountType:'fixed_amount',discountValue:25,endsAt:null,usedInCheckout:false,inactiveReason:'mode_club'}],
  texts:{programExists:true,programActive:true,ready:false,missingPlaceholders:['supportEmail'],invalidFields:[]},omnisend:null};
 const mode=new URLSearchParams(location.search).get('mode');
 const merchant=React.createElement('div',null,React.createElement(View.MerchantHeader,{summary}),React.createElement(View.Warnings,{summary:{...summary,campaign:{version:1,checkoutMode:'club',clubSuppressed:null,saved:true,invalid:false,welcome:bonus,profile:{...bonus,enabled:false,requiredFields:['phone']}}}}),
  React.createElement(View.Stepper,{steps:View.merchantSteps(summary)}),React.createElement(View.ProgramSections,{summary}),
  React.createElement(View.ReadOnlyCampaign,{summary,missing:View.campaignMissing(summary)}),React.createElement(View.OmnisendSection,{summary}));
 createRoot(document.getElementById('root')).render(mode==='merchant'?merchant:React.createElement(ClubOverview,{rows,showOmnisend:mode!=='limited'}));`);
 const loader=write('loader.js',`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
 await new Promise((resolve,reject)=>webpackModule.webpack({mode:'development',devtool:false,entry,output:{path:dir,filename:'bundle.js'},resolve:{alias:{'./club-campaign-actions$':actions,'next/navigation$':nav,'@/components/superadmin/admin-link$':link,'@':path.join(root,'src'),'react$':require.resolve('next/dist/compiled/react'),'react/jsx-runtime$':require.resolve('next/dist/compiled/react/jsx-runtime'),'react-dom$':require.resolve('next/dist/compiled/react-dom'),'react-dom/client$':require.resolve('next/dist/compiled/react-dom/client')},extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules'),'node_modules']},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:[loader]},{test:/club-overview-.*[\\/](entry|actions|link|nav)\.js$/,use:[loader]}]}}).run((error,stats)=>error?reject(error):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
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
const open=async(width,query='')=>{const page=await browser.newPage({viewport:{width,height:1000}});page.setDefaultTimeout(5000);page.on('pageerror',error=>console.error('OVERVIEW ERROR',error.message));await page.goto(origin+query);return page;};
const cells=row=>row.locator('th,td').allInnerTexts();

for(const width of [390,1440])test(`overview lists campaigns with date first, one header row, filters and actions at ${width}px`,async()=>{
 const page=await open(width);
 try{
  const table=page.getByRole('table');
  assert.deepEqual(await table.getByRole('columnheader').allInnerTexts().then(t=>t.map(s=>s.trim().toLowerCase())),['dato','merchant','type','rabat','status','omnisend','handlinger']);
  const rows=table.locator('tbody tr');assert.equal(await rows.count(),3);
  assert.deepEqual((await cells(rows.nth(0))).slice(0,6).map(s=>s.trim()),['20-10-2026','Esmeralda Pizza','Club','—','Live','Aktiv']);
  assert.deepEqual((await cells(rows.nth(1))).slice(0,5).map(s=>s.trim()),['—','Anden Merchant','Nyhedsbrev (standard)','Procent · 10 %','Live']);
  assert.deepEqual((await cells(rows.nth(2))).slice(0,5).map(s=>s.trim()),['—','Tredje Merchant','—','Ingen adgang','Ikke live']);
  assert.equal(await page.getByRole('link',{name:'Vis Esmeralda Pizza'}).getAttribute('href'),'/superadmin/loyalty/club/esm');
  assert.equal(await page.getByRole('link',{name:'Rediger Esmeralda Pizza'}).getAttribute('href'),'/superadmin/loyalty/club/esm#checkout');
  await page.getByRole('button',{name:'Slet kampagnen for Esmeralda Pizza'}).waitFor();
  // Actions follow each row's permissions.
  assert.equal(await page.getByRole('link',{name:'Vis Tredje Merchant'}).count(),1);
  assert.equal(await page.getByRole('link',{name:'Rediger Tredje Merchant'}).count(),0);assert.equal(await page.getByRole('button',{name:'Slet kampagnen for Tredje Merchant'}).count(),0);
  await page.getByRole('button',{name:'Ikke live · 1'}).click();assert.equal(await rows.count(),1);assert.equal((await cells(rows.nth(0)))[1].trim(),'Tredje Merchant');
  await page.getByRole('button',{name:'Alle · 3'}).click();await page.getByRole('searchbox',{name:'Søg merchant'}).fill('anden');
  assert.equal(await rows.count(),1);assert.equal((await cells(rows.nth(0)))[1].trim(),'Anden Merchant');
  await page.getByRole('searchbox',{name:'Søg merchant'}).fill('findes ikke');await page.getByText('Ingen merchants matcher.').waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 }finally{await page.close();}
});
test('Omnisend column is hidden for administrators who are not superusers',async()=>{
 const page=await open(1440,'/?mode=limited');
 try{
  const headers=await page.getByRole('columnheader').allInnerTexts();
  assert.equal(headers.some(text=>/omnisend/i.test(text)),false);assert.equal(await page.getByText('Aktiv',{exact:true}).count(),0);
 }finally{await page.close();}
});
test('new campaign menu offers only editable brands without a saved campaign',async()=>{
 const page=await open(1440);
 try{
  await page.getByRole('button',{name:'Ny kampagne'}).click();
  const items=await page.getByRole('menuitem').allInnerTexts();assert.deepEqual(items.map(s=>s.trim()),['Anden Merchant']);
  assert.equal(await page.getByRole('menuitem',{name:'Anden Merchant'}).getAttribute('href'),'/superadmin/loyalty/club/two#checkout');
 }finally{await page.close();}
});
for(const width of [390,1440])test(`delete asks for confirmation, keeps members and deletes only after explicit confirm at ${width}px`,async()=>{
 const page=await open(width);
 try{
  await page.getByRole('button',{name:'Slet kampagnen for Esmeralda Pizza'}).click();
  const dialog=page.getByRole('alertdialog',{name:'Slet kampagnen for Esmeralda Pizza?'});await dialog.waitFor();
  const text=await dialog.innerText();for(const kept of ['Medlemmer og stempelkort bevares','Samtykker til nyhedsbrev bevares','Rabatter, kunder allerede har fået, kan stadig bruges'])assert.match(text,new RegExp(kept));
  assert.equal(await dialog.getByRole('button',{name:/Slet/}).count(),1);
  await dialog.getByRole('button',{name:'Annullér'}).click();await dialog.waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>window.__deletes?.length||0),0);
  await page.getByRole('button',{name:'Slet kampagnen for Esmeralda Pizza'}).click();await dialog.getByRole('button',{name:'Slet kampagne'}).click();
  await page.getByRole('status').filter({hasText:'Kampagnen for Esmeralda Pizza er slettet.'}).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.__deletes),[{brandId:'esm',version:4}]);assert.equal(await page.evaluate(()=>window.__refreshes),1);
  assert.equal(await page.getByRole('alertdialog').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 }finally{await page.close();}
});
test('a concurrent change keeps the dialog open with an explanation and no refresh',async()=>{
 const page=await open(1440,'/?conflict');
 try{
  await page.getByRole('button',{name:'Slet kampagnen for Anden Merchant'}).click();
  const dialog=page.getByRole('alertdialog');await dialog.getByRole('button',{name:'Slet kampagne'}).click();
  await dialog.getByRole('alert').filter({hasText:'ændret af en anden'}).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.__deletes),[{brandId:'two',version:0}]);assert.equal(await page.evaluate(()=>window.__refreshes||0),0);
 }finally{await page.close();}
});
for(const width of [390,1440])test(`merchant view shows steps, plain-language warnings and missing permissions at ${width}px`,async()=>{
 const page=await open(width,'/?mode=merchant');
 try{
  await page.getByRole('heading',{level:1,name:'Esmeralda Pizza'}).waitFor();
  assert.match(await page.getByText(/Oprettet/).innerText(),/Oprettet 20-10-2026/);
  const steps=await page.getByRole('navigation',{name:'Opsætningstrin'}).getByRole('listitem').allInnerTexts();
  assert.equal(steps.length,5,'Omnisend step only for superusers');
  assert.match(steps[1],/Club-tekster[\s\S]*Mangler oplysninger[\s\S]*kræver handling/);assert.match(steps[3],/Tilmeldingsrabat[\s\S]*Ingen · valgfri/);
  assert.match(steps[4],/Stempler[\s\S]*Ingen adgang/);
  assert.match(await page.getByRole('note').filter({hasText:'uden tilmeldingsrabat'}).innerText(),/Nye medlemmer får kun 1 velkomststempel/);
  assert.match(await page.locator('#tekster').innerText(),/Mangler: supportEmail/);
  assert.match(await page.locator('#checkout').getByRole('note').innerText(),/Kræver: Rediger rabatter/);
  assert.match(await page.locator('#rabat').innerText(),/Bruges ikke: checkout tilbyder Club/);
  assert.equal(await page.getByRole('link',{name:'Opret tilmeldingsrabat'}).count(),0);assert.equal(await page.locator('#omnisend').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 }finally{await page.close();}
});
