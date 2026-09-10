const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {loadTs}=require('../helpers/load-ts.cjs');
const {checkout}=require('../helpers/checkout-fixture.cjs');
const {checkoutItems,validateCheckoutItems}=loadTs('src/lib/checkout-items.ts');
const {resolveFulfillmentTime,fulfillmentSlots}=loadTs('src/lib/fulfillment-time.ts');
const {checkoutRequestSchema}=loadTs('src/lib/checkout-schema.ts');
const openingHours=Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day=>[day,{isOpen:true,open:'12:00',close:'22:00'}]));
const location={id:'l',brandId:'b',isActive:true,deliveryTypes:['pickup','delivery'],allowPreOrder:true,prep_time:20,delivery_time:20,openingHours};
const scope={brandId:'b',locationId:'l',deliveryType:'pickup',now:new Date('2026-09-08T10:00:00Z')};
const product={id:'p',brandId:'b',locationIds:['l'],isActive:true,productName:'Pizza',price:100,categoryId:'pizza'};
const combo={id:'meal',brandId:'b',locationIds:['l'],isActive:true,comboName:'Meal',pickupPrice:100,deliveryPrice:100,orderTypes:['pickup','delivery'],productGroups:[{id:'main',groupName:'Main',productIds:['p','p2'],minSelection:1,maxSelection:1}],activeDays:[],activeTimeSlots:[]};
const catalog={products:[product,{...product,id:'p2',productName:'Pepperoni'}],combos:[combo],groups:[],toppings:[],discounts:[],upsells:[]};
const comboCart=id=>({id:'meal',cartItemId:'cart-meal',itemType:'combo',productName:'Meal',price:100,basePrice:100,quantity:1,toppings:[],comboSelections:[{groupId:'main',groupName:'Main',products:[{id,name:'browser label'}]}]});

