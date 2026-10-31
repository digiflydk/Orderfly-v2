// Only the changed checkout flow, locally in Chromium. Production React form,
// validation, UI, analytics provider and upsell dialog; external I/O is simulated.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const {chromium,expect}=require('@playwright/test');
const {loadTs}=require('../helpers/load-ts.cjs');
const {CUSTOMER_IDENTITY_CHECKOUT_MESSAGE}=loadTs('src/lib/checkout-public-error.ts');
const webpackModule=require('next/dist/compiled/webpack/webpack');
webpackModule.init();
let dir,server,browser,origin;
const requests=new Map();const attemptKeys=new Set();
const root=process.cwd();
const brand={id:'b',slug:'brand',name:'Fixture',bagFee:0,vatPercentage:25};
const location={id:'l',slug:'location',brandId:'b',name:'Fixture',country:'DK',city:'Hellerup',minOrder:0,deliveryFee:20,isActive:true,deliveryTypes:['pickup','delivery'],allowPreOrder:true,prep_time:20,delivery_time:20,openingHours:Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day=>[day,{isOpen:true,open:'12:00',close:'22:00'}]))};
function fixture(name,content){const file=path.join(dir,name+'.js');fs.writeFileSync(file,content);return file;}
before(async()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'checkout-browser-'));
 const settings=fixture('scenario',`export const scenario=new URLSearchParams(window.location.search).get('case')||'success';`);
 const cart=fixture('cart',`
 import React from 'react';
 import {basketTotals} from ${JSON.stringify(path.join(root,'src/lib/basket-totals.ts'))};
 const scenario=new URLSearchParams(window.location.search).get('case')||'success';
 const presentation=scenario.startsWith('presentation');
 const newsletter=scenario.startsWith('ui-newsletter')||scenario.startsWith('ui-club');
 export const brand={...${JSON.stringify(brand)},bagFee:presentation||newsletter?4:0}, location={...${JSON.stringify(location)},...(scenario.startsWith('managed-schedule-')?{openingHours:Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day=>[day,{isOpen:true,open:'11:00',close:'22:00'}]))}:{}),...(scenario.startsWith('v2-')?{paymentMethods:{online:!scenario.includes('offline'),payAtPickup:true}}:{})};
 const context=React.createContext(null);
 const item={id:'pizza',cartItemId:'pizza',productName:'Pizza',quantity:1,basePrice:100,price:100,toppings:[],itemType:'product',imageUrl:'/image.png'};
 const reduced={...item,id:'offer',cartItemId:'offer',basePrice:75,price:45};
 const initialItems=scenario.includes('combo-qa209')?[{...item,id:'combo',itemType:'combo',basePrice:105,price:105,toppings:[{id:'dressing',name:'Dressing',price:10}]}]:scenario.includes('stacking')?[{...item,basePrice:89,price:59,toppings:[{id:'chicken',name:'Kylling',price:15},{id:'base',name:'Napolitansk',price:10}]},{...item,id:'fries',cartItemId:'fries',basePrice:45,price:45},{...item,id:'soda',cartItemId:'soda',basePrice:35,price:33.25}]
  :scenario.includes('all-discounted')?[{...reduced,toppings:[{id:'extra',name:'Tilvalg',price:35}]},{...reduced,id:'second',cartItemId:'second'}]
  :scenario.includes('mixed')||scenario.includes('minimum')?[item,reduced]
  :scenario.includes('rounding')?[{...item,basePrice:0.04,price:0.04}]:[item];
 const standardDiscounts=scenario.includes('automatic')?[{id:'auto',isActive:true,discountName:'Automatisk rabat',discountType:'cart',discountMethod:'percentage',discountValue:scenario.includes('weaker')?5:20,minOrderValue:0}]:[];
 export function FixtureCart({children}) {
  const [includeBagFee,toggleBagFee]=React.useState(true);
  const [deliveryType,setDeliveryTypeState]=React.useState(scenario.startsWith('managed-')?'delivery':'pickup');
  const [cartReady,setCartReady]=React.useState(true);
  const setDeliveryType=type=>{setCartReady(false);setDeliveryTypeState(type);setTimeout(()=>setCartReady(true),50);};
  const [items,setItems]=React.useState(initialItems),[discount,setDiscount]=React.useState(scenario==='ui-newsletter-conflict'?{id:'stronger',applicationType:'code',discountType:'percentage',discountValue:20,code:'SAVE20'}:null);
  React.useEffect(()=>{window.replaceFixtureItems=setItems;},[]);
  const addToCart=React.useCallback((product,q,t,basePrice,price)=>setItems(old=>[...old,{...item,...product,cartItemId:product.id,basePrice,price}]),[]);
  const applyDiscount=React.useCallback(d=>setDiscount(d),[]),removeDiscount=React.useCallback(()=>setDiscount(null),[]);
  const setCartContext=React.useCallback(()=>{},[]);
  const [selectedTime,setSelectedTime]=React.useState(scenario.startsWith('managed-schedule-')?'2026-10-30T10:50:00.000Z':'asap');
  const saveCartForCheckout=React.useCallback(id=>{if(window.storageUnavailable)throw Error('storage denied');window.savedCheckout=id;},[]);
  const total=items.reduce((sum,i)=>sum+i.price*i.quantity,0);
  const bagFee=includeBagFee?brand.bagFee:0;
  const totals=basketTotals({cartItems:items,appliedDiscount:discount,standardDiscounts,deliveryType:'pickup',location,brand,includeBagFee});
  const value={brand,location,cartReady,cartItems:items,subtotal:total,checkoutTotal:total+bagFee,cartTotal:total,itemCount:items.length,includeBagFee,toggleBagFee,standardDiscounts,
   deliveryType,setDeliveryType,selectedTime,itemDiscount:0,cartDiscount:null,voucherDiscount:discount?.applicationType==='newsletter_signup'?{name:'Nyhedsbrev',amount:10}:null,deliveryFee:0,bagFee,adminFee:0,vatAmount:20,
   applyDiscount,removeDiscount,appliedDiscount:discount,setCartContext,setSelectedTime,saveCartForCheckout,addToCart,removeFromCart:id=>setItems(items=>items.filter(i=>i.cartItemId!==id)),
   ...(newsletter?{...totals,cartDiscount:totals.automaticCartDiscount}:{})};
  return React.createElement(context.Provider,{value},children);
 }
 export const useCart=()=>React.useContext(context);
 `);
 const actions=fixture('actions',`
 import {scenario} from ${JSON.stringify(settings)};
 export const getDiscountCardCheckoutEnabledAction=async()=>scenario.startsWith('ui-card');
 export const getDiscountCardCheckoutOfferAction=async(brand,slug,location,email)=>{window.cardPreviewCalls=window.cardPreviewCalls||[];window.cardPreviewCalls.push(email);if(window.holdCardPreview)await new Promise(resolve=>{window.cardPreviewRequests=window.cardPreviewRequests||[];window.cardPreviewRequests.push({email,resolve});});return scenario.startsWith('ui-card-preview')?{name:email,percentage:25}:scenario.startsWith('ui-card')&&email==='test@example.test'?{name:'Familie',percentage:25}:null;};
 export const newsletterSyncAvailableAction=async()=>true;
 export const getCheckoutSignupAction=async()=>scenario.startsWith('ui-club-card')&&( !scenario.includes('refresh') || window.fixtureActiveCard)?{mode:'none',clubSignupSuppressed:true}:scenario.startsWith('ui-club')&&!scenario.includes('personal-newsletter')?{mode:'club',clubProgram:{active:true,name:'Fixture Club',consentText:'Ja tak, send mig nyhedsbrevet fra Fixture Club.',consentHelp:scenario.includes('consent-layout')?'Medlemskab af Fixture Club kræver tilmelding til vores nyhedsbrev. Læs mere om, hvordan vi behandler dine oplysninger, i vores privatlivspolitik (https://www.esmeraldapizza.dk/privatlivspolitik).':'Medlemskab kræver nyhedsbrevet.',termsAccept:'Jeg accepterer Club-vilkårene.',consentVersion:'club-consent-1',termsVersion:'club-terms-1',campaignVersion:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',welcomeStamps:1,termsUrl:'/brand/club/vilkaar'}}:{mode:'newsletter'};
 export const getNewsletterSignupDiscountAction=async(brand,location,subtotal,method,email)=>scenario.startsWith('ui-club')?{id:'club',applicationType:'club_signup',discountType:'percentage',discountValue:15,minOrderValue:0,allowStacking:false,requiresSignup:!scenario.includes('personal')}:scenario.startsWith('ui-newsletter')&&email!=='existing@example.test'?{id:'n',applicationType:'newsletter_signup',discountType:'percentage',discountValue:10,minOrderValue:scenario.includes('minimum')?150:0,allowStacking:scenario.includes('stacking-on')}:null;
 export async function requestManagedDeliveryQuoteAction(input){window.quoteInputs=window.quoteInputs||[];window.quoteInputs.push(input);if(window.holdQuote)await new Promise(resolve=>{window.releaseQuote=resolve;});return scenario==='managed-unavailable'?{ok:false,code:'delivery_unavailable'}:{ok:true,quoteId:'quote-fixture',quoteToken:'a'.repeat(64),checkoutFingerprint:'b'.repeat(64),customerFeeMinor:3500,checkoutTotalMinor:13500,currency:'DKK',deliveryInterval:scenario==='managed-eta'?{earliest:'2026-10-30T12:40:00Z',latest:'2026-10-30T12:50:00Z'}:null,expiresAtMs:Date.now()+120000};}
 export async function validateDiscountAction(){if(scenario==='managed-discount')return {success:true,discount:{id:'code-discount',applicationType:'code',discountType:'percentage',discountValue:10,code:'TEST10',isActive:true}};throw Error('discount network failed');}
 export async function createStripeCheckoutSessionAction(...args){
  window.checkoutArguments=args;
  if(window.optionalActionQueueBusy)return new Promise(()=>{});
  if(scenario==='transport-failure')throw Error('response lost');
  return fetch('/session?case='+scenario,{method:'POST',body:JSON.stringify(args)}).then(r=>r.json());
 }
 `);
 const upsells=fixture('upsells',`
 import {scenario} from ${JSON.stringify(settings)};
 export async function getActiveUpsellForCart({excludedUpsellIds}){
  if(excludedUpsellIds.includes('u'))return null;
  if(scenario==='upsell-error')throw Error('upsell unavailable');
  if(scenario==='upsell-timeout'){window.optionalActionQueueBusy=true;return new Promise(()=>{});}
  if(scenario==='upsell-qa209')return {upsell:{id:'u',upsellName:'Andre købte også',discountType:'percentage',discountValue:10},products:[{id:'drink',productName:'Drink',price:20}]};
  if(scenario.startsWith('upsell-'))return {upsell:{id:'u',upsellName:'Extra drink',discountType:'none'},products:[{id:'drink',productName:'Drink',price:20}]};
  return null;
 }
 export async function incrementUpsellConversion(){window.optionalActionQueueBusy=true;return new Promise(()=>{});}
 `);
 const navigation=fixture('navigation',`export const useParams=()=>({brandSlug:'brand',locationSlug:'location'});export const useRouter=()=>({push:url=>window.location.assign(url)});const params=new URLSearchParams();export const useSearchParams=()=>params;export const usePathname=()=>'/brand/location/checkout';`);
 const entry=fixture('entry',`
 import React from 'react';import {createRoot} from 'react-dom/client';
 import {CheckoutClient} from ${JSON.stringify(path.join(root,'src/components/checkout/checkout-client.tsx'))};
 import {DesktopCart} from ${JSON.stringify(path.join(root,'src/components/cart/desktop-cart.tsx'))};
 import {MobileFloatingCart} from ${JSON.stringify(path.join(root,'src/components/cart/mobile-floating-cart.tsx'))};
 import {AnalyticsProvider} from ${JSON.stringify(path.join(root,'src/context/analytics-context.tsx'))};
 import {StorefrontCatalog} from ${JSON.stringify(path.join(root,'src/context/storefront-catalog.tsx'))};
 import {StorefrontV2Provider} from ${JSON.stringify(path.join(root,'src/context/storefront-v2-context.tsx'))};
 import {DeliveryPriceProvider} from ${JSON.stringify(path.join(root,'src/context/delivery-price-context.tsx'))};
 import {FixtureCart,brand,location} from ${JSON.stringify(cart)};
 const menu=new URLSearchParams(window.location.search).get('view')==='menu';
 const surface=menu?React.createElement(React.Fragment,null,React.createElement(DesktopCart),React.createElement(MobileFloatingCart)):React.createElement(CheckoutClient,{brand,location,managedDeliveryEnabled:new URLSearchParams(window.location.search).get('case')?.startsWith('managed-')});
 const scenario=new URLSearchParams(window.location.search).get('case')||'';
 const v2=scenario.startsWith('v2-')||new URLSearchParams(window.location.search).get('v2')==='1';
 const schedule=scenario.startsWith('managed-schedule-')?{...(scenario==='managed-schedule-inherited'?{}:{scheduleMode:'manual'}),enabled:true,paused:false,timezone:'Europe/Copenhagen',preparationMinutes:20,weeklyHours:Array.from({length:7},(_,day)=>({day,intervals:day===(scenario!=='managed-schedule-valid'?3:5)?[{startMinute:660,endMinute:1260}]:[]})),exceptions:[]}:null;
 const scheduledSurface=React.createElement(DeliveryPriceProvider,{managed:scenario.startsWith('managed-'),schedule},surface);
 const content=new URLSearchParams(window.location.search).get('case')==='upsell-qa209'?React.createElement(StorefrontCatalog,{products:[{id:'drink',productName:'Drink',price:20}],combos:[]},scheduledSurface):scheduledSurface;
 createRoot(document.getElementById('root')).render(React.createElement(FixtureCart,null,React.createElement(AnalyticsProvider,{brand},React.createElement(StorefrontV2Provider,{enabled:v2},v2?React.createElement('div',{'data-commerce-root':true,'data-brand-slug':'esmeralda','data-storefront-version':'2'},React.createElement('div',{className:'container mx-auto py-8 flex-1 max-w-[1140px] px-4'},content)):content))));
 `);
 const loader=fixture('ts-loader',`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=function(source){if(process.env.CHECKOUT_BASELINE&&this.resourcePath.startsWith(${JSON.stringify(root)}+'/src/'))source=require('node:child_process').execFileSync('git',['show',process.env.CHECKOUT_BASELINE+':'+require('node:path').relative(${JSON.stringify(root)},this.resourcePath)],{cwd:${JSON.stringify(root)},encoding:'utf8'});return ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;};`);
 const aliases={
  '@':path.join(root,'src'),
  '@/context/cart-context':cart,
  '@/app/checkout/actions':actions,
  '@/app/superadmin/upsells/actions':upsells,
  '@/app/superadmin/brands/actions':fixture('brands','export const getBrandBySlug=async()=>null;'),
  '@/app/superadmin/settings/actions':fixture('settings','export const getActiveStripeKey=async()=>"pk_test_fixture";'),
  '@stripe/stripe-js':fixture('stripe-js','export const loadStripe=()=>Promise.resolve(null);'),
  '@stripe/react-stripe-js':fixture('stripe-elements','export const Elements=({children})=>children;'),
  '@/lib/analytics':fixture('telemetry',`import {statisticsAllowed,trackingConsent,trackClientEvent as track} from ${JSON.stringify(path.join(root,'src/lib/analytics.ts'))};export {statisticsAllowed,trackingConsent};export const trackClientEvent=(...args)=>{if(window.telemetryUnavailable)throw Error('analytics denied');return track(...args);};`),
  '@/hooks/use-toast':fixture('toast','const toast=()=>{};export const useToast=()=>({toast});'),
  '@/app/superadmin/locations/client-actions':fixture('times',`export const calculateTimeSlots=()=>({asap_pickup:'Today - 18:20',asap_delivery:'Today - 18:40',pickup_times:['Today - 18:20'],delivery_times:['Today - 18:40']});`),
  'next/navigation':navigation,
  'next/image':fixture('image',`import React from 'react';export default function Image({fill,priority,...props}){return React.createElement('img',props);}`),
  'next/link':fixture('link',`import React from 'react';export default function Link(props){return React.createElement('a',props);}`),
 };
 // Specific aliases must precede the generic @ prefix.
 delete aliases['@'];aliases['@']=path.join(root,'src');
 await new Promise((resolve,reject)=>webpackModule.webpack({mode:'development',plugins:[new webpackModule.webpack.DefinePlugin({'process.env.NEXT_PUBLIC_RELEASE_SHA':JSON.stringify('local')})],devtool:false,entry,output:{path:dir,filename:'bundle.js'},resolve:{alias:aliases,extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules'),'node_modules']},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:[loader]},{test:/\.css$/,use:[fixture('css-loader','module.exports=function(){return "";}')]}]}}).run((err,stats)=>err?reject(err):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
 const css=(await require('postcss')([require('tailwindcss')({...loadTs('tailwind.config.ts',{'tailwindcss-animate':{default:require('tailwindcss-animate')}}).default,content:[path.join(root,'src/**/*.{ts,tsx}')]})]).process(fs.readFileSync(path.join(root,'src/app/globals.css'),'utf8'),{from:undefined})).css+'\n'+fs.readFileSync(path.join(root,'src/styles/commerce-ui.css'),'utf8')+'\n'+fs.readFileSync(path.join(root,'src/styles/storefront-v2.css'),'utf8')+'\n'+fs.readFileSync(path.join(root,'src/styles/storefront-v2-checkout.css'),'utf8')+'\n'+fs.readFileSync(path.join(root,'src/styles/storefront-v2.css'),'utf8');
 server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');res.setHeader('Cache-Control','no-store');
  if(url.pathname==='/style.css'){res.setHeader('Content-Type','text/css');return res.end(css);}
  if(url.pathname==='/bundle.js'){res.setHeader('Content-Type','application/javascript');return res.end(fs.readFileSync(path.join(dir,'bundle.js')));}
  if(url.pathname==='/api/delivery/price-preview'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({ok:true,baseFeeMinor:3500,currency:'DKK',minimumMinor:0,freeMinimumMinor:null,routingSource:'geoapify',routeReceipt:'server-route-receipt'}));}
  if(url.pathname==='/api/public/upsell'){
   let raw='';for await(const chunk of req)raw+=chunk;const input=JSON.parse(raw);
   const eligible=input.cartItems.some(item=>item.id==='pizza')&&!input.excludedUpsellIds.includes('u');
   res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(eligible?{upsell:{id:'u',upsellName:'Andre købte også',discountType:'percentage',discountValue:10},products:[{id:'drink',productName:'Drink',price:20}]}:null));
  }
  if(url.pathname==='/session'||url.pathname==='/api/checkout/session'){
   let raw='';for await(const chunk of req)raw+=chunk;
   const key=url.searchParams.get('case')||new URL(req.headers.referer).searchParams.get('case');const calls=requests.get(key)||[];const attemptKey=req.headers['idempotency-key'];const repeated=attemptKeys.has(attemptKey);if(!attemptKey||!attemptKeys.has(attemptKey)){calls.push(JSON.parse(raw));requests.set(key,calls);attemptKeys.add(attemptKey);}
   if(key==='transport-failure'||(key==='lost-response'&&!repeated)){req.socket.destroy();return;}
   if(key==='pending'&&!repeated){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({success:false,pending:true,retryable:false}));}
   if(key==='double-click')await new Promise(resolve=>setTimeout(resolve,250));
   res.setHeader('Content-Type','application/json');
   if(key==='retry'&&calls.length===1)return res.end(JSON.stringify({success:false,error:'Payment temporarily unavailable. Please try again.',retryable:true}));
   if(key==='identity-message')return res.end(JSON.stringify({success:false,error:CUSTOMER_IDENTITY_CHECKOUT_MESSAGE,retryable:true}));
   if(key==='uncertain')return res.end(JSON.stringify({success:false,error:'Please contact the restaurant. Reference: ORD-TEST.',retryable:false}));
   return res.end(JSON.stringify({success:true,url:origin+'/stripe?case='+key,orderId:'ORD-TEST'}));
  }
  if(url.pathname==='/stripe')return res.end('Hosted payment fixture');
  if(url.pathname==='/fonts/inter/inter-latin-wght-normal.woff2'){res.setHeader('Content-Type','font/woff2');return res.end(fs.readFileSync(path.join(root,'public/fonts/inter/inter-latin-wght-normal.woff2')));}
  if(url.pathname==='/image.png'){res.setHeader('Content-Type','image/svg+xml');return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><rect width="160" height="160" fill="#303532"/><circle cx="80" cy="80" r="66" fill="#c7954e"/><circle cx="80" cy="80" r="57" fill="#b1462a"/><circle cx="80" cy="80" r="51" fill="#e5bd67"/><g fill="#9b3425"><circle cx="55" cy="53" r="12"/><circle cx="101" cy="51" r="12"/><circle cx="80" cy="87" r="12"/><circle cx="49" cy="106" r="12"/><circle cx="112" cy="104" r="12"/></g></svg>');}
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script>');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,...(process.env.CART_CHROMIUM_PATH?{executablePath:process.env.CART_CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--use-gl=angle','--use-angle=swiftshader']});
});
after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));if(dir)fs.rmSync(dir,{recursive:true,force:true});});
async function setup(t,scenario,email='test@example.test',options={}){
 const v2=scenario.startsWith('v2-')||options.v2;
 const context=await browser.newContext({viewport:{width:scenario.includes('mobile')?390:1280,height:900}});t.after(()=>context.close());const page=await context.newPage();page.setDefaultTimeout(5000);page.setDefaultNavigationTimeout(5000);const errors=[];
 page.on('pageerror',e=>errors.push(e.message));t.after(()=>assert.deepEqual(errors,[]));
 if(scenario==='storage')await page.addInitScript(()=>{window.storageUnavailable=true;Object.defineProperty(window,'sessionStorage',{get(){throw Error('storage denied');}});});
 if(scenario==='telemetry')await page.addInitScript(()=>{window.telemetryUnavailable=true;});
 if(scenario==='cookie')await context.addCookies([{name:'orderfly_attribution',value:'%7Binvalid',url:origin}]);
 if(scenario.startsWith('managed-schedule-'))await page.clock.setFixedTime(new Date('2026-10-30T08:45:00.000Z'));
 if(scenario==='managed-future')await page.clock.setFixedTime(new Date('2026-10-27T22:00:00.000Z'));
 await page.goto(origin+'/?case='+scenario+(options.v2?'&v2=1':''));
 await page.getByPlaceholder(v2?'Indtast dit navn':'John Doe',{exact:true}).waitFor().catch(async error=>{
  t.diagnostic(JSON.stringify({body:await page.locator('body').innerText(),errors}));throw error;
 });
 await page.getByPlaceholder(v2?'Indtast dit navn':'John Doe',{exact:true}).fill('Test Customer');
 await page.getByPlaceholder(v2?'Indtast e-mail':'john@example.com',{exact:true}).fill(email);
 await page.getByPlaceholder(v2?'Indtast mobilnummer':'+123456789',{exact:true}).fill('12345678');
 await page.locator('.commerce-terms').getByRole('checkbox').first().check();
 return page;
}
const pay=page=>page.getByRole('button',{name:/Gå til betaling/}).first().click();
for(const scenario of ['success','lost-response','pending','upsell-error','upsell-timeout','storage','telemetry','cookie'])test(`${scenario}: valid Gå til betaling reaches hosted payment`,async t=>{
 const page=await setup(t,scenario);await pay(page);await page.waitForURL('**/stripe?*');assert.equal(requests.get(scenario).length,1);
});
test('two immediate submissions create only one payment request',async t=>{
 const page=await setup(t,'double-click');await page.locator('form').evaluate(form=>{form.requestSubmit();form.requestSubmit();});
 await page.waitForURL('**/stripe?*');assert.equal(requests.get('double-click').length,1);
});
test('terms checkbox and pay button keep their element while the customer types, so a tap is never lost',async t=>{
 const page=await setup(t,'success-mobile');
 const terms=page.getByRole('checkbox',{name:/Jeg accepterer|I accept the/}).last();
 const before=await terms.elementHandle(),payButton=await page.getByRole('button',{name:/Gå til betaling/}).last().elementHandle();
 await page.getByPlaceholder('John Doe',{exact:true}).fill('Test Customer Again');
 const newsletter=page.getByRole('checkbox',{name:/Få nyheder og tilbud/}).first();
 await newsletter.check();await newsletter.uncheck();
 assert.equal(await before.evaluate(node=>node.isConnected),true,'the checkbox was remounted');
 assert.equal(await payButton.evaluate(node=>node.isConnected),true,'the pay button was remounted');
 assert.equal(await terms.getAttribute('aria-checked'),'true');
});
test('invalid email is visibly rejected; correcting it allows payment',async t=>{
 const page=await setup(t,'invalid');await page.getByPlaceholder('john@example.com').fill('invalid');await pay(page);
 await page.getByText('Kontrollér de markerede felter, før du går til betaling.').first().waitFor();assert.equal(requests.has('invalid'),false);
 await page.getByPlaceholder('john@example.com').fill('valid@example.test');await pay(page);await page.waitForURL('**/stripe?*');
});
test('discount transport failure unlocks checkout',async t=>{
 const page=await setup(t,'discount');await page.getByText('Har du en rabatkode?',{exact:true}).click();await page.getByPlaceholder('Indtast rabatkode').fill('SAVE10');await page.getByRole('button',{name:'Anvend',exact:true}).click();
 await page.getByText('Rabatten kunne ikke kontrolleres. Prøv igen.').waitFor();await page.getByRole('button',{name:'OK',exact:true}).click();
 await pay(page);await page.waitForURL('**/stripe?*');
});
test('confirmed server rejection shows a persistent error and supports retry',async t=>{
 const page=await setup(t,'retry');await pay(page);await page.getByText('Payment temporarily unavailable. Please try again.').first().waitFor();
 await pay(page);await page.waitForURL('**/stripe?*');assert.equal(requests.get('retry').length,2);
});
test('customer identity conflict is shown as an actionable Danish checkout error',async t=>{
 const page=await setup(t,'identity-message');await pay(page);
 await page.getByText(CUSTOMER_IDENTITY_CHECKOUT_MESSAGE).first().waitFor();
 assert.equal((requests.get('identity-message')||[]).length,1);
 assert.equal(await page.getByRole('button',{name:/Gå til betaling/}).first().isDisabled(),false);
 assert.equal((await page.locator('body').innerText()).includes('Customer identity scope conflict'),false);
});
for(const scenario of ['uncertain','transport-failure'])test(`${scenario}: never silently starts another payment`,async t=>{
 const page=await setup(t,scenario);await pay(page);await page.getByText(/contact the restaurant|Kontakt restauranten/).first().waitFor();
 assert.equal(await page.getByRole('button',{name:/Gå til betaling/}).first().isDisabled(),true);
 await page.locator('form').evaluate(form=>form.requestSubmit());assert.equal((requests.get(scenario)||[]).length,1);
});
test('#71 configured upsell never inserts a payment dialog or changes the basket on submit',async t=>{
 const page=await setup(t,'upsell-skip');await pay(page);await page.waitForURL('**/stripe?*');
 assert.equal(requests.get('upsell-skip').length,1);assert.equal(requests.get('upsell-skip')[0][0].length,1);
});

