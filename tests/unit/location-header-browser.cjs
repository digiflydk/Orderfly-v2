const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {chromium}=require('@playwright/test');
const {execFileSync}=require('node:child_process');
const webpackModule=require('next/dist/compiled/webpack/webpack');webpackModule.init();
const root=process.cwd();let dir,server,browser,origin,render;
function file(name,code){const target=path.join(dir,name+'.js');fs.writeFileSync(target,code);return target;}
before(async()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'location-header-browser-'));
 const entry=file('entry',`import React from'react';import{hydrateRoot}from'react-dom/client';
 import{MenuHeader}from ${JSON.stringify(path.join(root,'src/components/layout/menu-header.tsx'))};
 import{BrandLayoutClient}from ${JSON.stringify(path.join(root,'src/app/[brandSlug]/layout-client.tsx'))};
 const f=globalThis.fixture;hydrateRoot(document.getElementById('root'),<BrandLayoutClient brand={f.brand}>{f.initialLocation?<><MenuHeader brand={f.brand} initialLocation={f.initialLocation} initialNow={f.initialNow}/><main><div id="menu" style={{height:1800}}>Menu</div></main></>:<div id="menu" style={{height:1800}}>Menu</div>}</BrandLayoutClient>,{onRecoverableError:error=>{throw error}});globalThis.hydrated=true;`);
 const serverEntry=file('server-entry',`import React from'react';import{renderToString}from'react-dom/server';
 import LocationLayout from ${JSON.stringify(path.join(root,'src/app/[brandSlug]/[locationSlug]/layout.tsx'))};
 import{BrandLayoutClient}from ${JSON.stringify(path.join(root,'src/app/[brandSlug]/layout-client.tsx'))};
 export async function render(f){globalThis.fixture=f;if(!f.initialLocation)return renderToString(<BrandLayoutClient brand={f.brand}><div id="menu" style={{height:1800}}>Menu</div></BrandLayoutClient>);const tree=await LocationLayout({children:<div id="menu" style={{height:1800}}>Menu</div>,params:Promise.resolve({brandSlug:f.brand.slug,locationSlug:f.initialLocation.slug})});f.initialNow=tree.props.children[0].props.initialNow;return renderToString(<BrandLayoutClient brand={f.brand}>{tree}</BrandLayoutClient>);}`);
 const loader=file('ts-loader',`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
 const aliases={
  '@/context/cart-context':file('cart',`import{useEffect,useState}from'react';export const useCart=()=>{const [location,setLocation]=useState(null);useEffect(()=>{setLocation(globalThis.fixture.location)},[]);return{location}};`),
  '@/lib/data/brand-location':file('data',`export const getBrandAndLocation=async(brandSlug,locationSlug)=>{const f=globalThis.fixture;if(brandSlug!==f.brand.slug||locationSlug!==f.initialLocation.slug)throw Error('Incorrect route lookup');return{brand:f.brand,location:f.initialLocation,brandMatchesLocation:f.initialLocation.brandId===f.brand.id}};`),
  '@/components/layout/footer':file('footer',`export const Footer=()=>null;`),
  '@/components/layout/header':file('header',`import React from'react';export const Header=()=> <header>Global</header>;`),
  '@/components/cookie-consent':file('cookies',`export const CookieConsent=()=>null;`),
  'next/navigation':file('navigation',`const router={push:href=>location.assign(href),refresh:()=>location.reload()};export const useRouter=()=>router;export const usePathname=()=>globalThis.fixture.pathname;export const notFound=()=>{throw Error('NOT_FOUND')};`),
  'next/image':file('image',`import React from'react';export default function Image({fill,priority,fetchPriority,...props}){return <img {...props} fetchPriority={fetchPriority} loading={priority?'eager':undefined} style={fill?{position:'absolute',height:'100%',width:'100%',inset:0}:undefined}/>;}`),
  'next/link':file('link',`import React from'react';export const useLinkStatus=()=>({pending:false});export default function Link(props){return <a {...props}/>;}`),
  'react$':require.resolve('next/dist/compiled/react'),
  'react/jsx-runtime$':require.resolve('next/dist/compiled/react/jsx-runtime'),
  'react-dom$':require.resolve('next/dist/compiled/react-dom'),
  'react-dom/client$':require.resolve('next/dist/compiled/react-dom/client'),
  'react-dom/server$':require.resolve('next/dist/compiled/react-dom/server.node'),
  '@':path.join(root,'src'),
 };
 for(const isServer of [false,true])await new Promise((resolve,reject)=>webpackModule.webpack({mode:'development',devtool:false,target:isServer?'node':'web',entry:isServer?serverEntry:entry,output:{path:dir,filename:isServer?'server.cjs':'bundle.js',...(isServer?{library:{type:'commonjs2'}}:{})},
  resolve:{alias:aliases,extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules'),'node_modules']},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:[loader]},{test:/location-header-browser-.*\.js$/,use:[loader]}]}}).run((err,stats)=>err?reject(err):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
 render=require(path.join(dir,'server.cjs')).render;
 const cssInput=path.join(dir,'input.css');fs.writeFileSync(cssInput,'@tailwind base;@tailwind components;@tailwind utilities;:root{--radius:0.5rem;}');
 execFileSync(process.execPath,[require.resolve('tailwindcss/lib/cli.js'),'-i',cssInput,'-o',path.join(dir,'style.css'),'--content',[path.join(root,'src/components/layout/menu-header.tsx'),path.join(root,'src/app/[brandSlug]/layout-client.tsx')].join(',')],{cwd:root,stdio:'pipe'});
 server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/bundle.js'){res.setHeader('content-type','application/javascript');return res.end(fs.readFileSync(path.join(dir,'bundle.js')));}
  if(url.pathname==='/style.css'){res.setHeader('content-type','text/css');return res.end(fs.readFileSync(path.join(dir,'style.css')));}
  if(url.pathname==='/photo.svg'||url.pathname==='/logo.svg'){res.setHeader('content-type','image/svg+xml');return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="300"><rect width="800" height="300" fill="#77553f"/></svg>');}
  const brand={id:'b',name:'Esmeralda Pizza',slug:'esmeralda',logoUrl:'/logo.svg'};
  const location={id:'l',brandId:'b',name:'Esmeralda Pizza Amager',slug:'amager',street:'Albaniensgade 6',zipCode:'2300',city:'København S',imageUrl:'/photo.svg',openingHours:Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day=>[day,{isOpen:true,open:'11:00',close:'22:00'}])),deliveryTypes:['delivery','pickup'],deliveryFee:49,minOrder:100};
  const mode=url.searchParams.get('mode');
  if(mode==='fallback'){delete location.imageUrl;delete location.street;location.address='Lang adresse 128, 2300 København S';location.deliveryTypes=['pickup'];Object.values(location.openingHours).forEach(day=>day.isOpen=false);}
  if(mode==='other-brand')location.brandId='other';
  if(mode==='missing'){delete location.openingHours;delete location.deliveryFee;delete location.minOrder;}
  if(mode==='external-image')location.imageUrl='https://cdn.example.test/location.jpg';
  if(mode==='long-name')location.name='Esmeralda Pizza Amager med et meget langt lokationsnavn som ikke må bryde headeren';
  const initialLocation={...location};
  if(mode==='stale-cart'){location.name='Another branch';location.slug='another';}
  if(mode==='cross-brand-cart')location.brandId='different-brand';
  const fixture={brand,location:mode==='empty-cart'?null:location,initialLocation:url.pathname==='/esmeralda/checkout'?undefined:initialLocation,pathname:url.pathname};
  let markup;try{markup=await render(fixture);}catch(error){if(error.message==='NOT_FOUND'){res.statusCode=404;return res.end('Not found');}throw error;}
  res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root">'+markup+'</div><script>globalThis.fixture='+JSON.stringify(fixture)+'</script><script src="/bundle.js"></script></body></html>');
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
test('an external location image is rendered without Next Image host restrictions',async t=>{
 const page=await pageFor(t,390,'/esmeralda/amager?mode=external-image');
 assert.equal(await page.locator('section img').getAttribute('src'),'https://cdn.example.test/location.jpg');
});
test('unknown hours/prices are omitted and a stale cart cannot show another brand location',async t=>{
 const page=await pageFor(t,390,'/esmeralda/amager?mode=missing');
 assert.equal(await page.getByText(/Åbningstid|Levering fra|Minimumsbestilling/).count(),0);
 const response=await page.goto(origin+'/esmeralda/amager?mode=other-brand');assert.equal(response.status(),404);
 assert.equal(await page.getByRole('region',{name:'Lokationsoplysninger'}).count(),0);
});
test('checkout keeps a compact header without a menu link or location banner',async t=>{
 const page=await pageFor(t,390,'/esmeralda/amager/checkout');await page.getByText('Esmeralda Pizza Amager').waitFor();
 assert.equal(await page.getByRole('banner').getByRole('link').count(),0);assert.equal(await page.getByRole('region',{name:'Lokationsoplysninger'}).count(),0);
 assert.equal((await page.getByRole('banner').boundingBox()).height,64);
});
test('checkout truncates long location names within the fixed mobile header',async t=>{
 const page=await pageFor(t,390,'/esmeralda/amager/checkout?mode=long-name');
 const header=page.getByRole('banner'),name=header.getByText(/meget langt lokationsnavn/);
 await name.waitFor();assert.equal((await header.boundingBox()).height,64);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.equal(await name.evaluate(element=>element.scrollWidth>element.clientWidth),true);
});

for(const mode of ['empty-cart','stale-cart','cross-brand-cart'])test(`header is complete before JavaScript and stable through hydration (${mode})`,async t=>{
 const context=await browser.newContext({viewport:{width:390,height:850}});t.after(()=>context.close());
 const page=await context.newPage();let resume;const held=new Promise(resolve=>{resume=resolve});
 await page.route('**/bundle.js',async route=>{await held;await route.continue()});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/esmeralda/amager?mode='+mode,{waitUntil:'commit'});
 await page.getByRole('heading',{name:'Esmeralda Pizza Amager'}).waitFor();
 await page.getByText('Åbningstid i dag: 11:00–22:00').waitFor();
 assert.equal(await page.getByRole('banner').count(),1);
 const hero=page.locator('section img');assert.equal(await hero.getAttribute('fetchpriority'),'high');assert.equal(await hero.getAttribute('loading'),'eager');
 await page.locator('link[rel=stylesheet]').evaluate(link=>link.sheet?undefined:new Promise(resolve=>link.onload=resolve));
 const before=await page.locator('#menu').boundingBox();
 await page.evaluate(()=>{globalThis.shifts=[];new PerformanceObserver(list=>globalThis.shifts.push(...list.getEntries().filter(e=>!e.hadRecentInput).map(e=>e.value))).observe({type:'layout-shift',buffered:true})});
 resume();await page.waitForFunction(()=>globalThis.hydrated);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 assert.deepEqual(await page.locator('#menu').boundingBox(),before);
 assert.equal(await page.getByRole('heading',{name:'Esmeralda Pizza Amager'}).count(),1);
 assert.equal(await page.getByText('Another branch').count(),0);
 assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>globalThis.shifts.reduce((sum,n)=>sum+n,0)),0);
});

test('legacy checkout retains exactly one compact header after cart restoration',async t=>{
 const page=await pageFor(t,390,'/esmeralda/checkout');
 await page.getByText('Esmeralda Pizza Amager').waitFor();
 assert.equal(await page.getByRole('banner').count(),1);
 assert.equal(await page.getByRole('banner').getByRole('link').count(),0);
 assert.equal(await page.getByRole('region',{name:'Lokationsoplysninger'}).count(),0);
});