test('after close: absolute next-opening slots include preparation and delivery, honor preorder and timezone',()=>{
 const now=new Date('2026-09-08T21:00:00Z');
 assert.equal(resolveFulfillmentTime(location,'pickup','asap',now),'2026-09-09T10:20:00.000Z');
 assert.equal(resolveFulfillmentTime(location,'delivery','asap',now),'2026-09-09T10:40:00.000Z');
 assert.throws(()=>resolveFulfillmentTime({...location,allowPreOrder:false},'pickup','asap',now));
 assert.equal(resolveFulfillmentTime(location,'delivery','asap',new Date('2026-01-05T08:00:00Z')),'2026-01-05T11:40:00.000Z');
 assert.throws(()=>resolveFulfillmentTime(location,'pickup','Today at 12:20',now));
 assert.throws(()=>resolveFulfillmentTime(location,'pickup','2020-01-01T10:20:00.000Z',now));
 assert.throws(()=>resolveFulfillmentTime({...location,deliveryTypes:['pickup']},'delivery','asap',now));
});
test('scheduled selection expires as the clock advances; next-day selection needs preorder permission',()=>{
 const at='2026-09-08T10:25:00.000Z';
 assert.equal(resolveFulfillmentTime(location,'pickup',at,new Date('2026-09-08T10:00:00Z')),at);
 assert.throws(()=>resolveFulfillmentTime(location,'pickup',at,new Date('2026-09-08T10:06:00Z')));
 assert.throws(()=>resolveFulfillmentTime({...location,allowPreOrder:false},'pickup','2026-09-09T10:20:00.000Z',scope.now));
 assert.ok(!fulfillmentSlots(location,'pickup','2026-09-07',scope.now).length);
});
test('combo mapping preserves distinct selections; server canonicalizes IDs and kitchen labels',()=>{
 const a=checkoutItems([comboCart('p')]),b=checkoutItems([comboCart('p2')]);
 assert.notDeepEqual(a,b);
 assert.equal(validateCheckoutItems(a,catalog,scope).items[0].comboSelections[0].products[0].name,'Pizza');
 assert.equal(validateCheckoutItems(b,catalog,scope).items[0].comboSelections[0].products[0].name,'Pepperoni');
 const renamed=structuredClone(catalog);renamed.combos[0].productGroups[0].groupName='Pizza choice';
 assert.equal(validateCheckoutItems(a,renamed,scope).items[0].comboSelections[0].groupName,'Pizza choice');
 // Legacy names are allowed only when they resolve uniquely to a native group.
 delete a[0].comboSelections[0].groupId;
 assert.equal(validateCheckoutItems(a,catalog,scope).items[0].comboSelections[0].groupId,'main');
});
for(const fault of ['missing','foreign-product','inactive-product','wrong-group','too-many','duplicate','inactive-combo','mode','schedule','product-disguised-as-combo'])test(`reject invalid combo ${fault}`,()=>{
 const items=checkoutItems([comboCart('p')]),data=structuredClone(catalog);
 if(fault==='missing')delete items[0].comboSelections;
 if(fault==='foreign-product')data.products[0].brandId='other';
 if(fault==='inactive-product')data.products[0].isActive=false;
 if(fault==='wrong-group')items[0].comboSelections[0].groupId='other';
 if(fault==='too-many')items[0].comboSelections[0].products.push({id:'p2',name:'Pepperoni'});
 if(fault==='duplicate')items[0].comboSelections.push(items[0].comboSelections[0]);
 if(fault==='inactive-combo')data.combos[0].isActive=false;
 if(fault==='mode')data.combos[0].orderTypes=['delivery'];
 if(fault==='schedule')data.combos[0].activeTimeSlots=[{start:'01:00',end:'02:00'}];
 if(fault==='product-disguised-as-combo')items[0].id='p';
 assert.throws(()=>validateCheckoutItems(items,data,scope));
});
test('toppings use native identities and require full price, availability, group minimum and scope',()=>{
 const data=structuredClone(catalog);data.products[0].toppingGroupIds=['g'];
 data.groups=[{id:'g',locationIds:['l'],minSelection:1,maxSelection:1}];
 data.toppings=[{id:'t',groupId:'g',locationIds:['l'],isActive:true,toppingName:'Extra cheese',price:10}];
 const item={id:'p',name:'Pizza',quantity:1,unitPrice:100,totalPrice:110,toppings:['Old name'],toppingIds:['t']};
 assert.deepEqual(validateCheckoutItems([item],data,scope).items[0].toppings,['Extra cheese']);
 assert.throws(()=>validateCheckoutItems([{...item,totalPrice:100}],data,scope),/Option prices/);
 assert.throws(()=>validateCheckoutItems([{...item,toppings:[],toppingIds:[]}],data,scope));
 data.toppings[0].isActive=false;assert.throws(()=>validateCheckoutItems([item],data,scope));
 data.toppings[0].isActive=true;data.groups[0].locationIds=['other'];assert.throws(()=>validateCheckoutItems([item],data,scope));
});
test('actual order persists combo selections and only a hash of the receipt capability before Stripe',async()=>{
 for(const id of ['p','p2']) {
  const f=await checkout({items:checkoutItems([comboCart(id)]),seed:[['comboMenus/meal',combo],['products/p2',catalog.products[1]]]});
  assert.equal(f.result.success,true,f.result.error);
  const order=f.writes.find(w=>w.ref.collection==='orders').data;
  assert.equal(order.productItems[0].comboSelections[0].products[0].id,id);
  assert.equal(order.productItems[0].comboSelections[0].groupId,'main');
  assert.equal(order.productItems[0].name,'Meal');
  assert.match(order.receiptTokenHash,/^[a-f0-9]{64}$/);assert.equal(order.receiptToken,undefined);
 }
});
for(const fault of ['past','inactive-product','inactive-location','unsupported-mode','minimum','malformed-action'])test(`actual checkout rejects ${fault} before customer/order/reservation/Stripe writes`,async()=>{
 const options={};
 if(fault==='past')options.deliveryTime='2020-01-01T10:00:00.000Z';
 if(fault==='inactive-product')options.seed=[['products/p',{...product,isActive:false}]];
 if(fault==='inactive-location')options.locationOverrides={isActive:false};
 if(fault==='unsupported-mode')options.locationOverrides={deliveryTypes:['delivery']};
 if(fault==='minimum'){options.deliveryType='delivery';options.locationOverrides={minOrder:110};options.customerOverrides={street:'Testvej 1',city:'Test',zipCode:'2900'};}
 if(fault==='malformed-action')options.customerOverrides={acceptTerms:false};
 const f=await checkout(options);assert.equal(f.result.success,false);assert.equal(f.result.retryable,true);
 assert.equal(f.writes.length,0);assert.ok(!f.events.includes('reserve'));assert.ok(!f.events.includes('stripe'));
});
test('delivery minimum uses catalog goods before discounts, without counting bag/delivery fees',async()=>{
 const f=await checkout({deliveryType:'delivery',locationOverrides:{minOrder:100},customerOverrides:{street:'Testvej 1',city:'Test',zipCode:'2900'}});
 assert.equal(f.result.success,true,f.result.error);
});

