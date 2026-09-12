// Actual admin forms and server mutations, with synthetic Firestore and transport only.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {chromium}=require('@playwright/test');
const {fixture}=require('../helpers/brand-location-fixture.cjs');
const webpackModule=require('next/dist/compiled/webpack/webpack');webpackModule.init();
const root=process.cwd();let dir,server,browser,origin,f,failNext=null,attempts=0;
function file(name,code){const target=path.join(dir,name+'.js');fs.writeFileSync(target,code);return target;}
before(async()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'brand-location-browser-'));
 const entry=file('entry',`import React from 'react';import {createRoot} from 'react-dom/client';
 import {BrandFormPage} from ${JSON.stringify(path.join(root,'src/components/superadmin/brand-form-page.tsx'))};
 import {LocationFormPage} from ${JSON.stringify(path.join(root,'src/components/superadmin/location-form-page.tsx'))};
 import SuperadminError from ${JSON.stringify(path.join(root,'src/app/superadmin/error.tsx'))};
 fetch('/data').then(r=>r.json()).then(data=>{
 let page;
 if(location.pathname.includes('/error'))page=<SuperadminError error={new Error('Server Action "abc" was not found on the server.')} reset={()=>{window.resetCount=(window.resetCount||0)+1;}}/>;
 else if(location.pathname.includes('/brands/'))page=<BrandFormPage brand={location.pathname.endsWith('/new')?undefined:data.brand} centralAdmin={location.pathname.endsWith('/new')} users={[{id:'u',name:'QA Owner',email:'QA@example.test'},{id:'u2',name:'Other owner',email:'qa@example.test'}]} plans={[]} foodCategories={[]}/>;
 else page=<LocationFormPage location={data.location} brands={data.brands}/>;
 createRoot(document.getElementById('root')).render(<React.StrictMode>{page}</React.StrictMode>);
 });`);
 const transport=`async function save(kind,form){const response=await fetch('/save/'+kind,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify([...form])});const result=await response.json();if(result.failure)throw new Error(result.failure);if(result.redirect){window.location.assign('/done/'+kind);return;}return result;}`;
 const actions=file('brand-action',`${transport} export const createOrUpdateBrand=(_,form)=>save('brands',form);export const updateBrandAppearances=async()=>({error:false});`);
 const loader=file('ts-loader',`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
 const aliases={
  '@/app/superadmin/brands/actions':actions,
  '@/app/superadmin/locations/actions':file('location-action',`${transport} export const createOrUpdateLocation=(_,form)=>save('locations',form);`),
  '@/hooks/use-toast':file('toast',`const toast=message=>{window.lastToast=message;};export const useToast=()=>({toast});`),
  'next/navigation':file('navigation',`export const useRouter=()=>({push:href=>location.assign(href),refresh:()=>location.reload()});`),
  'next/image':file('image',`import React from'react';export default function Image({fill,priority,...props}){return <img {...props}/>;}`),
  'next/link':file('link',`import React from'react';export const useLinkStatus=()=>({pending:false});export default function Link(props){return <a {...props}/>;}`),
  '@':path.join(root,'src'),
 };
 await new Promise((resolve,reject)=>webpackModule.webpack({mode:'development',devtool:false,entry,output:{path:dir,filename:'bundle.js'},resolve:{alias:aliases,extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules'),'node_modules']},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:[loader]},{test:/brand-location-browser-.*\.js$/,use:[loader]}]}}).run((err,stats)=>err?reject(err):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
 server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/bundle.js'){res.setHeader('content-type','application/javascript');return res.end(fs.readFileSync(path.join(dir,'bundle.js')));}
  if(url.pathname==='/data'){res.setHeader('content-type','application/json');return res.end(JSON.stringify({brand:await f.brands.getBrandById('b'),brands:await f.brands.getBrands(),location:await f.locations.getLocationById('l')}));}
  if(url.pathname.startsWith('/save/')){
   attempts++;res.setHeader('content-type','application/json');
   if(failNext){const failure=failNext;failNext=null;return res.end(JSON.stringify({failure}));}
   let raw='';for await(const chunk of req)raw+=chunk;
   const form=new FormData();for(const [key,value] of JSON.parse(raw))form.append(key,value);
   try{const result=await (url.pathname.endsWith('/brands')?f.brands.createOrUpdateBrand:f.locations.createOrUpdateLocation)(null,form);res.end(JSON.stringify(result));}
   catch(error){if(error.digest?.startsWith('NEXT_REDIRECT;'))res.end(JSON.stringify({redirect:true}));else{res.statusCode=500;res.end(JSON.stringify({failure:error.message}));}}
   return;
  }
  res.setHeader('content-type','text/html');res.end('<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.CART_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
});
after(async()=>{await browser?.close();await new Promise(resolve=>server?.close(resolve));if(dir)fs.rmSync(dir,{recursive:true,force:true});});
async function setup(t,route='/superadmin/locations/edit/l'){
 f=fixture();attempts=0;failNext=null;
 const context=await browser.newContext({viewport:{width:1280,height:900}});t.after(()=>context.close());
 const page=await context.newPage();page.setDefaultTimeout(6000);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));t.after(()=>assert.deepEqual(errors,[]));
 await page.goto(origin+route);await page.getByRole('heading').first().waitFor();return page;
}
async function chooseBrand(page,name='Esmeralda QA'){
 await page.getByRole('combobox',{name:'Brand',exact:true}).click();await page.getByRole('option',{name,exact:true}).click();
}

test('missing brand is labelled and editable; saving and reopening retains new brand, other fields and closed days',async t=>{
 const page=await setup(t);
 const select=page.getByRole('combobox',{name:'Brand',exact:true});assert.equal(await select.isEnabled(),true);
 assert.match(await select.innerText(),/Brand mangler/);
 await chooseBrand(page);await page.getByLabel('Location Name',{exact:true}).fill('Updated QA Amager');
 await page.getByRole('button',{name:'Save Changes',exact:true}).click();await page.waitForURL('**/done/locations');
 assert.equal(f.records.get('locations/l').brandId,'b');assert.equal(f.records.get('locations/l').isActive,false);
 assert.equal(f.records.get('locations/l').openingHours.tuesday.isOpen,false);
 await page.goto(origin+'/superadmin/locations/edit/l');
 await page.getByRole('combobox',{name:'Brand',exact:true}).waitFor();
 assert.match(await page.getByRole('combobox',{name:'Brand',exact:true}).innerText(),/Esmeralda QA/);
 assert.equal(await page.getByLabel('Location Name',{exact:true}).inputValue(),'Updated QA Amager');
 // Switching a valid existing assignment is also allowed.
 await chooseBrand(page,'CPH QA');await page.getByRole('button',{name:'Save Changes',exact:true}).click();await page.waitForURL('**/done/locations');
 assert.equal(f.records.get('locations/l').brandId,'c');
});

test('brand save survives a stale deployment: fields survive reload, no automatic replay, explicit retry succeeds',async t=>{
 const page=await setup(t,'/superadmin/brands/edit/b');
 await page.getByLabel('Brand Name',{exact:true}).fill('Updated QA Brand');
 failNext='Server Action "605e1859edd4a82193e6303c893d662808f1a083f4" was not found on the server.';
 await page.getByRole('button',{name:'Save Changes',exact:true}).click();
 await page.getByRole('button',{name:'Genindlæs med mine ændringer'}).waitFor();
 assert.equal(attempts,1);assert.equal(f.writes.length,0);
 assert.equal(await page.getByLabel('Brand Name',{exact:true}).inputValue(),'Updated QA Brand');
 await page.getByRole('button',{name:'Genindlæs med mine ændringer'}).click();
 await page.getByRole('alert').filter({hasText:'Dine ændringer er gendannet'}).waitFor();
 assert.equal(await page.getByLabel('Brand Name',{exact:true}).inputValue(),'Updated QA Brand');
 assert.equal(attempts,1);assert.equal(f.writes.length,0);
 assert.equal(await page.evaluate(()=>sessionStorage.getItem('orderfly:admin-form-recovery:'+location.pathname)),null);
 await page.getByRole('button',{name:'Save Changes',exact:true}).click();await page.waitForURL('**/done/brands');
 assert.equal(f.records.get('brands/b').name,'Updated QA Brand');assert.equal(f.writes.length,1);
 await page.goto(origin+'/superadmin/brands/edit/b');await page.getByLabel('Brand Name',{exact:true}).waitFor();
 assert.equal(await page.getByLabel('Brand Name',{exact:true}).inputValue(),'Updated QA Brand');
});

test('location draft restores selected brand after stale action and persists it only on explicit save',async t=>{
 const page=await setup(t);await chooseBrand(page);
 failNext='Failed to find Server Action "old". This request might be from an older deployment.';
 await page.getByRole('button',{name:'Save Changes',exact:true}).click();
 await page.getByRole('button',{name:'Genindlæs med mine ændringer'}).click();
 await page.getByRole('alert').filter({hasText:'Dine ændringer er gendannet'}).waitFor();
 assert.match(await page.getByRole('combobox',{name:'Brand',exact:true}).innerText(),/Esmeralda QA/);
 assert.equal(attempts,1);assert.equal(f.records.get('locations/l').brandId,'missing-brand');
 await page.getByRole('button',{name:'Save Changes',exact:true}).click();await page.waitForURL('**/done/locations');
 assert.equal(f.records.get('locations/l').brandId,'b');
});

test('ordinary save errors retain edits and do not offer deployment reload or replay writes',async t=>{
 const page=await setup(t,'/superadmin/brands/edit/b');await page.getByLabel('Brand Name',{exact:true}).fill('Unsaved QA');
 failNext='Network disconnected';await page.getByRole('button',{name:'Save Changes',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'Vi kunne ikke bekræfte'}).waitFor();
 assert.equal(await page.getByLabel('Brand Name',{exact:true}).inputValue(),'Unsaved QA');
 assert.equal(await page.getByRole('button',{name:'Genindlæs med mine ændringer'}).count(),0);
 assert.equal(attempts,1);assert.equal(f.writes.length,0);
});

test('blocked session storage never reloads or discards unsaved edits',async t=>{
 const page=await setup(t,'/superadmin/brands/edit/b');
 await page.evaluate(()=>Object.defineProperty(window,'sessionStorage',{get(){throw Error('blocked');}}));
 await page.getByLabel('Brand Name',{exact:true}).fill('Kept QA');failNext='Failed to find Server Action "old"';
 await page.getByRole('button',{name:'Save Changes',exact:true}).click();await page.getByRole('button',{name:'Genindlæs med mine ændringer'}).click();
 await page.getByRole('alert').filter({hasText:'Browseren kan ikke bevare ændringerne'}).waitFor();
 assert.equal(await page.getByLabel('Brand Name',{exact:true}).inputValue(),'Kept QA');assert.equal(attempts,1);
});

test('empty brand catalogue explains why selection is unavailable',async t=>{
 const page=await setup(t);f.records.delete('brands/b');f.records.delete('brands/c');await page.reload();
 await page.getByText('Der er ingen brands at vælge. Opret et brand først.').waitFor();
 assert.equal(await page.getByRole('combobox',{name:'Brand',exact:true}).isDisabled(),true);
});

test('stale drafts expire and a draft cannot change the edited document identity',async t=>{
 const page=await setup(t,'/superadmin/brands/edit/b');
 await page.evaluate(()=>sessionStorage.setItem('orderfly:admin-form-recovery:'+location.pathname,JSON.stringify({version:1,savedAt:Date.now()-3600000,values:{name:'Expired QA'}})));
 await page.reload();await page.getByLabel('Brand Name',{exact:true}).waitFor();assert.equal(await page.getByLabel('Brand Name',{exact:true}).inputValue(),'Esmeralda QA');
 await page.evaluate(()=>sessionStorage.setItem('orderfly:admin-form-recovery:'+location.pathname,JSON.stringify({version:1,savedAt:Date.now(),values:{id:'c',name:'Recovered QA'}})));
 await page.reload();await page.getByRole('alert').filter({hasText:'Dine ændringer er gendannet'}).waitFor();
 await page.getByRole('button',{name:'Save Changes',exact:true}).click();await page.waitForURL('**/done/brands');
 assert.equal(f.records.get('brands/b').name,'Recovered QA');assert.equal(f.records.get('brands/c').name,'CPH QA');
});

test('segment retry performs a full page reload for missing actions',async t=>{
 const page=await setup(t,'/superadmin/error');
 await page.evaluate(()=>window.reloadSentinel=true);await page.getByRole('button',{name:'Genindlæs siden'}).click();
 await page.waitForFunction(()=>window.reloadSentinel===undefined);
 assert.equal(await page.evaluate(()=>window.resetCount),undefined);
});

test('central brand owner selector distinguishes native IDs despite matching normalized emails',async t=>{
 const page=await setup(t,'/superadmin/brands/new');
 const owner=page.getByRole('combobox',{name:'Existing owner',exact:true});await owner.click();
 await page.getByRole('option',{name:'Other owner · qa@example.test · u2',exact:true}).click();
 assert.equal(await page.getByLabel('Owner Name',{exact:true}).inputValue(),'Other owner');
 assert.equal(await page.getByLabel('Owner Email',{exact:true}).inputValue(),'qa@example.test');
 await owner.click();await page.getByRole('option',{name:'QA Owner · QA@example.test · u',exact:true}).click();
 assert.equal(await page.getByLabel('Owner Name',{exact:true}).inputValue(),'QA Owner');
 assert.equal(await page.getByLabel('Owner Email',{exact:true}).inputValue(),'QA@example.test');
 assert.equal(await page.getByLabel('Owner Email',{exact:true}).isDisabled(),true);
});
