const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const { execFileSync } = require('node:child_process');
const { chromium } = require('@playwright/test');
const webpackModule = require('next/dist/compiled/webpack/webpack'); webpackModule.init();
const root = process.cwd(); let dir, server, browser, origin;
const brands = [{id:'b1',name:'Brand A'},{id:'b2',name:'Brand B'}];
const locations = [{id:'l1',brandId:'b1',name:'Lokation A'},{id:'l2',brandId:'b2',name:'Lokation B'},{id:'l3',brandId:'b1',name:'Lokation C'}];
const groups = Array.from({length:60},(_,i)=>({id:`g${i}`,groupName:`Gruppe ${String(i).padStart(2,'0')}`,displayName:`Valg ${i}`,locationIds:[i<30?'l1':'l2'],minSelection:0,maxSelection:3}));
const toppings = groups.map((g,i)=>({id:`t${i}`,groupId:g.id,toppingName:`Tilvalg ${String(i).padStart(2,'0')}`,price:10,isActive:i%2===0,locationIds:g.locationIds,maxQuantity:3}));
function file(name,source){const target=path.join(dir,name+'.js');fs.writeFileSync(target,source);return target;}
before(async()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'tilvalg-admin-browser-'));
 const entry=file('entry',`import React from 'react';import{createRoot}from'react-dom/client';
 import{ToppingsClientPage}from ${JSON.stringify(path.join(root,'src/app/superadmin/toppings/toppings-client-page.tsx'))};
 import{ToppingGroupFormPage}from ${JSON.stringify(path.join(root,'src/components/superadmin/topping-group-form-page.tsx'))};
 import{ToppingFormPage}from ${JSON.stringify(path.join(root,'src/components/superadmin/topping-form.tsx'))};
 fetch('/data').then(r=>r.json()).then(d=>createRoot(document.getElementById('root')).render(location.pathname.includes('/edit-group')?<ToppingGroupFormPage group={d.initialToppingGroups[0]} locations={d.initialLocations} brands={d.initialBrands} toppings={d.initialToppings.slice(0,1)} usage={d.initialUsage.g0}/>:location.pathname.includes('/new-topping')?<ToppingFormPage locations={d.initialLocations} brands={d.initialBrands} allGroups={d.initialToppingGroups} products={d.products}/>:<ToppingsClientPage {...d}/>));`);
 const loader=file('loader',`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
 const actions=file('actions',`export const duplicateTopping=async()=>({error:false,id:'copy',message:'ok'});export const duplicateToppingGroup=duplicateTopping;export const createOrUpdateToppingGroup=async()=>({error:true,message:'Kontrollér valgreglerne'});export const createOrUpdateTopping=createOrUpdateToppingGroup;export const deleteTopping=async()=>{throw Error('No delete expected');};export const deleteToppingGroup=deleteTopping;`);
 const aliases={
  '@/app/superadmin/toppings/actions':actions,
  'next/navigation':file('navigation',`const router={push:href=>location.assign(href),refresh:()=>{}};export const useRouter=()=>router;`),
  'next/link':file('link',`import React from'react';export const useLinkStatus=()=>({pending:false});export default function Link(props){return <a {...props}/>;}`),
  'react$':require.resolve('next/dist/compiled/react'),'react/jsx-runtime$':require.resolve('next/dist/compiled/react/jsx-runtime'),
  'react-dom$':require.resolve('next/dist/compiled/react-dom'),'react-dom/client$':require.resolve('next/dist/compiled/react-dom/client'),'@':path.join(root,'src'),
 };
 await new Promise((resolve,reject)=>webpackModule.webpack({mode:'development',devtool:false,entry,output:{path:dir,filename:'bundle.js'},plugins:[new webpackModule.webpack.NormalModuleReplacementPlugin(/^\.\/actions$/,resource=>{if(resource.context===path.join(root,'src/app/superadmin/toppings'))resource.request=actions;})],resolve:{alias:aliases,extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules'),'node_modules']},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:[loader]},{test:/tilvalg-admin-browser-.*\.js$/,use:[loader]}]}}).run((error,stats)=>error?reject(error):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
 execFileSync(path.join(root,'node_modules/.bin/tailwindcss'),['-c',path.join(root,'tailwind.config.ts'),'-i',path.join(root,'src/app/globals.css'),'-o',path.join(dir,'styles.css'),'--minify'],{cwd:root,stdio:'pipe'});
 const styles=fs.readFileSync(path.join(dir,'styles.css'),'utf8')+'\n'+fs.readFileSync(path.join(root,'src/styles/admin-ui.css'),'utf8');
 server=http.createServer((req,res)=>{if(req.url==='/styles.css'){res.setHeader('content-type','text/css');return res.end(styles);}if(req.url==='/bundle.js'){res.setHeader('content-type','application/javascript');return res.end(fs.readFileSync(path.join(dir,'bundle.js')));}if(req.url==='/data'){res.setHeader('content-type','application/json');return res.end(JSON.stringify({products:[{id:'wide',productName:'Brandprodukt',brandId:'b1',isActive:true,price:15,locationIds:[]},{id:'local',productName:'Lokalt produkt',brandId:'b1',isActive:true,price:12,locationIds:['l1']},{id:'invalid',productName:'Ugyldigt produkt',brandId:'b1',isActive:true,price:12}],initialToppingGroups:groups,initialToppings:toppings,initialLocations:locations,initialBrands:brands,initialUsage:{g0:{count:1,products:[{id:'p1',name:'Produkt A'}]}}}));}res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body class="admin-shell"><main class="p-4"><div id="root"></div></main><script src="/bundle.js"></script></body></html>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.CART_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
});
after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));if(dir)fs.rmSync(dir,{recursive:true,force:true});});
async function pageFor(t,width=1280,url='/superadmin/toppings') {const context=await browser.newContext({viewport:{width,height:900}});t.after(()=>context.close());const page=await context.newPage();page.setDefaultTimeout(6000);const errors=[];page.on('pageerror',e=>errors.push(e.message));t.after(()=>assert.deepEqual(errors,[]));await page.goto(origin+url);await page.getByRole('heading',{level:1}).waitFor();return page;}
for(const width of [390,1280])test(`large catalog pagination, filters and tab isolation (${width})`,async t=>{
 const page=await pageFor(t,width);await page.getByRole('cell',{name:'Gruppe 00',exact:true}).waitFor();
 assert.equal(await page.locator('tbody tr').count(),25);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'table scroll stays inside workspace');
 if(process.env.TILVALG_SCREENSHOT_DIR){fs.mkdirSync(process.env.TILVALG_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.TILVALG_SCREENSHOT_DIR,`tilvalg-${width}.png`),fullPage:true});}
 await page.getByRole('button',{name:'Næste',exact:true}).click();await page.getByRole('cell',{name:'Gruppe 25',exact:true}).waitFor();
 await page.getByLabel('Brand',{exact:true}).selectOption('b2');await page.getByRole('cell',{name:'Gruppe 30',exact:true}).waitFor();assert.equal(await page.getByText('Side 1 af 2',{exact:true}).count(),1);
 await page.getByLabel('Søg',{exact:true}).fill('ikke fundet');await page.getByText('Ingen resultater. Prøv at ændre dine filtre.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Nulstil filtre',exact:true}).click();await page.getByRole('tab',{name:'Tilvalg (60)',exact:true}).click();
 await page.getByLabel('Status',{exact:true}).selectOption('inactive');assert.equal(await page.getByText('30 tilvalg',{exact:true}).count(),1);
 await page.getByLabel('Søg',{exact:true}).fill('Tilvalg 01');await page.getByRole('cell',{name:'Tilvalg 01',exact:true}).waitFor();assert.equal(await page.locator('tbody tr').count(),1);
 assert.match(await page.getByRole('link',{name:'Åbn',exact:true}).getAttribute('href'),/edit-topping\/t1$/);
});
test('group deep link, dependent-product protection and failed-save preservation',async t=>{
 const page=await pageFor(t);await page.getByRole('link',{name:'Gruppe 00',exact:true}).click();await page.getByRole('heading',{name:'Rediger tilvalgsgruppe',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Slet gruppe',exact:true}).isDisabled(),true);
 assert.equal(await page.getByRole('link',{name:'Produkt A',exact:true}).getAttribute('href'),'/superadmin/products/edit/p1');
 await page.getByLabel('Internt navn',{exact:true}).fill('Ny gruppe');await page.getByRole('button',{name:'Gem tilvalgsgruppe',exact:true}).first().click();await page.getByRole('alert').waitFor();assert.equal(await page.getByLabel('Internt navn',{exact:true}).inputValue(),'Ny gruppe');
});
test('option only offers groups covering every selected location and retains input on rejection',async t=>{
 const page=await pageFor(t,1280,'/superadmin/toppings/new-topping');await page.getByLabel('Brand',{exact:true}).selectOption('b1');await page.getByRole('checkbox',{name:'Lokation A',exact:true}).check();
 assert.equal(await page.getByLabel('Tilvalgsgruppe',{exact:true}).locator('option').count(),31);
 await page.getByLabel('Tilvalgsgruppe',{exact:true}).selectOption('g0');await page.getByLabel('Tilvalgets navn',{exact:true}).fill('Ekstra ost');await page.getByRole('button',{name:'Gem tilvalg',exact:true}).first().click();await page.getByRole('alert').waitFor();assert.equal(await page.getByLabel('Tilvalgets navn',{exact:true}).inputValue(),'Ekstra ost');
});

test('brand-wide native product is selectable and retained when adding a location',async t=>{
 const page=await pageFor(t,1280,'/superadmin/toppings/new-topping');await page.getByLabel('Brand',{exact:true}).selectOption('b1');await page.getByRole('checkbox',{name:'Lokation A',exact:true}).check();
 const selector=page.getByLabel('Genbrug produkt',{exact:true});assert.equal(await selector.locator('option[value="invalid"]').count(),0);await selector.selectOption('wide');
 await page.getByRole('checkbox',{name:'Lokation C',exact:true}).check();assert.equal(await selector.inputValue(),'wide');assert.equal(await selector.locator('option[value="local"]').count(),0);assert.equal(await selector.locator('option[value="wide"]').textContent(),'Brandprodukt');
 assert.equal(await page.locator('input[name=price]').inputValue(),'15');
});
