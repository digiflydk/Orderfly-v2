// Only #67 P2 storefront interactions, against synthetic data and actual React components.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {chromium,expect}=require('@playwright/test');
const {loadTs}=require('../helpers/load-ts.cjs');
const webpackModule=require('next/dist/compiled/webpack/webpack');webpackModule.init();
const root=process.cwd();let dir,server,browser,origin,restoreReads=0,optionReads=0,optionFailures=0;
const {restoreCartItems}=loadTs('src/lib/cart-restore.ts');
const {defaultTexts}=loadTs('src/lib/cookie-texts.ts');
const brand={id:'b',slug:'fixture',name:'Fixture Pizza',bagFee:4,adminFee:0,vatPercentage:25,logoUrl:'/image.png'};
const location={id:'l',brandId:'b',slug:'restaurant',name:'Fixture Restaurant',isActive:true,minOrder:0,deliveryFee:20,deliveryTypes:['pickup','delivery'],allowPreOrder:true,prep_time:20,delivery_time:20,openingHours:Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day=>[day,{isOpen:true,open:'12:00',close:'22:00'}]))};
const product={id:'p',brandId:'b',locationIds:['l'],isActive:true,productName:'Fixture Pizza',description:'Tomat og ost',categoryId:'native-pizza',displayCategoryId:'__virtual_menu__',price:75,priceDelivery:80,imageUrl:'/image.png',toppingGroupIds:['g']};
const products=[product,{...product,id:'drink',productName:'Fixture Soda',description:'Kold drik',price:25,priceDelivery:30,toppingGroupIds:[]},{...product,id:'water',productName:'Fixture Water',price:25,priceDelivery:30,toppingGroupIds:[]}];
const combo={id:'combo',brandId:'b',locationIds:['l'],isActive:true,imageUrl:'/image.png',comboName:'Pizza og drik',description:'Pizza og valgfri drik',pickupPrice:90,deliveryPrice:100,upgradeProductIds:['p'],orderTypes:['pickup','delivery'],activeDays:[],activeTimeSlots:[],productGroups:[{id:'pizza-group',groupName:'Pizza',productIds:['p'],minSelection:1,maxSelection:1},{id:'drink-group',groupName:'Drik',productIds:['drink','water'],minSelection:1,maxSelection:1}]};
const groups=[{id:'g',locationIds:['l'],groupName:'Ekstra',minSelection:0,maxSelection:2},{id:'required',locationIds:['l'],groupName:'Bund',minSelection:1,maxSelection:1}];
const toppings=[{id:'t',groupId:'g',locationIds:['l'],isActive:true,isDefault:true,toppingName:'Ost',price:5},{id:'bacon',groupId:'g',locationIds:['l'],isActive:true,isDefault:false,toppingName:'Bacon',price:10},{id:'dressing',groupId:'g',locationIds:['l'],isActive:true,isDefault:false,toppingName:'Dressing',price:5},{id:'base',groupId:'required',locationIds:['l'],isActive:true,isDefault:false,toppingName:'Tynd bund',price:0}];
const capGroups=Array.from({length:51},(_,i)=>({id:`cap-g-${i}`,locationIds:['l'],groupName:`Cap group ${i}`,minSelection:0,maxSelection:2}));
capGroups.push({id:'cap-radio',locationIds:['l'],groupName:'Cap radio',minSelection:0,maxSelection:1});
const capToppings=capGroups.slice(0,51).map((group,i)=>({id:`cap-t-${i}`,groupId:group.id,locationIds:['l'],isActive:true,isDefault:true,toppingName:`Default ${i}`,price:1}));
capToppings.push({id:'cap-r-1',groupId:'cap-radio',locationIds:['l'],isActive:true,toppingName:'Radio 1',price:1});
function fixture(name,code){const file=path.join(dir,name+'.js');fs.writeFileSync(file,code);return file;}
before(async()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'commerce-p2-browser-'));
 const navigation=fixture('navigation',`import {useState,useEffect,useMemo} from 'react';
 const original=history.replaceState.bind(history);history.replaceState=(...args)=>{original(...args);window.dispatchEvent(new Event('fixture-navigation'));};
 export function useSearchParams(){const [search,setSearch]=useState(location.search);useEffect(()=>{const update=()=>setSearch(location.search);window.addEventListener('fixture-navigation',update);window.addEventListener('popstate',update);return()=>{window.removeEventListener('fixture-navigation',update);window.removeEventListener('popstate',update);};},[]);return useMemo(()=>new URLSearchParams(search),[search]);}
 export const usePathname=()=>location.pathname;export const useParams=()=>({brandSlug:'fixture',locationSlug:'restaurant'});export const useRouter=()=>({push:href=>location.assign(href)});`);
 const entry=fixture('entry',`import React,{useEffect,useState} from 'react';import{createRoot}from'react-dom/client';
 import LandingClient from ${JSON.stringify(path.join(root,'src/app/brand-site/m3pizza/landing-client.tsx'))};
 import {MenuClient} from ${JSON.stringify(path.join(root,'src/app/[brandSlug]/[locationSlug]/menu-client.tsx'))};
 import {AnalyticsDashboardClient} from ${JSON.stringify(path.join(root,'src/components/superadmin/analytics-dashboard-client.tsx'))};
 import {ToppingConditionEditor} from ${JSON.stringify(path.join(root,'src/components/superadmin/topping-condition-editor.tsx'))};
 import {ProductDialog} from ${JSON.stringify(path.join(root,'src/components/product/product-dialog.tsx'))};
 import {CartProvider,useCart} from ${JSON.stringify(path.join(root,'src/context/cart-context.tsx'))};
 import {AnalyticsProvider} from ${JSON.stringify(path.join(root,'src/context/analytics-context.tsx'))};
 const brand=${JSON.stringify(brand)},location=${JSON.stringify(location)},products=${JSON.stringify(products)},combo=${JSON.stringify(combo)};
 if(new URLSearchParams(window.location.search).get('minimum'))location.minOrder=100;
 if(new URLSearchParams(window.location.search).get('upsell')==='required')products[0].toppingGroupIds=['required'];
 const capGroups=${JSON.stringify(capGroups)},capToppings=${JSON.stringify(capToppings)};
 const capProduct={...products[0],id:'cap-product',productName:'Cap Product',toppingGroupIds:capGroups.map(group=>group.id)};
 function Debug(){const cart=useCart();return <pre id="cart-state" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify({ready:cart.cartReady,count:cart.itemCount,mode:cart.deliveryType,total:cart.checkoutTotal,toppingIds:cart.cartItems[0]?.toppings.map(topping=>topping.id)||[]})}</pre>;}
 const conditionalGroups=['size','regular','family','drink'].map(id=>({id,locationIds:['l'],groupName:id,minSelection:id==='size'||id==='drink'?1:0,maxSelection:1}));
 const conditionalToppings=[['alm','size',0],['fam','size',60],['menu','size',30],['cheese','regular',10],['family-cheese','family',20],['cola','drink',0]].map(([id,groupId,price])=>({id,groupId,price,toppingName:id,isActive:true,locationIds:['l'],isDefault:id==='alm'||id==='cola'}));
 const conditionalProduct={...products[0],toppingGroupIds:conditionalGroups.map(g=>g.id),toppingGroupConditions:{regular:['alm'],family:['fam'],drink:['menu']}};
 function EditorFixture(){const [rules,setRules]=useState({});return <><ToppingConditionEditor groups={conditionalGroups} toppings={conditionalToppings} value={rules} onChange={setRules}/><pre id="rules">{JSON.stringify(rules)}</pre></>;}
 function ConditionalFixture(){const cart=useCart();useEffect(()=>cart.setCartContext(brand,location,{deliveryType:'pickup',discounts:[]}),[]);return <><ProductDialog product={conditionalProduct} isOpen={true} setIsOpen={()=>{}} allToppingGroups={conditionalGroups} allToppings={conditionalToppings}/><Debug/></>;}
 function ToppingCapFixture(){const cart=useCart();useEffect(()=>cart.setCartContext(brand,location,{deliveryType:'pickup',discounts:[]}),[]);return <><ProductDialog product={capProduct} isOpen={true} setIsOpen={()=>{}} allToppingGroups={capGroups} allToppings={capToppings}/><Debug/></>;}
 function ConsentFixture(){const [events,setEvents]=useState([]);useEffect(()=>{const original=window.fetch;window.fetch=(url,options)=>{if(url==='/api/analytics/collect')setEvents(previous=>[...previous,JSON.parse(options.body)]);return original(url,options);};return()=>{window.fetch=original;};},[]);const consent=statistics=>{localStorage.setItem('orderfly_cookie_consent',JSON.stringify({statistics}));window.dispatchEvent(new Event('orderfly:consent'));};return <aside><button onClick={()=>consent(true)}>Allow analytics</button><button onClick={()=>consent(false)}>Reject analytics</button><pre id="funnel-events">{JSON.stringify(events)}</pre></aside>;}
 function DashboardFixture(){const [count,setCount]=useState(1);const data={totals:{sessions:2,measuredPurchasingSessions:1,view_menu:2,view_product:1,add_to_cart:1,start_checkout:1,click_purchase:1,payment_succeeded:count,revenue_paid:count*100},daily:[],byLocation:[],attribution:[],dataQualityWarnings:[]};return <><button onClick={()=>setCount(7)}>Receive refreshed report</button><AnalyticsDashboardClient initialData={data} locations={[]} searchParams={{dateFrom:'2026-09-01',dateTo:'2026-09-11',counting:'events'}}/></>;}
 const mode=new URLSearchParams(window.location.search).get('deliveryMethod')==='delivery'?'delivery':'pickup';
 createRoot(document.getElementById('root')).render(window.location.pathname==='/dashboard-fixture'?<DashboardFixture/>:window.location.pathname==='/condition-editor'?<EditorFixture/>:window.location.pathname==='/landing'?<LandingClient brand={brand} location={location} products={products} discounts={[]} config={null}/>:<AnalyticsProvider brand={brand}><ConsentFixture/><CartProvider>{window.location.pathname==='/conditional'?<ConditionalFixture/>:window.location.pathname==='/topping-cap'?<ToppingCapFixture/>:<><MenuClient brand={brand} location={location} initialProducts={products} initialDeliveryType={mode} initialCategories={[{id:'__virtual_menu__',categoryName:'Menu',isActive:true,brandId:'b'}]} initialActiveCombos={[combo]} initialActiveStandardDiscounts={[]}/><Debug/></>}</CartProvider></AnalyticsProvider>);`);
 const loader=fixture('ts-loader',`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
 const aliases={
  '@/app/superadmin/analytics/cust-funnel/actions':fixture('funnel-actions','export const runAggregationForDates=async()=>({success:true});'),
  '@/components/superadmin/FiltersBar':fixture('filter-bar','export const FiltersBar=()=>null;'),
  '@/app/cart-actions':fixture('cart-action',`export async function restoreCartAction(data){return fetch('/restore',{method:'POST',body:JSON.stringify(data)}).then(r=>r.json());}`),
  '@/app/superadmin/brands/actions':fixture('brand-action','export const getBrandBySlug=async()=>null;'),
  '@/app/superadmin/upsells/actions':fixture('upsells','export const getActiveUpsellForCart=async()=>null;export const incrementUpsellConversion=async()=>{};'),
  '@/hooks/use-toast':fixture('toast','export const useToast=()=>({toast:(message)=>{window.lastCartToast=message;}});'),
  'next/navigation':navigation,
  'next/image':fixture('image',`import React from'react';export default function Image({fill,priority,...props}){return <img {...props}/>;}`),
  'next/link':fixture('link',`import React from'react';export default function Link(props){return <a {...props}/>;}`),
  '@':path.join(root,'src'),
 };
 await new Promise((resolve,reject)=>webpackModule.webpack({mode:'development',plugins:[new webpackModule.webpack.DefinePlugin({'process.env.NEXT_PUBLIC_RELEASE_SHA':JSON.stringify('local')})],devtool:false,entry,output:{path:dir,filename:'bundle.js',publicPath:'/'},resolve:{alias:aliases,extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules'),'node_modules']},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:[loader]},{test:/commerce-p2-browser-.*\.js$/,use:[loader]}]}}).run((err,stats)=>err?reject(err):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
 const postcss=require('postcss'),tailwind=require('tailwindcss');
 const css=(await postcss([tailwind({...loadTs('tailwind.config.ts',{'tailwindcss-animate':{default:require('tailwindcss-animate')}}).default,content:[path.join(root,'src/**/*.{ts,tsx}')]})]).process(fs.readFileSync(path.join(root,'src/app/globals.css'),'utf8'),{from:undefined})).css;
 server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.endsWith('.js')){const file=path.join(dir,path.basename(url.pathname));if(fs.existsSync(file)){res.setHeader('Content-Type','application/javascript; charset=utf-8');return res.end(fs.readFileSync(file));}}
  if(url.pathname==='/style.css'){res.setHeader('Content-Type','text/css');return res.end(css+'\n'+fs.readFileSync(path.join(root,'src/styles/commerce-ui.css'),'utf8'));}
  if(url.pathname==='/image.png'){res.setHeader('Content-Type','image/png');return res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1YAAAAASUVORK5CYII=','base64'));}
  res.setHeader('Content-Type','application/json');
  if(url.pathname==='/restore'){restoreReads++;let raw='';for await(const c of req)raw+=c;const input=JSON.parse(raw);return res.end(JSON.stringify({...restoreCartItems(input.choices,{products,combos:[combo],toppings,groups,discounts:[],upsells:[]},input),discounts:[]}));}
  if(url.pathname==='/api/public/product-options'){optionReads++;if(optionFailures-->0){res.statusCode=503;return res.end('{}');}return res.end(JSON.stringify({toppings,groups}));}
  if(url.pathname==='/api/public/cookie-texts')return res.end(JSON.stringify(defaultTexts));
  if(url.pathname==='/api/public/upsell') {
   const mode=new URL(req.headers.referer||'http://localhost').searchParams.get('upsell');
   if(mode==='hang')return;
   let raw='';for await(const chunk of req)raw+=chunk;const input=JSON.parse(raw);
   if(mode==='required')return res.end(JSON.stringify(input.cartItems.some(i=>i.id==='drink') && !input.cartItems.some(i=>i.id==='p')?{upsell:{id:'u-required',upsellName:'En pizza til?',discountType:'none'},products:[products[0]]}:null));
   return res.end(JSON.stringify(mode==='active' && input.cartItems.some(i=>i.id==='p') && !input.cartItems.some(i=>i.id==='drink') ? {upsell:{id:'u',upsellName:'Til din pizza',discountType:'none'},products:[products[1]]}:null));
  }
  if(url.pathname==='/api/public/allergens')return res.end('[]');
  if(url.pathname==='/api/analytics/collect'){res.statusCode=204;return res.end();}
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 if(process.env.COMMERCE_FIXTURE_ONLY){console.log('FIXTURE_URL='+origin);await new Promise(()=>{});}
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
 assert.equal(await page.getByRole('dialog').locator('details, summary, [role="separator"]').count(),0);
 assert.equal(await page.getByRole('dialog').getByRole('heading',{name:'Ekstra',exact:true}).count(),1);
 assert.equal(await page.getByRole('checkbox',{name:/Ost/}).isChecked(),true);
 const panel=page.locator('[data-commerce-panel="options"]');
 await panel.evaluate(async node=>{await Promise.all(node.getAnimations().map(a=>a.finished.catch(()=>{})));});
 const bounds=await panel.boundingBox();assert.ok(Math.abs(bounds.y+bounds.height-900)<2,'options opens at bottom');
 const row=page.locator('[data-option-row]').filter({hasText:'Ost'});
 await row.getByText(/kr\./).click();assert.equal(await page.getByRole('checkbox',{name:/Ost/}).isChecked(),false,'price area toggles exactly once');
 await row.getByText('Ost',{exact:true}).click();assert.equal(await page.getByRole('checkbox',{name:/Ost/}).isChecked(),true,'label toggles exactly once');
 const cta=page.getByRole('dialog').getByRole('button',{name:/Add to cart|Tilføj til kurv/i});
 const optionRows=page.getByRole('dialog').locator('[data-option-row]');
 assert.equal(await optionRows.count(),3);
 const rowBoxes=await optionRows.evaluateAll(nodes=>nodes.map(node=>{const box=node.getBoundingClientRect();return {top:box.top,bottom:box.bottom,height:box.height};}));
 assert.ok(rowBoxes.every(box=>box.height>=43&&box.height<=45),'option rows keep a compact 44px touch target');
 assert.ok(rowBoxes.slice(1).every((box,index)=>box.top-rowBoxes[index].bottom<=1),'option rows do not add vertical gaps');
 assert.ok(Math.abs((await cta.boundingBox()).height-64.4)<1);
 assert.equal(await cta.evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(255, 189, 2)');
 if(process.env.UI69_SCREENSHOTS)await page.screenshot({path:process.env.UI69_SCREENSHOTS+'/options-'+width+'.png'});
 await page.getByRole('dialog').getByRole('button',{name:/Add to cart|Tilføj til kurv/i}).click();
 await page.waitForFunction(()=>JSON.parse(document.getElementById('cart-state').textContent).count===1);
 assert.equal(await page.evaluate(()=>window.lastCartToast?.title),'Tilføjet til kurven');
 assert.equal(optionReads,2);
 if(width===390){
   await page.getByRole('button',{name:/Se kurv/}).click();
   const cartPanel=page.locator('[data-commerce-panel="cart"]');await cartPanel.waitFor();
   await cartPanel.evaluate(async node=>{await Promise.all(node.getAnimations().map(a=>a.finished.catch(()=>{})));});
   const box=await cartPanel.boundingBox();assert.ok(Math.abs(box.y+box.height-900)<2);
   await page.keyboard.press('Escape');await cartPanel.waitFor({state:'hidden'});
 }
 await page.getByRole('button',{name:'Tilføj Fixture Pizza'}).click();await page.getByRole('dialog').waitFor();assert.equal(optionReads,2,'second open reuses options');await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Levering',exact:true}).click();
 await page.waitForFunction(()=>JSON.parse(document.getElementById('cart-state').textContent).ready&&JSON.parse(document.getElementById('cart-state').textContent).mode==='delivery');
 assert.equal(new URL(page.url()).searchParams.get('deliveryMethod'),'delivery');await page.reload();
 await page.waitForFunction(()=>JSON.parse(document.getElementById('cart-state').textContent).ready);
 const state=JSON.parse(await page.locator('#cart-state').textContent());assert.equal(state.mode,'delivery');assert.equal(state.count,1);assert.equal(state.total,109); // 80 + 5 extra + 20 delivery + 4 bag.
});

test('P2 topping cap covers defaults, checkboxes, radios and a valid 50-option cart',async t=>{
 const page=await setup(t,1280,'/topping-cap');
 await page.getByRole('dialog').waitFor();
 await page.waitForFunction(()=>document.querySelectorAll('[role="checkbox"][data-state="checked"]').length===50);
 assert.equal(await page.getByRole('checkbox',{name:'Default 50'}).isDisabled(),true,'51st default is capped and disabled');
 assert.equal(await page.getByRole('radio',{name:'Radio 1'}).isDisabled(),true,'an empty radio group cannot exceed the global cap');
 assert.equal(await page.getByRole('dialog').locator('details, summary').count(),0);
 await page.getByRole('checkbox',{name:'Default 0'}).click();
 await page.getByRole('checkbox',{name:'Default 50'}).click();
 assert.equal(await page.getByRole('checkbox',{name:/^Default 2 \+/}).isDisabled(),false,'selected options remain removable at the cap');
 await page.getByRole('checkbox',{name:/^Default 1 \+/}).click();
 await page.getByRole('radio',{name:'Radio 1'}).click();
 await page.getByRole('dialog').getByRole('button',{name:/Add to cart|Tilføj til kurv/i}).click();
 await page.waitForFunction(()=>JSON.parse(document.getElementById('cart-state').textContent).count===1);
 const state=JSON.parse(await page.locator('#cart-state').textContent());
 assert.equal(state.toppingIds.length,50);assert.ok(state.toppingIds.includes('cap-r-1'));assert.ok(state.toppingIds.includes('cap-t-50'));
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

for (const width of [360,390,768,820,1023,1280]) test(`#71 cart is reachable and a draft edit is atomic (${width})`, async t=>{
 const page=await setup(t,width,'/fixture/restaurant?deliveryMethod=pickup');
 await page.waitForFunction(()=>JSON.parse(document.getElementById('cart-state').textContent).ready);
 await page.getByRole('button',{name:'Tilføj Fixture Soda',exact:true}).click();
 await page.waitForFunction(()=>JSON.parse(document.getElementById('cart-state').textContent).count===1);
 assert.equal(await page.getByRole('dialog').count(),0,'simple plus adds without an options step');
 if(width<1024)await page.getByRole('button',{name:/Se kurv/}).click();
 const surface=width<1024?page.getByRole('dialog'):page.getByRole('complementary',{name:'Din kurv'});
 await surface.getByRole('button',{name:'Rediger Fixture Soda',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:/Gem ændringer/}).waitFor();
 await page.getByRole('dialog').getByRole('button',{name:'Øg antal',exact:true}).click();
 assert.equal(JSON.parse(await page.locator('#cart-state').textContent()).count,1,'draft is not written before save');
 await page.keyboard.press('Escape');
 if(width<1024)await page.getByRole('button',{name:/Se kurv/}).click();
 await (width<1024?page.getByRole('dialog'):page.getByRole('complementary',{name:'Din kurv'})).getByRole('button',{name:'Rediger Fixture Soda',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Øg antal',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:/Gem ændringer/}).click();
 await page.waitForFunction(()=>JSON.parse(document.getElementById('cart-state').textContent).count===2);
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('orderfly.cart.v1')));assert.equal(stored.choices.length,1);assert.equal(stored.choices[0].quantity,2);
 if(width<1024)await page.getByRole('button',{name:/Se kurv/}).click();
 const cta=(width<1024?page.getByRole('dialog'):page.getByRole('complementary',{name:'Din kurv'})).getByRole('button',{name:'Til kassen',exact:true});
 assert.ok(await cta.isVisible());assert.ok((await cta.boundingBox()).height>=55);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal page overflow');
 await (width<1024?page.getByRole('dialog'):page.getByRole('complementary',{name:'Din kurv'})).evaluate(async node=>{await Promise.all(node.getAnimations().map(a=>a.finished.catch(()=>{})));});
 const ctaBounds=await cta.boundingBox();assert.ok(ctaBounds.y>=0 && ctaBounds.y+ctaBounds.height<=900,'checkout CTA is inside the viewport');
 if(process.env.UI71_SCREENSHOTS)await page.screenshot({path:process.env.UI71_SCREENSHOTS+'/cart-'+width+'.png'});
});
test('#71 existing product upgrades to one combo and cancelling preserves the product',async t=>{
 const page=await setup(t,390,'/fixture/restaurant?deliveryMethod=pickup');
 await page.waitForFunction(()=>JSON.parse(document.getElementById('cart-state').textContent).ready);
 await page.getByRole('button',{name:'Tilføj Fixture Pizza',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:/Tilføj til kurv/}).click();
 await page.getByRole('button',{name:/Se kurv/}).click();await page.getByRole('dialog').getByRole('button',{name:'Rediger Fixture Pizza',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Vælg menu',exact:true}).click();
 await page.keyboard.press('Escape');
 assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('orderfly.cart.v1')))).choices[0].id,'p');
 await page.getByRole('dialog').getByRole('button',{name:'Vælg menu',exact:true}).click();
 await page.getByRole('dialog').getByRole('radio',{name:'Fixture Soda',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:/Gem ændringer/}).click();
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('orderfly.cart.v1')));assert.equal(stored.choices.length,1);assert.equal(stored.choices[0].id,'combo');assert.equal(stored.choices[0].comboSelections.length,2);
});

