const {test}=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {moduleGraph}=require('../helpers/load-ts-graph.cjs');
function fixture({worldlineFailure=false}={}){
 const token='a'.repeat(64),sessionId='cs_test_12345678';let order={id:'o',brandId:'b',locationId:'l',paymentMethod:'Stripe',paymentStatus:'Pending',status:'Pending',deliveryType:'Pickup',createdAt:new Date('2026-11-12T12:00:00Z'),totalAmount:125,customerName:'Synthetic',customerContact:'synthetic@example.test',customerDetails:{id:'c',address:'For Pickup'},productItems:[],paymentDetails:{subtotal:125,taxes:25,discountTotal:0,deliveryFee:0,tips:0,paymentRefId:''},psp:{provider:'stripe',checkoutSessionId:sessionId},paymentAgreement:{synthetic:true},receiptTokenHash:createHash('sha256').update(token).digest('hex')};let session={id:sessionId,mode:'payment',status:'complete',payment_status:'paid',currency:'dkk',amount_total:12500,livemode:false,metadata:{orderId:'o',brandId:'b',locationId:'l'}};let fetched=0,settled=0;
 let worldlineReconciled=0;
 const load=moduleGraph({'server-only':{},'@/app/checkout/order-actions':{getOrderById:async()=>structuredClone(order),getOrderByCheckoutSessionId:async()=>structuredClone(order)},'@/lib/payments/stripe-order':{stripeForOrder:async()=>{fetched++;return {checkout:{sessions:{retrieve:async()=>session}}};},assertStripeOrderSession:(id,o,s)=>{if(s.amount_total!==Math.round(o.totalAmount*100)||s.metadata?.brandId!==o.brandId||s.id!==o.psp?.checkoutSessionId)throw Error('scope');return s;}},'./settle-checkout':{settleFreeCheckoutOrder:async()=>{settled++;order.paymentStatus='Paid';},settlePaidCheckoutSession:async()=>{settled++;order.paymentStatus='Paid';}},'@/lib/payments/worldline-reconcile':{reconcileWorldlineOrder:async()=>{worldlineReconciled++;if(worldlineFailure)throw Error('provider unavailable');order.paymentStatus='Paid';order.status='Received';}},'@/lib/server/payment-settings':{getActiveStripeSecretKey:async()=>{throw Error('No current global key may be used');}},'@/lib/delivery/tracking-server':{readReceiptDeliveryTracking:async()=>null},'@/lib/delivery/payments/stripe-authority':{}});
 return {api:load('src/lib/server/guest-receipt.ts'),token,sessionId,get:()=>order,set:v=>order={...order,...v},session:v=>session={...session,...v},counts:()=>({fetched,settled}),worldlineCalls:()=>worldlineReconciled};
}
test('pinned Stripe receipt reconciles without reading the current global gateway',async()=>{const f=fixture();const receipt=await f.api.readGuestReceipt({orderId:'o',sessionId:f.sessionId,receiptToken:f.token});assert.equal(receipt.paymentStatus,'Paid');assert.deepEqual(f.counts(),{fetched:1,settled:1});assert.equal(receipt.paymentAgreement,undefined);assert.equal(receipt.psp,undefined);});
test('wrong Stripe provider observation never becomes a receipt or settlement',async()=>{const f=fixture();f.session({amount_total:1});assert.equal(await f.api.readGuestReceipt({orderId:'o',sessionId:f.sessionId,receiptToken:f.token}),null);assert.equal(f.counts().settled,0);});
test('Free receipt accepts only its dedicated token and never calls Stripe for pickup or delivery',async()=>{for(const deliveryType of ['Pickup','Delivery']){const f=fixture();f.set({paymentMethod:'Free',paymentStatus:'Paid',status:'Received',totalAmount:0,psp:undefined,paymentAgreement:undefined,deliveryType});assert.equal((await f.api.readGuestReceipt({orderId:'o',receiptToken:f.token})).paymentStatus,'Paid');assert.deepEqual(f.counts(),{fetched:0,settled:0});assert.equal(await f.api.readGuestReceipt({orderId:'o',receiptToken:'b'.repeat(64)}),null);assert.equal(await f.api.readGuestReceipt({orderId:'o',receiptToken:f.token,sessionId:f.sessionId}),null);}});
test('Free receipt fails closed for nonzero amount, missing token hash or PSP contamination',async()=>{for(const patch of [{totalAmount:1},{receiptTokenHash:undefined},{psp:{provider:'stripe',checkoutSessionId:'cs_test_12345678'}}]){const f=fixture();f.set({paymentMethod:'Free',paymentStatus:'Paid',totalAmount:0,psp:undefined,paymentAgreement:undefined,...patch});assert.equal(await f.api.readGuestReceipt({orderId:'o',receiptToken:f.token}),null);assert.deepEqual(f.counts(),{fetched:0,settled:0});}});

test('Free Pending receipt reconciles only after valid token and never uses a provider',async()=>{
 const f=fixture();f.set({paymentMethod:'Free',paymentStatus:'Pending',totalAmount:0,psp:undefined,paymentAgreement:undefined});
 assert.equal(await f.api.readGuestReceipt({orderId:'o',receiptToken:'b'.repeat(64)}),null);assert.equal(f.counts().settled,0);
 const receipt=await f.api.readGuestReceipt({orderId:'o',receiptToken:f.token});assert.equal(receipt.paymentStatus,'Paid');assert.deepEqual(f.counts(),{fetched:0,settled:1});
});

