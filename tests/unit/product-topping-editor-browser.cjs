const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {chromium}=require('@playwright/test');

const webpackModule=require('next/dist/compiled/webpack/webpack');webpackModule.init();
const root=process.cwd();let dir,server,browser,origin,lastSave;
function file(name,code){const target=path.join(dir,name+'.js');fs.writeFileSync(target,code);return target;}
before(async()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'product-page-browser-'));
 const entry=file('entry',`import React from'react';import{createRoot}from'react-dom/client';
 import{ProductsClientPage}from ${JSON.stringify(path.join(root,'src/app/superadmin/products/client-page.tsx'))};
 import{ProductFormPage}from ${JSON.stringify(path.join(root,'src/components/superadmin/product-form-page.tsx'))};
 const kind=location.pathname.endsWith('/new')?'new':location.pathname.includes('/edit/')?'edit':'list';
 fetch('/data?kind='+kind).then(r=>r.json()).then(props=>createRoot(document.getElementById('root')).render(kind==='list'?<ProductsClientPage {...props}/>:<ProductFormPage {...props}/>));`);
 const loader=file('ts-loader',`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
 const actions=file('actions',`export const createOrUpdateProduct=async(_,data)=>{await fetch('/save',{method:'POST',body:data});return {ok:false,error:{message:'Synthetic save rejection'}};};export const duplicateProducts=async()=>{throw Error('Unexpected duplicate');};export const deleteProduct=async()=>{throw Error('Unexpected delete');};export const updateProductSortOrder=async()=>{throw Error('Unexpected reorder');};`);
 const aliases={
  '@/app/superadmin/products/actions':actions,
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
  product:{id:'p',brandId:'b',locationIds:['l'],categoryId:'c',productName:'Synthetic product',price:70,isActive:true,toppingGroupIds:['g','r'],toppingOverrides:{extra:{price:7,isDefault:true,defaultQuantity:2}},toppingGroupConditions:{}},
  toppingGroups:[{id:'g',groupName:'Extra',locationIds:['l'],minSelection:0,maxSelection:5},{id:'r',groupName:'Ingredients',kind:'removal',locationIds:['l'],minSelection:0,maxSelection:0}],
  toppings:[{id:'extra',groupId:'g',toppingName:'Cheese',price:10,isActive:true,isDefault:false,maxQuantity:3,locationIds:['l']},{id:'sauce',groupId:'g',toppingName:'Sauce',price:5,isActive:true,isDefault:true,locationIds:['l']},{id:'onion',groupId:'r',toppingName:'Onion',price:0,isActive:true,isDefault:false,locationIds:['l']}],
 };
 server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/bundle.js'){res.setHeader('content-type','application/javascript');return res.end(fs.readFileSync(path.join(dir,'bundle.js')));}
  if(url.pathname==='/data'){res.setHeader('content-type','application/json');return res.end(JSON.stringify(props));}
  if(url.pathname==='/save'){const chunks=[];for await(const chunk of req)chunks.push(chunk);const data=await new Request('http://localhost/save',{method:'POST',headers:{'content-type':req.headers['content-type']},body:Buffer.concat(chunks)}).formData();lastSave={overrides:JSON.parse(data.get('toppingOverrides')),groups:data.getAll('toppingGroupIds')};res.end('{}');return;}
  res.setHeader('content-type','text/html');res.end('<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
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
 await page.getByText('Tilpas 2 tilvalg',{exact:true}).click();await page.getByText('Tilpas 1 fravalg',{exact:true}).click();
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