test('#71 inline quick upsell removes itself after add without a popup',async t=>{
 const page=await setup(t,390,'/fixture/restaurant?deliveryMethod=pickup&upsell=active');
 await page.waitForFunction(()=>JSON.parse(document.getElementById('cart-state').textContent).ready);
 await page.getByRole('button',{name:'Tilføj Fixture Pizza',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:/Tilføj til kurv/}).click();
 await page.getByRole('button',{name:/Se kurv/}).click();
 const offers=page.getByRole('dialog').getByRole('region',{name:'Anbefalet til din ordre'});
 await offers.getByRole('button',{name:'Tilføj Fixture Soda',exact:true}).click();
 await page.waitForFunction(()=>JSON.parse(document.getElementById('cart-state').textContent).count===2);
 await offers.waitFor({state:'hidden'});assert.equal(await page.getByRole('dialog').count(),1,'cart stays open without an upsell modal');
});
test('#71 a hanging recommendation request cannot delay checkout navigation',async t=>{
 const page=await setup(t,390,'/fixture/restaurant?deliveryMethod=pickup&upsell=hang');
 await page.waitForFunction(()=>JSON.parse(document.getElementById('cart-state').textContent).ready);
 await page.getByRole('button',{name:'Tilføj Fixture Soda',exact:true}).click();await page.getByRole('button',{name:/Se kurv/}).click();
 const cta=page.getByRole('dialog').getByRole('button',{name:'Til kassen'});const started=Date.now();await cta.click();await page.waitForURL('**/fixture/restaurant/checkout');assert.ok(Date.now()-started<1500,'navigation does not wait for the 2s optional timeout');
});


