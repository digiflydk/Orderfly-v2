const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {loadTs}=require('../helpers/load-ts.cjs');
function component(file,mocks={}){
 const source=fs.readFileSync(file,'utf8');
 const ui=new Proxy({}, {get:()=>({children})=>React.createElement('div',null,children)});
 const defaults=Object.fromEntries([...source.matchAll(/from ['"]([^'"]+)['"]/g)].map(m=>[m[1],ui]));
 Object.assign(defaults,{'react':React,'react/jsx-runtime':require('react/jsx-runtime'),'next/link':{default:({children,...props})=>React.createElement('a',props,children)}},mocks);
 const exports={};const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},fileName:'component.tsx'}).outputText;
 new Function('require','exports',code)(id=>defaults[id]||require(id),exports);return exports;
}
const icons=new Proxy({}, {get:(_,name)=>props=>React.createElement('svg',{'data-icon':String(name)})});
const {ConfirmationClient}=component('src/app/[brandSlug]/[locationSlug]/checkout/confirmation/confirmation-client.tsx',{
 'lucide-react':icons,
 '@/context/cart-context':{useCart:()=>({completeCheckout:()=>{throw Error('Rendering cannot complete a checkout');}})},
 '@/lib/storefront-format':loadTs('src/lib/storefront-format.ts'),
 '@/hooks/use-storefront-path':{useStorefrontPath:()=>()=>'/menu'},
 '@/lib/merchant-payment-methods':{paymentMethodLabel:()=> 'Online betaling'},
 '@/components/checkout/stamp-celebration':{StampCelebration:()=>React.createElement('div',{'data-stamp-celebration':true})},
 '@/components/checkout/managed-delivery-tracking':{ManagedDeliveryTracking:()=>React.createElement('div',{'data-delivery-tracking':true})},
});
const invoice={number:'TEST-INVOICE',issuedAt:'2026-11-13T10:00:00Z',seller:{legalName:'Synthetic Seller',registrationNumber:'12345678',address:'Synthetic Address'}};
const order={id:'ORD-123',brandId:'b',locationId:'l',paymentMethod:'Worldline',paymentStatus:'Pending',status:'Pending',deliveryType:'Pickup',deliveryTime:'2026-11-13T10:00:00Z',createdAt:'2026-11-13T00:00:00Z',customerName:'Synthetic Guest',customerContact:'synthetic@example.test',customerDetails:{id:'c',address:'For Pickup'},totalAmount:125,productItems:[{id:'pizza',name:'Testpizza',quantity:1,totalPrice:125,unitPrice:125}],paymentDetails:{subtotal:125,taxes:0,deliveryFee:0,discountTotal:0,tips:0}};
const render=(patch={},extra={})=>renderToStaticMarkup(React.createElement(ConfirmationClient,{order:{...order,...patch},orderId:order.id,receiptToken:'a'.repeat(64),brand:{id:'b',slug:'brand'},location:{id:'l',slug:'location'},...extra}));
test('authenticated Pending Worldline shows complete order details inline without paid claims',()=>{
 const html=render({invoice});
 for(const text of ['Din bestilling','ORD-123','Synthetic Guest','Testpizza','Kundeoplysninger','Ordreoplysninger','Din ordreoversigt','Betalingsstatus','Behandles'])assert.ok(html.includes(text),text);
 assert.doesNotMatch(html,/Afventer bekræftelse af betaling|Vi kontrollerer din betaling|Tak for din bestilling|er bekræftet|Din faktura|TEST-INVOICE|Synthetic Seller|Giv feedback|data-stamp-celebration|data-icon="CheckCircle2"|bg-green-100/);
});
test('verified Paid Worldline retains successful receipt, invoice and feedback',()=>{
 const html=render({paymentStatus:'Paid',status:'Received',invoice});
 for(const text of ['Tak for din bestilling!','er bekræftet','Din faktura','TEST-INVOICE','Synthetic Seller','Betalt','Giv feedback','data-stamp-celebration','data-icon="CheckCircle2"'])assert.ok(html.includes(text),text);
 assert.doesNotMatch(html,/Behandles/);
});
test('Worldline failure and cancellation never show a successful or inline pending receipt',()=>{
 for(const [patch,title] of [[{paymentStatus:'Failed'},'Betalingen blev ikke gennemført'],[{status:'Canceled'},'Ordren er annulleret'],[{paymentStatus:'Paid',status:'Canceled'},'Ordren er annulleret']]){
  const html=render(patch);assert.ok(html.includes(title));assert.doesNotMatch(html,/Tak for din bestilling|er bekræftet|data-stamp-celebration|data-icon="CheckCircle2"|Behandles/);
 }
});
test('refunded or unbooked managed delivery remains distinct from payment confirmation',()=>{
 const refunded=render({paymentStatus:'Paid',status:'Canceled',managedDeliveryTracking:{paymentStatus:'refunded',bookingState:'rejected',deliveryStatus:'failed'}});
 assert.match(refunded,/Din betaling er refunderet/);assert.match(refunded,/Refunderet/);assert.doesNotMatch(refunded,/Tak for din bestilling|er bekræftet|data-stamp-celebration/);
 const unconfirmed=render({paymentStatus:'Paid',status:'Pending',deliveryType:'Delivery',managedDeliveryTracking:{paymentStatus:'paid',bookingState:'pending'}});
 assert.match(unconfirmed,/Tak for din bestilling!/);assert.match(unconfirmed,/er betalt\. Leveringen er endnu ikke bekræftet/);assert.doesNotMatch(unconfirmed,/Vi kontrollerer din levering|er bekræftet\.|data-icon="CheckCircle2"/);
 const stripeUnconfirmed=render({paymentMethod:'Stripe',paymentStatus:'Paid',status:'Pending',deliveryType:'Delivery',managedDeliveryTracking:{paymentStatus:'paid',bookingState:'pending'}});
 assert.match(stripeUnconfirmed,/Vi kontrollerer din levering/);assert.doesNotMatch(stripeUnconfirmed,/Tak for din bestilling!/);
});
test('Stripe and Free Pending retain their existing separate pending behavior',()=>{
 for(const paymentMethod of ['Stripe','Free']){
  const html=render({paymentMethod});assert.match(html,/Afventer bekræftelse af betaling/);assert.doesNotMatch(html,/Testpizza|Din ordreoversigt|Behandles/);
 }
});
test('accepted unpaid pickup retains its existing receipt and restaurant-payment instruction',()=>{
 const html=render({paymentMethod:'PayAtPickup',status:'Received'});
 assert.match(html,/Betales ved afhentning/);assert.match(html,/Din ordreoversigt/);assert.match(html,/Giv feedback/);assert.doesNotMatch(html,/Din faktura|Behandles/);
});
test('missing private receipt data never becomes a fabricated order summary',()=>{
 const html=render({}, {order:null});assert.match(html,/Kontrollerer betaling/);assert.doesNotMatch(html,/Testpizza|Synthetic Guest|Din ordreoversigt|Behandles|TEST-INVOICE/);
});
test('initial route shell follows receipt layout without interstitial or invoice claims',()=>{
 const {default:Loading}=component('src/app/[brandSlug]/[locationSlug]/checkout/confirmation/loading.tsx');
 const html=renderToStaticMarkup(React.createElement(Loading));
 for(const text of ['Din bestilling','Kundeoplysninger','Ordreoplysninger','Din ordreoversigt','aria-busy="true"'])assert.ok(html.includes(text));
 assert.doesNotMatch(html,/Vi kontrollerer betalingen|Vent et øjeblik|Din faktura|ORD-123|Testpizza|Tak for din bestilling|data-icon="CheckCircle2"/);
});
