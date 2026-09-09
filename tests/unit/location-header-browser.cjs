const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {chromium}=require('@playwright/test');
const {execFileSync}=require('node:child_process');
const webpackModule=require('next/dist/compiled/webpack/webpack');webpackModule.init();
const root=process.cwd();let dir,server,browser,origin;
function file(name,code){const target=path.join(dir,name+'.js');fs.writeFileSync(target,code);return target;}
before(async()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'location-header-browser-'));
 const entry=file('entry',`import React from'react';import{createRoot}from'react-dom/client';
 import{MenuHeader}from ${JSON.stringify(path.join(root,'src/components/layout/menu-header.tsx'))};
 createRoot(document.getElementById('root')).render(<div><MenuHeader brand={window.fixture.brand}/><main style={{height:1800}}>Menu</main></div>);`);
 const loader=file('ts-loader',`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
 const aliases={
  '@/context/cart-context':file('cart',`export const useCart=()=>({location:window.fixture.location});`),
  'next/navigation':file('navigation',`const router={push:href=>location.assign(href),refresh:()=>location.reload()};export const useRouter=()=>router;export const usePathname=()=>location.pathname;`),
  'next/image':file('image',`import React from'react';export default function Image({fill,priority,...props}){return <img {...props} style={fill?{position:'absolute',height:'100%',width:'100%',inset:0}:undefined}/>;}`),
  'next/link':file('link',`import React from'react';export const useLinkStatus=()=>({pending:false});export default function Link(props){return <a {...props}/>;}`),
  'react$':require.resolve('next/dist/compiled/react'),
  'react/jsx-runtime$':require.resolve('next/dist/compiled/react/jsx-runtime'),
  'react-dom$':require.resolve('next/dist/compiled/react-dom'),
  'react-dom/client$':require.resolve('next/dist/compiled/react-dom/client'),
  '@':path.join(root,'src'),
 };
 await new Promise((resolve,reject)=>webpackModule.webpack({mode:'development',devtool:false,entry,output:{path:dir,filename:'bundle.js'},
  resolve:{alias:aliases,extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules'),'node_modules']},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:[loader]},{test:/location-header-browser-.*\.js$/,use:[loader]}]}}).run((err,stats)=>err?reject(err):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
 const cssInput=path.join(dir,'input.css');fs.writeFileSync(cssInput,'@tailwind base;@tailwind components;@tailwind utilities;:root{--radius:0.5rem;}');
 execFileSync(process.execPath,[require.resolve('tailwindcss/lib/cli.js'),'-i',cssInput,'-o',path.join(dir,'style.css'),'--content',path.join(root,'src/components/layout/menu-header.tsx')],{cwd:root,stdio:'pipe'});
 server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/bundle.js'){res.setHeader('content-type','application/javascript');return res.end(fs.readFileSync(path.join(dir,'bundle.js')));}
  if(url.pathname==='/style.css'){res.setHeader('content-type','text/css');return res.end(fs.readFileSync(path.join(dir,'style.css')));}
  if(url.pathname==='/photo.svg'||url.pathname==='/logo.svg'){res.setHeader('content-type','image/svg+xml');return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="300"><rect width="800" height="300" fill="#77553f"/></svg>');}
  const brand={id:'b',name:'Esmeralda Pizza',slug:'esmeralda',logoUrl:'/logo.svg'};
  const location={id:'l',brandId:'b',name:'Esmeralda Pizza Amager',slug:'amager',street:'Albaniensgade 6',zipCode:'2300',city:'København S',imageUrl:'/photo.svg',openingHours:{wednesday:{isOpen:true,open:'11:00',close:'22:00'}},deliveryTypes:['delivery','pickup'],deliveryFee:49,minOrder:100};
  const mode=url.searchParams.get('mode');
  if(mode==='fallback'){delete location.imageUrl;delete location.street;location.address='Lang adresse 128, 2300 København S';location.deliveryTypes=['pickup'];location.openingHours.wednesday.isOpen=false;}
  if(mode==='other-brand')location.brandId='other';
  if(mode==='missing'){delete location.openingHours;delete location.deliveryFee;delete location.minOrder;}
  res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script>window.fixture='+JSON.stringify({brand,location})+'</script><script src="/bundle.js"></script></body></html>');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.CART_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
});
after(async()=>{await browser?.close();await new Promise(resolve=>server?.close(resolve));if(dir)console.log('Visual review:',dir);});
async function pageFor(t,width=390,path='/esmeralda/amager'){
 const context=await browser.newContext({viewport:{width,height:850}});t.after(()=>context.close());
 const page=await context.newPage();await page.clock.install({time:new Date('2026-09-09T12:00:00Z')});page.setDefaultTimeout(6000);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));t.after(()=>assert.deepEqual(errors,[]));
 await page.goto(origin+path);await page.getByRole('banner').waitFor();return page;
}
for(const width of [390,1280])test(`logo above location details, wrapping and sticky logo (${width})`,async t=>{
 const page=await pageFor(t,width);
 const banner=page.getByRole('banner'),details=page.getByRole('region',{name:'Lokationsoplysninger'});
 await page.getByText('Åbningstid i dag: 11:00–22:00').waitFor();
 assert.equal(await page.getByRole('heading',{name:'Esmeralda Pizza Amager'}).count(),1);
 const address=page.getByRole('link',{name:'Albaniensgade 6, 2300 København S'});assert.match(await address.getAttribute('href'),/google.com\/maps\/search/);
 await page.getByText('Levering fra: 49,00 kr.').waitFor();await page.getByText('Minimumsbestilling: 100,00 kr.').waitFor();
 const top=await banner.boundingBox(),below=await details.boundingBox();assert.ok(below.y>=top.y+top.height);assert.equal(top.height,64);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.locator('section img').evaluate(img=>img.decode());
 await page.screenshot({path:path.join(dir,'header-'+width+'.png')});
 await page.evaluate(()=>scrollTo(0,600));assert.equal(Math.round((await banner.boundingBox()).y),0);assert.ok((await details.boundingBox()).y<0);
});
test('missing photo, address fallback and pickup-only location show only real information',async t=>{
 const page=await pageFor(t,390,'/esmeralda/amager?mode=fallback');
 await page.getByText('Åbningstid i dag: Lukket').waitFor();await page.getByRole('link',{name:'Lang adresse 128, 2300 København S'}).waitFor();
 assert.equal(await page.locator('section img').count(),0);assert.equal(await page.getByText(/Levering fra|Minimumsbestilling/).count(),0);
});
test('unknown hours/prices are omitted and a stale cart cannot show another brand location',async t=>{
 const page=await pageFor(t,390,'/esmeralda/amager?mode=missing');
 assert.equal(await page.getByText(/Åbningstid|Levering fra|Minimumsbestilling/).count(),0);
 await page.goto(origin+'/esmeralda/amager?mode=other-brand');await page.getByRole('banner').waitFor();
 assert.equal(await page.getByRole('region',{name:'Lokationsoplysninger'}).count(),0);
});
test('checkout keeps a compact header without a menu link or location banner',async t=>{
 const page=await pageFor(t,390,'/esmeralda/amager/checkout');await page.getByText('Esmeralda Pizza Amager').waitFor();
 assert.equal(await page.getByRole('banner').getByRole('link').count(),0);assert.equal(await page.getByRole('region',{name:'Lokationsoplysninger'}).count(),0);
 assert.equal((await page.getByRole('banner').boundingBox()).height,64);
});
