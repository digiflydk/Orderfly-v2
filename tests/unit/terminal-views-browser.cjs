// Real terminal components in local Chromium; parent API/action callbacks are synthetic.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {execFileSync}=require('node:child_process'),{chromium}=require('@playwright/test');
const webpackModule=require('next/dist/compiled/webpack/webpack');webpackModule.init();
let dir,browser,server,origin;const root=process.cwd();
before(async()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'terminal-views-'));
 const write=(name,body)=>{const file=path.join(dir,name);fs.writeFileSync(file,body);return file;};
 const entry=write('entry.js',`import React from 'react';import{createRoot}from'react-dom/client';
 import{TerminalHistory}from ${JSON.stringify(path.join(root,'src/app/merchant/orders/terminal-history'))};
 import{TerminalPreorders}from ${JSON.stringify(path.join(root,'src/app/merchant/orders/terminal-preorders'))};
 const base={brandId:'brand',locationId:'amager',brandName:'Esmeralda',locationName:'Amager',customerName:'Testkunde med et længere navn',deliveryType:'Pickup',status:'Completed',paymentStatus:'Paid',paymentMethod:'Stripe',totalAmount:149,refundedAmountOre:0,createdAt:'2026-10-25T12:00:00Z',items:[]};
 const record=(kind,value)=>window.__calls.push({kind,value});window.__calls=[];
 function App(){const params=new URLSearchParams(location.search),view=params.get('view'),empty=params.has('empty'),error=params.has('error'),loading=params.has('loading');
 const[filters,setFilters]=React.useState({search:'',dateFrom:'',dateTo:''});
 const orders=empty?[]:[{...base,id:'ORD-LATER',fulfillmentAt:'2026-10-27T18:00:00Z'},{...base,id:'ORD-FIRST',fulfillmentAt:'2026-10-26T17:00:00Z'}];
 const props={orders,loading,error:error?'Forbindelsen blev afbrudt.':null,onRetry:()=>record('retry'),onSelectOrder:o=>record('detail',o.id),onReprint:params.has('readonly')?undefined:o=>record('reprint',o.id),hasMore:params.has('more'),onLoadMore:()=>record('more')};
 return React.createElement(view==='preorders'?TerminalPreorders:TerminalHistory,{...props,filters,onFiltersChange:f=>{record('filter',f);setFilters(f);}});}
 createRoot(document.getElementById('root')).render(React.createElement(App));`);
 const loader=write('loader.js',`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
 await new Promise((resolve,reject)=>webpackModule.webpack({mode:'development',devtool:false,entry,output:{path:dir,filename:'bundle.js'},resolve:{alias:{'@':path.join(root,'src'),'react$':require.resolve('next/dist/compiled/react'),'react/jsx-runtime$':require.resolve('next/dist/compiled/react/jsx-runtime'),'react-dom$':require.resolve('next/dist/compiled/react-dom'),'react-dom/client$':require.resolve('next/dist/compiled/react-dom/client')},extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules'),'node_modules']},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:[loader]}]}}).run((error,stats)=>error?reject(error):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
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

for(const width of [768,1024])test(`history filters, details, reprint and pagination at ${width}px`,async()=>{
 const page=await browser.newPage({viewport:{width,height:1000}});try{
 await page.goto(origin+'?more');
 assert.equal(await page.evaluate(()=>window.__calls.length),0);
 await page.getByLabel('Søg ordre eller kunde').fill(' ORD-FIRST ');
 await page.getByLabel('Bestillingsdato fra').fill('2026-10-26');
 await page.getByLabel('Bestillingsdato til').fill('2026-10-25');
 await page.getByRole('button',{name:'Søg',exact:true}).click();await page.getByRole('alert').waitFor();
 assert.equal(await page.evaluate(()=>window.__calls.length),0);
 await page.getByLabel('Bestillingsdato fra').fill('2026-10-25');await page.getByRole('button',{name:'Søg',exact:true}).click();
 assert.deepEqual(await page.evaluate(()=>window.__calls[0]),{kind:'filter',value:{search:'ORD-FIRST',dateFrom:'2026-10-25',dateTo:'2026-10-25'}});
 await page.getByRole('button',{name:'Vis ordre ORD-FIRST',exact:true}).click();
 await page.getByRole('button',{name:'Genprint ordre ORD-FIRST',exact:true}).click();
 await page.getByRole('button',{name:'Hent flere ordrer',exact:true}).click();
 assert.deepEqual(await page.evaluate(()=>window.__calls.slice(1).map(c=>c.kind)),['detail','reprint','more']);
 await page.getByRole('button',{name:'Nulstil',exact:true}).click();
 assert.deepEqual(await page.evaluate(()=>window.__calls.at(-1).value),{search:'',dateFrom:'',dateTo:''});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 if(process.env.TERMINAL_VIEWS_SCREENSHOTS){fs.mkdirSync(process.env.TERMINAL_VIEWS_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.TERMINAL_VIEWS_SCREENSHOTS,'history-'+width+'.png'),fullPage:true});}
 }finally{await page.close();}
});
test('preorders ordered by scheduled day with read-only viewing and explicit reprint',async()=>{
 const page=await browser.newPage({viewport:{width:768,height:1024}});try{
 await page.goto(origin+'?view=preorders&more');
 const cards=page.locator('article');assert.match(await cards.nth(0).getAttribute('aria-label'),/ORD-FIRST/);assert.match(await cards.nth(1).getAttribute('aria-label'),/ORD-LATER/);
 assert.equal(await page.evaluate(()=>window.__calls.length),0);
 await page.getByRole('button',{name:'Vis ordre ORD-FIRST',exact:true}).click();assert.deepEqual(await page.evaluate(()=>window.__calls),[{kind:'detail',value:'ORD-FIRST'}]);
 assert.match(await page.getByRole('region',{name:'Forudbestillinger',exact:true}).textContent(),/Senere i dag/);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 if(process.env.TERMINAL_VIEWS_SCREENSHOTS){fs.mkdirSync(process.env.TERMINAL_VIEWS_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.TERMINAL_VIEWS_SCREENSHOTS,'preorders-768.png'),fullPage:true});}
 }finally{await page.close();}
});
for(const view of ['history','preorders'])test(`${view}: empty scanned page still permits continuing, errors never look empty`,async()=>{
 const page=await browser.newPage();try{
 await page.goto(origin+'?view='+view+'&empty&more');
 await page.getByRole('button',{name:/Hent flere/}).click();assert.equal(await page.evaluate(()=>window.__calls[0].kind),'more');
 await page.goto(origin+'?view='+view+'&error&empty&more');await page.getByRole('alert').waitFor();
 assert.equal(await page.getByText(/Ingen (ordrer|forudbestillinger)/).count(),0);
 assert.equal(await page.getByRole('button',{name:/Hent flere/}).isDisabled(),true);
 await page.getByRole('button',{name:'Prøv igen'}).click();assert.equal(await page.evaluate(()=>window.__calls[0].kind),'retry');
 await page.goto(origin+'?view='+view+'&loading');await page.getByRole('status').waitFor();
 assert.equal(await page.getByRole('button',{name:'Genprint ordre ORD-FIRST'}).isDisabled(),true);
 await page.goto(origin+'?view='+view+'&readonly');assert.equal(await page.getByRole('button',{name:/Genprint/}).count(),0);
 }finally{await page.close();}
});