// Presentation changes must preserve the actual payment and bag opt-out behavior.
for (const [surface,index] of [['desktop',0],['mobile',1]]) test(`presentation: ${surface} payment button resumes the same session without an extra link`,async t=>{
 const scenario='presentation-resume-'+surface;
 const page=await setup(t,scenario);
 await page.route('**/stripe?*',route=>route.abort('aborted'));
 const firstNavigation=page.waitForEvent('requestfailed',req=>req.url().includes('/stripe?'));
 await page.getByRole('button',{name:/Gå til betaling/}).first().click();await firstNavigation;
 assert.equal(requests.get(scenario).length,1);
 assert.equal(requests.get(scenario)[0][5].bagFee,4);
 assert.equal(await page.getByRole('link',{name:'Continue to payment',exact:true}).count(),0);
 assert.equal(await page.getByPlaceholder('John Doe',{exact:true}).isDisabled(),true);
 assert.equal(await page.getByRole('checkbox',{name:/Jeg accepterer|I accept the/}).first().isDisabled(),true);
 assert.equal(await page.getByRole('button',{name:'Ændr tidspunkt',exact:true}).isDisabled(),true);
 for(const row of await page.getByText('Pose',{exact:true}).filter({visible:true}).all())assert.equal(await row.locator('..').getByRole('button').isDisabled(),true);
 await page.unroute('**/stripe?*');
 await page.getByRole('button',{name:/Gå til betaling/}).first().click();
 await page.waitForURL('**/stripe?*');assert.equal(requests.get(scenario).length,1);
});
test('presentation: menu desktop, mobile drawer and floating amount exclude bag; checkout shows it and supports removal',async t=>{
 const page=await setup(t,'presentation-bag');
 await page.goto(origin+'/?case=presentation-bag&view=menu');
 await page.getByText('Din kurv',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:/Til kassen/}).isEnabled(),true);
 assert.match(await page.getByText('Foreløbigt beløb',{exact:true}).locator('..').textContent(),/100,00 kr\./);
 await page.setViewportSize({width:390,height:900});
 const floating=page.getByRole('button',{name:/Se kurv/});
 assert.match(await floating.textContent(),/100,00 kr\./);await floating.click();
 const drawer=page.getByRole('dialog');
 assert.match(await drawer.getByText('Foreløbigt beløb',{exact:true}).locator('..').textContent(),/100,00 kr\./);
 assert.equal(await drawer.getByText('Pose',{exact:true}).count(),0);
 await page.goto(origin+'/?case=presentation-bag');
 await page.getByText('Pose',{exact:true}).first().waitFor();
 assert.match(await page.getByRole('button',{name:/Gå til betaling/}).first().textContent(),/104,00 kr\./);
 await page.getByText('Pose',{exact:true}).first().locator('..').getByRole('button').click();
 await page.getByRole('button',{name:'Ja, fjern',exact:true}).click();
 assert.equal(await page.getByText('Pose',{exact:true}).count(),0);
 assert.match(await page.getByRole('button',{name:/Gå til betaling/}).first().textContent(),/100,00 kr\./);
});