test('#71 recommended product requires options and cannot add twice',async t=>{
 const page=await setup(t,390,'/fixture/restaurant?deliveryMethod=pickup&upsell=required');
 await page.waitForFunction(()=>JSON.parse(document.getElementById('cart-state').textContent).ready);
 await page.getByRole('button',{name:'Tilføj Fixture Soda',exact:true}).click();
 await page.getByRole('button',{name:/Se kurv/}).click();
 await page.getByRole('region',{name:'Anbefalet til din ordre'}).getByRole('button',{name:'Tilføj Fixture Pizza',exact:true}).click();
 const dialog=page.getByRole('dialog').last();
 await dialog.getByRole('button',{name:/Vælg de påkrævede tilvalg/}).click();
 assert.equal(JSON.parse(await page.locator('#cart-state').textContent()).count,1);
 const required=dialog.getByRole('region',{name:'Bund',exact:true});
 assert.equal(await required.evaluate(node=>node===document.activeElement),true);
 assert.equal(await required.getByRole('heading',{name:'Bund',exact:true}).count(),1);
 await dialog.getByRole('radio',{name:/Tynd bund/}).click();
 await dialog.getByRole('button',{name:/Tilføj til kurv/}).evaluate(node=>{node.click();node.click();});
 await page.waitForFunction(()=>JSON.parse(document.getElementById('cart-state').textContent).count===2);
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('orderfly.cart.v1')));
 assert.equal(stored.choices.filter(i=>i.id==='p').length,1);assert.deepEqual(stored.choices.find(i=>i.id==='p').toppingIds,['base']);
});

