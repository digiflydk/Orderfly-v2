const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {chromium}=require('@playwright/test');
const {fixture,image}=require('../helpers/product-save-fixture.cjs');
process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET='orderfly-test.invalid';
const webpackModule=require('next/dist/compiled/webpack/webpack');webpackModule.init();
const root=process.cwd();let dir,server,browser,origin,f,lastId;
function file(name,code){const target=path.join(dir,name+'.js');fs.writeFileSync(target,code);return target;}
before(async()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'product-save-browser-'));
 const entry=file('entry',`import React from'react';import{createRoot}from'react-dom/client';
 import{ProductCard}from ${JSON.stringify(path.join(root,'src/components/product/product-card.tsx'))};
 import{ProductFormPage}from ${JSON.stringify(path.join(root,'src/components/superadmin/product-form-page.tsx'))};
 const kind=location.pathname.startsWith('/menu/')?'menu':location.pathname.includes('/edit/')?'edit':'new';
 fetch('/data?kind='+kind+'&id='+location.pathname.split('/').pop()).then(r=>r.json()).then(props=>createRoot(document.getElementById('root')).render(kind==='menu'?<ProductCard product={props.product} activeDiscounts={[]}/>:<ProductFormPage {...props}/>));`);
 const loader=file('ts-loader',`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
 const actions=file('actions',`export const createOrUpdateProduct=async(_,data)=>{const response=await fetch('/save',{method:'POST',body:data});if(!response.ok)throw Error('Request failed');return response.json();};export const duplicateProducts=async()=>{throw Error('Unexpected duplicate');};export const deleteProduct=async()=>{throw Error('Unexpected delete');};export const updateProductSortOrder=async()=>{throw Error('Unexpected reorder');};`);
 const aliases={
  '@/app/superadmin/products/actions':actions,
  '@/context/cart-context':file('cart',`export const useCart=()=>({deliveryType:'pickup',location:{id:'l'},cartReady:true,cartItems:[],addToCart:()=>{}});`),
  '@/context/analytics-context':file('analytics',`export const useAnalytics=()=>({trackEvent:()=>{}});`),
  'next/dynamic':file('dynamic',`export default ()=>()=>null;`),
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
  resolve:{alias:aliases,extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules'),'node_modules']},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:[loader]},{test:/product-save-browser-.*\.js$/,use:[loader]}]}}).run((err,stats)=>err?reject(err):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
 f=fixture();
 server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/bundle.js'){res.setHeader('content-type','application/javascript');return res.end(fs.readFileSync(path.join(dir,'bundle.js')));}
  if(url.pathname==='/data'){res.setHeader('content-type','application/json');return res.end(JSON.stringify(f.props(url.searchParams.get('kind')==='new'?undefined:url.searchParams.get('id'))));}
  if(url.pathname==='/save'){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const data=await new Request('http://localhost/save',{method:'POST',headers:{'content-type':req.headers['content-type']},body:Buffer.concat(chunks)}).formData();
   const result=await f.actions.createOrUpdateProduct(null,data);if(result.ok)lastId=result.id;
   res.setHeader('content-type','application/json');return res.end(JSON.stringify(result));
  }
  res.setHeader('content-type','text/html');res.end('<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.CART_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
});
after(async()=>{await browser?.close();await new Promise(resolve=>server?.close(resolve));if(dir)fs.rmSync(dir,{recursive:true,force:true});});
async function setup(t){
 f=fixture();lastId=null;
 const context=await browser.newContext({viewport:{width:1280,height:900}});t.after(()=>context.close());
 await context.route('https://firebasestorage.googleapis.com/**',route=>{
  const object=f.objects.get(decodeURIComponent(new URL(route.request().url()).pathname.split('/o/')[1]));
  return object?route.fulfill({status:200,contentType:object.options.metadata.contentType,body:object.bytes}):route.abort();
 });
 const page=await context.newPage();page.setDefaultTimeout(8000);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));t.after(()=>assert.deepEqual(errors,[]));
 await page.goto(origin+'/superadmin/products/new');
 await page.getByRole('combobox',{name:'Brand',exact:true}).click();await page.getByRole('option',{name:'Esmeralda QA',exact:true}).click();
 await page.getByRole('combobox',{name:'Category',exact:true}).click();await page.getByRole('option',{name:'QA Vand',exact:true}).click();
 await page.getByLabel('Product Name',{exact:true}).fill('Kildevand 0,5 l');
 await page.locator('input[name="price"]').fill('20');await page.locator('input[name="priceDelivery"]').fill('20');
 await page.getByLabel('QA Amager',{exact:true}).check();
 return page;
}
for(const format of ['jpeg','png','avif'])test(`create and reload actual ${format} in admin and customer card`,async t=>{
 const page=await setup(t),bytes=await image(format);
 await page.locator('input[type="file"]').setInputFiles({name:`water.${format}`,mimeType:`image/${format}`,buffer:bytes});
 await page.getByRole('button',{name:'Create Product',exact:true}).click();
 await page.waitForURL('**/superadmin/products');assert.ok(lastId);
 const saved=f.records.get('products/'+lastId);assert.equal(saved.brandId,'b');assert.equal(saved.price,20);assert.equal(saved.priceDelivery,20);assert.deepEqual(saved.locationIds,['l']);
 await page.goto(origin+'/superadmin/products/edit/'+lastId);await page.reload();
 assert.equal(await page.getByLabel('Product Name',{exact:true}).inputValue(),'Kildevand 0,5 l');
 assert.equal(await page.getByLabel('QA Amager',{exact:true}).isChecked(),true);assert.equal(await page.getByLabel('QA Hellerup',{exact:true}).isChecked(),false);
 await page.waitForFunction(()=>{const img=document.querySelector('img[alt="Image Preview"]');return img&&img.naturalWidth>0;});
 assert.equal(await page.getByAltText('Image Preview').getAttribute('src'),saved.imageUrl);
 await page.getByLabel('Product Name',{exact:true}).fill('Kildevand edited');await page.getByRole('button',{name:'Save Changes',exact:true}).click();await page.waitForURL('**/superadmin/products');
 assert.equal(f.records.get('products/'+lastId).imageUrl,saved.imageUrl);assert.equal(f.objects.size,1);
 await page.goto(origin+'/menu/'+lastId);await page.reload();
 await page.waitForFunction(()=>{const img=document.querySelector('article img');return img&&img.naturalWidth>0;});
 assert.equal(await page.locator('article img').getAttribute('src'),saved.imageUrl);
});
test('server validation, upload failure and transport failure retain all entries and the file for retry',async t=>{
 const page=await setup(t);const bytes=await image();
 await page.getByLabel('QA Extras',{exact:true}).check();await page.getByLabel('QA Milk',{exact:true}).check();
 await page.locator('input[type="file"]').setInputFiles({name:'water.jpg',mimeType:'image/jpeg',buffer:bytes});
 await page.getByLabel('Product Name',{exact:true}).fill('K');await page.getByRole('button',{name:'Create Product',exact:true}).click();await page.getByRole('alert').filter({hasText:'Product name must'}).waitFor();
 await page.getByLabel('Product Name',{exact:true}).fill('Kildevand 0,5 l');
 f.failure.upload=true;await page.getByRole('button',{name:'Create Product',exact:true}).click();await page.getByRole('alert').filter({hasText:'Image upload failed'}).waitFor();
 assert.equal(f.writes.length,0);
 await page.route('**/save',route=>route.fulfill({status:503,body:'Unavailable'}));
 await page.getByRole('button',{name:'Create Product',exact:true}).click();await page.getByRole('alert').filter({hasText:'Could not contact the server'}).waitFor();
 assert.equal(await page.getByLabel('Product Name',{exact:true}).inputValue(),'Kildevand 0,5 l');assert.equal(await page.locator('input[name="price"]').inputValue(),'20');
 for(const name of ['QA Amager','QA Extras','QA Milk'])assert.equal(await page.getByLabel(name,{exact:true}).isChecked(),true);
 assert.equal(await page.locator('input[type="file"]').evaluate(el=>el.files[0].name),'water.jpg');
 await page.unroute('**/save');f.failure.upload=false;
 await page.getByRole('button',{name:'Create Product',exact:true}).click();await page.waitForURL('**/superadmin/products');
 assert.equal(f.writes.length,1);const saved=f.records.get('products/'+lastId);assert.deepEqual(saved.toppingGroupIds,['g']);assert.deepEqual(saved.allergenIds,['a']);
});
test('oversized file is rejected before submitting without clearing entries',async t=>{
 const page=await setup(t);
 await page.locator('input[type="file"]').setInputFiles({name:'large.jpg',mimeType:'image/jpeg',buffer:Buffer.alloc(5*1024*1024+1)});
 await page.getByRole('button',{name:'Create Product',exact:true}).click();await page.getByRole('alert').filter({hasText:'at most 5 MB'}).waitFor();
 assert.equal(f.writes.length,0);assert.equal(await page.getByLabel('Product Name',{exact:true}).inputValue(),'Kildevand 0,5 l');
});
test('switching brands clears hidden brand-scoped selections',async t=>{
 const page=await setup(t);
 await page.getByLabel('QA Extras',{exact:true}).check();
 await page.getByRole('combobox',{name:'Brand',exact:true}).click();await page.getByRole('option',{name:'CPH QA',exact:true}).click();
 await page.getByRole('combobox',{name:'Brand',exact:true}).click();await page.getByRole('option',{name:'Esmeralda QA',exact:true}).click();
 assert.equal(await page.getByLabel('QA Amager',{exact:true}).isChecked(),false);
 assert.equal(await page.getByLabel('QA Extras',{exact:true}).isChecked(),false);
});
test('clearing an existing delivery price removes the override',async t=>{
 const page=await setup(t);await page.goto(origin+'/superadmin/products/edit/hellerup');
 await page.locator('input[name="priceDelivery"]').fill('');await page.getByRole('button',{name:'Save Changes',exact:true}).click();await page.waitForURL('**/superadmin/products');
 assert.equal(Object.hasOwn(f.records.get('products/hellerup'),'priceDelivery'),false);
});

test('editing can move a product to another brand and reload its valid selections',async t=>{
 const page=await setup(t);await page.goto(origin+'/superadmin/products/edit/hellerup');
 await page.getByLabel('QA Sauce',{exact:true}).check();
 await page.getByRole('combobox',{name:'Brand',exact:true}).click();await page.getByRole('option',{name:'CPH QA',exact:true}).click();
 assert.equal(await page.getByLabel('QA Hellerup',{exact:true}).count(),0);
 assert.equal(await page.getByLabel('QA Sauce',{exact:true}).count(),0);
 await page.getByRole('button',{name:'Save Changes',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'categoryId'}).waitFor();assert.equal(f.writes.length,0);
 await page.getByRole('combobox',{name:'Category',exact:true}).click();await page.getByRole('option',{name:'QA CPH Vand',exact:true}).click();
 await page.getByLabel('QA CPH',{exact:true}).check();await page.getByLabel('QA CPH Extras',{exact:true}).check();
 await page.getByRole('button',{name:'Save Changes',exact:true}).click();await page.waitForURL('**/superadmin/products');
 const saved=f.records.get('products/hellerup');assert.equal(saved.brandId,'c');assert.equal(saved.price,50);assert.equal(saved.priceDelivery,60);assert.equal(saved.imageUrl,'https://existing.example/keep.jpg');assert.deepEqual(saved.locationIds,['foreign']);assert.deepEqual(saved.toppingGroupIds,['foreign']);
 await page.goto(origin+'/superadmin/products/edit/hellerup');await page.reload();
 assert.match(await page.getByRole('combobox',{name:'Brand',exact:true}).innerText(),/CPH QA/);
 assert.equal(await page.getByLabel('QA CPH',{exact:true}).isChecked(),true);
});
test('permission-denied upload message keeps replacement image and edited brand for retry',async t=>{
 const page=await setup(t);await page.goto(origin+'/superadmin/products/edit/hellerup');
 await page.getByRole('combobox',{name:'Brand',exact:true}).click();await page.getByRole('option',{name:'CPH QA',exact:true}).click();
 await page.getByRole('combobox',{name:'Category',exact:true}).click();await page.getByRole('option',{name:'QA CPH Vand',exact:true}).click();await page.getByLabel('QA CPH',{exact:true}).check();
 await page.locator('input[type="file"]').setInputFiles({name:'replacement.jpg',mimeType:'image/jpeg',buffer:await image()});
 f.failure.upload=Object.assign(Error('Access denied'),{code:403});
 await page.getByRole('button',{name:'Save Changes',exact:true}).click();await page.getByRole('alert').filter({hasText:'storage access was denied (403)'}).waitFor();
 assert.equal(f.records.get('products/hellerup').brandId,'b');assert.equal(f.writes.length,0);
 assert.match(await page.getByRole('combobox',{name:'Brand',exact:true}).innerText(),/CPH QA/);
 assert.equal(await page.locator('input[type="file"]').evaluate(el=>el.files[0].name),'replacement.jpg');
 f.failure.upload=false;await page.getByRole('button',{name:'Save Changes',exact:true}).click();await page.waitForURL('**/superadmin/products');
 const saved=f.records.get('products/hellerup');assert.equal(saved.brandId,'c');assert.match(decodeURIComponent(saved.imageUrl),/brands\/c\/products\/hellerup\//);
});

test('brand reference rejection names the dependency and keeps the form and image for retry',async t=>{
 const page=await setup(t);await page.goto(origin+'/superadmin/products/edit/hellerup');
 f.records.set('comboMenus/meal',{brandId:'b',comboName:'QA Lunch Menu',isActive:false,productGroups:[{productIds:['hellerup']}]});
 await page.getByRole('combobox',{name:'Brand',exact:true}).click();await page.getByRole('option',{name:'CPH QA',exact:true}).click();
 await page.getByRole('combobox',{name:'Category',exact:true}).click();await page.getByRole('option',{name:'QA CPH Vand',exact:true}).click();await page.getByLabel('QA CPH',{exact:true}).check();
 await page.getByLabel('Product Name',{exact:true}).fill('Moved product');
 await page.locator('input[type="file"]').setInputFiles({name:'replacement.jpg',mimeType:'image/jpeg',buffer:await image()});
 await page.getByRole('button',{name:'Save Changes',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'Combo menu "QA Lunch Menu" (meal)'}).waitFor();
 assert.equal(f.writes.length,0);assert.equal(f.storageCalls.length,0);assert.equal(f.records.get('products/hellerup').brandId,'b');
 assert.equal(await page.getByLabel('Product Name',{exact:true}).inputValue(),'Moved product');
 assert.match(await page.getByRole('combobox',{name:'Brand',exact:true}).innerText(),/CPH QA/);
 assert.equal(await page.getByLabel('QA CPH',{exact:true}).isChecked(),true);
 assert.equal(await page.locator('input[name="price"]').inputValue(),'50');assert.equal(await page.locator('input[name="priceDelivery"]').inputValue(),'60');
 assert.equal(await page.locator('input[type="file"]').evaluate(el=>el.files[0].name),'replacement.jpg');
 f.records.delete('comboMenus/meal');
 await page.getByRole('button',{name:'Save Changes',exact:true}).click();await page.waitForURL('**/superadmin/products');
 const saved=f.records.get('products/hellerup');assert.equal(saved.brandId,'c');assert.equal(saved.productName,'Moved product');assert.match(decodeURIComponent(saved.imageUrl),/brands\/c\/products\/hellerup\//);
 assert.equal(f.writes.length,1);assert.equal(f.objects.size,1);
});
