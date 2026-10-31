const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {chromium}=require('@playwright/test');
const webpackModule=require('next/dist/compiled/webpack/webpack');webpackModule.init();
const root=process.cwd();let dir,server,browser,origin,current,calls,failImport;
const scope={brandId:'esmeralda',locationId:'amager'};
function initial(overrides={}){return {masterEmailEnabled:true,configuration:{accountId:'account',restaurantId:'restaurant',paused:true,approvedAt:null,testSourceId:null,approvedTestSourceId:null},test:null,rows:[],counts:{imported:0,eligible:0,pending:0,accepted:0,failed:0,uncertain:0},canEdit:true,...overrides};}
function file(name,code){const target=path.join(dir,name+'.js');fs.writeFileSync(target,code);return target;}
before(async()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'dully-browser-'));
 const entry=file('entry',`import React from'react';import{createRoot}from'react-dom/client';import{DullyFeedbackView}from ${JSON.stringify(path.join(root,'src/app/superadmin/feedback/dully/dully-view.tsx'))};createRoot(document.getElementById('root')).render(<DullyFeedbackView brands={[{id:'esmeralda',name:'Esmeralda'},{id:'other',name:'Other brand'}]} locations={[{id:'amager',brandId:'esmeralda',name:'Amager'},{id:'other-location',brandId:'other',name:'Other location'}]}/>);`);
 const loader=file('ts-loader',`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
 const actions=file('actions',`const send=async(kind,input)=>{const response=await fetch('/action/'+kind,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});if(!response.ok)throw Error('Transport failed');return response.json();};export const loadDullyFeedback=input=>send('load',input);export const saveDullyConfiguration=input=>send('configure',input);export const importDullyOrders=input=>send('import',input);export const sendDullyTest=input=>send('test',input);export const approveDullyTest=input=>send('approve',input);export const pauseDullyFeedback=input=>send('pause',input);`);
 await new Promise((resolve,reject)=>webpackModule.webpack({mode:'development',devtool:false,entry,output:{path:dir,filename:'bundle.js'},plugins:[new webpackModule.webpack.NormalModuleReplacementPlugin(/^\.\/actions$/,resource=>{if(resource.context===path.join(root,'src/app/superadmin/feedback/dully'))resource.request=actions;})],resolve:{alias:{'next/link':file('link',`import React from'react';export const useLinkStatus=()=>({pending:false});export default function Link(props){return <a {...props}/>;}`),'react$':require.resolve('next/dist/compiled/react'),'react/jsx-runtime$':require.resolve('next/dist/compiled/react/jsx-runtime'),'react-dom$':require.resolve('next/dist/compiled/react-dom'),'react-dom/client$':require.resolve('next/dist/compiled/react-dom/client'),'@':path.join(root,'src')},extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules'),'node_modules']},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:[loader]},{test:/dully-browser-.*\.js$/,use:[loader]}]}}).run((err,stats)=>err?reject(err):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
 const css=await require('postcss')([require('tailwindcss')({config:path.join(root,'tailwind.config.ts')})]).process(fs.readFileSync(path.join(root,'src/app/globals.css'),'utf8'),{from:path.join(root,'src/app/globals.css')});fs.writeFileSync(path.join(dir,'style.css'),css.css);
 server=http.createServer(async(req,res)=>{
  if(req.url==='/bundle.js'){res.setHeader('content-type','application/javascript');return res.end(fs.readFileSync(path.join(dir,'bundle.js')));}
  if(req.url==='/style.css'){res.setHeader('content-type','text/css');return res.end(fs.readFileSync(path.join(dir,'style.css')));}
  if(req.url.startsWith('/action/')){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);const input=JSON.parse(Buffer.concat(chunks)),kind=req.url.split('/').pop();calls.push({kind,input});
   if(kind==='import'&&failImport){res.statusCode=503;return res.end('offline');}
   if(kind==='test'){current.test={sourceId:'test-source',experienceType:input.experienceType,state:'pending'};current.configuration.testSourceId='test-source';}
   if(kind==='approve'){assert.equal(input.confirmed,true);current.configuration.approvedAt=Date.now();current.configuration.approvedTestSourceId=input.testSourceId;}
   if(kind==='pause')current.configuration.paused=input.paused;
   if(kind==='import'){current.counts.imported=1;current.counts.eligible=1;}
   const result=input.brandId==='other'?initial({configuration:null,canEdit:false}):current;
   res.setHeader('content-type','application/json');return res.end(JSON.stringify({ok:true,state:result,message:kind==='load'?undefined:'Handlingen er gemt.'}));
  }
  res.setHeader('content-type','text/html');res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.CART_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
});
after(async()=>{await browser?.close();await new Promise(resolve=>server?.close(resolve));if(dir)fs.rmSync(dir,{recursive:true,force:true});});
async function setup(t,width=390,overrides={}){current=initial(overrides);calls=[];failImport=false;const context=await browser.newContext({viewport:{width,height:900}});t.after(()=>context.close());const page=await context.newPage();page.setDefaultTimeout(6000);const errors=[];page.on('pageerror',error=>errors.push(error.message));t.after(()=>assert.deepEqual(errors,[]));await page.goto(origin);await page.getByRole('heading',{name:'1. Dully-datakilde'}).waitFor();return page;}
test('mobile workflow requires preview and server-approved test; no accidental send on load',async t=>{
 const page=await setup(t,320);
 assert.equal(await page.getByRole('button',{name:'Aktivér daglig afsendelse'}).isEnabled(),false);
 assert.equal(await page.getByRole('button',{name:'Godkend test',exact:true}).isEnabled(),false);
 assert.equal(calls.filter(call=>call.kind!=='load').length,0);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.getByLabel('Ordreudtræk (JSON)').fill('not json');await page.getByRole('button',{name:'Forhåndsvis import'}).click();
 assert.match(await page.getByRole('alert').innerText(),/Ingen data er importeret/);
 const json=JSON.stringify([{externalOrderId:'id-1',orderNumber:'2154',externalRestaurantId:'restaurant',email:'synthetic@example.test',experienceType:'pickup',orderedAt:'2026-10-31T19:00:00+01:00',completedAt:'2026-10-31T20:00:00+01:00',status:'completed',paymentStatus:'paid'}]);
 await page.getByLabel('Ordreudtræk (JSON)').fill(json);
 assert.equal(await page.getByRole('button',{name:'Importér ordrer',exact:true}).isEnabled(),false);
 await page.getByRole('button',{name:'Forhåndsvis import'}).click();await page.getByRole('button',{name:'Importér 1 ordrer',exact:true}).click();
 await page.getByRole('status').waitFor();assert.equal(calls.filter(call=>call.kind==='import').length,1);
 assert.deepEqual(calls.find(call=>call.kind==='import').input,{...scope,json});
 assert.equal(calls.filter(call=>['test','approve','pause'].includes(call.kind)).length,0);
 await page.getByRole('button',{name:'Send testmail'}).click();await page.getByText('Seneste test:').waitFor();
 assert.equal(await page.getByRole('button',{name:'Send testmail'}).isEnabled(),false);
 assert.equal(await page.getByRole('checkbox').isEnabled(),false);
 current.test.state='accepted';await page.getByRole('button',{name:'Opdatér status'}).click();await page.getByRole('checkbox').waitFor();
 await page.waitForFunction(()=>!document.querySelector('input[type=checkbox]').disabled);
 assert.equal(await page.getByRole('button',{name:'Godkend test',exact:true}).isEnabled(),false);
 await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Godkend test',exact:true}).click();await page.getByText('Testen er godkendt.',{exact:true}).waitFor();
 assert.equal(current.configuration.paused,true);
 await page.getByRole('button',{name:'Aktivér daglig afsendelse'}).click();await page.getByRole('button',{name:'Sæt på pause'}).waitFor();assert.equal(current.configuration.paused,false);
 await page.getByRole('button',{name:'Sæt på pause'}).click();await page.getByRole('button',{name:'Aktivér daglig afsendelse'}).waitFor();assert.equal(current.configuration.paused,true);
});
test('transport error preserves import; refresh restores state without retry; source change clears mapping',async t=>{
 const page=await setup(t,1280);const json='[{"orderNumber":"42"}]';
 await page.getByLabel('Ordreudtræk (JSON)').fill(json);await page.getByRole('button',{name:'Forhåndsvis import'}).click();failImport=true;
 await page.getByRole('button',{name:'Importér 1 ordrer',exact:true}).click();await page.getByRole('alert').waitFor();
 assert.equal(calls.filter(call=>call.kind==='import').length,1);
 failImport=false;await page.getByRole('button',{name:'Opdatér status'}).click();await page.getByLabel('Ordreudtræk (JSON)').waitFor();
 assert.equal(await page.getByLabel('Ordreudtræk (JSON)').inputValue(),json);
 assert.equal(calls.filter(call=>call.kind==='import').length,1);
 await page.getByLabel('Brand',{exact:true}).selectOption('other');await page.getByText('Du har læseadgang.',{exact:false}).waitFor();
 assert.equal(await page.getByLabel('Dully-kontoreference').inputValue(),'');assert.equal(await page.getByLabel('Dully-restaurantreference').inputValue(),'');assert.equal(await page.getByLabel('Ordreudtræk (JSON)').inputValue(),'');
 assert.equal(await page.getByRole('button',{name:'Send testmail'}).isEnabled(),false);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
});
test('master customer-email switch blocks customer activation but leaves explicit test and pause available',async t=>{
 const page=await setup(t,390,{masterEmailEnabled:false});
 await page.getByText('Feedbackmails til kunder er slået fra for brandet.',{exact:false}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Send testmail'}).isEnabled(),true);
 assert.equal(await page.getByRole('button',{name:'Aktivér daglig afsendelse'}).isEnabled(),false);
 assert.equal(calls.filter(call=>call.kind!=='load').length,0);
 current.configuration.paused=false;
 await page.getByRole('button',{name:'Opdatér status'}).click();
 await page.getByText('Stoppet: kundemails er slået fra',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Sæt på pause'}).isEnabled(),true);
 await page.getByRole('button',{name:'Sæt på pause'}).click();
 await page.getByRole('button',{name:'Aktivér daglig afsendelse'}).waitFor();
 assert.equal(current.masterEmailEnabled,false);assert.equal(current.configuration.paused,true);
 assert.equal(await page.getByRole('button',{name:'Aktivér daglig afsendelse'}).isEnabled(),false);
});
