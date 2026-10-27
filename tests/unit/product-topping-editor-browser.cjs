const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {chromium}=require('@playwright/test');

const webpackModule=require('next/dist/compiled/webpack/webpack');webpackModule.init();
const root=process.cwd();let dir,server,browser,origin,lastSave,lastToppingSave;
function file(name,code){const target=path.join(dir,name+'.js');fs.writeFileSync(target,code);return target;}
before(async()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'product-page-browser-'));
 require('node:child_process').execFileSync(process.execPath,[require.resolve('tailwindcss/lib/cli.js'),'-i','src/app/globals.css','-o',path.join(dir,'styles.css')],{cwd:root,stdio:'pipe'});
 const entry=file('entry',`import React from'react';import{createRoot}from'react-dom/client';
 import{ProductsClientPage}from ${JSON.stringify(path.join(root,'src/app/superadmin/products/client-page.tsx'))};
 import{ProductFormPage}from ${JSON.stringify(path.join(root,'src/components/superadmin/product-form-page.tsx'))};
 import{ToppingFormPage}from ${JSON.stringify(path.join(root,'src/components/superadmin/topping-form.tsx'))};
 const kind=location.pathname.includes('/toppings/')?'topping':location.pathname.endsWith('/new')?'new':location.pathname.includes('/edit/')?'edit':'list';
 fetch('/data?kind='+kind).then(r=>r.json()).then(props=>createRoot(document.getElementById('root')).render(kind==='topping'?<ToppingFormPage {...props}/>:kind==='list'?<ProductsClientPage {...props}/>:<ProductFormPage {...props}/>));`);
 const loader=file('ts-loader',`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
 const actions=file('actions',`export const createOrUpdateProduct=async(_,data)=>{await fetch('/save',{method:'POST',body:data});return {ok:false,error:{message:'Synthetic save rejection'}};};export const duplicateProducts=async()=>{throw Error('Unexpected duplicate');};export const deleteProduct=async()=>{throw Error('Unexpected delete');};export const updateProductSortOrder=async()=>{throw Error('Unexpected reorder');};`);
 const aliases={
  '@/app/superadmin/products/actions':actions,
  '@/app/superadmin/toppings/actions':file('topping-actions',`export const createOrUpdateTopping=async(_,data)=>{await fetch('/topping-save',{method:'POST',body:data});return{error:true,message:'Synthetic topping rejection'};};export const deleteTopping=async()=>{throw Error('Unexpected delete');};`),
  '@/app/superadmin/locations/actions':file('locations',`export const getAllLocations=()=>{throw Error('Unexpected post-mount server action');};`),
  '@/hooks/use-toast':file('toast','const toast=()=>{};export const useToast=()=>({toast});'),
  'next/navigation':file('navigation',`const router={push:href=>location.assign(href),refresh:()=>location.reload()};export const useRouter=()=>router;`),
  'next/image':file('image',`import React from'react';export default function Image({fill,priority,...props}){return <img {...props}/>;}`),
  'next/link':file('link',`import React from'react';export const useLinkStatus=()=>({pending:false});export default function Link(props){return <a {...props}/>;}`),
  'react$':require.resolve('next/dist/compiled/react'),
  'react/jsx-runtime$':require.resolve('next/dist/compiled/react/jsx-runtime'),
  'react-dom$':require.resolve('next/dist/compiled/react-dom'),
  'react-dom/client$':require.resolve('next/dist/compiled/react-dom/client'),
  '@':path.join(root,'src'),
 };
 await new Promise((resolve,reject)=>webpackModule.webpack({mode:'development',devtool:false,entry,output:{path:dir,filename:'bundle.js'},
  plugins:[new webpackModule.webpack.NormalModuleReplacementPlugin(/^\.\/actions$/,resource=>{if(resource.context===path.join(root,'src/app/superadmin/products'))resource.request=actions;})],
  resolve:{alias:aliases,extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules'),'node_modules']},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:[loader]},{test:/product-page-browser-.*\.js$/,use:[loader]}]}}).run((err,stats)=>err?reject(err):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
 const props={
  brands:[{id:'b',name:'Synthetic brand'}], locations:[{id:'l',name:'Synthetic location',brandId:'b'}], categories:[{id:'c',categoryName:'Synthetic category',locationIds:['l']}],allergens:[],
  product:{id:'p',brandId:'b',locationIds:['l'],categoryId:'c',productName:'Synthetic product',price:70,isActive:true,toppingGroupIds:['g','r'],toppingOverrides:{extra:{price:7,isDefault:true,defaultQuantity:2},linked:{price:0,isDefault:true,defaultQuantity:2},priceOnly:{price:123}},toppingGroupConditions:{}},
  toppingGroups:[{id:'g',groupName:'Extra',locationIds:['l'],minSelection:0,maxSelection:5},{id:'r',groupName:'Ingredients',kind:'removal',locationIds:['l'],minSelection:0,maxSelection:0}],
  toppings:[{id:'linked',groupId:'g',productId:'drink',toppingName:'Linked drink',price:999,isActive:true,isDefault:false,maxQuantity:3,locationIds:['l']},{id:'priceOnly',groupId:'g',productId:'drink',toppingName:'Linked price only',price:999,isActive:true,isDefault:false,locationIds:['l']},{id:'extra',groupId:'g',toppingName:'Cheese',price:10,isActive:true,isDefault:false,maxQuantity:3,locationIds:['l']},{id:'sauce',groupId:'g',toppingName:'Sauce',price:5,isActive:true,isDefault:true,locationIds:['l']},{id:'onion',groupId:'r',toppingName:'Onion',price:0,isActive:true,isDefault:false,locationIds:['l']}],
 };
 server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/styles.css'){res.setHeader('content-type','text/css');return res.end(fs.readFileSync(path.join(dir,'styles.css')));}
  if(url.pathname==='/bundle.js'){res.setHeader('content-type','application/javascript');return res.end(fs.readFileSync(path.join(dir,'bundle.js')));}
  if(url.pathname==='/data'){res.setHeader('content-type','application/json');return res.end(JSON.stringify(url.searchParams.get('kind')==='topping'?{brands:props.brands,locations:props.locations,allGroups:props.toppingGroups,topping:props.toppings[0],products:[{id:'drink',productName:'Synthetic drink',price:12,priceDelivery:15,isActive:true,brandId:'b',locationIds:['l']},{id:'drink2',productName:'Synthetic water',price:8,isActive:true,brandId:'b',locationIds:[]}]}:props));}
  if(url.pathname==='/topping-save'){const chunks=[];for await(const chunk of req)chunks.push(chunk);const data=await new Request('http://localhost/topping-save',{method:'POST',headers:{'content-type':req.headers['content-type']},body:Buffer.concat(chunks)}).formData();lastToppingSave=Object.fromEntries(data);res.end('{}');return;}
  if(url.pathname==='/save'){const chunks=[];for await(const chunk of req)chunks.push(chunk);const data=await new Request('http://localhost/save',{method:'POST',headers:{'content-type':req.headers['content-type']},body:Buffer.concat(chunks)}).formData();lastSave={overrides:JSON.parse(data.get('toppingOverrides')),groups:data.getAll('toppingGroupIds')};res.end('{}');return;}
  res.setHeader('content-type','text/html');res.end('<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.CART_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
});
after(async()=>{await browser?.close();await new Promise(resolve=>server?.close(resolve));if(dir)fs.rmSync(dir,{recursive:true,force:true});});
async function setup(t,width=1280){
 const context=await browser.newContext({viewport:{width,height:900}});t.after(()=>context.close());
 const page=await context.newPage();page.setDefaultTimeout(6000);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));t.after(()=>assert.deepEqual(errors,[]));
 await page.goto(origin+'/superadmin/products/edit/p');await page.getByRole('heading',{name:'Edit Product'}).waitFor();
 await page.getByText('Tilpas 4 tilvalg',{exact:true}).click();await page.getByText('Tilpas 1 fravalg',{exact:true}).click();
 return page;
}
for(const width of [390,1280])test(`product override zero, inheritance, order and failed-save retention (${width})`,async t=>{
 const page=await setup(t,width);
 assert.equal(await page.getByLabel('Pris: Cheese',{exact:true}).inputValue(),'7');
 assert.equal(await page.getByLabel('Standardantal: Cheese',{exact:true}).inputValue(),'2');
 await page.getByLabel('Pris: Cheese',{exact:true}).fill('0');
 await page.getByLabel('Standardvalg: Sauce',{exact:true}).selectOption('no');
 await page.getByLabel('Tilgængelighed: Onion',{exact:true}).selectOption('no');
 assert.equal(await page.getByLabel('Pris: Onion',{exact:true}).count(),0);
 await page.getByRole('button',{name:'Flyt Ingredients op',exact:true}).click();
 lastSave=undefined;await page.getByRole('button',{name:'Save Changes',exact:true}).click();
 await page.getByText('Synthetic save rejection').first().waitFor();
 assert.deepEqual(lastSave.groups,['r','g']);
 assert.deepEqual(lastSave.overrides.linked,{isDefault:true,defaultQuantity:2});
 assert.equal(Object.hasOwn(lastSave.overrides,'priceOnly'),false);
 assert.equal(await page.getByLabel('Pris: Linked drink',{exact:true}).count(),0);
 assert.equal(await page.getByText('Følger produktets pris',{exact:true}).count(),2);
 assert.deepEqual(lastSave.overrides.extra,{price:0,isDefault:true,defaultQuantity:2});
 assert.equal(lastSave.overrides.sauce.isDefault,false);
 assert.equal(lastSave.overrides.onion.isAvailable,false);
 assert.equal(await page.getByLabel('Pris: Cheese',{exact:true}).inputValue(),'0');
 await page.getByLabel('Pris: Cheese',{exact:true}).fill('');
 await page.getByRole('button',{name:'Save Changes',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('button[type="submit"]')?.disabled===false);
 assert.equal(Object.hasOwn(lastSave.overrides.extra,'price'),false);
});
test('hiding or detaching a group cleans invalid defaults and overrides',async t=>{
 const page=await setup(t);
 await page.getByLabel('Tilgængelighed: Cheese',{exact:true}).selectOption('no');
 await page.getByRole('button',{name:'Save Changes',exact:true}).click();await page.getByText('Synthetic save rejection').first().waitFor();
 assert.deepEqual(lastSave.overrides.extra,{price:7,isDefault:false,isAvailable:false});
 await page.getByRole('checkbox',{name:'Extra',exact:true}).uncheck();
 await page.getByRole('button',{name:'Save Changes',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('button[type="submit"]')?.disabled===false);
 assert.deepEqual(lastSave.groups,['r']);assert.deepEqual(lastSave.overrides,{});
});

for(const width of [390,1280])test(`linked topping prices follow source and standalone zero stays editable (${width})`,async t=>{
 const context=await browser.newContext({viewport:{width,height:900}});t.after(()=>context.close());const page=await context.newPage();
 await page.goto(origin+'/superadmin/toppings/edit/linked');
 const disclosure=page.getByRole('status',{name:'Tilknyttet produktpris'});
 await disclosure.waitFor();assert.match(await disclosure.textContent(),/Afhentning: 12 kr.*Levering: 15 kr/);
 assert.equal(await page.locator('input[name="price"][type="number"]').count(),0);
 await page.getByLabel('Genbrug produkt',{exact:true}).selectOption('drink2');
 assert.match(await disclosure.textContent(),/Afhentning: 8 kr.*Levering: 8 kr/);
 await page.getByRole('button',{name:'Gem tilvalg',exact:true}).first().click();await page.getByRole('alert').waitFor();
 assert.equal(lastToppingSave.productId,'drink2');assert.equal(lastToppingSave.price,'8');
 await page.getByLabel('Genbrug produkt',{exact:true}).selectOption('');
 await page.getByLabel('Pris (kr.)',{exact:false}).fill('0');
 await page.getByLabel('Valgt som standard',{exact:true}).check();
 await page.getByRole('button',{name:'Gem tilvalg',exact:true}).first().click();
 await page.waitForFunction(()=>document.querySelector('button[type="submit"]')?.disabled===false);
 assert.equal(lastToppingSave.productId,'');assert.equal(lastToppingSave.price,'0');assert.equal(lastToppingSave.isDefault,'on');
 assert.equal(await disclosure.count(),0);
});
