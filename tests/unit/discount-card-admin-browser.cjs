// Actual notification card, real browser and compiled CSS. Server action is synthetic.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {execFileSync}=require('node:child_process'),{chromium}=require('@playwright/test');
const webpackModule=require('next/dist/compiled/webpack/webpack');webpackModule.init();
let dir,browser,server,origin;const root=process.cwd();
before(async()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'discount-admin-'));
 const write=(name,body)=>{const file=path.join(dir,name);fs.writeFileSync(file,body);return file;};
 const actions=write('actions.js',`
 async function result(kind,value){window.__calls=(window.__calls||[]).concat([{kind,value}]);await new Promise(r=>setTimeout(r,60));
 const error=new URLSearchParams(location.search).get('error');if(error==='network')throw Error('transport');if(error)return {ok:false,error};
 const d=window.__data;if(kind==='feature')d.feature={...d.feature,...value,version:value.version+1};
 if(kind==='group'){if((d.groups.find(g=>g.id===value.id)?.version||0)!==value.version)return {ok:false,error:'record_changed'};const row={...value,companyId:'company',version:value.version+1,updatedAt:0};d.groups=d.groups.filter(g=>g.id!==value.id).concat(row);}
 if(kind==='assignment'){if((d.assignments.find(g=>g.customerId===value.customerId)?.version||0)!==value.version)return {ok:false,error:'record_changed'};const row={...value,id:'card',companyId:'company',version:value.version+1,updatedAt:0};d.assignments=d.assignments.filter(g=>g.customerId!==value.customerId).concat(row);}
 return {ok:true,data:structuredClone(d),savedVersion:value.version+1};}
 export const saveDiscountCardFeatureAction=v=>result('feature',v);
 export const saveDiscountCardGroupAction=v=>result('group',v);
 export const saveDiscountCardAssignmentAction=v=>result('assignment',v);
 export const inviteDiscountCardAction=v=>result('invite',v);
 export const searchDiscountCardCustomersAction=(brandId,email)=>result('search',{brandId,email});`);
 const entry=write('entry.js',`import React from 'react';import{createRoot}from'react-dom/client';
 import{DiscountCardAdmin}from ${JSON.stringify(path.join(root,'src/app/superadmin/loyalty/discount-card/client-page'))};
 const d={feature:{brandId:'brand',companyId:'company',version:0,enabled:false,locationScope:{mode:'all',locationIds:[]},updatedAt:0},groups:[{id:'friends',brandId:'brand',companyId:'company',version:1,name:'Venner',percentage:20,active:true,updatedAt:0}],assignments:[],locations:[{id:'amager',name:'Amager'},{id:'city',name:'City'}],customers:[{id:'person',name:'Testkunde',email:'test@example.com',memberId:'member'}],customersTruncated:false,assignmentsTruncated:false};
 window.__data=structuredClone(d);createRoot(document.getElementById('root')).render(React.createElement(DiscountCardAdmin,{brandId:'brand',brandName:'Esmeralda',initial:d}));`);
 const loader=write('loader.js',`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
 await new Promise((resolve,reject)=>webpackModule.webpack({mode:'development',devtool:false,entry,output:{path:dir,filename:'bundle.js'},resolve:{alias:{'./actions$':actions,'@':path.join(root,'src'),'react$':require.resolve('next/dist/compiled/react'),'react/jsx-runtime$':require.resolve('next/dist/compiled/react/jsx-runtime'),'react-dom$':require.resolve('next/dist/compiled/react-dom'),'react-dom/client$':require.resolve('next/dist/compiled/react-dom/client')},extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules'),'node_modules']},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:[loader]},{test:/discount-admin-.*[\\/](entry|actions)\.js$/,use:[loader]}]}}).run((error,stats)=>error?reject(error):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
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

for(const width of [390,1440])test(`feature scope, groups, member card and invitation at ${width}px`,async()=>{
 const page=await browser.newPage({viewport:{width,height:1000}});try{
 await page.goto(origin);
 assert.equal(await page.getByRole('switch',{name:'Aktivér rabatkort'}).getAttribute('aria-checked'),'false');
 await page.getByRole('switch',{name:'Aktivér rabatkort'}).click();
 await page.getByLabel('Gælder på',{exact:true}).selectOption('selected');
 await page.getByRole('button',{name:'Gem indstillinger',exact:true}).click();
 await page.getByRole('alert').waitFor();assert.equal(await page.evaluate(()=>window.__calls?.length||0),0);
 await page.getByLabel('Amager',{exact:true}).check();await page.getByRole('button',{name:'Gem indstillinger',exact:true}).click();await page.getByRole('status').waitFor();
 assert.deepEqual(await page.evaluate(()=>window.__calls[0].value.locationScope),{mode:'selected',locationIds:['amager']});
 await page.getByRole('switch',{name:'Aktivér rabatkort'}).click();await page.getByRole('button',{name:'Gem indstillinger',exact:true}).click();await page.getByRole('status').waitFor();
 assert.equal(await page.evaluate(()=>window.__calls[1].value.version),1);
 await page.getByLabel('Gruppenavn',{exact:true}).fill('Familie');await page.getByLabel('Rabat i procent',{exact:true}).fill('101');await page.getByRole('button',{name:'Gem gruppe',exact:true}).click();await page.getByRole('alert').waitFor();
 assert.equal(await page.evaluate(()=>window.__calls.length),2);
 await page.getByLabel('Rabat i procent',{exact:true}).fill('25');await page.getByRole('button',{name:'Gem gruppe',exact:true}).click();await page.getByRole('status').waitFor();
 assert.equal(await page.evaluate(()=>window.__calls[2].value.percentage),25);
 await page.getByLabel('Kunde',{exact:true}).selectOption('person');await page.getByLabel('Kortets gruppe',{exact:true}).selectOption('friends');await page.getByRole('button',{name:'Gem kort',exact:true}).click();await page.getByRole('status').waitFor();
 assert.equal(await page.evaluate(()=>window.__calls[3].value.status),'active');
 await page.getByRole('switch',{name:'Spær kortet'}).click();await page.getByRole('button',{name:'Gem kort',exact:true}).click();await page.getByRole('status').waitFor();
 assert.equal(await page.evaluate(()=>window.__calls[4].value.version),1);assert.equal(await page.evaluate(()=>window.__calls[4].value.status),'blocked');
 assert.equal(await page.getByRole('button',{name:'Send invitation',exact:true}).isDisabled(),true);
 await page.getByRole('switch',{name:'Aktivér rabatkort'}).click();await page.getByRole('button',{name:'Gem indstillinger',exact:true}).click();await page.getByRole('status').waitFor();
 await page.getByLabel('Modtagerens navn',{exact:true}).fill('Ny ven');await page.getByLabel('Modtagerens e-mail',{exact:true}).fill('friend@example.com');await page.getByLabel('Invitationsgruppe',{exact:true}).selectOption('friends');await page.getByRole('button',{name:'Send ny invitation',exact:true}).click();await page.getByRole('status').waitFor();
 const last=await page.evaluate(()=>window.__calls.at(-1));assert.equal(last.kind,'invite');assert.equal(last.value.email,'friend@example.com');assert.equal('customerId'in last.value,false);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 if(process.env.DISCOUNT_CARD_SCREENSHOTS){fs.mkdirSync(process.env.DISCOUNT_CARD_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.DISCOUNT_CARD_SCREENSHOTS,'admin-'+width+'.png'),fullPage:true});}
 }finally{await page.close();}
});
for(const error of ['record_changed','forbidden','unauthorized','network'])test(`failed action ${error} never claims success`,async()=>{
 const page=await browser.newPage();try{await page.goto(origin+'?error='+error);await page.getByRole('button',{name:'Gem indstillinger',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('status').count(),0);}finally{await page.close();}
});

test('unrelated refresh cannot advance dirty group editor version',async()=>{
 const page=await browser.newPage();try{
  await page.goto(origin);await page.getByRole('button',{name:'Rediger gruppe Venner',exact:true}).click();await page.getByLabel('Rabat i procent',{exact:true}).fill('25');
  await page.evaluate(()=>{window.__data.groups[0].version=2;window.__data.groups[0].percentage=30;});
  await page.getByRole('button',{name:'Gem indstillinger',exact:true}).click();await page.getByRole('status').waitFor();
  await page.getByRole('button',{name:'Gem gruppe',exact:true}).click();
  await page.waitForFunction(()=>window.__calls.at(-1)?.kind==='group');
  assert.equal(await page.evaluate(()=>window.__calls.at(-1).value.version),1);
  await page.getByRole('alert').filter({hasText:'ændret af en anden'}).waitFor();assert.equal(await page.evaluate(()=>window.__data.groups[0].percentage),30);
 }finally{await page.close();}
});
test('unrelated refresh cannot advance dirty assignment editor version',async()=>{
 const page=await browser.newPage();try{
  await page.goto(origin);await page.getByLabel('Kunde',{exact:true}).selectOption('person');await page.getByLabel('Kortets gruppe',{exact:true}).selectOption('friends');await page.getByRole('button',{name:'Gem kort',exact:true}).click();await page.getByRole('status').waitFor();
  await page.evaluate(()=>{window.__data.assignments[0].version=2;window.__data.assignments[0].status='blocked';});
  await page.getByRole('button',{name:'Gem indstillinger',exact:true}).click();await page.getByRole('status').waitFor();
  await page.getByRole('button',{name:'Gem kort',exact:true}).click();await page.waitForFunction(()=>window.__calls.at(-1)?.kind==='assignment');
  assert.equal(await page.evaluate(()=>window.__calls.at(-1).value.version),1);
  await page.getByRole('alert').filter({hasText:'ændret af en anden'}).waitFor();assert.equal(await page.evaluate(()=>window.__data.assignments[0].status),'blocked');
 }finally{await page.close();}
});