function receiptFixture({paymentStatus='Paid',stripeStatus='paid',legacy=false,fail=false}={}) {
 const token='a'.repeat(64),sessionId='cs_test_receipt_fixture_12345';let reads=0,settlements=0;
 const order={id:'ORD-FIXTURE',brandId:'b',locationId:'l',customerName:'Synthetic customer',customerContact:'synthetic@example.test',customerDetails:{id:'customer-fixture',address:'Test'},
  status:'Received',paymentStatus,createdAt:new Date('2026-09-08T10:00:00Z'),totalAmount:100,productItems:[{name:'Pizza',quantity:1,unitPrice:100,totalPrice:100}],
  psp:{checkoutSessionId:sessionId,paymentIntentId:'private-pi'},cancelTokenHash:'private-cancel-hash',privateField:'private',
  paymentDetails:{subtotal:100,taxes:0,deliveryFee:0,discountTotal:0,tips:0,paymentRefId:'private-ref'},
  ...(!legacy?{receiptTokenHash:createHash('sha256').update(token).digest('hex')}:{})};
 const snapshot={id:order.id,exists:true,data:()=>structuredClone(order)};
 const db={collection:()=>({doc:id=>({get:async()=>{reads++;return id===order.id?snapshot:{exists:false}}}),where:(_,__,value)=>({limit:()=>({get:async()=>{reads++;return {empty:value!==sessionId,docs:value===sessionId?[snapshot]:[]}}})})})};
 const mocks={'server-only':{},'firebase-admin/firestore':{},'@/lib/firebase-admin':{getAdminDb:()=>db},
  '@/app/superadmin/settings/actions':{getActiveStripeSecretKey:async()=> 'fixture'},
  stripe:{default:class Stripe{checkout={sessions:{retrieve:async()=>{if(fail)throw Error('network');return{id:sessionId,status:stripeStatus==='expired'?'expired':'complete',payment_status:stripeStatus,metadata:{orderId:order.id,brandId:'b',locationId:'l'}}}}};}},
  './settle-checkout':{settlePaidCheckoutSession:async()=>{settlements++;order.paymentStatus='Paid';}},
 };
 const api=loadTs('src/lib/server/guest-receipt.ts',mocks);
 return {api,order,proof:{sessionId,receiptToken:token,orderId:order.id,brandId:'b',locationId:'l'},reads:()=>reads,settlements:()=>settlements};
}
test('receipt denies order ID alone, wrong/missing token, session, order, brand and location; projects minimal data',async()=>{
 const f=receiptFixture();
 for(const patch of [{sessionId:undefined},{receiptToken:undefined},{receiptToken:'b'.repeat(64)},{sessionId:'cs_test_wrong_session_12345'},{orderId:'ORD-OTHER'},{brandId:'other'},{locationId:'other'}]) {
  assert.equal(await f.api.readGuestReceipt({...f.proof,...patch}),null);
 }
 const receipt=await f.api.readGuestReceipt(f.proof);assert.equal(receipt.customerContact,'synthetic@example.test');
 for(const key of ['psp','cancelTokenHash','receiptTokenHash','privateField'])assert.equal(key in receipt,false);
 assert.equal('paymentRefId' in receipt.paymentDetails,false);
});
test('legacy receipt still requires its exact random Stripe session and matching restaurant',async()=>{
 const f=receiptFixture({legacy:true});
 assert.ok(await f.api.readGuestReceipt({...f.proof,receiptToken:undefined}));
 assert.equal(await f.api.readGuestReceipt({...f.proof,sessionId:undefined}),null);
 assert.equal(await f.api.readGuestReceipt({...f.proof,brandId:'wrong'}),null);
});
test('delayed webhook reconciliation reports paid only after shared settlement; timeout remains Pending',async()=>{
 const paid=receiptFixture({paymentStatus:'Pending'});
 assert.equal((await paid.api.readGuestReceipt(paid.proof)).paymentStatus,'Paid');assert.equal(paid.settlements(),1);
 await paid.api.readGuestReceipt(paid.proof);assert.equal(paid.settlements(),2); // Paid receipt can repair a missing job through idempotent settlement.
 for(const options of [{stripeStatus:'unpaid'},{fail:true}]) {
  const pending=receiptFixture({paymentStatus:'Pending',...options});
  assert.equal((await pending.api.readGuestReceipt(pending.proof)).paymentStatus,'Pending');assert.equal(pending.settlements(),0);
 }
 const expired=receiptFixture({paymentStatus:'Pending',stripeStatus:'expired'});
 assert.equal((await expired.api.readGuestReceipt(expired.proof)).paymentStatus,'Failed');assert.equal(expired.settlements(),0);
});