test('Tilbage til menuen is available with a nonempty cart and preserves restaurant and fulfillment in the route',async t=>{
 const page=await setup(t,'back-to-menu');
 const back=page.getByRole('link',{name:'Tilbage til menuen',exact:true});
 assert.equal(await back.getAttribute('href'),'/brand/location?deliveryMethod=pickup');
 await back.click();await page.waitForURL('**/brand/location?deliveryMethod=pickup');
 assert.equal(requests.has('back-to-menu'),false);
});

for(const surface of ['desktop','mobile'])for(const failure of ['error','timeout'])test(`P1 menu ${surface}: upsell ${failure} still opens checkout without starting payment`,async t=>{
 const scenario='upsell-'+failure;
 const page=await setup(t,'menu-setup-'+surface+'-'+failure);
 await page.goto(origin+'/?case='+scenario+'&view=menu');
 if(surface==='mobile') {
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:/Se kurv/}).click();
  await page.getByRole('dialog').getByRole('button',{name:/Til kassen/}).click();
 } else await page.getByRole('button',{name:/Til kassen/}).first().click();
 await page.waitForURL('**/brand/location/checkout');
 assert.equal(requests.has('menu-setup-'+surface+'-'+failure),false);
});

test('#71 newsletter highlights the available benefit while explicit consent stays unchecked',async t=>{
 const page=await setup(t,'ui-newsletter');const card=page.locator('.commerce-newsletter');
 await card.getByText('Få 10% ved tilmelding',{exact:true}).waitFor();
 const consent=card.getByRole('checkbox');assert.equal(await consent.isChecked(),false);assert.equal(await card.getAttribute('data-newsletter-offer'),'true');
 await page.getByRole('button',{name:/Gå til betaling.*104,00/}).first().waitFor();
 await consent.check();await card.getByText(/Nyhedsbrevsrabat: 10,00.*trukket fra/).waitFor();
 await page.getByRole('button',{name:/Gå til betaling.*94,00/}).first().waitFor();
 await consent.uncheck();assert.equal(await card.getByText(/trukket fra denne ordre/).count(),0);
 await page.getByRole('button',{name:/Gå til betaling.*104,00/}).first().waitFor();
 const terms=page.locator('.commerce-terms').filter({visible:true}).first(),box=await terms.boundingBox(),check=await terms.getByRole('checkbox').boundingBox();assert.ok(box.height>=48.3);assert.ok(check.y>box.y);
 await consent.check();await pay(page);await page.waitForURL('**/stripe?*');const args=requests.get('ui-newsletter')[0],customer=args[1];assert.equal(customer.subscribeToNewsletter,true);assert.match(customer.newsletterConsentId,/^[a-f0-9-]{36}$/);assert.equal(customer.newsletterConsentVersion,'checkout-email-da-2026-09-28');
 assert.equal(args[5].discountTotal,10);assert.equal(args[5].bagFee,4);assert.equal(args[6],'n');
});
test('#71 newsletter opt-out before submit sends no grant and does not add a discount',async t=>{
 const page=await setup(t,'ui-newsletter-unchecked');const card=page.locator('.commerce-newsletter');
 await card.getByText('Få 10% ved tilmelding',{exact:true}).waitFor();await card.getByRole('checkbox').check();await card.getByRole('checkbox').uncheck();
 await pay(page);await page.waitForURL('**/stripe?*');const args=requests.get('ui-newsletter-unchecked')[0],customer=args[1];assert.equal(customer.subscribeToNewsletter,false);assert.equal(customer.newsletterConsentId,undefined);assert.equal(args[6],null);assert.equal(args[5].discountTotal,0);
});
test('#71 newsletter makes no extra saving promise with another applied discount',async t=>{
 const page=await setup(t,'ui-newsletter-conflict');const card=page.locator('.commerce-newsletter');
 await page.getByText('Rabatkode:').waitFor();await card.getByRole('checkbox').check();
 assert.equal(await card.getAttribute('data-newsletter-offer'),'false');assert.equal(await card.getByText(/trukket fra denne ordre/).count(),0);assert.equal(await card.getByText('Få nyheder og tilbud').count(),1);
 assert.match(await page.getByText(/Rabatkode:/).locator('..').textContent(),/SAVE20/);
});

