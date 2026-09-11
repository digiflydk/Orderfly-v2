// Only the changed checkout flow, locally in Chromium. Production React form,
// validation, UI, analytics provider and upsell dialog; external I/O is simulated.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('@playwright/test');
const {loadTs}=require('../helpers/load-ts.cjs');
const webpackModule=require('next/dist/compiled/webpack/webpack');
webpackModule.init();
let dir,server,browser,origin;
const requests=new Map();const attemptKeys=new Set();
const root=process.cwd();
const brand={id:'b',slug:'brand',name:'Fixture',bagFee:0,vatPercentage:25};
const location={id:'l',slug:'location',brandId:'b',name:'Fixture',city:'Hellerup',minOrder:0,isActive:true,deliveryTypes:['pickup','delivery'],allowPreOrder:true,prep_time:20,delivery_time:20,openingHours:Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day=>[day,{isOpen:true,open:'12:00',close:'22:00'}]))};
function fixture(name,content){const file=path.join(dir,name+'.js');fs.writeFileSync(file,content);return file;}
before(async()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'checkout-browser-'));
 const settings=fixture('scenario',`export const scenario=new URLSearchParams(window.location.search).get('case')||'success';`);
 const cart=fixture('cart',`
 import React from 'react';
 import {basketTotals} from ${JSON.stringify(path.join(root,'src/lib/basket-totals.ts'))};
 const scenario=new URLSearchParams(window.location.search).get('case')||'success';
 const presentation=scenario.startsWith('presentation');
 const newsletter=scenario.startsWith('ui-newsletter');
 export const brand={...${JSON.stringify(brand)},bagFee:presentation||newsletter?4:0}, location=${JSON.stringify(location)};
 const context=React.createContext(null);
 const item={id:'pizza',cartItemId:'pizza',productName:'Pizza',quantity:1,basePrice:100,price:100,toppings:[],itemType:'product',imageUrl:'/image.png'};
 const reduced={...item,id:'offer',cartItemId:'offer',basePrice:75,price:45};
 const initialItems=scenario.includes('stacking')?[{...item,basePrice:89,price:59,toppings:[{id:'chicken',name:'Kylling',price:15},{id:'base',name:'Napolitansk',price:10}]},{...item,id:'fries',cartItemId:'fries',basePrice:45,price:45},{...item,id:'soda',cartItemId:'soda',basePrice:35,price:33.25}]
  :scenario.includes('all-discounted')?[{...reduced,toppings:[{id:'extra',name:'Tilvalg',price:35}]},{...reduced,id:'second',cartItemId:'second'}]
  :scenario.includes('mixed')||scenario.includes('minimum')?[item,reduced]
  :scenario.includes('rounding')?[{...item,basePrice:0.04,price:0.04}]:[item];
 const standardDiscounts=scenario.includes('automatic')?[{id:'auto',isActive:true,discountName:'Automatisk rabat',discountType:'cart',discountMethod:'percentage',discountValue:scenario.includes('weaker')?5:20,minOrderValue:0}]:[];
 export function FixtureCart({children}) {
  const [includeBagFee,toggleBagFee]=React.useState(true);
  const [items,setItems]=React.useState(initialItems),[discount,setDiscount]=React.useState(scenario==='ui-newsletter-conflict'?{id:'stronger',applicationType:'code',discountType:'percentage',discountValue:20,code:'SAVE20'}:null);
  React.useEffect(()=>{window.replaceFixtureItems=setItems;},[]);
  const addToCart=React.useCallback((product,q,t,basePrice,price)=>setItems(old=>[...old,{...item,...product,cartItemId:product.id,basePrice,price}]),[]);
  const applyDiscount=React.useCallback(d=>setDiscount(d),[]),removeDiscount=React.useCallback(()=>setDiscount(null),[]);
  const setCartContext=React.useCallback(()=>{},[]),setSelectedTime=React.useCallback(()=>{},[]);
  const saveCartForCheckout=React.useCallback(id=>{if(window.storageUnavailable)throw Error('storage denied');window.savedCheckout=id;},[]);
  const total=items.reduce((sum,i)=>sum+i.price*i.quantity,0);
  const bagFee=includeBagFee?brand.bagFee:0;
  const totals=basketTotals({cartItems:items,appliedDiscount:discount,standardDiscounts,deliveryType:'pickup',location,brand,includeBagFee});
  const value={brand,location,cartReady:true,cartItems:items,subtotal:total,checkoutTotal:total+bagFee,cartTotal:total,itemCount:items.length,includeBagFee,toggleBagFee,standardDiscounts,
   deliveryType:'pickup',selectedTime:'asap',itemDiscount:0,cartDiscount:null,voucherDiscount:discount?.applicationType==='newsletter_signup'?{name:'Nyhedsbrev',amount:10}:null,deliveryFee:0,bagFee,adminFee:0,vatAmount:20,
   applyDiscount,removeDiscount,appliedDiscount:discount,setCartContext,setSelectedTime,saveCartForCheckout,addToCart,
   ...(newsletter?{...totals,cartDiscount:totals.automaticCartDiscount}:{})};
  return React.createElement(context.Provider,{value},children);
 }
 export const useCart=()=>React.useContext(context);
 `);
 const actions=fixture('actions',`
 import {scenario} from ${JSON.stringify(settings)};
 export const getNewsletterSignupDiscountAction=async(brand,location,subtotal,method,email)=>scenario.startsWith('ui-newsletter')&&email!=='existing@example.test'?{id:'n',applicationType:'newsletter_signup',discountType:'percentage',discountValue:10,minOrderValue:scenario.includes('minimum')?150:0,allowStacking:scenario.includes('stacking-on')}:null;
 export async function validateDiscountAction(){throw Error('discount network failed');}
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
 import {FixtureCart,brand,location} from ${JSON.stringify(cart)};
 const menu=new URLSearchParams(window.location.search).get('view')==='menu';
 createRoot(document.getElementById('root')).render(React.createElement(FixtureCart,null,React.createElement(AnalyticsProvider,{brand},menu?React.createElement(React.Fragment,null,React.createElement(DesktopCart),React.createElement(MobileFloatingCart)):React.createElement(CheckoutClient,{brand,location}))));
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
  '@/lib/analytics':fixture('telemetry',`export const statisticsAllowed=()=>false;export const trackClientEvent=()=>{if(window.telemetryUnavailable)throw Error('analytics denied');};`),
  '@/hooks/use-toast':fixture('toast','const toast=()=>{};export const useToast=()=>({toast});'),
  '@/app/superadmin/locations/client-actions':fixture('times',`export const calculateTimeSlots=()=>({asap_pickup:'Today - 18:20',asap_delivery:'Today - 18:40',pickup_times:['Today - 18:20'],delivery_times:['Today - 18:40']});`),
  [path.join(root,'src/components/checkout/timeslot-dialog')]:fixture('time-dialog','export const TimeSlotDialog=()=>null;'),
  'next/navigation':navigation,
  'next/image':fixture('image',`import React from 'react';export default function Image({fill,priority,...props}){return React.createElement('img',props);}`),
  'next/link':fixture('link',`import React from 'react';export default function Link(props){return React.createElement('a',props);}`),
 };
 // Specific aliases must precede the generic @ prefix.
 delete aliases['@'];aliases['@']=path.join(root,'src');
 await new Promise((resolve,reject)=>webpackModule.webpack({mode:'development',devtool:false,entry,output:{path:dir,filename:'bundle.js'},resolve:{alias:aliases,extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules'),'node_modules']},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:[loader]}]}}).run((err,stats)=>err?reject(err):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
 const css=(await require('postcss')([require('tailwindcss')({...loadTs('tailwind.config.ts',{'tailwindcss-animate':{default:require('tailwindcss-animate')}}).default,content:[path.join(root,'src/**/*.{ts,tsx}')]})]).process(fs.readFileSync(path.join(root,'src/app/globals.css'),'utf8'),{from:undefined})).css+'\n'+fs.readFileSync(path.join(root,'src/styles/commerce-ui.css'),'utf8');
 server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');res.setHeader('Cache-Control','no-store');
  if(url.pathname==='/style.css'){res.setHeader('Content-Type','text/css');return res.end(css);}
  if(url.pathname==='/bundle.js'){res.setHeader('Content-Type','application/javascript');return res.end(fs.readFileSync(path.join(dir,'bundle.js')));}
  if(url.pathname==='/session'||url.pathname==='/api/checkout/session'){
   let raw='';for await(const chunk of req)raw+=chunk;
   const key=url.searchParams.get('case')||new URL(req.headers.referer).searchParams.get('case');const calls=requests.get(key)||[];const attemptKey=req.headers['idempotency-key'];const repeated=attemptKeys.has(attemptKey);if(!attemptKey||!attemptKeys.has(attemptKey)){calls.push(JSON.parse(raw));requests.set(key,calls);attemptKeys.add(attemptKey);}
   if(key==='transport-failure'||(key==='lost-response'&&!repeated)){req.socket.destroy();return;}
   if(key==='pending'&&!repeated){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({success:false,pending:true,retryable:false}));}
   if(key==='double-click')await new Promise(resolve=>setTimeout(resolve,250));
   res.setHeader('Content-Type','application/json');
   if(key==='retry'&&calls.length===1)return res.end(JSON.stringify({success:false,error:'Payment temporarily unavailable. Please try again.',retryable:true}));
   if(key==='uncertain')return res.end(JSON.stringify({success:false,error:'Please contact the restaurant. Reference: ORD-TEST.',retryable:false}));
   return res.end(JSON.stringify({success:true,url:origin+'/stripe?case='+key,orderId:'ORD-TEST'}));
  }
  if(url.pathname==='/stripe')return res.end('Hosted payment fixture');
  if(url.pathname==='/image.png'){res.statusCode=204;return res.end();}
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script>');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,...(process.env.CART_CHROMIUM_PATH?{executablePath:process.env.CART_CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--use-gl=angle','--use-angle=swiftshader']});
});
after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));if(dir)fs.rmSync(dir,{recursive:true,force:true});});
async function setup(t,scenario){
 const context=await browser.newContext({viewport:{width:scenario.includes('mobile')?390:1280,height:900}});t.after(()=>context.close());const page=await context.newPage();page.setDefaultTimeout(5000);page.setDefaultNavigationTimeout(5000);const errors=[];
 page.on('pageerror',e=>errors.push(e.message));t.after(()=>assert.deepEqual(errors,[]));
 if(scenario==='storage')await page.addInitScript(()=>{window.storageUnavailable=true;Object.defineProperty(window,'sessionStorage',{get(){throw Error('storage denied');}});});
 if(scenario==='telemetry')await page.addInitScript(()=>{window.telemetryUnavailable=true;});
 if(scenario==='cookie')await context.addCookies([{name:'orderfly_attribution',value:'%7Binvalid',url:origin}]);
 await page.goto(origin+'/?case='+scenario);
 await page.getByPlaceholder('John Doe',{exact:true}).fill('Test Customer');
 await page.getByPlaceholder('john@example.com',{exact:true}).fill('test@example.test');
 await page.getByPlaceholder('+123456789',{exact:true}).fill('12345678');
 await page.getByRole('checkbox',{name:/Jeg accepterer|I accept the/}).first().check();
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
 await consent.check();await pay(page);await page.waitForURL('**/stripe?*');const args=requests.get('ui-newsletter')[0],customer=args[1];assert.equal(customer.subscribeToNewsletter,true);assert.match(customer.newsletterConsentId,/^[a-f0-9-]{36}$/);assert.equal(customer.newsletterConsentVersion,'checkout-email-da-2026-09-08');
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
