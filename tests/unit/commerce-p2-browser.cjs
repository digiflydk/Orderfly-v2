// Only #67 P2 storefront interactions, against synthetic data and actual React components.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {chromium}=require('@playwright/test');
const {loadTs}=require('../helpers/load-ts.cjs');
const webpackModule=require('next/dist/compiled/webpack/webpack');webpackModule.init();
const root=process.cwd();let dir,server,browser,origin,restoreReads=0,optionReads=0,optionFailures=0;
const {restoreCartItems}=loadTs('src/lib/cart-restore.ts');
const {defaultTexts}=loadTs('src/lib/cookie-texts.ts');
const brand={id:'b',slug:'fixture',name:'Fixture Pizza',bagFee:4,adminFee:0,vatPercentage:25,logoUrl:'/image.png'};
const location={id:'l',brandId:'b',slug:'restaurant',name:'Fixture Restaurant',isActive:true,minOrder:0,deliveryFee:20,deliveryTypes:['pickup','delivery'],allowPreOrder:true,prep_time:20,delivery_time:20,openingHours:Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day=>[day,{isOpen:true,open:'12:00',close:'22:00'}]))};
const product={id:'p',brandId:'b',locationIds:['l'],isActive:true,productName:'Fixture Pizza',description:'Tomat og ost',categoryId:'native-pizza',displayCategoryId:'__virtual_menu__',price:75,priceDelivery:80,imageUrl:'/image.png',toppingGroupIds:['g']};
const products=[product,{...product,id:'drink',productName:'Fixture Soda',description:'Kold drik',price:25,priceDelivery:30,toppingGroupIds:[]}];
const groups=[{id:'g',locationIds:['l'],groupName:'Ekstra',minSelection:0,maxSelection:2}];
const toppings=[{id:'t',groupId:'g',locationIds:['l'],isActive:true,isDefault:true,toppingName:'Ost',price:5}];
function fixture(name,code){const file=path.join(dir,name+'.js');fs.writeFileSync(file,code);return file;}
before(async()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'commerce-p2-browser-'));
 const navigation=fixture('navigation',`import {useState,useEffect} from 'react';
 const original=history.replaceState.bind(history);history.replaceState=(...args)=>{original(...args);window.dispatchEvent(new Event('fixture-navigation'));};
 export function useSearchParams(){const [search,setSearch]=useState(location.search);useEffect(()=>{const update=()=>setSearch(location.search);window.addEventListener('fixture-navigation',update);window.addEventListener('popstate',update);return()=>{window.removeEventListener('fixture-navigation',update);window.removeEventListener('popstate',update);};},[]);return new URLSearchParams(search);}
 export const usePathname=()=>location.pathname;export const useParams=()=>({brandSlug:'fixture',locationSlug:'restaurant'});export const useRouter=()=>({push:href=>location.assign(href)});`);
 const entry=fixture('entry',`import React from 'react';import{createRoot}from'react-dom/client';
 import LandingClient from ${JSON.stringify(path.join(root,'src/app/brand-site/m3pizza/landing-client.tsx'))};
 import {MenuClient} from ${JSON.stringify(path.join(root,'src/app/[brandSlug]/[locationSlug]/menu-client.tsx'))};
 import {CartProvider,useCart} from ${JSON.stringify(path.join(root,'src/context/cart-context.tsx'))};
 import {AnalyticsProvider} from ${JSON.stringify(path.join(root,'src/context/analytics-context.tsx'))};
 const brand=${JSON.stringify(brand)},location=${JSON.stringify(location)},products=${JSON.stringify(products)};
 function Debug(){const cart=useCart();return <pre id="cart-state">{JSON.stringify({ready:cart.cartReady,count:cart.itemCount,mode:cart.deliveryType,total:cart.checkoutTotal})}</pre>;}
 const mode=new URLSearchParams(window.location.search).get('deliveryMethod')==='delivery'?'delivery':'pickup';
 createRoot(document.getElementById('root')).render(window.location.pathname==='/landing'?<LandingClient brand={brand} location={location} products={products} discounts={[]} config={null}/>:<AnalyticsProvider brand={brand}><CartProvider><MenuClient brand={brand} location={location} initialProducts={products} initialDeliveryType={mode} initialCategories={[{id:'__virtual_menu__',categoryName:'Menu',isActive:true,brandId:'b'}]} initialActiveCombos={[]} initialActiveStandardDiscounts={[]}/><Debug/></CartProvider></AnalyticsProvider>);`);
 const loader=fixture('ts-loader',`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
 const aliases={
  '@/app/cart-actions':fixture('cart-action',`export async function restoreCartAction(data){return fetch('/restore',{method:'POST',body:JSON.stringify(data)}).then(r=>r.json());}`),
  '@/app/superadmin/brands/actions':fixture('brand-action','export const getBrandBySlug=async()=>null;'),
  '@/app/superadmin/upsells/actions':fixture('upsells','export const getActiveUpsellForCart=async()=>null;export const incrementUpsellConversion=async()=>{};'),
  '@/hooks/use-toast':fixture('toast','export const useToast=()=>({toast:()=>{}});'),
  'next/navigation':navigation,
  'next/image':fixture('image',`import React from'react';export default function Image({fill,priority,...props}){return <img {...props}/>;}`),
  'next/link':fixture('link',`import React from'react';export default function Link(props){return <a {...props}/>;}`),
  '@':path.join(root,'src'),
 };
 await new Promise((resolve,reject)=>webpackModule.webpack({mode:'development',devtool:false,entry,output:{path:dir,filename:'bundle.js',publicPath:'/'},resolve:{alias:aliases,extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules'),'node_modules']},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:[loader]},{test:/commerce-p2-browser-.*\.js$/,use:[loader]}]}}).run((err,stats)=>err?reject(err):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
 const postcss=require('postcss'),tailwind=require('tailwindcss');
 const css=(await postcss([tailwind({content:[path.join(root,'src/**/*.{ts,tsx}')],theme:{extend:{}},plugins:[]})]).process('@tailwind base;@tailwind components;@tailwind utilities;',{from:undefined})).css;
 server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.endsWith('.js')){const file=path.join(dir,path.basename(url.pathname));if(fs.existsSync(file)){res.setHeader('Content-Type','application/javascript; charset=utf-8');return res.end(fs.readFileSync(file));}}
  if(url.pathname==='/style.css'){res.setHeader('Content-Type','text/css');return res.end(css);}
  if(url.pathname==='/image.png'){res.setHeader('Content-Type','image/png');return res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1YAAAAASUVORK5CYII=','base64'));}
  res.setHeader('Content-Type','application/json');
  if(url.pathname==='/restore'){restoreReads++;let raw='';for await(const c of req)raw+=c;const input=JSON.parse(raw);return res.end(JSON.stringify({...restoreCartItems(input.choices,{products,combos:[],toppings,groups,discounts:[],upsells:[]},input),discounts:[]}));}
  if(url.pathname==='/api/public/product-options'){optionReads++;if(optionFailures-->0){res.statusCode=503;return res.end('{}');}return res.end(JSON.stringify({toppings,groups}));}
  if(url.pathname==='/api/public/cookie-texts')return res.end(JSON.stringify(defaultTexts));
  if(url.pathname==='/api/public/allergens')return res.end('[]');
  if(url.pathname==='/api/analytics/collect'){res.statusCode=204;return res.end();}
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.CART_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
});
after(async()=>{await browser?.close();await new Promise(resolve=>server?.close(resolve));if(dir)fs.rmSync(dir,{recursive:true,force:true});});
async function setup(t,width,route){const context=await browser.newContext({viewport:{width,height:900}});t.after(()=>context.close());await context.addCookies([{name:'orderfly_cookie_consent',value:encodeURIComponent(JSON.stringify({consent_version:defaultTexts.consent_version,statistics:false})),url:origin}]);const page=await context.newPage();page.setDefaultTimeout(6000);const errors=[];page.on('pageerror',error=>errors.push(error.message));t.after(()=>assert.deepEqual(errors,[]));await page.goto(origin+route);return page;}
for(const width of [1280,390])test(`P2 landing order CTAs and delivery choice navigate to the canonical native restaurant (${width})`,async t=>{
 const page=await setup(t,width,'/landing');
 assert.equal(await page.getByText('Spar 25 %',{exact:true}).count(),0);assert.equal(await page.getByText('Gratis levering',{exact:true}).count(),0);assert.equal(await page.getByText('M3Point',{exact:true}).count(),0);
 await page.getByRole('button',{name:'Bestil nu',exact:true}).first().click();
 await page.getByRole('button',{name:'Leverer til mig',exact:false}).click();
 await page.waitForURL('**/fixture/restaurant?deliveryMethod=delivery');
 await page.waitForFunction(()=>JSON.parse(document.getElementById('cart-state')?.textContent||'{}').ready);
 assert.equal(new URL(page.url()).pathname,'/fixture/restaurant');
});
for(const width of [1280,390])test(`P2 menu search, options retry/cache and fulfillment survive reload (${width})`,async t=>{
 restoreReads=0;optionReads=0;optionFailures=1;
 const page=await setup(t,width,'/fixture/restaurant?deliveryMethod=pickup');
 await page.waitForFunction(()=>JSON.parse(document.getElementById('cart-state')?.textContent||'{}').ready);
 assert.equal(restoreReads,0,'empty initial cart reuses server props');
 await page.getByRole('searchbox',{name:'Søg i menuen'}).fill('soda');
 assert.equal(await page.getByRole('button',{name:'Tilføj Fixture Pizza'}).count(),0);
 await page.getByRole('button',{name:'Tilføj Fixture Soda'}).waitFor({state:'attached'});
 assert.equal(await page.getByRole('button',{name:'Tilføj Fixture Soda'}).count(),1);
 await page.getByRole('searchbox').press('Escape');
 await page.getByRole('button',{name:'Tilføj Fixture Pizza'}).click();
 await page.getByRole('alert').getByRole('button',{name:'Prøv igen'}).click();
 await page.getByRole('dialog').waitFor();
 assert.equal(await page.getByRole('checkbox',{name:'Ost'}).isChecked(),true);
 await page.getByRole('dialog').getByRole('button',{name:/Add to cart|Tilføj til kurv/i}).click();
 await page.waitForFunction(()=>JSON.parse(document.getElementById('cart-state').textContent).count===1);
 assert.equal(optionReads,2);
 await page.getByRole('button',{name:'Tilføj Fixture Pizza'}).click();await page.getByRole('dialog').waitFor();assert.equal(optionReads,2,'second open reuses options');await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Delivery',exact:true}).click();
 await page.waitForFunction(()=>JSON.parse(document.getElementById('cart-state').textContent).ready&&JSON.parse(document.getElementById('cart-state').textContent).mode==='delivery');
 assert.equal(new URL(page.url()).searchParams.get('deliveryMethod'),'delivery');await page.reload();
 await page.waitForFunction(()=>JSON.parse(document.getElementById('cart-state').textContent).ready);
 const state=JSON.parse(await page.locator('#cart-state').textContent());assert.equal(state.mode,'delivery');assert.equal(state.count,1);assert.equal(state.total,109); // 80 + 5 extra + 20 delivery + 4 bag.
});

test('P2 mobile navigation, keyboard and lower order CTAs remain usable with blocked storage', async t=>{
 const page=await setup(t,390,'/landing');
 await page.addInitScript(()=>{for(const storage of ['localStorage','sessionStorage'])Object.defineProperty(window,storage,{get(){throw new Error('Storage unavailable');},configurable:true});});
 await page.reload();
 const menu=page.getByRole('button',{name:'Menu',exact:true});
 await menu.focus();await menu.press('Enter');
 assert.equal(await menu.getAttribute('aria-expanded'),'true');
 await page.getByRole('link',{name:'Se menuen',exact:true}).focus();await page.keyboard.press('Escape');
 assert.equal(await menu.getAttribute('aria-expanded'),'false');
 await menu.click();await page.getByRole('link',{name:'Se menuen',exact:true}).click();
 assert.equal(new URL(page.url()).hash,'#menu');assert.equal(await menu.getAttribute('aria-expanded'),'false');
 for(const button of [page.getByRole('button',{name:'Vælg',exact:true}).first(),page.getByRole('button',{name:'Se hele menuen',exact:true}),page.getByRole('button',{name:'Bestil nu',exact:true}).last()]){
   await button.click();await page.getByRole('dialog').getByRole('button',{name:/Jeg tager med/}).press('Escape');
   await page.getByRole('dialog').waitFor({state:'hidden'});
 }
});