for(const surface of ['desktop','mobile']) test(`newsletter feedback: screenshot's discounted basket stays 129 kr on ${surface} without a false promise`,async t=>{
 const scenario='ui-newsletter-all-discounted-'+surface,page=await setup(t,scenario),card=page.locator('.commerce-newsletter');
 await card.getByText(/Nyhedsbrevsrabatten giver 10% på varer uden anden rabat/).waitFor();
 assert.equal(await card.getByRole('checkbox').isChecked(),false);
 await card.getByRole('status').getByText(/ingen ekstra rabat/).waitFor();
 await card.getByRole('checkbox').check();
 await page.getByRole('button',{name:/Gå til betaling.*129,00/}).first().waitFor();
 assert.equal(await card.getByText(/trukket fra denne ordre/).count(),0);
 await pay(page);await page.waitForURL('**/stripe?*');const args=requests.get(scenario)[0];
 assert.equal(args[5].subtotal,185);assert.equal(args[5].discountTotal,60);assert.equal(args[5].bagFee,4);assert.equal(args[6],null);assert.equal(args[1].subscribeToNewsletter,true);
});

for(const scenario of ['ui-newsletter-mixed','ui-newsletter-automatic-weaker']) test(`newsletter feedback: ${scenario} lowers the total and payment payload`,async t=>{
 const page=await setup(t,scenario),card=page.locator('.commerce-newsletter');
 await card.getByText('Få 10% ved tilmelding',{exact:true}).waitFor();
 await card.getByRole('checkbox').check();await card.getByText(/Nyhedsbrevsrabat: 10,00.*trukket fra/).waitFor();
 await page.getByRole('button',{name:scenario.includes('mixed')?/Gå til betaling.*139,00/:/Gå til betaling.*94,00/}).first().waitFor();
 await pay(page);await page.waitForURL('**/stripe?*');const args=requests.get(scenario)[0];
 assert.equal(args[5].cartDiscountTotal,10);assert.equal(args[5].discountTotal,scenario.includes('mixed')?40:10);assert.equal(args[6],'n');
});

for(const scenario of ['ui-newsletter-minimum','ui-newsletter-automatic-stronger','ui-newsletter-rounding']) test(`newsletter feedback: ${scenario} never submits an unusable newsletter discount`,async t=>{
 const page=await setup(t,scenario),card=page.locator('.commerce-newsletter');
 await card.getByText(/Nyhedsbrevsrabatten giver 10%/).waitFor();
 if(scenario.includes('minimum'))await card.getByRole('status').getByText(/Du mangler 50,00/).waitFor();
 await card.getByRole('checkbox').check();
 assert.equal(await card.getAttribute('data-newsletter-offer'),'false');assert.equal(await card.getByText(/trukket fra denne ordre/).count(),0);
 await pay(page);await page.waitForURL('**/stripe?*');const args=requests.get(scenario)[0];
 assert.equal(args[6],null);assert.equal(args[5].discountTotal,scenario.includes('minimum')?30:scenario.includes('automatic')?20:0);
});

test('newsletter feedback: changing email revokes the saving and restores it only for an eligible email',async t=>{
 const page=await setup(t,'ui-newsletter-email'),card=page.locator('.commerce-newsletter');
 await card.getByText('Få 10% ved tilmelding',{exact:true}).waitFor();await card.getByRole('checkbox').check();
 await page.getByRole('button',{name:/Gå til betaling.*94,00/}).first().waitFor();
 await page.getByPlaceholder('john@example.com').fill('existing@example.test');
 await page.getByRole('button',{name:/Gå til betaling.*104,00/}).first().waitFor();
 assert.equal(await card.getByText(/trukket fra denne ordre/).count(),0);
 await page.getByPlaceholder('john@example.com').fill('new@example.test');
 await page.getByRole('button',{name:/Gå til betaling.*94,00/}).first().waitFor();
});

