// Only the changed checkout flow, locally in Chromium. Production React form,
// validation, UI, analytics provider and upsell dialog; external I/O is simulated.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('@playwright/test');
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
 const scenario=new URLSearchParams(window.location.search).get('case')||'success';
 const presentation=scenario.startsWith('presentation');
 export const brand={...${JSON.stringify(brand)},bagFee:presentation?4:0}, location=${JSON.stringify(location)};
 const context=React.createContext(null);
 const item={id:'pizza',cartItemId:'pizza',productName:'Pizza',quantity:1,basePrice:100,price:100,toppings:[],itemType:'product',imageUrl:'/image.png'};
 export function FixtureCart({children}) {
  const [includeBagFee,toggleBagFee]=React.useState(true);
  const [items,setItems]=React.useState([item]),[discount,setDiscount]=React.useState(scenario==='ui-newsletter-conflict'?{id:'stronger',applicationType:'automatic',discountType:'percentage',discountValue:20,code:'SAVE20'}:null);
  const addToCart=React.useCallback((product,q,t,basePrice,price)=>setItems(old=>[...old,{...item,...product,cartItemId:product.id,basePrice,price}]),[]);
  const applyDiscount=React.useCallback(d=>setDiscount(d),[]),removeDiscount=React.useCallback(()=>setDiscount(null),[]);
  const setCartContext=React.useCallback(()=>{},[]),setSelectedTime=React.useCallback(()=>{},[]);
  const saveCartForCheckout=React.useCallback(id=>{if(window.storageUnavailable)throw Error('storage denied');window.savedCheckout=id;},[]);
  const total=items.reduce((sum,i)=>sum+i.price*i.quantity,0);
  const bagFee=includeBagFee?brand.bagFee:0;
  const value={brand,location,cartReady:true,cartItems:items,subtotal:total,checkoutTotal:total+bagFee,cartTotal:total,itemCount:items.length,includeBagFee,toggleBagFee,
   deliveryType:'pickup',selectedTime:'asap',itemDiscount:0,cartDiscount:null,voucherDiscount:null,deliveryFee:0,bagFee,adminFee:0,vatAmount:20,
   applyDiscount,removeDiscount,appliedDiscount:discount,setCartContext,setSelectedTime,saveCartForCheckout,addToCart};
  return React.createElement(context.Provider,{value},children);
 }
 export const useCart=()=>React.useContext(context);
 `);
 const actions=fixture('actions',`
 import {scenario} from ${JSON.stringify(settings)};
 export const getNewsletterSignupDiscountAction=async()=>scenario.startsWith('ui-newsletter')?{id:'n',applicationType:'newsletter_signup',discountType:'percentage',discountValue:10,minOrderValue:0}:null;
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
 const css=(await require('postcss')([require('tailwindcss')({content:[path.join(root,'src/**/*.{ts,tsx}')],theme:{extend:{}},plugins:[]})]).process('@tailwind base;@tailwind components;@tailwind utilities;',{from:undefined})).css+'\n'+fs.readFileSync(path.join(root,'src/styles/commerce-ui.css'),'utf8');
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
 const context=await browser.newContext();t.after(()=>context.close());const page=await context.newPage();page.setDefaultTimeout(5000);page.setDefaultNavigationTimeout(5000);const errors=[];
 page.on('pageerror',e=>errors.push(e.message));t.after(()=>assert.deepEqual(errors,[]));
 if(scenario==='storage')await page.addInitScript(()=>{window.storageUnavailable=true;Object.defineProperty(window,'sessionStorage',{get(){throw Error('storage denied');}});});
 if(scenario==='telemetry')await page.addInitScript(()=>{window.telemetryUnavailable=true;});
 if(scenario==='cookie')await context.addCookies([{name:'orderfly_attribution',value:'%7Binvalid',url:origin}]);
 await page.goto(origin+'/?case='+scenario);
 await page.getByPlaceholder('John Doe',{exact:true}).fill('Test Customer');
 await page.getByPlaceholder('john@example.com',{exact:true}).fill('test@example.test');
 await page.getByPlaceholder('+123456789',{exact:true}).fill('12345678');
 await page.getByRole('checkbox',{name:/I accept the/}).first().check();
 return page;
}
const pay=page=>page.getByRole('button',{name:/Complete Order/}).first().click();
for(const scenario of ['success','lost-response','pending','upsell-error','upsell-timeout','storage','telemetry','cookie'])test(`${scenario}: valid Complete Order reaches hosted payment`,async t=>{
 const page=await setup(t,scenario);await pay(page);await page.waitForURL('**/stripe?*');assert.equal(requests.get(scenario).length,1);
});
test('two immediate submissions create only one payment request',async t=>{
 const page=await setup(t,'double-click');await page.locator('form').evaluate(form=>{form.requestSubmit();form.requestSubmit();});
 await page.waitForURL('**/stripe?*');assert.equal(requests.get('double-click').length,1);
});
test('invalid email is visibly rejected; correcting it allows payment',async t=>{
 const page=await setup(t,'invalid');await page.getByPlaceholder('john@example.com').fill('invalid');await pay(page);
 await page.getByText('Please check the highlighted fields before continuing to payment.').first().waitFor();assert.equal(requests.has('invalid'),false);
 await page.getByPlaceholder('john@example.com').fill('valid@example.test');await pay(page);await page.waitForURL('**/stripe?*');
});
test('discount transport failure unlocks checkout',async t=>{
 const page=await setup(t,'discount');await page.getByPlaceholder('Enter discount code').fill('SAVE10');await page.getByRole('button',{name:'Apply',exact:true}).click();
 await page.getByText('Discount could not be checked. Please try again.').waitFor();await page.getByRole('button',{name:'OK',exact:true}).click();
 await pay(page);await page.waitForURL('**/stripe?*');
});
test('confirmed server rejection shows a persistent error and supports retry',async t=>{
 const page=await setup(t,'retry');await pay(page);await page.getByText('Payment temporarily unavailable. Please try again.').first().waitFor();
 await pay(page);await page.waitForURL('**/stripe?*');assert.equal(requests.get('retry').length,2);
});
for(const scenario of ['uncertain','transport-failure'])test(`${scenario}: never silently starts another payment`,async t=>{
 const page=await setup(t,scenario);await pay(page);await page.getByText(/contact the restaurant/).first().waitFor();
 assert.equal(await page.getByRole('button',{name:/Complete Order/}).first().isDisabled(),true);
 await page.locator('form').evaluate(form=>form.requestSubmit());assert.equal((requests.get(scenario)||[]).length,1);
});
test('skipping an upsell continues through validated checkout',async t=>{
 const page=await setup(t,'upsell-skip');await pay(page);await page.getByRole('button',{name:'No thanks, continue to payment'}).click();
 await page.waitForURL('**/stripe?*');assert.equal(requests.get('upsell-skip').length,1);
});
test('accepting upsell closes immediately even if conversion tracking hangs, and charges the updated cart',async t=>{
 const page=await setup(t,'upsell-accept');await pay(page);await page.getByRole('button',{name:'Add to cart',exact:true}).click();
 await page.getByRole('dialog').waitFor({state:'hidden'});
 await pay(page);
 await page.waitForURL('**/stripe?*');assert.equal(requests.get('upsell-accept')[0][0].length,2);
 assert.equal(requests.get('upsell-accept')[0][0][1].name,'Drink');
});