test('#71 editing one combo part preserves the other selected parts',async t=>{
 const page=await setup(t,390,'/fixture/restaurant?deliveryMethod=pickup');
 await page.waitForFunction(()=>JSON.parse(document.getElementById('cart-state').textContent).ready);
 await page.getByRole('button',{name:'Tilføj Pizza og drik',exact:true}).click();
 assert.equal(await page.getByRole('dialog').locator('details, summary, [role="separator"]').count(),0);
 assert.equal(await page.getByRole('dialog').getByRole('heading',{name:'Drik',exact:true}).count(),1);
 const comboRows=page.getByRole('dialog').getByRole('region',{name:'Drik',exact:true}).locator('[data-option-row]');
 const comboBoxes=await comboRows.evaluateAll(nodes=>nodes.map(node=>{const box=node.getBoundingClientRect();return {top:box.top,bottom:box.bottom,height:box.height};}));
 assert.ok(comboBoxes.every(box=>box.height>=43&&box.height<=45),'combo option rows keep a compact 44px touch target');
 assert.ok(comboBoxes.slice(1).every((box,index)=>box.top-comboBoxes[index].bottom<=1),'combo option rows do not add vertical gaps');
 await page.getByRole('dialog').getByRole('radio',{name:'Fixture Soda',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:/Tilføj til kurv/}).click();
 await page.getByRole('button',{name:/Se kurv/}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Rediger Pizza og drik',exact:true}).click();
 await page.getByRole('dialog').getByRole('radio',{name:'Fixture Water',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:/Gem ændringer/}).click();
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('orderfly.cart.v1')));
 assert.equal(stored.choices.length,1);assert.deepEqual(stored.choices[0].comboSelections.map(g=>g.products.map(p=>p.id)),[['p'],['water']]);
});

