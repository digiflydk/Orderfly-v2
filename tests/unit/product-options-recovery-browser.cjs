// Real ProductCard + scoped catalog client, with loopback transport and dialog boundary.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {chromium}=require('@playwright/test');
const webpackModule=require('next/dist/compiled/webpack/webpack');webpackModule.init();
const root=process.cwd();let dir,browser,server,origin,mode,requests,release;
const file=(name,source)=>{const p=path.join(dir,name+'.js');fs.writeFileSync(p,source);return p;};
before(async()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'product-options-recovery-'));
 const dialog=file('dialog',`import React from'react';export function ProductDialog(p){return p.isOpen?<section role="dialog" aria-label="Tilvalg"><p>{p.allToppingGroups.map(g=>g.groupName).join(',')}</p><button onClick={()=>p.setIsOpen(false)}>Luk tilvalg</button></section>:null;}`);
 const entry=file('entry',`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{ProductCard}from'@/components/product/product-card';const product={id:'p',brandId:'b',productName:'Testpizza',price:75,toppingGroupIds:['g']};function App(){const[loc,setLoc]=useState('l');window.testLocation=loc;return <><button onClick={()=>setLoc('other')}>Anden lokation</button><ProductCard product={product} activeDiscounts={[]}/></>;}window.adds=[];createRoot(document.getElementById('root')).render(<App/>);`);
 const loader=file('loader',`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
 const alias={
  'next/dynamic':file('dynamic',`import{ProductDialog}from${JSON.stringify(dialog)};export default()=>ProductDialog;`),
  '@/context/cart-context':file('cart',`export const useCart=()=>({cartReady:true,location:{id:window.testLocation},deliveryType:'pickup',cartItems:[],addToCart:(...args)=>{window.adds.push(args);return true;}});`),
  '@/context/storefront-v2-context':file('v2',`export const useStorefrontV2=()=>true;`),
  '@/context/analytics-context':file('analytics',`export const useAnalytics=()=>({trackEvent:()=>{}});`),
  '@/context/product-link-context':file('link',`const link={claim:()=>false,opened:()=>{},closed:()=>{}};export const useProductLink=()=>link;`),
  '@/hooks/use-toast':file('toast',`export const useToast=()=>({toast:()=>{}});`),
  '@/components/ui/button':file('button',`import React from'react';export function Button({variant,size,asChild,...props}){return <button {...props}/>;}`),
  '@/components/ui/badge':file('badge',`import React from'react';export const Badge=p=><span {...p}/>;`),
  '@/components/ui/skeleton':file('skeleton',`import React from'react';export const Skeleton=p=><span {...p}/>;`),
  '@/components/product/storefront-product-image':file('image',`export const StorefrontProductImage=()=>null;`),
  'lucide-react':file('icons',`export const Loader2=()=>null;export const Plus=()=>null;`),
  '@':path.join(root,'src'),
 };
 await new Promise((resolve,reject)=>webpackModule.webpack({mode:'development',devtool:false,entry,output:{path:dir,filename:'bundle.js'},plugins:[new webpackModule.webpack.NormalModuleReplacementPlugin(/^\.\/product-dialog$/,r=>r.request=dialog),new webpackModule.webpack.NormalModuleReplacementPlugin(/^\.\/storefront-product-image$/,r=>r.request=alias['@/components/product/storefront-product-image'])],resolve:{alias,extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules'),'node_modules']},module:{rules:[{test:/\.[jt]sx?$/,exclude:/node_modules/,use:[loader]}]}}).run((error,stats)=>error?reject(error):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
 server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/bundle.js'){res.setHeader('Content-Type','application/javascript; charset=utf-8');return res.end(fs.readFileSync(path.join(dir,'bundle.js')));}
  if(url.pathname==='/api/public/product-options'){
   const loc=url.searchParams.get('locationId');requests.push({location:loc,brand:url.searchParams.get('brandId')});
   if(mode==='transient'&&requests.length===1){res.statusCode=503;return res.end('temporary');}
   if(mode==='forbidden'){res.statusCode=403;return res.end('denied');}
   if(mode==='held'&&loc==='l')await new Promise(r=>release=r);
   res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({groups:[{id:'g',groupName:'Bund '+loc,locationIds:[mode==='malformed'?'foreign':loc]}],toppings:[]}));
  }
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script src="/bundle.js"></script>');
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
});
after(async()=>{release?.();await browser?.close();if(server)await new Promise(r=>server.close(r));if(dir)fs.rmSync(dir,{recursive:true,force:true});});
async function pageFor(t,width,scenario){mode=scenario;requests=[];release=undefined;const ctx=await browser.newContext({viewport:{width,height:844}});t.after(()=>ctx.close());const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));t.after(()=>assert.deepEqual(errors,[]));page.setDefaultTimeout(10000);await page.goto(origin);await page.getByRole('button',{name:'Tilføj Testpizza',exact:true}).waitFor();return page;}
for(const width of [390,1280]){
 test(`transient catalog failure recovers once without repeating add-to-cart (${width}px)`,async t=>{
  const page=await pageFor(t,width,'transient');await page.getByRole('button',{name:'Tilføj Testpizza',exact:true}).click();await page.getByRole('dialog').waitFor();
  assert.deepEqual(requests,[{brand:'b',location:'l'},{brand:'b',location:'l'}]);assert.deepEqual(await page.evaluate(()=>window.adds),[]);
  await page.getByRole('button',{name:'Luk tilvalg',exact:true}).click();await page.getByRole('button',{name:'Tilføj Testpizza',exact:true}).click();await page.getByRole('dialog').waitFor();assert.equal(requests.length,2);
 });
 test(`denied or malformed options stay closed until an explicit successful retry (${width}px)`,async t=>{
  for(const scenario of ['forbidden','malformed']){
   const page=await pageFor(t,width,scenario);await page.getByRole('button',{name:'Tilføj Testpizza',exact:true}).click();await page.getByRole('alert').waitFor();
   assert.equal(requests.length,1);assert.equal(await page.getByRole('dialog').count(),0);assert.deepEqual(await page.evaluate(()=>window.adds),[]);
   mode='normal';await page.getByRole('button',{name:'Prøv igen',exact:true}).click();await page.getByRole('dialog').waitFor();assert.equal(requests.length,2);await page.close();
  }
 });
 test(`changing location during a read cannot open the old option catalog (${width}px)`,async t=>{
  const page=await pageFor(t,width,'held');await page.getByRole('button',{name:'Tilføj Testpizza',exact:true}).click();while(!release)await new Promise(r=>setTimeout(r,10));
  await page.getByRole('button',{name:'Anden lokation',exact:true}).click();await page.getByRole('button',{name:'Tilføj Testpizza',exact:true}).click();await page.getByRole('dialog').waitFor();assert.equal(await page.getByRole('dialog').getByText('Bund other',{exact:true}).count(),1);
  const old=page.waitForResponse(r=>r.url().includes('locationId=l'));release();await old;await page.evaluate(()=>new Promise(requestAnimationFrame));
  assert.equal(await page.getByRole('dialog').getByText('Bund other',{exact:true}).count(),1);assert.equal(await page.getByRole('dialog').getByText('Bund l',{exact:true}).count(),0);assert.deepEqual(await page.evaluate(()=>window.adds),[]);
 });
}