for(const enabled of [false,true])test(`newsletter stacking ${enabled?'on':'off'}: actual screenshot prices, checkbox and payment agree`,async t=>{
 const scenario='ui-newsletter-stacking-'+(enabled?'on':'off')+'-mobile';
 const page=await setup(t,scenario),card=page.locator('.commerce-newsletter');
 await card.getByText('Få 10% ved tilmelding',{exact:true}).waitFor();
 await card.getByText(enabled?/på alle varer efter varerabatter/:/på varer uden anden rabat/).waitFor();
 await page.getByRole('button',{name:/Gå til betaling.*166,25/}).first().waitFor();
 await card.getByRole('checkbox').check();
 await card.getByText(enabled?/Nyhedsbrevsrabat: 16,23/:/Nyhedsbrevsrabat: 4,50/).waitFor();
 await page.getByRole('button',{name:enabled?/Gå til betaling.*150,02/:/Gå til betaling.*161,75/}).first().waitFor();
 await card.getByRole('checkbox').uncheck();
 await page.getByRole('button',{name:/Gå til betaling.*166,25/}).first().waitFor();
 await card.getByRole('checkbox').check();await pay(page);await page.waitForURL('**/stripe?*');
 const args=requests.get(scenario)[0];assert.equal(args[5].subtotal,194);
 assert.equal(args[5].cartDiscountTotal,enabled?16.23:4.5);assert.equal(args[5].discountTotal,enabled?47.98:36.25);assert.equal(args[6],'n');
});

test('newsletter feedback: cart eligibility changes even when original subtotal stays unchanged',async t=>{
 const page=await setup(t,'ui-newsletter-cart'),card=page.locator('.commerce-newsletter');
 await card.getByText('Få 10% ved tilmelding',{exact:true}).waitFor();await card.getByRole('checkbox').check();
 await page.getByRole('button',{name:/Gå til betaling.*94,00/}).first().waitFor();
 await page.evaluate(()=>window.replaceFixtureItems(items=>items.map(item=>({...item,price:80}))));
 await card.getByRole('status').getByText(/ingen ekstra rabat/).waitFor();
 await page.getByRole('button',{name:/Gå til betaling.*84,00/}).first().waitFor();
 await pay(page);await page.waitForURL('**/stripe?*');const args=requests.get('ui-newsletter-cart')[0];
 assert.equal(args[6],null);assert.equal(args[5].discountTotal,20);
});

test('native mobile checkout supports autofill and hides sticky bar only for a focused keyboard',async t=>{
 const page=await setup(t,'native-mobile');
 await page.setViewportSize({width:390,height:900});
 await page.addInitScript(()=>{
  const viewport=new EventTarget();viewport.height=window.innerHeight;viewport.scale=1;
  Object.defineProperty(window,'visualViewport',{configurable:true,get:()=>viewport});
  window.resizeTestViewport=(height,scale=1)=>{viewport.height=height;viewport.scale=scale;viewport.dispatchEvent(new Event('resize'));};
 });
 await page.reload();
 const name=page.getByPlaceholder('John Doe',{exact:true}),email=page.getByPlaceholder('john@example.com',{exact:true});
 await name.waitFor();
 assert.equal(await name.getAttribute('autocomplete'),'name');
 assert.equal(await email.getAttribute('autocomplete'),'email');
 assert.equal(await email.getAttribute('inputmode'),'email');
 assert.equal(await page.getByPlaceholder('+123456789').getAttribute('inputmode'),'tel');
 assert.equal(await name.evaluate(node=>getComputedStyle(node).fontSize),'16px');
 await name.focus();await page.evaluate(()=>window.resizeTestViewport(430));
 await page.waitForFunction(()=>document.querySelector('form').dataset.keyboardOpen==='true');
 assert.equal(await page.locator('.commerce-checkout-bar').isVisible(),false);
 await page.evaluate(()=>window.resizeTestViewport(900));
 await page.waitForFunction(()=>document.querySelector('form').dataset.keyboardOpen==='false');
 assert.equal(await page.locator('.commerce-checkout-bar').isVisible(),true);
 await page.evaluate(()=>window.resizeTestViewport(430,2));
 assert.equal(await page.locator('form').getAttribute('data-keyboard-open'),'false','pinch zoom does not hide the bar');
 await name.blur();await page.evaluate(()=>window.resizeTestViewport(430));
 assert.equal(await page.locator('form').getAttribute('data-keyboard-open'),'false','viewport change without editing is harmless');
 assert.equal(requests.has('native-mobile'),false);
});

for(const width of [390,1280])test(`#71 lab: click to payment with a hanging optional upsell lookup (${width})`,async t=>{
 const page=await setup(t,'upsell-timeout');await page.setViewportSize({width,height:900});const started=Date.now();await page.getByRole('button',{name:/Gå til betaling|Complete Order/}).filter({visible:true}).first().click();await page.waitForURL('**/stripe?*');
 const elapsed=Date.now()-started;console.log('LAB_OPTIONAL_UPSELL_PAYMENT_'+width+'_MS='+elapsed);
 if(!process.env.CHECKOUT_BASELINE)assert.ok(elapsed<1500,'payment does not await the optional 2s timeout');
});

test('#123 late checkout consent and payment click retain location context',async t=>{
 const page=await setup(t,'funnel-consent');const events=[];
 await page.route('**/api/analytics/collect',async route=>{events.push(route.request().postDataJSON());await route.fulfill({status:204});});
 await page.evaluate(()=>{localStorage.setItem('orderfly_cookie_consent',JSON.stringify({statistics:true}));window.dispatchEvent(new Event('orderfly:consent'));});
 const {expect}=require('@playwright/test');
 await expect.poll(()=>events.filter(e=>e.name==='start_checkout').length).toBe(1);
 await page.getByPlaceholder('John Doe',{exact:true}).fill('Another Test Customer');
 assert.equal(events.filter(e=>e.name==='start_checkout').length,1);
 await pay(page);await page.waitForURL('**/stripe?*');
 await expect.poll(()=>events.filter(e=>e.name==='click_purchase').length).toBe(1);
 for(const e of events.filter(e=>['start_checkout','click_purchase'].includes(e.name))){assert.equal(e.params.locationId,'l');assert.equal(e.params.brandId,'b');assert.ok(e.params.sessionId);}
});

// QA209 deliberately never clicks payment or submits customer/consent data.
for(const width of [390,1280])for(const enabled of [false,true])test(`QA209 cart-only combo newsletter ${enabled} at ${width}`,async t=>{
 const scenario='ui-newsletter-combo-qa209-stacking-'+(enabled?'on':'off')+'-'+width;
 const page=await setup(t,scenario,'okh2071@gmail.com');await page.setViewportSize({width,height:1000});
 const card=page.locator('.commerce-newsletter');
 if(enabled)await card.getByText('Få 10% ved tilmelding',{exact:true}).waitFor();
 await card.getByRole('checkbox').check();
 await page.getByRole('button',{name:enabled?/Gå til betaling.*107,50/:/Gå til betaling.*119,00/}).first().waitFor();
 if(process.env.QA_OUTPUT_DIR){fs.mkdirSync(process.env.QA_OUTPUT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.QA_OUTPUT_DIR,`newsletter-combo-${enabled}-${width}.png`),fullPage:true});}
 await card.getByRole('checkbox').uncheck();
 await page.getByRole('button',{name:/Gå til betaling.*119,00/}).first().waitFor();
 assert.equal(requests.get(scenario)?.length||0,0);
});

test('QA209 cart-only upsell offer price, add, remove and dismiss never start checkout',async t=>{
 const context=await browser.newContext({viewport:{width:1280,height:900}});t.after(()=>context.close());
 const page=await context.newPage();page.setDefaultTimeout(5000);const errors=[];page.on('pageerror',e=>errors.push(e.message));t.after(()=>assert.deepEqual(errors,[]));
 await page.goto(origin+'/?case=upsell-qa209&view=menu');
 const offer=page.getByRole('region',{name:'Anbefalet til din ordre'}).first();
 await offer.getByText('18,00 kr.',{exact:true}).waitFor();
 await offer.getByRole('button',{name:'Tilføj Drink',exact:true}).click();
 const line=page.locator('[data-cart-line="drink"]').first();await line.waitFor();
 assert.match(await line.innerText(),/18,00 kr/);
 await line.getByRole('button',{name:'Fjern Drink',exact:true}).click();await line.waitFor({state:'detached'});
 await offer.getByRole('button',{name:'Skjul anbefaling',exact:true}).click();await offer.waitFor({state:'hidden'});
 assert.deepEqual(errors,[]);assert.equal(requests.get('upsell-qa209')?.length||0,0);
});

