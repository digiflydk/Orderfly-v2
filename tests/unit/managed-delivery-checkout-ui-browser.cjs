// Real quote hook and customer components in Chromium; provider responses are controlled fixtures.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { chromium, expect } = require('@playwright/test');
const webpackModule = require('next/dist/compiled/webpack/webpack');
webpackModule.init();
const root = process.cwd();
let dir, server, browser, origin;
const brands = [{ id: 'a', name: 'Nord' }, { id: 'b', name: 'Syd' }];
const locations = [{ id: 'la', name: 'Nord Station', brandId: 'a' }, { id: 'lb', name: 'Syd Torv', brandId: 'b' }];
before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'managed-delivery-browser-'));
  const entry = path.join(dir, 'entry.js');
  fs.writeFileSync(entry, `import React from 'react';import {createRoot} from 'react-dom/client';
    import {ConfirmationClient} from ${JSON.stringify(path.join(root, 'src/app/[brandSlug]/[locationSlug]/checkout/confirmation/confirmation-client.tsx'))};
    import {ManagedDeliveryQuote} from ${JSON.stringify(path.join(root, 'src/components/checkout/managed-delivery-quote.tsx'))};
    import {ManagedDeliveryTracking} from ${JSON.stringify(path.join(root, 'src/components/checkout/managed-delivery-tracking.tsx'))};
    import {useManagedDeliveryQuote} from ${JSON.stringify(path.join(root, 'src/components/checkout/use-managed-delivery-quote.ts'))};
    function Fixture(){const [address,setAddress]=React.useState(''),[cart,setCart]=React.useState('pizza'),[time,setTime]=React.useState('asap'),[enabled,setEnabled]=React.useState(true),[tracking,setTracking]=React.useState(null),[showDeliveryTime,setShowDeliveryTime]=React.useState(true),[fallback,setFallback]=React.useState(null);
    window.changeAddress=setAddress;window.changeCart=setCart;window.changeTime=setTime;window.setManagedEnabled=setEnabled;window.setTracking=setTracking;window.showDeliveryTime=setShowDeliveryTime;window.setFallback=setFallback;
    const identity=JSON.stringify({address,cart,time});const input=React.useMemo(()=>({address,cart,time}),[address,cart,time]);const fetchQuote=React.useCallback(value=>new Promise(resolve=>{window.requests=window.requests||[];window.requests.push({value,resolve});}),[]);
    const flow=useManagedDeliveryQuote({enabled,requestIdentity:identity,input,requestQuote:fetchQuote,autoRequestReady:address.length>=3});window.paymentProof=flow.paymentProof;
    return React.createElement(React.Fragment,null,React.createElement('p',null,'Kurv: 2 pizzaer'),React.createElement('label',null,'Adresse',React.createElement('input',{value:address,onChange:event=>setAddress(event.target.value)})),React.createElement(ManagedDeliveryQuote,{enabled,state:flow.state,checkoutFingerprint:flow.state.kind==='ready'?flow.state.quote.checkoutFingerprint:'',previousFeeMinor:flow.previousFeeMinor,onRequest:flow.request,showDeliveryTime}),React.createElement('button',{disabled:!flow.paymentProof,onClick:()=>window.submittedProof=flow.paymentProof},'Test betaling'),React.createElement(ManagedDeliveryTracking,{enabled,orderId:'order-a',data:tracking,fallbackDeliveryTime:fallback,onRefresh:()=>{}}));}
    createRoot(document.getElementById('root')).render(window.location.pathname==='/confirmation'?React.createElement(ConfirmationClient,{order:window.__receipt,sessionId:window.__receiptSession,receiptToken:window.__receiptToken,brand:{id:'brand-a',slug:'brand-a',name:'Test'},location:{id:'location-a',slug:'location-a',name:'Test'}}):React.createElement(Fixture));`);
  const loader = path.join(dir, 'loader.js');
  fs.writeFileSync(loader, `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
  const cartStub=path.join(dir,'cart-stub.js'),pathStub=path.join(dir,'path-stub.js'),analyticsStub=path.join(dir,'analytics-stub.js'),linkStub=path.join(dir,'link-stub.js');
  fs.writeFileSync(cartStub,'const completeCheckout=()=>{};export const useCart=()=>({completeCheckout});');
  fs.writeFileSync(pathStub,"export const useStorefrontPath=()=>()=>'/menu';");
  fs.writeFileSync(analyticsStub,'export const pushPaidPurchase=()=>{};');
  fs.writeFileSync(linkStub,"import React from 'react';export default function Link(props){return React.createElement('a',props);}");
  await new Promise((resolve, reject) => webpackModule.webpack({ mode: 'development', devtool: false, entry,
    output: { path: dir, filename: 'bundle.js' },
    resolve: { alias: { '@/context/cart-context':cartStub,'@/hooks/use-storefront-path':pathStub,'@/lib/analytics':analyticsStub,'next/link':linkStub,'@': path.join(root, 'src') }, extensions: ['.tsx', '.ts', '.js'], modules: [path.join(root, 'node_modules'), 'node_modules'] },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: [loader] }] },
  }).run((error, stats) => error ? reject(error) : stats.hasErrors() ? reject(Error(stats.toString({ all: false, errors: true }))) : resolve()));
  execFileSync(path.join(root, 'node_modules/.bin/tailwindcss'), ['-c', path.join(root, 'tailwind.config.ts'), '-i', path.join(root, 'src/app/globals.css'), '-o', path.join(dir, 'styles.css'), '--minify'], { cwd: root, stdio: 'pipe' });
  const styles = fs.readFileSync(path.join(dir, 'styles.css'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'src/styles/admin-ui.css'), 'utf8');
  server = http.createServer((req, res) => {
    if (req.url === '/bundle.js') { res.setHeader('content-type', 'application/javascript'); return res.end(fs.readFileSync(path.join(dir, 'bundle.js'))); }
    if (req.url === '/styles.css') { res.setHeader('content-type', 'text/css'); return res.end(styles); }
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end('<!doctype html><html lang="da"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><main class="admin-shell min-h-screen bg-background p-4 md:p-8"><div id="root" class="mx-auto max-w-6xl"></div></main><script src="/bundle.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ headless: true, executablePath: process.env.CART_CHROMIUM_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
});
after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); if (dir) fs.rmSync(dir, { recursive: true, force: true }); });
function quote(extra={}){return {ok:true,quoteId:'quote-a',quoteToken:'opaque-token',checkoutFingerprint:'fingerprint-a',customerFeeMinor:3500,checkoutTotalMinor:23500,currency:'DKK',deliveryInterval:{earliest:'2026-10-26T15:00:00Z',latest:'2026-10-26T15:30:00Z'},expiresAtMs:Date.now()+120000,...extra};}
async function respond(page,result,index=0){await page.evaluate(({result,index})=>window.requests[index].resolve(result),{result,index});}
async function waitRequests(page,count){await expect.poll(()=>page.evaluate(()=>window.requests?.length||0)).toBe(count);}
async function quotePage(t,viewport={width:390,height:844}){const context=await browser.newContext({viewport});t.after(()=>context.close());const page=await context.newPage();await page.goto(origin);return page;}
test('valid address automatically debounces one quote and payment accepts the visible price without extra controls',async t=>{
 const page=await quotePage(t);await page.clock.install();const address=page.getByRole('textbox',{name:'Adresse'}),pay=page.getByRole('button',{name:'Test betaling'});
 await address.fill('a');await page.clock.runFor(1000);assert.equal(await page.evaluate(()=>window.requests?.length||0),0);
 await address.fill('Testvej');await page.clock.runFor(100);await address.fill('Testvej 12');await page.clock.runFor(100);assert.equal(await page.evaluate(()=>window.requests?.length||0),0);
 await page.clock.runFor(200);await waitRequests(page,1);await expect(pay).toBeDisabled();await respond(page,quote());await expect(pay).toBeEnabled();
 await expect(page.getByText('235,00',{exact:false})).toBeVisible();await expect(page.getByRole('checkbox')).toHaveCount(0);await expect(page.getByRole('button',{name:/Hent leveringspris|Opdater leveringspris|Vælg afhentning/})).toHaveCount(0);
 assert.equal(await page.evaluate(()=>window.submittedProof),undefined);await pay.click();assert.equal(await page.evaluate(()=>window.submittedProof.quoteToken),'opaque-token');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
});
test('in-flight old address result cannot enable payment; only the latest queued identity is requested',async t=>{
 const page=await quotePage(t);await page.getByRole('textbox',{name:'Adresse'}).fill('first');await waitRequests(page,1);
 await page.evaluate(()=>{window.changeAddress('second');});await page.waitForTimeout(800);assert.equal(await page.evaluate(()=>window.requests.length),1);
 await page.evaluate(()=>window.changeAddress('third'));await respond(page,quote({quoteId:'obsolete'}));await expect(page.getByRole('button',{name:'Test betaling'})).toBeDisabled();await waitRequests(page,2);
 const inputs=await page.evaluate(()=>window.requests.map(r=>r.value));assert.equal(inputs[1].address,'third');assert.equal(inputs[0].checkoutKey,inputs[1].checkoutKey);assert.match(inputs[0].checkoutKey,/^[a-f0-9]{64}$/);
 await respond(page,quote({quoteId:'current'}),1);await expect(page.getByRole('button',{name:'Test betaling'})).toBeEnabled();assert.equal(await page.evaluate(()=>window.paymentProof.quoteId),'current');
});
test('cart and time changes immediately revoke payment and automatically replace the displayed total',async t=>{
 const page=await quotePage(t);await page.getByRole('textbox',{name:'Adresse'}).fill('first');await waitRequests(page,1);await respond(page,quote());const pay=page.getByRole('button',{name:'Test betaling'});await expect(pay).toBeEnabled();
 await page.evaluate(()=>window.changeCart('two'));await expect(pay).toBeDisabled();await waitRequests(page,2);await respond(page,quote({quoteId:'cart',customerFeeMinor:4500,checkoutTotalMinor:34500}),1);await expect(pay).toBeEnabled();await expect(page.getByText('345,00',{exact:false})).toBeVisible();
 await page.evaluate(()=>window.changeTime('tomorrow'));await expect(pay).toBeDisabled();await waitRequests(page,3);await respond(page,quote({quoteId:'time'}),2);await pay.click();assert.equal(await page.evaluate(()=>window.submittedProof.quoteId),'time');
});
test('near-expiry quote blocks payment and retries only on explicit request',async t=>{
 const page=await quotePage(t);await page.clock.install();await page.getByRole('textbox',{name:'Adresse'}).fill('first');await page.clock.runFor(800);await waitRequests(page,1);
 const now=await page.evaluate(()=>Date.now());await respond(page,quote({expiresAtMs:now+61000}));await expect(page.getByRole('button',{name:'Test betaling'})).toBeEnabled();await page.clock.runFor(2000);await expect(page.getByRole('button',{name:'Test betaling'})).toBeDisabled();await page.clock.runFor(10000);assert.equal(await page.evaluate(()=>window.requests.length),1);
 await page.getByRole('button',{name:'Prøv igen',exact:true}).click();await waitRequests(page,2);await respond(page,quote({expiresAtMs:now+180000}),1);await expect(page.getByRole('button',{name:'Test betaling'})).toBeEnabled();
});
for(const [code,message] of [['invalid_address','Kontrollér leveringsadressen'],['outside_area','uden for restaurantens leveringsområde']])test(code+' blocks payment without automatic provider retry or pickup CTA',async t=>{
 const page=await quotePage(t);await page.getByRole('textbox',{name:'Adresse'}).fill('first');await waitRequests(page,1);await respond(page,{ok:false,code,message:'PRIVATE_PROVIDER_TEXT'});await expect(page.getByRole('alert')).toContainText(message);await expect(page.getByRole('button',{name:'Test betaling'})).toBeDisabled();await expect(page.getByText('PRIVATE_PROVIDER_TEXT')).toHaveCount(0);await expect(page.getByRole('button',{name:'Vælg afhentning i stedet'})).toHaveCount(0);await page.waitForTimeout(1000);assert.equal(await page.evaluate(()=>window.requests.length),1);
});
test('disabled new flow renders nothing and tracking rejects foreign identity or unsafe links',async t=>{const context=await browser.newContext();t.after(()=>context.close());const page=await context.newPage();await page.goto(origin);await page.evaluate(()=>window.setManagedEnabled(false));await expect(page.getByRole('heading',{name:'Levering',exact:true})).toHaveCount(0);await expect(page.getByRole('heading',{name:'Følg din levering'})).toHaveCount(0);await page.evaluate(()=>window.setManagedEnabled(true));const data={orderId:'order-a',bookingState:'unknown',deliveryStatus:null,paymentStatus:'paid',trackingUrl:'javascript:alert(1)',deliveryInterval:null,updatedAt:'2026-10-26T12:00:00Z',pickupInterval:null,pickupReliable:false};await page.evaluate(data=>window.setTracking(data),data);await expect(page.getByText('Vi afklarer, om leveringen er bestilt. Start ikke en ny bestilling.')).toBeVisible();await expect(page.getByText('Betaling: Betalt')).toBeVisible();await expect(page.getByRole('link')).toHaveCount(0);await page.evaluate(data=>window.setTracking({...data,orderId:'foreign'}),data);await expect(page.getByText('Vi kan ikke vise en bekræftet leveringsstatus lige nu.')).toBeVisible();await expect(page.getByText('Betaling: Betalt')).toHaveCount(0);});
test('paid confirmation never claims uncertain managed delivery is confirmed',async t=>{const context=await browser.newContext({viewport:{width:390,height:844}});t.after(()=>context.close());const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>{window.__receipt={id:'order-a',brandId:'brand-a',locationId:'location-a',customerName:'Test kunde',customerContact:'test@example.test',customerDetails:{id:'customer-a',address:'Testvej 1'},createdAt:'2026-10-26T12:00:00Z',deliveryType:'Delivery',deliveryTime:'asap',status:'Pending',paymentStatus:'Paid',paymentMethod:'Stripe',totalAmount:135,productItems:[],paymentDetails:{subtotal:100,deliveryFee:35},managedDeliveryTracking:{orderId:'order-a',bookingState:'unknown',deliveryStatus:null,paymentStatus:'paid',trackingUrl:null,deliveryInterval:null,pickupInterval:null,pickupReliable:false,updatedAt:null}};});await page.goto(origin+'/confirmation');await expect(page.getByRole('heading',{name:'Vi kontrollerer din levering'})).toBeVisible();await expect(page.getByText('Vi afklarer, om leveringen er bestilt. Start ikke en ny bestilling.')).toBeVisible();await expect(page.getByText('Opdateringstidspunktet er ikke oplyst.')).toBeVisible();await expect(page.getByText('Valgt leveringstid',{exact:true})).toHaveCount(0);await expect(page.getByText(/Forventet levering:/)).toHaveCount(0);await expect(page.getByText('Afventer levering',{exact:true})).toBeVisible();await expect(page.getByText(/er betalt. Leveringen er endnu ikke bekræftet/)).toBeVisible();assert.deepEqual(errors,[]);});

test('identity mismatch explains correction and automatic retry preserves basket',async t=>{
 const page=await quotePage(t);await page.getByRole('textbox',{name:'Adresse'}).fill('first');await waitRequests(page,1);await respond(page,{ok:false,code:'customer_identity_conflict',message:'PRIVATE_SERVER_TEXT'});
 await expect(page.getByRole('alert')).toContainText('Kontrollér begge oplysninger');await expect(page.getByText('PRIVATE_SERVER_TEXT')).toHaveCount(0);await expect(page.getByRole('button',{name:'Test betaling'})).toBeDisabled();await page.evaluate(()=>window.changeAddress('corrected-customer'));await waitRequests(page,2);await respond(page,quote(),1);await expect(page.getByRole('button',{name:'Test betaling'})).toBeEnabled();await expect(page.getByText('Kurv: 2 pizzaer')).toBeVisible();
});

test('refunded rejected delivery receipt never claims paid or confirmed',async t=>{
 const context=await browser.newContext();t.after(()=>context.close());const page=await context.newPage();
 await page.addInitScript(()=>{window.__receipt={id:'order-a',brandId:'brand-a',locationId:'location-a',customerName:'Test kunde',customerContact:'test@example.test',customerDetails:{id:'customer-a',address:'Testvej 1'},createdAt:'2026-10-26T12:00:00Z',deliveryType:'Delivery',status:'Canceled',paymentStatus:'Paid',paymentMethod:'Stripe',totalAmount:135,productItems:[],paymentDetails:{subtotal:100,deliveryFee:35},managedDeliveryTracking:{orderId:'order-a',bookingState:'rejected',deliveryStatus:null,paymentStatus:'refunded',trackingUrl:null,deliveryInterval:null,pickupInterval:null,pickupReliable:false,updatedAt:null}};});
 await page.goto(origin+'/confirmation');await expect(page.getByRole('heading',{name:'Din betaling er refunderet'})).toBeVisible();await expect(page.getByText(/er annulleret, og betalingen er refunderet/)).toBeVisible();await expect(page.getByText('Betaling: Refunderet')).toBeVisible();await expect(page.getByText(/er betalt. Leveringen/)).toHaveCount(0);
});
test('persisted cancellation separates payment, hides stale ETA and preserves uncertain delivery state',async t=>{
 const context=await browser.newContext();t.after(()=>context.close());const page=await context.newPage();await page.goto(origin);
 const data={orderId:'order-a',bookingState:'accepted',cancellationState:'cancelled',deliveryStatus:'cancelled',paymentStatus:'paid',trackingUrl:'https://tracking.example/order',deliveryInterval:{earliest:'2026-10-26T12:00:00Z',latest:'2026-10-26T12:10:00Z'},pickupInterval:null,pickupReliable:false,updatedAt:null};
 await page.evaluate(data=>window.setTracking(data),data);await expect(page.getByText('Leveringen er annulleret',{exact:true})).toBeVisible();await expect(page.getByText('Betaling: Betalt')).toBeVisible();await expect(page.getByText(/Forventet levering:/)).toHaveCount(0);await expect(page.getByRole('link')).toHaveCount(0);
 await page.evaluate(data=>window.setTracking({...data,cancellationState:'unknown',deliveryStatus:'picked_up'}),data);await expect(page.getByText('Kurér har afhentet din ordre')).toBeVisible();await expect(page.getByRole('alert').filter({hasText:'Resultatet af annulleringen er ukendt'})).toBeVisible();
});

test('paid cancelled receipt reports courier cancellation without claiming a refund',async t=>{const context=await browser.newContext({viewport:{width:390,height:844}});t.after(()=>context.close());const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>{window.__receipt={id:'order-a',brandId:'brand-a',locationId:'location-a',customerName:'Test kunde',customerContact:'test@example.test',customerDetails:{id:'customer-a',address:'Testvej 1'},createdAt:'2026-10-26T12:00:00Z',deliveryType:'Delivery',deliveryTime:'asap',status:'Pending',paymentStatus:'Paid',paymentMethod:'Stripe',totalAmount:135,productItems:[],paymentDetails:{subtotal:100,deliveryFee:35},managedDeliveryTracking:{orderId:'order-a',bookingState:'accepted',cancellationState:'cancelled',deliveryStatus:'cancelled',paymentStatus:'paid',trackingUrl:null,deliveryInterval:null,pickupInterval:null,pickupReliable:false,updatedAt:null}};});await page.goto(origin+'/confirmation');await expect(page.getByRole('heading',{name:'Leveringen er annulleret',exact:true})).toBeVisible();await expect(page.getByText('Betaling: Betalt')).toBeVisible();await expect(page.getByText(/har fået annulleret kurérleveringen/)).toBeVisible();await expect(page.getByRole('heading',{name:'Tak for din bestilling!'})).toHaveCount(0);assert.deepEqual(errors,[]);});

test('paid delivery receipt refreshes ETA automatically with scoped proof, recovers errors and stops on delivery',async t=>{
 const context=await browser.newContext();t.after(()=>context.close());const page=await context.newPage();await page.clock.install();
 const receipt={id:'order-a',brandId:'brand-a',locationId:'location-a',customerName:'Test',customerContact:'test@example.test',customerDetails:{id:'customer-a',address:'Testvej 1'},createdAt:'2026-10-26T12:00:00Z',deliveryType:'Delivery',deliveryTime:'asap',status:'Pending',paymentStatus:'Paid',paymentMethod:'Stripe',totalAmount:135,productItems:[],paymentDetails:{subtotal:100,deliveryFee:35},managedDeliveryTracking:{orderId:'order-a',bookingState:'pending',deliveryStatus:null,paymentStatus:'paid',trackingUrl:null,deliveryInterval:null,pickupInterval:null,pickupReliable:false,updatedAt:null}};
 await page.addInitScript(r=>{window.__receipt=r;window.__receiptSession='cs_test_receipt_fixture';window.__receiptToken='a'.repeat(64);},receipt);
 let requests=0,fail=false,done=false;
 await page.route('**/api/orders/lookup-by-session?**',async route=>{
  requests++;const q=new URL(route.request().url()).searchParams;
  assert.equal(q.get('session_id'),'cs_test_receipt_fixture');assert.equal(q.get('receipt_token'),'a'.repeat(64));assert.equal(q.get('brand_id'),'brand-a');assert.equal(q.get('location_id'),'location-a');assert.equal(q.get('order_id'),'order-a');assert.equal(q.get('status_only'),'true');
  if(fail)return route.fulfill({status:503,json:{found:false}});
  const order={...receipt,status:'Received',managedDeliveryTracking:{...receipt.managedDeliveryTracking,bookingState:'accepted',deliveryStatus:done?'delivered':'courier_assigned',deliveryInterval:{earliest:'2026-10-30T11:05:00Z',latest:'2026-10-30T11:15:00Z'},updatedAt:'2026-10-30T10:00:00Z'}};
  await route.fulfill({json:{found:true,order}});
 });
 await page.goto(origin+'/confirmation');await page.clock.runFor(1600);await expect(page.getByText(/Forventet levering: ca.*12.15/)).toBeVisible();assert.equal(requests,1);
 await expect(page.getByRole('heading',{name:'Tak for din bestilling!'})).toBeVisible();
 fail=true;await page.clock.runFor(10100);await expect(page.getByRole('alert')).toContainText('kunne ikke opdateres');await expect(page.getByText(/Forventet levering: ca.*12.15/)).toBeVisible();
 fail=false;done=true;await page.clock.runFor(10100);await expect(page.getByText('Din ordre er leveret',{exact:true})).toBeVisible();await expect(page.getByRole('alert')).toHaveCount(0);
 const count=requests;await page.clock.runFor(30000);assert.equal(requests,count);assert.equal(new URL(page.url()).pathname,'/confirmation');
});

test('legacy paid delivery does not start managed delivery polling',async t=>{
 const context=await browser.newContext();t.after(()=>context.close());const page=await context.newPage();await page.clock.install();let requests=0;
 await page.route('**/api/orders/lookup-by-session?**',async route=>{requests++;await route.fulfill({json:{found:false}});});
 await page.addInitScript(()=>{window.__receiptSession='cs_test_receipt_fixture';window.__receipt={id:'order-a',brandId:'brand-a',locationId:'location-a',customerName:'Test',customerContact:'test@example.test',customerDetails:{id:'customer-a',address:'Testvej 1'},createdAt:'2026-10-26T12:00:00Z',deliveryType:'Delivery',status:'Received',paymentStatus:'Paid',paymentMethod:'Stripe',totalAmount:135,productItems:[],paymentDetails:{subtotal:100,deliveryFee:35}};});
 await page.goto(origin+'/confirmation');await expect(page.getByRole('heading',{name:'Tak for din bestilling!'})).toBeVisible();await page.clock.runFor(45000);assert.equal(requests,0);
});


test('quote shows a single conservative estimate and checkout can suppress the duplicate time',async t=>{
 const page=await quotePage(t);await page.getByRole('textbox',{name:'Adresse'}).fill('first');await waitRequests(page,1);await respond(page,quote());
 const estimate=page.getByText(/Forventet levering:/);await expect(estimate).toHaveCount(1);await expect(estimate).toContainText('ca.');await expect(estimate).toContainText('16.30');await expect(estimate).not.toContainText('16.00');await expect(estimate).not.toContainText('–');
 await page.evaluate(()=>window.showDeliveryTime(false));await expect(estimate).toHaveCount(0);await expect(page.getByText('235,00',{exact:false})).toBeVisible();await expect(page.getByRole('button',{name:'Test betaling'})).toBeEnabled();
});

test('tracking never renders invalid or inverted estimates and preserves the provider interval',async t=>{
 const page=await quotePage(t),data={orderId:'order-a',bookingState:'accepted',deliveryStatus:'courier_assigned',paymentStatus:'paid',trackingUrl:null,deliveryInterval:{earliest:'2026-10-30T11:05:00Z',latest:'2026-10-30T11:15:00Z'},updatedAt:null,pickupInterval:null,pickupReliable:false};
 await page.evaluate(data=>{window.originalTracking=data;window.setTracking(data);},data);
 const estimate=page.getByText(/Forventet levering:/);await expect(estimate).toHaveCount(1);await expect(estimate).toContainText('12.15');await expect(estimate).not.toContainText('12.05');await expect(estimate).not.toContainText('–');
 assert.deepEqual(await page.evaluate(()=>window.originalTracking.deliveryInterval),data.deliveryInterval);
 for(const interval of [null,{earliest:'invalid',latest:'2026-10-30T11:15:00Z'},{earliest:'2026-10-30T11:15:00Z',latest:'2026-10-30T11:05:00Z'}]){
  await page.evaluate(({data,interval})=>window.setTracking({...data,deliveryInterval:interval}),{data,interval});await expect(estimate).toHaveCount(0);
 }
});

test('accepted managed confirmation shows only the provider estimate, not the original selected time',async t=>{
 const context=await browser.newContext();t.after(()=>context.close());const page=await context.newPage();
 await page.addInitScript(()=>{window.__receipt={id:'order-a',brandId:'brand-a',locationId:'location-a',customerName:'Test',customerContact:'test@example.test',customerDetails:{id:'customer-a',address:'Testvej 1'},createdAt:'2026-10-30T10:00:00Z',deliveryType:'Delivery',deliveryTime:'2026-10-30T11:00:00Z',status:'Received',paymentStatus:'Paid',paymentMethod:'Stripe',totalAmount:135,productItems:[],paymentDetails:{subtotal:100,deliveryFee:35},managedDeliveryTracking:{orderId:'order-a',bookingState:'accepted',deliveryStatus:'courier_assigned',paymentStatus:'paid',trackingUrl:null,deliveryInterval:{earliest:'2026-10-30T11:05:00Z',latest:'2026-10-30T11:15:00Z'},pickupInterval:null,pickupReliable:false,updatedAt:null}};});
 await page.goto(origin+'/confirmation');await expect(page.getByText(/Forventet levering:/)).toHaveCount(1);await expect(page.getByText(/Forventet levering: ca.*12.15/)).toBeVisible();await expect(page.getByText('Valgt leveringstid',{exact:true})).toHaveCount(0);await expect(page.getByText('Forventet levering',{exact:true})).toHaveCount(0);await expect(page.getByText(/12.00/)).toHaveCount(0);
});


test('managed receipt uses one preliminary native estimate until a provider ETA arrives',async t=>{
 const context=await browser.newContext();t.after(()=>context.close());const page=await context.newPage();await page.clock.install();
 const receipt={id:'order-a',brandId:'brand-a',locationId:'location-a',customerName:'Test',customerContact:'test@example.test',customerDetails:{id:'customer-a',address:'Testvej 1'},createdAt:'2026-10-30T10:00:00Z',deliveryType:'Delivery',deliveryTime:'fre. 30. okt. 11:30',fulfillmentAt:'2026-10-30T10:30:00.000Z',expectedDeliveryAt:'2026-10-30T11:00:00.000Z',status:'Received',paymentStatus:'Paid',paymentMethod:'Stripe',totalAmount:135,productItems:[],paymentDetails:{subtotal:100,deliveryFee:35},managedDeliveryTracking:{orderId:'order-a',bookingState:'accepted',deliveryStatus:'booked',paymentStatus:'paid',trackingUrl:null,deliveryInterval:null,pickupInterval:null,pickupReliable:false,updatedAt:null}};
 await page.addInitScript(r=>{window.__receipt=r;window.__receiptSession='cs_test_receipt_fixture';window.__receiptToken='a'.repeat(64);},receipt);
 await page.route('**/api/orders/lookup-by-session?**',async route=>route.fulfill({json:{found:true,order:{...receipt,managedDeliveryTracking:{...receipt.managedDeliveryTracking,deliveryInterval:{earliest:'2026-10-30T11:05:00Z',latest:'2026-10-30T11:15:00Z'}}}}}));
 await page.goto(origin+'/confirmation');await expect(page.getByText(/Foreløbigt forventet levering: ca.*12.00/)).toBeVisible();await expect(page.getByText(/levering: ca/i)).toHaveCount(1);await expect(page.getByText('Valgt leveringstid',{exact:true})).toHaveCount(0);
 await page.clock.runFor(1600);await expect(page.getByText(/Forventet levering: ca.*12.15/)).toBeVisible();await expect(page.getByText(/Foreløbigt forventet levering/)).toHaveCount(0);await expect(page.getByText(/levering: ca/i)).toHaveCount(1);
});

test('preliminary estimate is suppressed for unsafe states and non-ISO saved choices',async t=>{
 const page=await quotePage(t),data={orderId:'order-a',bookingState:'accepted',deliveryStatus:'booked',paymentStatus:'paid',trackingUrl:null,deliveryInterval:null,updatedAt:null,pickupInterval:null,pickupReliable:false};
 await page.evaluate(data=>{window.setFallback('2026-10-30T11:00:00.000Z');window.setTracking(data);},data);await expect(page.getByText(/Foreløbigt forventet levering: ca.*12.00/)).toBeVisible();
 for(const patch of [{bookingState:'rejected'},{deliveryStatus:'cancelled'},{deliveryStatus:'failed'},{deliveryStatus:'delivered'},{paymentStatus:'refunded'},{paymentStatus:'failed'},{cancellationState:'submitting'},{cancellationState:'unknown'},{cancellationState:'cancelled'},{orderId:'foreign'}]){
  await page.evaluate(({data,patch})=>window.setTracking({...data,...patch}),{data,patch});await expect(page.getByText(/Foreløbigt forventet levering/)).toHaveCount(0);
 }
 await page.evaluate(data=>window.setTracking(data),data);
 for(const value of ['asap','12:00','invalid','2026-02-30T11:00:00.000Z']){await page.evaluate(value=>window.setFallback(value),value);await expect(page.getByText(/Foreløbigt forventet levering/)).toHaveCount(0);}
});
