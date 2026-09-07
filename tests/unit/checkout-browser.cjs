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
const location={id:'l',slug:'location',brandId:'b',name:'Fixture',city:'Hellerup',minOrder:0};
function fixture(name,content){const file=path.join(dir,name+'.js');fs.writeFileSync(file,content);return file;}
before(async()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'checkout-browser-'));
 const settings=fixture('scenario',`export const scenario=new URLSearchParams(window.location.search).get('case')||'success';`);
 const cart=fixture('cart',`
 import React from 'react';
 export const brand=${JSON.stringify(brand)}, location=${JSON.stringify(location)};
 const context=React.createContext(null);
 const item={id:'pizza',cartItemId:'pizza',productName:'Pizza',quantity:1,basePrice:100,price:100,toppings:[],itemType:'product',imageUrl:'/image.png'};
 export function FixtureCart({children}) {
  const [items,setItems]=React.useState([item]),[discount,setDiscount]=React.useState(null);
  const addToCart=React.useCallback((product,q,t,basePrice,price)=>setItems(old=>[...old,{...item,...product,cartItemId:product.id,basePrice,price}]),[]);
  const applyDiscount=React.useCallback(d=>setDiscount(d),[]),removeDiscount=React.useCallback(()=>setDiscount(null),[]);
  const setCartContext=React.useCallback(()=>{},[]),setSelectedTime=React.useCallback(()=>{},[]);
  const saveCartForCheckout=React.useCallback(id=>{if(window.storageUnavailable)throw Error('storage denied');window.savedCheckout=id;},[]);
  const total=items.reduce((sum,i)=>sum+i.price*i.quantity,0);
  const value={brand,location,cartReady:true,cartItems:items,subtotal:total,checkoutTotal:total,cartTotal:total,itemCount:items.length,
   deliveryType:'pickup',selectedTime:'asap',itemDiscount:0,cartDiscount:null,voucherDiscount:null,deliveryFee:0,bagFee:0,adminFee:0,vatAmount:20,
   applyDiscount,removeDiscount,appliedDiscount:discount,setCartContext,setSelectedTime,saveCartForCheckout,addToCart};
  return React.createElement(context.Provider,{value},children);
 }
 export const useCart=()=>React.useContext(context);
 `);
 const actions=fixture('actions',`
 import {scenario} from ${JSON.stringify(settings)};
 export const getNewsletterSignupDiscountAction=async()=>null;
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
 import {AnalyticsProvider} from ${JSON.stringify(path.join(root,'src/context/analytics-context.tsx'))};
 import {FixtureCart,brand,location} from ${JSON.stringify(cart)};
 createRoot(document.getElementById('root')).render(React.createElement(FixtureCart,null,React.createElement(AnalyticsProvider,{brand},React.createElement(CheckoutClient,{brand,location}))));
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
  '@/lib/analytics':fixture('telemetry',`export const trackClientEvent=()=>{if(window.telemetryUnavailable)throw Error('analytics denied');};`),
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
 server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');res.setHeader('Cache-Control','no-store');
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
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><div id="root"></div><script src="/bundle.js"></script>');
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
