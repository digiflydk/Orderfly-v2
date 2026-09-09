const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {chromium}=require('@playwright/test');
const {fixture}=require('../helpers/product-page-fixture.cjs');
const webpackModule=require('next/dist/compiled/webpack/webpack');webpackModule.init();
const root=process.cwd();let dir,server,browser,origin;
function file(name,code){const target=path.join(dir,name+'.js');fs.writeFileSync(target,code);return target;}
before(async()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'product-page-browser-'));
 const entry=file('entry',`import React from'react';import{createRoot}from'react-dom/client';
 import{ProductsClientPage}from ${JSON.stringify(path.join(root,'src/app/superadmin/products/client-page.tsx'))};
 import{ProductFormPage}from ${JSON.stringify(path.join(root,'src/components/superadmin/product-form-page.tsx'))};
 const kind=location.pathname.endsWith('/new')?'new':location.pathname.includes('/edit/')?'edit':'list';
 fetch('/data?kind='+kind).then(r=>r.json()).then(props=>createRoot(document.getElementById('root')).render(kind==='list'?<ProductsClientPage {...props}/>:<ProductFormPage {...props}/>));`);
 const loader=file('ts-loader',`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
 const actions=file('actions',`export const createOrUpdateProduct=async()=>{throw Error('Unexpected save');};export const duplicateProducts=async()=>{throw Error('Unexpected duplicate');};export const deleteProduct=async()=>{throw Error('Unexpected delete');};export const updateProductSortOrder=async()=>{throw Error('Unexpected reorder');};`);
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
 const f=fixture();
 server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/bundle.js'){res.setHeader('content-type','application/javascript');return res.end(fs.readFileSync(path.join(dir,'bundle.js')));}
  if(url.pathname==='/data'){res.setHeader('content-type','application/json');return res.end(JSON.stringify(await f.pageProps(url.searchParams.get('kind')||'list')));}
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
 await page.goto(origin+'/superadmin/products');await page.getByRole('heading',{name:'Product Management'}).waitFor();
 return page;
}
for(const width of [390,1280])test(`product overview opens and filters ordinary, unsorted and missing-price records (${width})`,async t=>{
 const page=await setup(t,width);
 await page.locator('tbody tr').filter({hasText:'QA Fries'}).waitFor();
 assert.match(await page.locator('tbody tr').filter({hasText:'QA Missing price'}).innerText(),/Pris mangler/);
 const pizza=page.locator('tbody tr').filter({has:page.getByText('QA Pizza',{exact:true})});
 assert.match(await pizza.innerText(),/kr.84.00/);
 await page.getByPlaceholder(/Search by product name/).fill('Fries');
 assert.equal(await page.getByText('QA Pizza',{exact:true}).count(),0);assert.equal(await page.getByText('QA Fries',{exact:true}).count(),1);
 await page.getByRole('button',{name:'Clear',exact:true}).click();
 await page.getByRole('combobox').click();await page.getByRole('option',{name:'CPH QA',exact:true}).click();
 await page.getByText('No products found.').waitFor();
 await page.getByRole('button',{name:'Clear',exact:true}).click();await page.getByText('QA Pizza',{exact:true}).waitFor();
});

test('canonical edit and new-product links open the actual forms with category and option data',async t=>{
 const page=await setup(t);
 const row=page.locator('tbody tr').filter({has:page.getByText('QA Pizza',{exact:true})});
 await row.getByRole('button',{name:'Open menu',exact:true}).click();await page.getByRole('menuitem',{name:'Edit',exact:true}).click();
 await page.waitForURL('**/superadmin/products/edit/p');await page.getByLabel('Product Name',{exact:true}).waitFor();
 assert.equal(await page.getByLabel('Product Name',{exact:true}).inputValue(),'QA Pizza');
 assert.equal(await page.getByLabel('QA Amager',{exact:true}).isChecked(),true);
 assert.equal(await page.getByLabel('QA Extras',{exact:true}).isChecked(),true);
 assert.match(await page.getByRole('combobox',{name:'Category',exact:true}).innerText(),/QA Pizza category/);
 await page.goto(origin+'/superadmin/products/new');await page.getByRole('heading',{name:'Create New Product'}).waitFor();
 await page.getByRole('combobox',{name:'Brand',exact:true}).click();await page.getByRole('option',{name:'Esmeralda QA',exact:true}).click();
 await page.getByRole('combobox',{name:'Category',exact:true}).click();await page.getByRole('option',{name:'QA Pizza category',exact:true}).waitFor();
});

test('duplication gets locations with initial page data without an extra server action',async t=>{
 const page=await setup(t);const row=page.locator('tbody tr').filter({has:page.getByText('QA Pizza',{exact:true})});
 await row.getByRole('button',{name:'Open menu',exact:true}).click();await page.getByRole('menuitem',{name:'Duplicate',exact:true}).click();
 const dialog=page.getByRole('dialog');await dialog.waitFor();await dialog.getByRole('combobox').click();await page.getByRole('option',{name:'Esmeralda QA',exact:true}).click();
 await dialog.getByLabel('QA Amager',{exact:true}).waitFor();
 await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
});
