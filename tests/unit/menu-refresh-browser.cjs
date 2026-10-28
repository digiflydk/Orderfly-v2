// #756: real ordering components and cart state, with loopback-only catalog fixtures.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {chromium}=require('@playwright/test');
const {loadTs}=require('../helpers/load-ts.cjs');
const webpackModule=require('next/dist/compiled/webpack/webpack');webpackModule.init();
const root=process.cwd();let dir,server,browser,origin;
const brand={id:'b',slug:'esmeralda',name:'Esmeralda Pizza',bagFee:4,adminFee:0,vatPercentage:25,logoUrl:'/image.svg'};
const location={id:'l',brandId:'b',slug:'amager',name:'Esmeralda Pizza Amager',street:'Albaniensgade 6',zipCode:'2300',city:'København S',imageUrl:'/image.svg',isActive:true,minOrder:100,deliveryFee:39,deliveryTypes:['pickup','delivery'],allowPreOrder:true,prep_time:20,delivery_time:20,openingHours:Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day=>[day,{isOpen:true,open:'00:00',close:'23:59'}]))};
const names=['Pizza','Pasta','Burgere','Sandwich','A la Carte','Salat','Forretter','Tilbehør','Dyppelse','Desserter','Børnemenu','Vand','Sodavand','Italiensk sodavand'];
const categories=names.map((categoryName,i)=>({id:'c'+i,brandId:'b',categoryName,sortOrder:i,isActive:true}));
const products=categories.flatMap((c,i)=>Array.from({length:3},(_,j)=>({id:'p'+i+'-'+j,brandId:'b',locationIds:['l'],isActive:true,productName:i===0?['Margherita','Pepperoni','Hawaii'][j]:c.categoryName+' '+(j+1),description:'Tomatsauce, mozzarella og friske råvarer.',categoryId:c.id,price:79,priceDelivery:89,imageUrl:'/image.svg',toppingGroupIds:[]})));
function file(name,code){const p=path.join(dir,name+'.js');fs.writeFileSync(p,code);return p;}
before(async()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'menu-refresh-browser-'));
 const entry=file('entry',`import React from'react';import{createRoot}from'react-dom/client';import{CartProvider}from'@/context/cart-context';import{MenuHeader}from'@/components/layout/menu-header';import{DeliveryPriceProvider}from'@/context/delivery-price-context';import{MenuClient}from ${JSON.stringify(path.join(root,'src/app/[brandSlug]/[locationSlug]/menu-client.tsx'))};
 const brand=${JSON.stringify(brand)},location=${JSON.stringify(location)};const q=new URLSearchParams(window.location.search);if(q.has('other'))brand.slug='other';if(q.has('pickupOnly'))location.deliveryTypes=['pickup'];const mode=q.get('deliveryMethod')==='delivery'?'delivery':'pickup';
 createRoot(document.getElementById('root')).render(<div data-commerce-root data-brand-slug={brand.slug}><CartProvider><DeliveryPriceProvider managed={q.has('managed')}><MenuHeader brand={brand} initialLocation={location} initialNow={Date.now()}/><main><MenuClient brand={brand} location={location} initialDeliveryType={mode} initialCategories={${JSON.stringify(categories)}} initialProducts={${JSON.stringify(products)}} initialActiveCombos={[]} initialActiveStandardDiscounts={[]}/></main></DeliveryPriceProvider></CartProvider></div>);`);
 const aliases={
  '@/context/analytics-context':file('analytics',`const trackEvent=()=>false;export const useAnalytics=()=>({trackEvent,measurementKey:'fixture'});`),
  '@/components/feedback/public-reviews-link':file('reviews','export const PublicReviewsLink=()=>null;'),
  '@/app/cart-actions':file('restore',`export const restoreCartAction=async input=>fetch('/restore',{method:'POST',body:JSON.stringify(input)}).then(r=>r.json());`),
  '@/hooks/use-toast':file('toast','export const useToast=()=>({toast:()=>{}});'),
  'next/navigation':file('navigation',`import{useMemo}from'react';export const useSearchParams=()=>useMemo(()=>new URLSearchParams(window.location.search),[]);export const usePathname=()=>window.location.pathname;export const useRouter=()=>({push:href=>location.assign(href)});`),
  'next/image':file('image',`import React from'react';export default function Image({fill,priority,...props}){return <img {...props} style={fill?{position:'absolute',width:'100%',height:'100%',inset:0}:undefined}/>;}`),
  'next/link':file('link',`import React from'react';export const useLinkStatus=()=>({pending:false});export default function Link(props){return <a {...props}/>;}`),
  '@':path.join(root,'src'),
 };
 const loader=file('loader',`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
 await new Promise((resolve,reject)=>webpackModule.webpack({mode:'development',devtool:false,entry,output:{path:dir,filename:'bundle.js',publicPath:'/'},resolve:{alias:aliases,extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules'),'node_modules']},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:[loader]},{test:/menu-refresh-browser-.*\.js$/,use:[loader]}]}}).run((e,s)=>e?reject(e):s.hasErrors()?reject(Error(s.toString({all:false,errors:true}))):resolve()));
 const css=(await require('postcss')([require('tailwindcss')({...loadTs('tailwind.config.ts',{'tailwindcss-animate':{default:require('tailwindcss-animate')}}).default,content:[path.join(root,'src/**/*.{ts,tsx}')]})]).process(fs.readFileSync('src/app/globals.css','utf8'),{from:undefined})).css+'\n'+fs.readFileSync('src/styles/commerce-ui.css','utf8');
 server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.endsWith('.js')){const p=path.join(dir,path.basename(url.pathname));if(fs.existsSync(p)){res.setHeader('Content-Type','application/javascript; charset=utf-8');return res.end(fs.readFileSync(p));}}
  if(url.pathname==='/style.css'){res.setHeader('Content-Type','text/css');return res.end(css);}
  if(url.pathname==='/fonts/inter/inter-latin-wght-normal.woff2'){res.setHeader('Content-Type','font/woff2');return res.end(fs.readFileSync('public'+url.pathname));}
  if(url.pathname==='/image.svg'){res.setHeader('Content-Type','image/svg+xml');return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="400"><defs><linearGradient id="g"><stop stop-color="#665137"/><stop offset="1" stop-color="#28241b"/></linearGradient></defs><rect width="1000" height="400" fill="url(#g)"/><circle cx="740" cy="180" r="130" fill="#bd8c4b"/><circle cx="740" cy="180" r="110" fill="#a1442d"/></svg>');}
  if(url.pathname==='/restore'){let raw='';for await(const c of req)raw+=c;const input=JSON.parse(raw);const out=loadTs('src/lib/cart-restore.ts').restoreCartItems(input.choices,{products,combos:[],toppings:[],groups:[],discounts:[],upsells:[]},input);res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({...out,discounts:[]}));}
  if(url.pathname.startsWith('/api/')){res.setHeader('Content-Type','application/json');return res.end(url.pathname.includes('upsell')?'null':'[]');}
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
 });
 await new Promise(r=>server.listen(0,'0.0.0.0',r));origin='http://127.0.0.1:'+server.address().port;
 if(process.env.MENU_FIXTURE_ONLY){console.log('FIXTURE_URL='+origin);await new Promise(()=>{});}
 browser=await chromium.launch({headless:true,executablePath:process.env.CART_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
});
after(async()=>{await browser?.close();await new Promise(r=>server?.close(r));console.log('QA screenshots: '+dir);});
async function setup(t,width,query=''){
 const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});t.after(()=>context.close());const page=await context.newPage();page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',e=>errors.push(e.message));t.after(()=>assert.deepEqual(errors,[]));await page.goto(origin+'/esmeralda/amager?deliveryMethod=pickup'+query);await page.getByRole('button',{name:'Tilføj Margherita',exact:true}).waitFor().catch(async e=>{console.log('DOM failure',await page.locator('body').innerText(),errors);await page.screenshot({path:path.join(dir,'failure-'+width+'.png')});throw e});await page.waitForFunction(()=>document.querySelector('button[aria-label="Tilføj Margherita"]')?.disabled===false);await page.evaluate(()=>document.fonts.ready);return page;
}
for(const width of [320,390,768,1280,1600])test(`menu frame, Inter, sticky navigation and cart (${width}px)`,async t=>{
 const page=await setup(t,width);const header=page.locator('[data-storefront-header]'),hero=page.locator('[data-menu-hero]'),frame=page.locator('main .storefront-frame');
 assert.ok((await hero.boundingBox()).y>=(await header.boundingBox()).height);
 assert.equal(Math.round((await hero.boundingBox()).width),Math.round((await frame.boundingBox()).width));
 assert.ok((await hero.boundingBox()).width<=1540);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.match(await page.getByRole('heading',{level:1}).evaluate(e=>getComputedStyle(e).fontFamily),/Esmeralda Inter/);
 assert.equal(await page.evaluate(()=>[...document.fonts].some(font=>font.family==='Esmeralda Inter'&&font.status==='loaded')),true);
 assert.equal(await page.getByText(/Leveringspris beregnes|Levering fra:|Minimumsbestilling:/).count(),0);
 await page.screenshot({path:path.join(dir,'menu-'+width+'.png'),fullPage:false});
 await page.getByRole('button',{name:'Tilføj Margherita',exact:true}).click();
 await header.getByRole('button',{name:'Se kurv · 1',exact:true}).click();
 const dialog=page.getByRole('dialog');await dialog.waitFor();assert.equal(await dialog.getByRole('heading',{name:'Margherita',exact:true}).count(),1);
 await dialog.getByRole('button',{name:'Tilføj én Margherita',exact:true}).click();await dialog.getByRole('button',{name:'Rediger Margherita',exact:true}).click();
 await page.getByRole('dialog').getByRole('heading',{name:'Margherita',exact:true}).waitFor();await page.getByRole('dialog').getByRole('button',{name:'Luk',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Til kassen',exact:true}).waitFor();await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Vis flere kategorier'}).click();
 await page.getByRole('button',{name:'Italiensk sodavand',exact:true}).click();
 const heading=page.getByRole('heading',{name:'Italiensk sodavand',exact:true});const y=(await heading.boundingBox()).y;const navBox=await page.locator('[data-storefront-categories]').boundingBox();assert.ok(y>=navBox.y+navBox.height-1,`heading ${y} below nav ${JSON.stringify(navBox)}`);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
});
test('search empty state and keyboard reset, fulfillment labels, minimum and checkout',async t=>{
 const page=await setup(t,1280,'&managed');const search=page.getByRole('searchbox',{name:'Søg i menuen'});await search.fill('nothingmatches');await page.getByRole('status').filter({hasText:'Ingen varer matcher'}).waitFor();await page.getByRole('button',{name:'Ryd menusøgning'}).click();assert.equal(await search.inputValue(),'');
 await page.getByRole('button',{name:'Levering',exact:true}).click();await page.getByText('Leveringspris beregnes i kassen').waitFor();await page.getByRole('button',{name:'Tilføj Margherita',exact:true}).click();assert.equal(await page.getByRole('complementary',{name:'Din kurv'}).getByRole('button',{name:'Til kassen'}).isEnabled(),false);
 await page.getByRole('button',{name:'Afhentning',exact:true}).click();assert.equal(await page.getByText('Leveringspris beregnes i kassen').count(),0);await page.getByRole('button',{name:'Ændr tidspunkt',exact:true}).click();await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'Gem tidspunkt',exact:true}).click();await page.getByRole('complementary',{name:'Din kurv'}).getByRole('button',{name:'Til kassen'}).click();await page.waitForURL('**/esmeralda/amager/checkout');
});
test('pickup-only and other-brand boundary',async t=>{
 const page=await setup(t,390,'&pickupOnly');assert.equal(await page.getByRole('button',{name:'Levering',exact:true}).isEnabled(),false);
 await page.goto(origin+'/other/amager?deliveryMethod=pickup&other');await page.getByRole('button',{name:'Afhentning',exact:true}).waitFor();assert.equal(await page.locator('[data-menu-refresh],[data-menu-hero]').count(),0);assert.doesNotMatch(await page.getByRole('heading',{level:1}).evaluate(e=>getComputedStyle(e).fontFamily),/Esmeralda Inter/);
});