function worldline(options){const f=fixture(options);f.set({paymentMethod:'Worldline',psp:{provider:'worldline',transactionId:'123',checkoutSessionId:'private-worldline-session'}});return f;}
test('Worldline confirmation projection stays Pending without a provider operation',async()=>{
 const f=worldline();const receipt=await f.api.readGuestReceipt({orderId:'o',receiptToken:f.token,brandId:'b',locationId:'l'},{reconcileWorldlinePayment:false});
 assert.equal(receipt.paymentStatus,'Pending');assert.equal(receipt.status,'Pending');assert.equal(f.worldlineCalls(),0);assert.deepEqual(f.counts(),{fetched:0,settled:0});
 assert.equal(receipt.psp,undefined);assert.equal(receipt.paymentAgreement,undefined);assert.equal(receipt.receiptTokenHash,undefined);assert.doesNotMatch(JSON.stringify(receipt),/private-worldline-session/);
});
test('default Worldline receipt reconciliation remains enabled for API recovery',async()=>{
 const f=worldline();const receipt=await f.api.readGuestReceipt({orderId:'o',receiptToken:f.token});
 assert.equal(receipt.paymentStatus,'Paid');assert.equal(receipt.status,'Received');assert.equal(f.worldlineCalls(),1);assert.deepEqual(f.counts(),{fetched:0,settled:0});
});
test('Worldline receipt failure stays Pending rather than manufacturing paid status',async()=>{
 const f=worldline({worldlineFailure:true});const receipt=await f.api.readGuestReceipt({orderId:'o',receiptToken:f.token});
 assert.equal(receipt.paymentStatus,'Pending');assert.equal(f.worldlineCalls(),1);
});
test('Worldline projection never bypasses receipt capability or tenant scope',async()=>{
 for(const options of [{},{reconcileWorldlinePayment:false}])for(const proof of [
  {orderId:'o',receiptToken:'b'.repeat(64)},
  {orderId:'o',receiptToken:'a'.repeat(64),brandId:'other'},
  {orderId:'o',receiptToken:'a'.repeat(64),locationId:'other'},
  {orderId:'o',receiptToken:'a'.repeat(64),sessionId:'cs_test_12345678'},
 ]){const f=worldline();assert.equal(await f.api.readGuestReceipt(proof,options),null);assert.equal(f.worldlineCalls(),0);assert.deepEqual(f.counts(),{fetched:0,settled:0});}
});
test('status-only Worldline reads retain existing no-reconciliation behavior',async()=>{
 const f=worldline();assert.equal((await f.api.readGuestReceipt({orderId:'o',receiptToken:f.token},{reconcilePayment:false})).paymentStatus,'Pending');assert.equal(f.worldlineCalls(),0);
});
test('Worldline-only projection option preserves Stripe, Free and pickup behavior',async()=>{
 const options={reconcileWorldlinePayment:false};
 const stripe=fixture();assert.equal((await stripe.api.readGuestReceipt({orderId:'o',sessionId:stripe.sessionId,receiptToken:stripe.token},options)).paymentStatus,'Paid');assert.deepEqual(stripe.counts(),{fetched:1,settled:1});
 const free=fixture();free.set({paymentMethod:'Free',totalAmount:0,psp:undefined});assert.equal((await free.api.readGuestReceipt({orderId:'o',receiptToken:free.token},options)).paymentStatus,'Paid');assert.deepEqual(free.counts(),{fetched:0,settled:1});
 const pickup=fixture();pickup.set({paymentMethod:'PayAtPickup',status:'Received',psp:undefined});assert.equal((await pickup.api.readGuestReceipt({orderId:'o',receiptToken:pickup.token},options)).paymentStatus,'Pending');assert.deepEqual(pickup.counts(),{fetched:0,settled:0});
});

test('native confirmation page requests a scoped receipt projection without Worldline reconciliation',async()=>{
 const fs=require('node:fs'),ts=require('typescript');const calls=[];const view={id:'o',paymentStatus:'Pending',status:'Pending'};
 const exports={};const mocks={
  '@/app/superadmin/brands/actions':{getBrandBySlug:async()=>({id:'b',slug:'brand'})},
  '@/lib/data/brand-location':{getLocationBySlug:async()=>({id:'l',slug:'location',brandId:'b'})},
  '@/lib/server/guest-receipt':{readGuestReceipt:async(proof,options)=>{calls.push({proof,options});return view;}},
  './confirmation-client':{ConfirmationClient:()=>null},
  '@/lib/next/resolve-props':{resolveParams:async p=>p,resolveSearchParams:async p=>p},
 };
 const code=ts.transpileModule(fs.readFileSync('src/app/[brandSlug]/[locationSlug]/checkout/confirmation/page.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},fileName:'page.tsx'}).outputText;
 new Function('require','exports',code)(name=>mocks[name]||require(name),exports);
 const page=await exports.default({params:{brandSlug:'brand',locationSlug:'location'},searchParams:{order_id:'o',receipt_token:'a'.repeat(64)}});
 assert.equal(page.props.order.paymentStatus,'Pending');assert.equal(page.props.order.status,'Pending');
 assert.deepEqual(calls,[{proof:{orderId:'o',sessionId:undefined,receiptToken:'a'.repeat(64),brandId:'b',locationId:'l'},options:{reconcileWorldlinePayment:false}}]);
 calls.length=0;const missing=await exports.default({params:{brandSlug:'brand',locationSlug:'location'},searchParams:{order_id:'o'}});assert.equal(missing.props.order,null);assert.equal(calls.length,0);
});