for (const width of ['desktop','mobile']) test(`Club signup ${width}: requires two unticked consents and discounts this order`,async t=>{
 const scenario='ui-club-new-'+width,page=await setup(t,scenario);
 const card=page.locator('[data-club-signup-offer]');await card.getByRole('heading',{name:/Bliv medlem af Fixture Club og få 15%/}).waitFor();
 assert.equal(await page.locator('[data-newsletter-offer]').count(),0);
 const consent=card.getByRole('checkbox',{name:'Ja tak, send mig nyhedsbrevet fra Fixture Club.'});
 const terms=card.getByRole('checkbox',{name:'Jeg accepterer Club-vilkårene.'});
 assert.equal(await consent.isChecked(),false);assert.equal(await terms.isChecked(),false);
 await consent.check();assert.equal(await card.getByText(/trukket fra denne ordre/).count(),0);
 await pay(page);await card.getByText('Du skal acceptere Club-vilkårene for at blive medlem.').waitFor();assert.equal(requests.has(scenario),false);
 await terms.check();await card.getByText(/Club-rabat: 15,00.*trukket fra/).waitFor();
 assert.equal(await card.getByRole('link',{name:'Læs Club-vilkårene'}).getAttribute('href'),'/brand/club/vilkaar');
 await pay(page);await page.waitForURL('**/stripe?*');
 const args=requests.get(scenario)[0],customer=args[1];
 assert.equal(customer.subscribeToClub,true);assert.equal(customer.subscribeToNewsletter,true);assert.equal(customer.clubTermsAccepted,true);
 assert.equal(customer.clubConsentVersion,'club-consent-1');assert.equal(customer.clubTermsVersion,'club-terms-1');assert.equal(customer.clubCampaignVersion,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
 assert.equal(customer.newsletterConsentVersion,undefined);assert.equal(args[6],'club');assert.equal(args[5].discountTotal,15);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
});
test('existing personal Club right can be used beside newsletter signup without signing up to Club again',async t=>{
 const scenario='ui-club-personal-newsletter',page=await setup(t,scenario);
 const card=page.locator('[data-club-personal-offer]');await card.getByText('Brug din personlige Club-rabat').waitFor();
 assert.equal(await page.locator('[data-club-signup-offer]').count(),0);
 await page.getByRole('checkbox',{name:'Få nyheder og tilbud'}).waitFor();
 const use=card.getByRole('checkbox');assert.equal(await use.isChecked(),false);await use.check();
 await card.getByText(/Club-rabat: 15,00.*trukket fra/).waitFor();await pay(page);await page.waitForURL('**/stripe?*');
 const args=requests.get(scenario)[0];assert.equal(args[1].subscribeToClub,false);assert.equal(args[1].subscribeToNewsletter,false);assert.equal(args[6],'club');
});

for (const device of ['desktop','mobile']) test(`personal discount card ${device}: quote, summary and submitted total agree`,async t=>{
 const scenario='ui-card-'+device,page=await setup(t,scenario);
 await page.locator('[data-discount-card-offer]').waitFor();
 assert.match(await page.locator('[data-discount-card-offer]').innerText(),/25%/);
 assert.match(await page.getByRole('button',{name:/Gå til betaling/}).first().innerText(),/75,00/);
 const summary=page.getByText('I alt',{exact:true}).first().locator('..');
 assert.match(await summary.innerText(),/75,00/);
 await pay(page);await page.waitForURL('**/stripe?*');
 assert.equal(requests.get(scenario)[0][5].cartDiscountTotal,25);
 assert.equal(requests.get(scenario)[0][6],null);
});
test('personal discount card has same-origin login entry and clears benefit when contact changes',async t=>{
 const page=await setup(t,'ui-card-contact');await page.locator('[data-discount-card-offer]').waitFor();
 await page.getByPlaceholder('john@example.com').fill('other@example.test');
 const link=page.getByRole('link',{name:'Log ind i Club',exact:true});await link.waitFor();
 const href=await link.getAttribute('href');assert.ok(href.startsWith('/'));assert.ok(!href.startsWith('//'));assert.match(href,/club\/login\?returnTo=/);
 assert.equal(await page.locator('[data-discount-card-offer]').count(),0);
 assert.match(await page.getByRole('button',{name:/Gå til betaling/}).first().innerText(),/100,00/);
});
for(const host of ['orderfly.dk','brand.orderfly.dk'])test('personal card login respects browser origin '+host,async t=>{
 const context=await browser.newContext();t.after(()=>context.close());const page=await context.newPage();
 await page.route('http://'+host+'/**',async route=>{
  const url=new URL(route.request().url());const response=await route.fetch({url:origin+url.pathname+url.search});await route.fulfill({response});
 });
 await page.goto('http://'+host+'/?case=ui-card-origin');
 await page.getByPlaceholder('john@example.com').fill('other@example.test');
 if(host==='orderfly.dk'){
  const link=page.getByRole('link',{name:'Åbn brandets bestillingsside',exact:true});await link.waitFor();
  assert.equal(await link.getAttribute('href'),'https://brand.orderfly.dk/location');assert.equal(await link.getAttribute('target'),'_blank');
  assert.match(await page.locator('body').innerText(),/Din kurv bliver på denne side og overføres ikke/);
  assert.equal(await page.getByRole('link',{name:'Log ind i Club',exact:true}).count(),0);
 }else{
  const link=page.getByRole('link',{name:'Log ind i Club',exact:true});await link.waitFor();
  assert.equal(await link.getAttribute('href'),'/club/login?returnTo=%2Flocation%2Fcheckout');
  assert.equal(await page.getByRole('link',{name:'Åbn brandets bestillingsside',exact:true}).count(),0);
 }
 assert.match(await page.getByRole('button',{name:/Gå til betaling/}).first().innerText(),/100,00/);
});
for(const width of [390,1280])test('#596 active card hides Club completely and omits consent payload '+width,async t=>{
 const scenario='ui-club-card-'+width,page=await setup(t,scenario);await page.setViewportSize({width,height:900});
 assert.equal(await page.locator('[data-club-signup-offer]').count(),0);assert.equal(await page.locator('[data-club-personal-offer]').count(),0);
 await page.getByRole('button',{name:/Gå til betaling/}).first().click();await page.waitForURL('**/stripe?*');
 const customer=requests.get(scenario)[0][1];
 for(const key of ['subscribeToClub','clubTermsAccepted','clubConsentVersion','clubTermsVersion','clubCampaignVersion','useClubDiscount'])assert.equal(Object.hasOwn(customer,key),false,key);
 assert.equal(customer.subscribeToNewsletter,false);
});
test('#596 refreshed card clears previous Club opt-in and prevents stale consent submission',async t=>{
 const scenario='ui-club-card-refresh',page=await setup(t,scenario),box=page.locator('[data-club-signup-offer]');await box.waitFor();
 await box.getByRole('checkbox').nth(0).check();await box.getByRole('checkbox').nth(1).check();
 await page.evaluate(()=>{window.fixtureActiveCard=true;window.dispatchEvent(new Event('focus'));});await box.waitFor({state:'hidden'});
 await page.getByRole('button',{name:/Gå til betaling/}).first().click();await page.waitForURL('**/stripe?*');
 const customer=requests.get(scenario)[0][1];assert.equal(customer.subscribeToNewsletter,false);
 for(const key of ['subscribeToClub','clubTermsAccepted','clubConsentVersion','clubTermsVersion','clubCampaignVersion'])assert.equal(Object.hasOwn(customer,key),false,key);
});
async function fillDeliveryAddress(page){await page.getByLabel('Adresse',{exact:true}).fill('Testvej 1');await page.getByLabel('Postnummer',{exact:true}).fill('2300');await page.getByLabel('By',{exact:true}).fill('København');}
async function quoted(page){await expect.poll(()=>page.evaluate(()=>window.quoteInputs?.length||0)).toBeGreaterThan(0);await expect(page.getByRole('button',{name:/Gå til betaling/}).first()).toBeEnabled();}
test('managed checkout automatically displays server total and payment submits the exact visible capability',async t=>{
 const page=await setup(t,'managed-success');await page.locator('.commerce-terms').getByRole('checkbox').first().uncheck();await fillDeliveryAddress(page);
 await expect.poll(()=>page.evaluate(()=>window.quoteInputs?.length||0)).toBe(1);await expect(page.getByRole('button',{name:/Gå til betaling/}).first()).toBeDisabled();
 assert.equal(await page.evaluate(()=>window.quoteInputs[0].customerInfo.acceptTerms),false);await expect(page.getByRole('checkbox',{name:/Jeg accepterer leveringsprisen/})).toHaveCount(0);await expect(page.getByRole('button',{name:/Hent leveringspris|Opdater leveringspris|Vælg afhentning i stedet/})).toHaveCount(0);
 await expect(page.getByText('135,00',{exact:false}).first()).toBeVisible();assert.equal(requests.get('managed-success')?.length||0,0);
 await page.locator('.commerce-terms').getByRole('checkbox').first().check();await pay(page);await page.waitForURL('**/stripe?*');const args=requests.get('managed-success')[0];assert.equal(args.length,12);assert.equal(args[5].deliveryFee,35);assert.equal(args[11].customerFeeMinor,3500);assert.equal(args[11].checkoutTotalMinor,13500);assert.match(args[11].checkoutKey,/^[a-f0-9]{64}$/);assert.equal(args[11].quoteToken,'a'.repeat(64));
});
test('managed unavailable delivery blocks forced form submission and retains basket without redundant pickup CTA',async t=>{
 const page=await setup(t,'managed-unavailable');await fillDeliveryAddress(page);await expect(page.getByRole('alert')).toContainText('Vi kan ikke beregne leveringsprisen');await expect(page.getByRole('button',{name:/Gå til betaling/}).first()).toBeDisabled();await expect(page.getByRole('button',{name:'Vælg afhentning i stedet'})).toHaveCount(0);await page.locator('form').evaluate(form=>form.requestSubmit());await page.waitForTimeout(200);assert.equal(requests.get('managed-unavailable')?.length||0,0);assert.equal(await page.evaluate(()=>window.quoteInputs[0].cartItems.length),1);
});
test('managed invalid address sends no quote and cannot create payment',async t=>{
 const page=await setup(t,'managed-invalid');await page.getByLabel('Adresse',{exact:true}).fill('Testvej');await page.getByLabel('Postnummer',{exact:true}).fill('23');await page.getByLabel('By',{exact:true}).fill('København');await page.waitForTimeout(1000);assert.equal(await page.evaluate(()=>window.quoteInputs?.length||0),0);await expect(page.getByRole('button',{name:/Gå til betaling/}).first()).toBeDisabled();await page.locator('form').evaluate(form=>form.requestSubmit());assert.equal(requests.get('managed-invalid')?.length||0,0);
});
test('managed discount change automatically reprices before another payment',async t=>{
 const page=await setup(t,'managed-discount');await page.locator('details').filter({has:page.getByPlaceholder('Indtast rabatkode')}).locator('summary').click();await page.getByPlaceholder('Indtast rabatkode').fill('TEST10');await page.getByRole('button',{name:'Anvend',exact:true}).click();await expect(page.getByRole('button',{name:'Fjern rabatkode',exact:true})).toBeVisible();assert.equal(await page.evaluate(()=>window.quoteInputs?.length||0),0);
 await fillDeliveryAddress(page);await quoted(page);assert.equal(await page.evaluate(()=>window.quoteInputs.at(-1).appliedDiscountId),'code-discount');const count=await page.evaluate(()=>window.quoteInputs.length);await page.getByRole('button',{name:'Fjern rabatkode',exact:true}).click();await expect(page.getByRole('button',{name:/Gå til betaling/}).first()).toBeDisabled();await expect.poll(()=>page.evaluate(()=>window.quoteInputs.length)).toBe(count+1);await quoted(page);assert.equal(await page.evaluate(()=>window.quoteInputs.at(-1).appliedDiscountId),null);
});
test('managed instructions change revokes the previous price until automatic requote',async t=>{
 const page=await setup(t,'managed-instructions');const input=page.getByLabel('Leveringsinstruktioner (valgfrit)',{exact:true});await input.fill('Ring på ved bagdøren.');await fillDeliveryAddress(page);await quoted(page);assert.equal(await page.evaluate(()=>window.quoteInputs.at(-1).customerInfo.deliveryInstructions),'Ring på ved bagdøren.');await input.fill('Ring på ved hoveddøren.');await expect(page.getByRole('button',{name:/Gå til betaling/}).first()).toBeDisabled();await expect.poll(()=>page.evaluate(()=>window.quoteInputs.at(-1).customerInfo.deliveryInstructions)).toBe('Ring på ved hoveddøren.');await quoted(page);await pay(page);await page.waitForURL('**/stripe?*');assert.equal(requests.get('managed-instructions')[0][1].deliveryInstructions,'Ring på ved hoveddøren.');
});
test('closed kitchen sends the displayed next-day slot to automatic quote and payment',async t=>{
 const page=await setup(t,'managed-future');await expect(page.getByText('Forventet levering ca. ons. 28. okt. 12:40',{exact:true})).toBeVisible();await fillDeliveryAddress(page);await quoted(page);const selection=await page.evaluate(()=>window.quoteInputs.at(-1).deliveryTime);assert.equal(selection,'2026-10-28T11:40:00.000Z');await pay(page);await page.waitForURL('**/stripe?*');assert.equal(requests.get('managed-future')[0][9],selection);
});

test('managed form change in the same submit turn cannot reuse a previously displayed quote',async t=>{
 const page=await setup(t,'managed-submit-race');await fillDeliveryAddress(page);await quoted(page);
 await page.getByLabel('Adresse',{exact:true}).evaluate(input=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,'Andenvej 99');input.dispatchEvent(new Event('input',{bubbles:true}));input.form.requestSubmit();});
 await page.waitForTimeout(150);assert.equal(requests.get('managed-submit-race')?.length||0,0);await expect(page.getByRole('button',{name:/Gå til betaling/}).first()).toBeDisabled();
 await expect.poll(()=>page.evaluate(()=>window.quoteInputs.at(-1).customerInfo.street)).toBe('Andenvej 99');await quoted(page);await pay(page);await page.waitForURL('**/stripe?*');assert.equal(requests.get('managed-submit-race')[0][1].street,'Andenvej 99');
});

