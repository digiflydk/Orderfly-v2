const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {chromium,expect}=require('@playwright/test');
const compiler=require('next/dist/compiled/webpack/webpack');compiler.init();
const root=process.cwd();let dir,server,browser,origin;
before(async()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'customer-access-browser-'));
 const file=(name,source)=>{const target=path.join(dir,name+'.js');fs.writeFileSync(target,source);return target;};
 const entry=file('entry',`import React from 'react';import {createRoot} from 'react-dom/client';import {CustomerForm} from ${JSON.stringify(path.join(root,'src/components/superadmin/customer-form.tsx'))};function App(){const[open,setOpen]=React.useState(true);return <CustomerForm isOpen={open} setIsOpen={setOpen} customer={null}/>;}createRoot(document.getElementById('root')).render(<App/>);`);
 const actions=file('actions',`export async function getCustomerFormBrands(){const r=await fetch('/brands');if(!r.ok)throw Error('unavailable');return r.json();}export async function createOrUpdateCustomer(_,form){const r=await fetch('/save',{method:'POST',body:form});if(!r.ok)throw Error('unavailable');return r.json();}`);
 const loader=file('loader',`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
 const alias={'@/app/superadmin/customers/actions':actions,'@/hooks/use-toast':file('toast','export const useToast=()=>({toast:()=>{}});'),'@':path.join(root,'src')};
 for(const name of ['react','react/jsx-runtime','react-dom','react-dom/client'])alias[name+'$']=require.resolve('next/dist/compiled/'+name);
 await new Promise((resolve,reject)=>compiler.webpack({mode:'development',devtool:false,entry,output:{path:dir,filename:'bundle.js'},resolve:{alias,extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules'),'node_modules']},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:[loader]},{test:/customer-access-browser-.*\.js$/,use:[loader]}]}}).run((error,stats)=>error?reject(error):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
 server=http.createServer((req,res)=>{
  if(req.url==='/bundle.js'){res.setHeader('content-type','application/javascript');return res.end(fs.readFileSync(path.join(dir,'bundle.js')));}
  if(req.url==='/brands'){res.setHeader('content-type','application/json');return res.end(JSON.stringify([{id:'allowed',name:'Allowed brand'}]));}
  res.setHeader('content-type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script src="/bundle.js"></script>');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.CART_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
});
after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));if(dir)fs.rmSync(dir,{recursive:true,force:true});});
for(const width of [390,1280])test(`customer save preserves values after transport failure and retries with the authorized brand (${width})`,async t=>{
 const context=await browser.newContext({viewport:{width,height:850}});t.after(()=>context.close());
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/save',route=>route.fulfill({status:503,body:'unavailable'}));
 await page.goto(origin);await expect(page.getByRole('combobox',{name:'Brand'})).toHaveValue('allowed');
 await page.getByLabel('Full Name',{exact:true}).fill('Test Customer');await page.getByLabel('Email',{exact:true}).fill('test@example.test');await page.getByLabel('Phone',{exact:true}).fill('12345678');
 await page.getByRole('button',{name:'Create Customer',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Your entries are preserved');
 await expect(page.getByLabel('Full Name',{exact:true})).toHaveValue('Test Customer');await expect(page.getByLabel('Email',{exact:true})).toHaveValue('test@example.test');
 await page.unroute('**/save');let saved;
 await page.route('**/save',async route=>{saved=await new Request('http://fixture/save',{method:'POST',headers:{'content-type':route.request().headers()['content-type']},body:route.request().postDataBuffer()}).formData();await route.fulfill({json:{error:false,message:'Saved'}});});
 await page.getByRole('button',{name:'Create Customer',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 assert.equal(saved.get('brandId'),'allowed');assert.equal(saved.get('fullName'),'Test Customer');assert.deepEqual(errors,[]);
});
test('a failed brand lookup is visible and prevents customer creation',async t=>{
 const context=await browser.newContext();t.after(()=>context.close());const page=await context.newPage();
 await page.route('**/brands',route=>route.fulfill({status:503,body:'unavailable'}));await page.goto(origin);
 await expect(page.getByRole('alert')).toContainText('Brands could not be loaded');await expect(page.getByRole('button',{name:'Create Customer',exact:true})).toBeDisabled();
});