test('#71 delivery minimum is actionable before checkout and selection is visible',async t=>{
 const page=await setup(t,390,'/fixture/restaurant?deliveryMethod=delivery&minimum=100');
 await page.waitForFunction(()=>JSON.parse(document.getElementById('cart-state').textContent).ready);
 assert.equal(await page.getByRole('button',{name:'Levering',exact:true}).evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(255, 189, 2)');
 await page.getByRole('button',{name:'Tilføj Fixture Soda',exact:true}).click();await page.getByRole('button',{name:/Se kurv/}).click();
 const dialog=page.getByRole('dialog');assert.equal(await dialog.getByRole('button',{name:'Til kassen',exact:true}).isDisabled(),true);
 assert.match(await dialog.getByRole('status').textContent(),/70,00.*100,00/);
 await dialog.getByRole('button',{name:'Find flere varer',exact:true}).click();await dialog.waitFor({state:'hidden'});
});

for(const width of [390,1280])test(`conditional product options switch safely at ${width}px`,async t=>{
 const page=await setup(t,width,'/conditional');
 await page.waitForFunction(()=>JSON.parse(document.getElementById('cart-state').textContent).ready);
 const dialog=page.getByRole('dialog');
 await dialog.getByRole('region',{name:'regular',exact:true}).waitFor();
 assert.equal(await dialog.getByRole('region',{name:'family',exact:true}).count(),0);
 assert.equal(await dialog.getByRole('region',{name:'drink',exact:true}).count(),0);
 await dialog.getByRole('radio',{name:/^cheese /}).click();
 await dialog.getByRole('radio',{name:/^fam /}).click();
 await dialog.getByRole('region',{name:'family',exact:true}).waitFor();
 assert.equal(await dialog.getByRole('region',{name:'regular',exact:true}).count(),0);
 await dialog.getByRole('radio',{name:/^family-cheese /}).click();
 await expect(dialog.getByRole('button',{name:/Tilføj til kurv/})).toHaveText(/155,00/);
 await dialog.getByRole('radio',{name:/^menu /}).click();
 await dialog.getByRole('region',{name:'drink',exact:true}).waitFor();
 await expect(dialog.getByRole('radio',{name:/^cola /})).toBeChecked();
 await expect(dialog.getByRole('button',{name:/Tilføj til kurv/})).toHaveText(/105,00/);
 await dialog.getByRole('radio',{name:/^alm /}).click();
 assert.equal(await dialog.getByRole('region',{name:'drink',exact:true}).count(),0);
 await expect(dialog.getByRole('button',{name:/Tilføj til kurv/})).toHaveText(/75,00/);
 await dialog.getByRole('button',{name:/Tilføj til kurv/}).click();
 await page.waitForFunction(()=>JSON.parse(document.getElementById('cart-state').textContent).count===1);
 assert.deepEqual(JSON.parse(await page.locator('#cart-state').textContent()).toppingIds,['alm']);
});

for(const width of [390,1280])test(`admin conditional groups share triggers and can be cleared at ${width}px`,async t=>{
 const page=await setup(t,width,'/condition-editor');
 await page.getByLabel('Synlighed for drink',{exact:true}).selectOption('conditional');
 await page.getByText('Vælg mindst ét aktiverende tilvalg.',{exact:true}).waitFor();
 await page.getByLabel('size · menu',{exact:true}).check();
 await page.getByLabel('Synlighed for family',{exact:true}).selectOption('conditional');
 await page.getByLabel('size · menu',{exact:true}).nth(0).check();
 assert.deepEqual(JSON.parse(await page.locator('#rules').textContent()),{drink:['menu'],family:['menu']});
 await page.getByLabel('Synlighed for drink',{exact:true}).selectOption('always');
 assert.deepEqual(JSON.parse(await page.locator('#rules').textContent()),{family:['menu']});
});

// #123: exercise actual consent/provider/menu/dialog components with isolated collection.
for(const width of [1280,390])test(`#123 late consent restores current views without replaying actions (${width})`,async t=>{
 const page=await setup(t,width,'/fixture/restaurant?deliveryMethod=pickup');
 const events=()=>page.locator('#funnel-events').evaluate(node=>JSON.parse(node.textContent));
 await expect(page.getByRole('button',{name:'Tilføj Fixture Soda',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Tilføj Fixture Soda',exact:true}).click();
 await page.getByRole('button',{name:'Se Fixture Pizza',exact:true}).click();
 await page.getByRole('dialog').waitFor();
 assert.deepEqual(await events(),[]);
 // The fixture grants consent through the same event/storage contract as CookieConsent.
 await page.evaluate(()=>{localStorage.setItem('orderfly_cookie_consent',JSON.stringify({statistics:true}));window.dispatchEvent(new Event('orderfly:consent'));});
 await expect.poll(async()=> (await events()).map(e=>e.name).sort()).toEqual(['view_menu','view_product']);
 await page.getByRole('checkbox',{name:/Bacon/}).check();
 assert.equal((await events()).filter(e=>e.name==='view_product').length,1,'option changes do not duplicate views');
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Tilføj Fixture Soda',exact:true}).click();
 await expect.poll(async()=> (await events()).filter(e=>e.name==='add_to_cart').length).toBe(1);
 await page.getByRole('button',{name:'Se Fixture Pizza',exact:true}).click();
 await expect.poll(async()=> (await events()).filter(e=>e.name==='view_product').length).toBe(2);
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Se Pizza og drik',exact:true}).click();
 await expect.poll(async()=> (await events()).filter(e=>e.name==='view_product'&&e.params.productId==='combo').length).toBe(1);
 await page.keyboard.press('Escape');
 for(const {params} of await events()){assert.equal(params.brandId,'b');assert.equal(params.locationId,'l');assert.ok(params.sessionId);}
 await page.getByRole('button',{name:'Reject analytics',exact:true}).click();
 const before=(await events()).length;
 await page.getByRole('button',{name:'Tilføj Fixture Soda',exact:true}).click();
 assert.equal((await events()).length,before);
});

test('#123 report renders refreshed server data instead of initial state',async t=>{
 const page=await setup(t,1280,'/dashboard-fixture');
 await expect(page.getByText('100,00 kr.',{exact:true})).toHaveCount(2);
 await page.getByRole('button',{name:'Receive refreshed report',exact:true}).click();
 await expect(page.getByText('700,00 kr.',{exact:true})).toBeVisible();
 await expect(page.getByText('50.00%',{exact:true})).toBeVisible();
});

// #125: real provider storage lifecycle, with synthetic customer-free actions.
test('#125 no analytics identity before consent; 30-minute brand session survives reload, rotates and revokes',async t=>{
 const page=await setup(t,390,'/fixture/restaurant?deliveryMethod=pickup');
 const session=async()=> (await page.context().cookies()).find(c=>c.name==='orderfly_session_id_b');
 assert.equal(await session(),undefined);
 await page.getByRole('button',{name:'Allow analytics',exact:true}).click();
 await expect.poll(async()=>!!(await session())).toBe(true);
 const first=await session();
 assert.ok(first.expires-Date.now()/1000>1700 && first.expires-Date.now()/1000<=1801);
 await page.reload();
 await expect(page.getByRole('button',{name:'Tilføj Fixture Soda',exact:true})).toBeEnabled();
 assert.equal((await session()).value,first.value);
 await page.evaluate(()=>{document.cookie='orderfly_session_id_b=; Max-Age=0; Path=/';});
 await page.getByRole('button',{name:'Tilføj Fixture Soda',exact:true}).click();
 await expect.poll(async()=> (await session())?.value).not.toBe(first.value);
 await page.getByRole('button',{name:'Reject analytics',exact:true}).click();
 await expect.poll(session).toBeUndefined();
 const events=()=>page.locator('#funnel-events').evaluate(node=>JSON.parse(node.textContent));
 const before=(await events()).length;
 await page.getByRole('button',{name:'Tilføj Fixture Soda',exact:true}).click();
 assert.equal((await events()).length,before);
 await page.getByRole('button',{name:'Allow analytics',exact:true}).click();
 await expect.poll(async()=> (await events()).filter(e=>e.name==='view_menu').length).toBeGreaterThan(1);
});