// V2 changes presentation/payment handoff only; requests retain the existing contract.
test('V2 mobile checkout has no payment selector and hands online payment to hosted provider',async t=>{
 const page=await setup(t,'v2-success-mobile');
 await expect(page.locator('form[data-storefront-version="2"]')).toHaveCount(1);
 await expect(page.locator('input[name="paymentMethod"]')).toHaveCount(0);
 await expect(page.getByText('Betal ved afhentning',{exact:true})).toHaveCount(0);
 const button=page.getByRole('button',{name:/Gå til betaling/}).last();
 await expect(button).toBeVisible();
 await expect(button).toHaveCSS('background-color','rgb(232, 191, 105)');
 await expect(page.locator('form[data-storefront-version="2"]')).toHaveCSS('background-color','rgb(17, 20, 19)');
 await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
 const box=await button.boundingBox();assert.ok(box.y>=0&&box.y+box.height<=900,'payment CTA stays in viewport');
 await pay(page);await page.waitForURL('**/stripe?*');
 assert.equal(requests.get('v2-success-mobile').length,1);
 assert.equal(requests.get('v2-success-mobile')[0][1].paymentMethod,'online');
});
test('V2 rejects invalid contact details before contacting hosted payment',async t=>{
 const page=await setup(t,'v2-invalid-mobile');
 await page.getByPlaceholder('Indtast e-mail').fill('invalid');await pay(page);
 await expect(page.getByText('Indtast en gyldig e-mailadresse',{exact:true})).toBeVisible();
 await expect(page.getByRole('alert').filter({visible:true})).toContainText('Kontrollér de markerede felter');
 assert.equal(requests.has('v2-invalid-mobile'),false);
});
test('V2 never silently enables online payment when merchant disables it',async t=>{
 const page=await setup(t,'v2-offline-mobile');
 await expect(page.getByText('Online betaling er ikke tilgængelig hos restauranten lige nu. Kontakt restauranten for at bestille.')).toBeVisible();
 await expect(page.locator('input[name="paymentMethod"]')).toHaveCount(0);
 await expect(page.getByRole('button',{name:/Gå til betaling/}).first()).toBeDisabled();
 await page.locator('form').evaluate(form=>form.requestSubmit());
 await page.waitForTimeout(100);assert.equal(requests.has('v2-offline-mobile'),false);
});

for (const width of [320,390]) test(`V2 checkout layout keeps the payment action visible and contact fields readable at ${width}px`,async t=>{
 const page=await setup(t,'v2-layout-mobile-'+width);await page.setViewportSize({width,height:844});
 await page.evaluate(()=>window.scrollTo(0,0));await page.mouse.move(0,0);
 await expect(page.getByRole('heading',{name:'Checkout',exact:true})).toBeVisible();
 const cta=page.locator('.commerce-checkout-bar button[type="submit"]');
 const initial=await cta.boundingBox();assert.ok(initial.x>=12&&initial.x+initial.width<=width-12);
 assert.ok(initial.y>=0&&initial.y+initial.height<=844);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'checkout has no horizontal overflow');
 assert.ok(await page.getByPlaceholder('Indtast dit navn').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=16),'contact input avoids mobile zoom');
 if(process.env.CHECKOUT_SCREENSHOT_DIR){fs.mkdirSync(process.env.CHECKOUT_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.CHECKOUT_SCREENSHOT_DIR,`checkout-${width}-initial.png`)});}
 await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
 const scrolled=await cta.boundingBox();assert.equal(scrolled.y,initial.y);
 if(process.env.CHECKOUT_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.CHECKOUT_SCREENSHOT_DIR,`checkout-${width}-scrolled.png`)});
 assert.equal(requests.has('v2-layout-mobile-'+width),false,'visual check creates no payment');
});


test('managed Friday closure blocks a saved Friday choice and the actual picker offers no Friday slots',async t=>{
 const page=await setup(t,'managed-schedule-closed');
 await fillDeliveryAddress(page);
 await expect(page.getByRole('alert')).toContainText('Det valgte tidspunkt er ikke tilgængeligt for levering');
 await expect(page.getByRole('button',{name:/Gå til betaling/}).first()).toBeDisabled();
 await page.waitForTimeout(900);assert.equal(await page.evaluate(()=>window.quoteInputs?.length||0),0);
 await page.getByRole('button',{name:'Ændr tidspunkt',exact:true}).click();
 const dialog=page.getByRole('dialog');await expect(dialog.getByRole('button',{name:'Gem tidspunkt'})).toBeDisabled();
 await dialog.getByRole('combobox',{name:'Tidspunkt'}).click();
 const old=page.getByRole('option',{name:'fre. 30. okt. 11:50 (ikke længere ledigt)',exact:true});await expect(old).toBeDisabled();
 await expect(page.getByRole('option',{name:'fre. 30. okt. 12:05',exact:true})).toHaveCount(0);
 await expect(page.getByRole('option',{name:'Hurtigst muligt (ons. 4. nov. 11:50)',exact:true})).toBeEnabled();
});
test('before opening actual picker changes valid Friday 11:50 to 12:05 and automatically requotes payment',async t=>{
 const page=await setup(t,'managed-schedule-valid');
 await expect(page.getByText('Forventet levering ca. fre. 30. okt. 11:50',{exact:true})).toBeVisible();
 await fillDeliveryAddress(page);await quoted(page);
 assert.equal(await page.evaluate(()=>window.quoteInputs.at(-1).deliveryTime),'2026-10-30T10:50:00.000Z');
 await page.getByRole('button',{name:'Ændr tidspunkt',exact:true}).click();
 await page.evaluate(()=>{window.holdQuote=true;});
 const dialog=page.getByRole('dialog');await dialog.getByRole('combobox',{name:'Tidspunkt'}).click();
 await page.getByRole('option',{name:'fre. 30. okt. 12:05',exact:true}).click();
 await dialog.getByRole('button',{name:'Gem tidspunkt'}).click();
 await expect(page.getByRole('button',{name:/Gå til betaling/}).first()).toBeDisabled();
 await expect.poll(()=>page.evaluate(()=>window.quoteInputs?.at(-1).deliveryTime)).toBe('2026-10-30T11:05:00.000Z');
 await expect(page.getByRole('button',{name:/Gå til betaling/}).first()).toBeDisabled();
 await page.evaluate(()=>{window.holdQuote=false;window.releaseQuote();});
 await quoted(page);await pay(page);await page.waitForURL('**/stripe?*');
 assert.equal(requests.get('managed-schedule-valid')[0][9],'2026-10-30T11:05:00.000Z');
});

test('valid provider ETA replaces default in the single checkout time field before payment',async t=>{
 const page=await setup(t,'managed-eta');await fillDeliveryAddress(page);await quoted(page);
 await expect(page.getByText('Forventet levering ca. 30.10.2026, 13.50',{exact:true})).toBeVisible();
 await expect(page.getByText(/Forventet levering/)).toHaveCount(1);
 await expect(page.getByText(/13.40.*13.50/)).toHaveCount(0);
});