// Presentation changes must preserve the actual payment and bag opt-out behavior.
for (const [surface,index] of [['desktop',0],['mobile',1]]) test(`presentation: ${surface} payment button resumes the same session without an extra link`,async t=>{
 const scenario='presentation-resume-'+surface;
 const page=await setup(t,scenario);
 await page.route('**/stripe?*',route=>route.abort('aborted'));
 const firstNavigation=page.waitForEvent('requestfailed',req=>req.url().includes('/stripe?'));
 await page.getByRole('button',{name:/Complete Order/}).nth(index).click();await firstNavigation;
 assert.equal(requests.get(scenario).length,1);
 assert.equal(requests.get(scenario)[0][5].bagFee,4);
 assert.equal(await page.getByRole('link',{name:'Continue to payment',exact:true}).count(),0);
 assert.equal(await page.getByPlaceholder('John Doe',{exact:true}).isDisabled(),true);
 assert.equal(await page.getByRole('checkbox',{name:/I accept the/}).nth(index).isDisabled(),true);
 assert.equal(await page.getByRole('button',{name:'Change',exact:true}).isDisabled(),true);
 for(const row of await page.getByText('Bag',{exact:true}).all())assert.equal(await row.locator('..').getByRole('button').isDisabled(),true);
 await page.unroute('**/stripe?*');
 await page.getByRole('button',{name:/Complete Order/}).nth(index).click();
 await page.waitForURL('**/stripe?*');assert.equal(requests.get(scenario).length,1);
});
test('presentation: menu desktop, mobile drawer and floating amount exclude bag; checkout shows it and supports removal',async t=>{
 const page=await setup(t,'presentation-bag');
 await page.goto(origin+'/?case=presentation-bag&view=menu');
 await page.getByText('Your Cart',{exact:true}).waitFor();
 assert.match(await page.getByRole('button',{name:/Proceed to Checkout/}).textContent(),/kr\.100\.00/);
 assert.match(await page.getByText('Total',{exact:true}).locator('..').textContent(),/kr\.100\.00/);
 const floating=page.getByRole('button',{name:/View cart/});
 assert.match(await floating.textContent(),/kr\. 100\.00/);await floating.click();
 const drawer=page.getByRole('dialog');
 assert.match(await drawer.getByText('Total',{exact:true}).locator('..').textContent(),/kr\.100\.00/);
 assert.equal(await drawer.getByText('Bag',{exact:true}).count(),0);
 await page.goto(origin+'/?case=presentation-bag');
 await page.getByText('Bag',{exact:true}).first().waitFor();
 assert.match(await page.getByRole('button',{name:/Complete Order/}).first().textContent(),/kr\. 104\.00/);
 await page.getByText('Bag',{exact:true}).first().locator('..').getByRole('button').click();
 await page.getByRole('button',{name:'Yes, remove',exact:true}).click();
 assert.equal(await page.getByText('Bag',{exact:true}).count(),0);
 assert.match(await page.getByRole('button',{name:/Complete Order/}).first().textContent(),/kr\. 100\.00/);
});