function hookFixture({analytics=()=>{},cart={}}={}) {
 const state=[];let index=0;const navigations=[];
 const hooks={useRef:value=>{const i=index++;return state[i]||=( {current:value});},useState:value=>{const i=index++;if(!(i in state))state[i]=value;return[state[i],next=>{state[i]=typeof next==='function'?next(state[i]):next}]}};
 const api=loadTs('src/hooks/use-menu-checkout.ts',{
  react:hooks,'next/navigation':{useRouter:()=>({push:path=>navigations.push(path)})},
  '@/context/cart-context':{useCart:()=>({brand:{id:'b',slug:'brand'},location:{id:'l',slug:'location'},cartReady:true,deliveryType:'pickup',cartItems:[{...comboCart('p'),tags:[]}],checkoutTotal:100,itemCount:1,...cart})},
  '@/context/analytics-context':{useAnalytics:()=>({trackEvent:analytics})},
 });
 const render=()=>{index=0;return api.useMenuCheckout()};
 return{first:render(),render,navigations};
}
test('menu checkout navigates immediately, ignores optional analytics failure and repeated clicks',()=>{
 const f=hookFixture({analytics:()=>{throw Error('analytics offline')}});
 f.first.handleCheckoutClick();f.first.handleCheckoutClick();f.render().handleCheckoutClick();
 assert.deepEqual(f.navigations,['/brand/location/checkout']);assert.equal(f.render().isPending,true);
});
test('menu checkout stays put until the cart context is ready and complete',()=>{
 for(const cart of [{cartReady:false},{brand:null},{location:null},{deliveryType:null},{cartItems:[]}]) {
  const f=hookFixture({cart});f.first.handleCheckoutClick();assert.deepEqual(f.navigations,[]);
 }
});

