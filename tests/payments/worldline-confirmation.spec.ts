import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import ts from 'typescript';
const order={id:'ORD-123',brandId:'b',locationId:'l',createdAt:'2026-11-12T12:00:00Z',customerName:'Synthetic guest',customerContact:'synthetic@example.test',deliveryType:'Pickup',deliveryTime:'12:30',status:'Pending',paymentStatus:'Pending',paymentMethod:'Worldline',totalAmount:125,productItems:[],customerDetails:{id:'c',address:'For Pickup'},paymentDetails:{subtotal:125,taxes:0,deliveryFee:0,discountTotal:0,tips:0}};
async function mount(page:any,{missing=false,outage=false}={}){
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
 await page.evaluate(({code,order,missing}:any)=>{
  const w=window as any,R=w.React;w.completed=[];w.purchases=[];w.paymentReady=false;
  const complete=(...args:any[])=>w.completed.push(args);
  const primitive=(tag:string)=>(props:any)=>R.createElement(tag,{...props,variant:undefined,asChild:undefined},props.children);
  const ui=new Proxy({}, {get:(_,name:string)=>primitive(name.includes('Title')?'h2':name.includes('Button')?'button':'div')});
  const require=(name:string):any=>{
   if(name==='react')return R;
   if(name==='next/link')return {default:primitive('a')};
   if(name==='lucide-react')return new Proxy({},{get:()=>primitive('span')});
   if(name.includes('/ui/'))return ui;
   if(name.includes('stamp-celebration'))return {StampCelebration:()=>null};
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
 },{code,order,missing});
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
