import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import ts from 'typescript';
const order={id:'ORD-123',brandId:'b',locationId:'l',createdAt:'2026-11-12T12:00:00Z',customerName:'Synthetic guest',customerContact:'synthetic@example.test',deliveryType:'Pickup',deliveryTime:'12:30',status:'Pending',paymentStatus:'Pending',paymentMethod:'Worldline',totalAmount:125,productItems:[],customerDetails:{id:'c',address:'For Pickup'},paymentDetails:{subtotal:125,taxes:0,deliveryFee:0,discountTotal:0,tips:0}};
async function mount(page:any,{missing=false,outage=false,paid=false,delivery=false,outcome=undefined as undefined|'refunded'|'partially_refunded'|'canceled',canceled=false}={}){
 const initialOrder={...order,...(paid?{paymentStatus:'Paid',status:delivery?'Pending':'Received'}:{}),...(delivery?{deliveryType:'Delivery',managedDeliveryTracking:{paymentStatus:'paid',bookingState:'pending',deliveryStatus:'pending'}}:{}),...(outcome?{paymentOutcome:outcome,status:outcome==='partially_refunded'?'Received':'Canceled',paymentStatus:outcome==='canceled'?'Failed':'Paid',refundedAmountMinor:outcome==='refunded'?12500:outcome==='partially_refunded'?2500:undefined}:{}),...(canceled?{status:'Canceled'}:{})};
 await page.route('https://checkout.test/**',(route:any)=>route.fulfill({contentType:'text/html',body:'<main id="root"></main>'}));
 await page.goto('https://checkout.test/brand/location/checkout/confirmation?status=approved');
 await page.addScriptTag({content:fs.readFileSync('node_modules/react/umd/react.development.js','utf8')});
 await page.addScriptTag({content:fs.readFileSync('node_modules/react-dom/umd/react-dom.development.js','utf8')});
 const requests:string[]=[];
 await page.route('https://checkout.test/api/orders/lookup-by-session?**',async(route:any)=>{
  requests.push(route.request().url());
  const ready=await page.evaluate(()=>(window as any).paymentReady);
  await route.fulfill({status:outage?503:200,contentType:'application/json',body:JSON.stringify(outage?{found:false,retryable:true}:{found:true,order:{...order,paymentStatus:ready?'Paid':'Pending',status:ready?'Received':'Pending'}})});
 });
 const code=ts.transpileModule(fs.readFileSync('src/app/[brandSlug]/[locationSlug]/checkout/confirmation/confirmation-client.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
 await page.evaluate(({code,order,missing,paid}:any)=>{
  const w=window as any,R=w.React;w.completed=[];w.purchases=[];w.stamps=0;w.paymentReady=paid;
  const complete=(...args:any[])=>w.completed.push(args);
  const primitive=(tag:string)=>(props:any)=>R.createElement(tag,{...props,variant:undefined,asChild:undefined},props.children);
  const ui=new Proxy({}, {get:(_,name:string)=>primitive(name.includes('Title')?'h2':name.includes('Button')?'button':'div')});
  const require=(name:string):any=>{
   if(name==='react')return R;
   if(name==='next/link')return {default:primitive('a')};
   if(name==='lucide-react')return new Proxy({},{get:()=>primitive('span')});
   if(name.includes('/ui/'))return ui;
   if(name.includes('stamp-celebration'))return {StampCelebration:()=>{w.stamps++;return null;}};
   if(name.includes('managed-delivery-tracking'))return {ManagedDeliveryTracking:()=>null};
   if(name.includes('cart-context'))return {useCart:()=>({completeCheckout:complete})};
   if(name.includes('use-storefront-path'))return {useStorefrontPath:()=>()=>'/brand/location'};
   if(name.includes('storefront-format'))return {formatPrice:(v:any)=>String(v),localizeTime:(v:any)=>v};
   if(name.includes('merchant-payment-methods'))return {paymentMethodLabel:()=> 'Online betaling'};
   if(name.includes('analytics'))return {pushPaidPurchase:(v:any)=>w.purchases.push(v)};
   throw Error('Unmocked fixture import '+name);
  };
  const exports:any={};new Function('require','exports','React',code)(require,exports,R);
  w.ReactDOM.createRoot(document.getElementById('root')).render(R.createElement(exports.ConfirmationClient,{order:missing?null:order,brand:{id:'b',slug:'brand',name:'Synthetic brand',currency:'DKK'},location:{id:'l',slug:'location',name:'Synthetic location',brandId:'b'},orderId:'ORD-123',receiptToken:'a'.repeat(64)}));
 },{code,order:initialOrder,missing,paid});
 return requests;
}
test('Worldline token-only return waits for server Paid before receipt, analytics and clearing cart',async({page})=>{
 const requests=await mount(page);await expect(page.getByRole('heading',{name:'Afventer bekræftelse af betaling'})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).completed)).toHaveLength(0);await expect.poll(()=>requests.length).toBeGreaterThan(0);
 const query=new URL(requests[0]).searchParams;expect(query.get('session_id')).toBeNull();expect(query.get('order_id')).toBe('ORD-123');expect(query.get('receipt_token')).toBe('a'.repeat(64));
 await page.evaluate(()=>{(window as any).paymentReady=true;});await expect(page.getByRole('heading',{name:'Tak for din bestilling!'})).toBeVisible({timeout:15000});expect((await page.evaluate(()=>(window as any).completed)).length).toBeGreaterThan(0);
});
test('outage and browser approved parameter cannot mark an unresolved order paid',async({page})=>{
 const requests=await mount(page,{outage:true});await expect.poll(()=>requests.length).toBeGreaterThan(0);await expect(page.getByRole('heading',{name:'Afventer bekræftelse af betaling'})).toBeVisible();expect(await page.evaluate(()=>(window as any).completed)).toHaveLength(0);expect(await page.evaluate(()=>(window as any).purchases)).toHaveLength(0);
});
test('verified Paid Worldline return renders the receipt immediately without a payment waiting screen',async({page})=>{
 const requests=await mount(page,{paid:true});
 await expect(page.getByRole('heading',{name:'Tak for din bestilling!'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Afventer bekræftelse af betaling'})).toHaveCount(0);
 await expect(page.getByText('Din faktura',{exact:true})).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>(window as any).completed.length)).toBeGreaterThan(0);
 expect(requests).toHaveLength(0);
});
test('Paid Worldline delivery shows the receipt while keeping pending booking explicit',async({page})=>{
 await mount(page,{paid:true,delivery:true});
 await expect(page.getByRole('heading',{name:'Tak for din bestilling!'})).toBeVisible();
 await expect(page.getByText('er betalt. Leveringen er endnu ikke bekræftet.',{exact:false})).toBeVisible();
 await expect(page.getByText('Afventer levering',{exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Afventer bekræftelse af betaling'})).toHaveCount(0);
});

test('verified full-refund receipt never thanks for an order or emits purchase/stamp effects',async({page})=>{
 await mount(page,{paid:true,outcome:'refunded'});
 await expect(page.getByRole('heading',{name:'Din betaling er refunderet'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Tak for din bestilling!'})).toHaveCount(0);
 await expect(page.getByText('er annulleret, og betalingen er refunderet.',{exact:false})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).purchases)).toHaveLength(0);
 expect(await page.evaluate(()=>(window as any).stamps)).toBe(0);
});
test('verified canceled authorization displays cancellation and preserves the unpaid cart',async({page})=>{
 await mount(page,{outcome:'canceled'});
 await expect(page.getByRole('heading',{name:'Ordren er annulleret'})).toBeVisible();
 await expect(page.getByText('Ordren er annulleret. Der er ikke hævet nogen betaling.',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).completed)).toHaveLength(0);
 expect(await page.evaluate(()=>(window as any).purchases)).toHaveLength(0);
 expect(await page.evaluate(()=>(window as any).stamps)).toBe(0);
});
test('canceled captured order without verified refund never claims refund or a successful new purchase',async({page})=>{
 await mount(page,{paid:true,canceled:true});
 await expect(page.getByRole('heading',{name:'Ordren er annulleret'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Tak for din bestilling!'})).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'Din betaling er refunderet'})).toHaveCount(0);
 expect(await page.evaluate(()=>(window as any).purchases)).toHaveLength(0);
 expect(await page.evaluate(()=>(window as any).stamps)).toBe(0);
});

test('partial refund keeps the original invoice and shows exact remaining payment without a purchase conversion',async({page})=>{
 await mount(page,{paid:true,outcome:'partially_refunded'});
 await expect(page.getByRole('heading',{name:'Din betaling er delvist refunderet'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Tak for din bestilling!'})).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'Din betaling er refunderet',exact:true})).toHaveCount(0);
 await expect(page.getByRole('status')).toHaveText('Refunderet: 25. Oprindelig betaling: 125. Resterende betaling: 100.');
 await expect(page.getByText('Din faktura',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).purchases)).toHaveLength(0);expect(await page.evaluate(()=>(window as any).stamps)).toBe(0);
});