function loadComponent(file,mocks={}) {
 const fs=require('node:fs'),ts=require('typescript'),React=require('react');
 const source=fs.readFileSync(file,'utf8');
 const ui=new Proxy({}, {get:()=>function Component({children,...props}){return React.createElement('div',null,children)}});
 const defaults=Object.fromEntries([...source.matchAll(/from ['"]([^'"]+)['"]/g)].map(m=>[m[1],ui]));
 Object.assign(defaults,{'react':React,'react/jsx-runtime':require('react/jsx-runtime'),'next/link':{default:({children})=>React.createElement('a',null,children)},'date-fns-tz':require('date-fns-tz')},mocks);
 const mod={exports:{}};const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('require','module','exports',code)(id=>defaults[id]||require(id),mod,mod.exports);return mod.exports;
}
test('real receipt component displays Pending/Failed truthfully and includes combo choices only on paid receipt',async()=>{
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
 const {ConfirmationClient}=loadComponent('src/app/[brandSlug]/[locationSlug]/checkout/confirmation/confirmation-client.tsx',{
  '@/context/cart-context':{useCart:()=>({completeCheckout:()=>{throw Error('SSR must not clear cart')}})},
  '@/lib/storefront-format':loadTs('src/lib/storefront-format.ts'),
 });
 const f=receiptFixture();const order=await f.api.readGuestReceipt(f.proof);
 const render=paymentStatus=>renderToStaticMarkup(React.createElement(ConfirmationClient,{order:{...order,paymentStatus,productItems:[{...order.productItems[0],comboSelections:[{groupId:'g',groupName:'Pizza choice',products:[{id:'p2',name:'Pepperoni'}]}]}]},brand:{id:'b',slug:'brand'},location:{id:'l',slug:'location'},sessionId:f.proof.sessionId,receiptToken:f.proof.receiptToken}));
 assert.match(render('Pending'),/Afventer bekræftelse af betaling/);assert.doesNotMatch(render('Pending'),/er bekræftet/);
 assert.match(render('Failed'),/Betalingen blev ikke gennemført/);assert.doesNotMatch(render('Failed'),/er bekræftet/);
 assert.match(render('Paid'),/er bekræftet/);assert.match(render('Paid'),/Pizza choice: Pepperoni/);
});

test('lookup endpoint enforces store scope and returns no cacheable receipt or error details',async()=>{
 let seen;
 const api=loadTs('src/app/api/orders/lookup-by-session/route.ts',{
  '@/lib/server/guest-receipt':{readGuestReceipt:async proof=>{seen=proof;return null;}},
 });
 let response=await api.GET(new Request('https://example.test/api/orders/lookup-by-session?session_id=cs_test_example'));
 assert.equal(response.status,400);assert.equal(seen,undefined);
 response=await api.GET(new Request('https://example.test/api/orders/lookup-by-session?session_id=cs_test_example&brand_id=b&location_id=l&receipt_token=proof'));
 assert.equal(seen.receiptToken,'proof');assert.equal(seen.brandId,'b');assert.equal(seen.locationId,'l');
 assert.equal(response.headers.get('cache-control'),'private, no-store');assert.deepEqual(await response.json(),{found:false});
});
test('unknown or duplicated optional combo groups cannot be silently dropped at checkout',()=>{
 const data=structuredClone(catalog);data.combos[0].productGroups[0].minSelection=0;
 const items=checkoutItems([comboCart('p')]);items[0].comboSelections[0].groupId='unknown';
 assert.throws(()=>validateCheckoutItems(items,data,scope));
 items[0].comboSelections[0].groupId='main';
 data.combos[0].productGroups.push({id:'extra',groupName:'Extras',productIds:['p2'],minSelection:0,maxSelection:1});
 items[0].comboSelections.push({...items[0].comboSelections[0],groupId:undefined});
 assert.throws(()=>validateCheckoutItems(items,data,scope));
});
test('a slot expiring during reservation releases only that order hold and never calls Stripe',async()=>{
 const RealDate=Date;let now='2026-09-08T10:00:00Z';
 global.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return new RealDate(now).getTime();}};
 try {
  const f=await checkout({realReservations:true,deliveryTime:'2026-09-08T10:25:00.000Z',beforeStripe:()=>{now='2026-09-08T10:10:00Z';}});
  assert.equal(f.result.success,false);assert.equal(f.result.retryable,true);assert.match(f.result.error,/order time/);
  assert.ok(f.events.includes('reserve'));assert.ok(f.events.includes('release'));assert.ok(!f.events.includes('stripe'));
  assert.equal(f.records.get('orders/ORD-TEST').discountReservation,'released');
 }finally{global.Date=RealDate;}
});

test('Paid receipt retries verified settlement but preserves Paid on Stripe timeout/expired response',async()=>{
 const paid=receiptFixture();await paid.api.readGuestReceipt(paid.proof);assert.equal(paid.settlements(),1);
 for(const options of [{fail:true},{stripeStatus:'expired'},{stripeStatus:'unpaid'}]){
  const f=receiptFixture(options);assert.equal((await f.api.readGuestReceipt(f.proof)).paymentStatus,'Paid');assert.equal(f.settlements(),0);
 }
});