test('actual checkout announces delivery pricing immediately on completed address without stealing city focus',async t=>{
 const page=await setup(t,'managed-loading');await page.clock.install();await page.evaluate(()=>window.holdQuote=true);await fillDeliveryAddress(page);
 const popup=page.getByRole('dialog',{name:'Henter leveringsprisen…'});await expect(popup).toBeVisible();await expect(page.getByLabel('By',{exact:true})).toBeFocused();assert.equal(await page.evaluate(()=>window.quoteInputs?.length||0),0);
 await page.clock.runFor(300);await expect(popup).toHaveCount(0);await page.clock.runFor(300);await expect.poll(()=>page.evaluate(()=>window.quoteInputs?.length||0)).toBe(1);await expect(page.getByRole('button',{name:/Gå til betaling/}).first()).toBeDisabled();
 await page.evaluate(()=>window.releaseQuote());await expect(popup).toHaveCount(0);await expect(page.getByRole('button',{name:/Gå til betaling/}).first()).toBeEnabled();
});

test('address pricing starts before contact details while courier confirmation waits',async t=>{
 const page=await setup(t,'managed-missing-contact');await page.getByPlaceholder('john@example.com',{exact:true}).fill('');await page.clock.install();await fillDeliveryAddress(page);
 await expect(page.getByText('Udfyld navn, e-mail og mobilnummer for at bekræfte leveringen.',{exact:true})).toBeVisible();await expect(page.getByRole('dialog',{name:'Henter leveringsprisen…'})).toBeVisible();await page.clock.runFor(1000);await expect(page.getByRole('dialog',{name:'Henter leveringsprisen…'})).toHaveCount(0);assert.equal(await page.evaluate(()=>window.quoteInputs?.length||0),0);
 await page.getByPlaceholder('john@example.com',{exact:true}).fill('test@example.test');await expect(page.getByRole('dialog',{name:'Henter leveringsprisen…'})).toHaveCount(0);await expect(page.getByPlaceholder('john@example.com',{exact:true})).toBeFocused();
});


test('email benefit preview validates and debounces typing without enqueuing partial addresses',async t=>{
 const page=await setup(t,'ui-card-preview-debounce');await page.locator('[data-discount-card-offer]').waitFor();await page.clock.install();await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now()+1000)));await page.evaluate(()=>window.cardPreviewCalls=[]);
 const email=page.getByPlaceholder('john@example.com',{exact:true});
 for(const value of ['t','test@','test@example']){await email.fill(value);await page.clock.runFor(400);assert.equal(await page.evaluate(()=>window.cardPreviewCalls.length),0);await expect(page.locator('[data-discount-card-offer]')).toHaveCount(0);}
 await email.fill('first@example.test');await page.clock.runFor(100);await email.fill('latest@example.test');await page.clock.runFor(200);assert.equal(await page.evaluate(()=>window.cardPreviewCalls.length),0);await page.clock.runFor(100);
 await expect(page.locator('[data-discount-card-offer]')).toContainText('latest@example.test');assert.deepEqual(await page.evaluate(()=>window.cardPreviewCalls),['latest@example.test']);
});

test('email benefit preview serializes stale lookups and coalesces latest contact plus focus refresh',async t=>{
 const page=await setup(t,'ui-card-preview-queue');await page.locator('[data-discount-card-offer]').waitFor();await page.clock.install();await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now()+1000)));await page.evaluate(()=>{window.cardPreviewCalls=[];window.holdCardPreview=true;});
 const email=page.getByPlaceholder('john@example.com',{exact:true});await email.fill('first@example.test');await expect(page.locator('[data-discount-card-offer]')).toHaveCount(0);await page.clock.runFor(300);await expect.poll(()=>page.evaluate(()=>window.cardPreviewCalls.length)).toBe(1);
 await email.fill('second@example.test');await page.clock.runFor(400);await email.fill('latest@example.test');await page.clock.runFor(400);await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('focus'));});await page.clock.runFor(400);assert.deepEqual(await page.evaluate(()=>window.cardPreviewCalls),['first@example.test']);
 await page.evaluate(()=>window.cardPreviewRequests[0].resolve());await expect.poll(()=>page.evaluate(()=>window.cardPreviewCalls.length)).toBe(2);assert.deepEqual(await page.evaluate(()=>window.cardPreviewCalls),['first@example.test','latest@example.test']);await expect(page.locator('[data-discount-card-offer]')).toHaveCount(0);
 await page.evaluate(()=>window.cardPreviewRequests[1].resolve());await expect(page.locator('[data-discount-card-offer]')).toContainText('latest@example.test');await page.clock.runFor(400);assert.equal(await page.evaluate(()=>window.cardPreviewCalls.length),2);
 await page.evaluate(()=>{window.holdCardPreview=false;window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('focus'));});await page.clock.runFor(300);await expect.poll(()=>page.evaluate(()=>window.cardPreviewCalls.length)).toBe(3);await expect(page.locator('[data-discount-card-offer]')).toContainText('latest@example.test');
});

test('missing schedule mode inherits restaurant Friday despite old Wednesday-only delivery hours',async t=>{
 const page=await setup(t,'managed-schedule-inherited');
 await expect(page.getByText('Forventet levering ca. fre. 30. okt. 11:50',{exact:true})).toBeVisible();
 await fillDeliveryAddress(page);await quoted(page);
 assert.equal(await page.evaluate(()=>window.quoteInputs.at(-1).deliveryTime),'2026-10-30T10:50:00.000Z');
 await expect(page.getByRole('button',{name:/Gå til betaling/}).first()).toBeEnabled();
});
test('address price is visible before contact details and courier confirmation, but never permits payment',async t=>{
 const page=await setup(t,'managed-preview');await page.getByLabel('E-mail',{exact:true}).fill('');
 await page.evaluate(()=>window.holdQuote=true);await fillDeliveryAddress(page);
 await expect(page.getByText('Leveringsprisen er beregnet. Vi bekræfter nu leveringen, før du kan betale.')).toBeVisible();
 await expect(page.getByText('35,00 kr.',{exact:true}).filter({visible:true}).first()).toBeVisible();assert.equal(await page.evaluate(()=>window.quoteInputs?.length||0),0);
 await page.getByLabel('E-mail',{exact:true}).fill('test@example.test');await expect.poll(()=>page.evaluate(()=>window.quoteInputs?.length||0)).toBe(1);
 await expect(page.getByRole('button',{name:/Gå til betaling/}).first()).toBeDisabled();
 assert.equal(await page.evaluate(()=>window.quoteInputs.at(-1).routeReceipt),'server-route-receipt');
 await page.evaluate(()=>window.releaseQuote());await quoted(page);
});

// Exercise the production consent markup with real checkout CSS, including the
// long privacy URL from the mobile report. No order or payment is submitted.
for (const mode of ['newsletter', 'club', 'club-personal']) {
 for (const [width, scale, v2] of [[320,1,true],[390,1,true],[320,2,true],[390,2,true],[1280,1,true],[320,1,false]]) {
  test(`consent layout: ${mode}, ${width}px, ${scale}x text, V${v2?2:1} stays inside its card`, async t => {
   const scenario=`ui-${mode}-consent-layout-${width}-${scale}-${v2}`;
   const page=await setup(t,scenario,'test@example.test',{v2});
   await page.setViewportSize({width,height:900});
   const card=page.locator('.commerce-newsletter');
   await card.waitFor();
   if(mode==='club-personal') await card.getByText('Brug din personlige Club-rabat',{exact:true}).waitFor();
   if(mode==='club') await card.getByText(/https:\/\/www.esmeraldapizza.dk\/privatlivspolitik/).waitFor();
   if(scale!==1) await card.evaluate((node,multiplier)=>{
    // Increase each text element from its rendered size, including the V2 label
    // sizes expressed in px, to model accessibility text enlargement.
    const elements=[node,...node.querySelectorAll('h3,p,label,a,span')];
    const sizes=elements.map(element=>parseFloat(getComputedStyle(element).fontSize));
    elements.forEach((element,i)=>element.style.fontSize=`${sizes[i]*multiplier}px`);
   },scale);
   const geometry=await card.evaluate(node=>{
    const card=node.getBoundingClientRect(),style=getComputedStyle(node);
    const left=card.left+parseFloat(style.paddingLeft),right=card.right-parseFloat(style.paddingRight);
    const overflows=[];const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);
    while(walker.nextNode()){
     if(!walker.currentNode.textContent.trim())continue;
     const range=document.createRange();range.selectNodeContents(walker.currentNode);
     for(const rect of range.getClientRects()) if(rect.width&&rect.height&&(rect.left<left-1||rect.right>right+1))overflows.push(walker.currentNode.textContent);
    }
    return {overflows,left:card.left,right:card.right,viewport:innerWidth,scrollWidth:node.scrollWidth,clientWidth:node.clientWidth,overflow:getComputedStyle(node).overflow};
   });
   assert.deepEqual(geometry.overflows,[],'all consent text, including privacy URL, wraps inside the card padding');
   assert.ok(geometry.left>=-1&&geometry.right<=geometry.viewport+1,JSON.stringify(geometry));
   assert.ok(geometry.scrollWidth<=geometry.clientWidth+1,'card has no horizontal overflow');
   assert.ok(!['hidden','clip'].includes(geometry.overflow),'text remains visible rather than being clipped');
   const checks=card.getByRole('checkbox');
   assert.equal(await checks.count(),mode==='club'?2:1);
   for(const checkbox of await checks.all()){
    assert.equal(await checkbox.isChecked(),false,'consent is never preselected');
    const box=await checkbox.boundingBox();assert.ok(box.width>=15&&box.height>=15,'checkbox does not shrink');
    await checkbox.check();assert.equal(await checkbox.isChecked(),true);
    await checkbox.uncheck();assert.equal(await checkbox.isChecked(),false);
   }
   if(mode==='club')assert.equal(await card.getByRole('link',{name:'Læs Club-vilkårene'}).getAttribute('href'),'/brand/club/vilkaar');
   assert.equal(requests.has(scenario),false);
  });
 }
}