test('Back to Menu is available with a nonempty cart and preserves restaurant and fulfillment in the route',async t=>{
 const page=await setup(t,'back-to-menu');
 const back=page.getByRole('link',{name:'Back to Menu',exact:true});
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
  await page.getByRole('button',{name:/View cart/}).click();
  await page.getByRole('dialog').getByRole('button',{name:/Proceed to Checkout/}).click();
 } else await page.getByRole('button',{name:/Proceed to Checkout/}).first().click();
 await page.waitForURL('**/brand/location/checkout');
 assert.equal(requests.has('menu-setup-'+surface+'-'+failure),false);
});

test('UI69 terms spacing and eligible newsletter highlight preserve explicit consent',async t=>{
 const page=await setup(t,'ui-newsletter');
 const card=page.locator('.commerce-newsletter');
 await page.getByText('Subscribe to newsletter',{exact:true}).waitFor();
 assert.equal(await card.getAttribute('data-newsletter-offer'),'false');
 const consent=card.getByRole('checkbox');assert.equal(await consent.isChecked(),false);
 await card.locator('label').click();assert.equal(await consent.isChecked(),true);
 await page.getByText('Signed up — saving 10%',{exact:true}).waitFor();
 assert.equal(await card.getAttribute('data-newsletter-offer'),'true');
 await card.locator('label').click();assert.equal(await consent.isChecked(),false);
 await page.getByText('Subscribe to newsletter',{exact:true}).waitFor();
 assert.equal(await card.getAttribute('data-newsletter-offer'),'false');
 await page.getByText(/Discount Applied:/).waitFor({state:'hidden'});
 const terms=page.locator('.commerce-terms').filter({visible:true}).first();
 assert.ok((await terms.boundingBox()).height>=48.3);
 const payButton=page.getByRole('button',{name:/Complete Order/}).filter({visible:true}).first();
 assert.ok(Math.abs((await payButton.boundingBox()).height-55.2)<1);
 assert.equal(await payButton.evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(255, 189, 2)');
 if(process.env.UI69_SCREENSHOTS)await page.screenshot({path:process.env.UI69_SCREENSHOTS+'/checkout.png',fullPage:true});
});

test('UI69 newsletter makes no saving promise while another discount remains applied',async t=>{
 const page=await setup(t,'ui-newsletter-conflict');
 const card=page.locator('.commerce-newsletter');
 await page.getByText('Discount Applied:').waitFor();
 await card.getByRole('checkbox').check();
 assert.equal(await card.getAttribute('data-newsletter-offer'),'false');
 assert.equal(await card.getByText(/saving|save .*order/i).count(),0);
 assert.match(await page.getByText(/Discount Applied:/).locator('..').textContent(),/SAVE20/);
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
