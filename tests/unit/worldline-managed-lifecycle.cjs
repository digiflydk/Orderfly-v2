const { test } = require('node:test');
const { createHmac } = require('node:crypto');
const assert = require('node:assert/strict');
const { checkout } = require('../helpers/checkout-fixture.cjs');
const { memoryDb } = require('../helpers/marketing-db.cjs');
const { moduleGraph } = require('../helpers/load-ts-graph.cjs');

// Real post-authorization payment/delivery domain modules. Initial checkout quote/session
// and external HTTP, native database/session identity inputs are synthetic fixtures.
const environment = {
  ORDERFLY_PRINT_INTENTS_ENABLED: 'true',
  ORDERFLY_DELIVERY_ENVIRONMENT: 'sandbox',
  ORDERFLY_DELIVERY_DISPATCH_ENABLED: 'true',
  ORDERFLY_DELIVERY_CALLBACK_ENABLED: 'true',
};
const previousEnvironment = Object.fromEntries(Object.keys(environment).map(key => [key, process.env[key]]));
Object.assign(process.env, environment);
process.on('exit', () => {
  for (const [key, value] of Object.entries(previousEnvironment)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
const printerPath = id => 'locations/l/printers/' + id;
const policyPath = 'locations/l/printIntentPolicies/original';
const rulesPath = 'locations/l/printerRouting/original';
const worldlineBinding={provider:'worldline',mode:'test',owner:{brandId:'b'},merchantNumber:'T123',revision:1,reference:`projects/orderfly-39325/secrets/orderfly-worldline-${'a'.repeat(64)}-test/versions/1`};
const worldlineCredentials={merchantNumber:'T123',accessToken:'fixture-access',secretToken:'fixture-secret',md5Key:'fixture-md5'};
async function nativeCheckout(){
 const created=await checkout({realReservations:true,deliveryType:'delivery',brandOverrides:{companyRegNo:'12345678',companyName:'Fixture ApS',street:'Testvej 1',zipCode:'2300',city:'København',country:'DK',currency:'DKK'},customerOverrides:{street:'Testvej 2',zipCode:'2300',city:'København'},paymentOverrides:{deliveryFee:10},managedDeliveryAcceptance:{checkoutKey:'a'.repeat(64),quoteId:'Q',quoteToken:'b'.repeat(64),checkoutFingerprint:'c'.repeat(64),customerFeeMinor:1000,checkoutTotalMinor:11400,currency:'DKK'},configureMocks:({mocks})=>{
  mocks['@/lib/payments/merchant-agreement']={resolveMerchantAgreement:async()=>({...worldlineBinding,credentials:worldlineCredentials}),resolveLegacyStripeAgreement:async()=>{throw Error('Unexpected Stripe fallback');}};
  mocks['@/lib/payments/worldline-client']={createWorldlineCheckoutSession:async()=>({token:'worldline-session',url:'https://v1.checkout.bambora.com/worldline-session'})};
  mocks['@/lib/delivery/quotes/runtime']={managedDeliveryRuntimeAvailable:async()=>true,managedDeliveryRuntimeEnvironment:async()=> 'sandbox',assertManagedCheckoutRuntime:async()=>{}};
  mocks['@/lib/delivery/quotes/adoption']={managedDeliveryRequired:async()=>true};
  mocks['@/lib/delivery/quotes/customer-controller']={currentNativeManagedDraft:async()=>({binding:{fulfillmentAt:new Date(Date.now()+600000).toISOString()}})};
  mocks['@/lib/delivery/quotes/customer-store']={prepareCustomerQuoteConsumption:async()=>({quote:{quoteRef:'Q',contentDigest:'d'.repeat(64),binding:{providerId:'wolt'},economics:{customerFee:{amountMinor:1000,currency:'DKK'}},expiresAtMs:Date.now()+300000,fulfillment:{readyAt:new Date(Date.now()+600000).toISOString(),desiredDelivery:{kind:'asap'}}},apply:()=>{}})};
  mocks['@/lib/delivery/payments/stripe-authority']={resolveManagedStripeGateway:async()=>{throw Error('Unexpected Stripe account');}};
 }});
 assert.equal(created.result.success,true,created.result.error);
 const records=created.records,db=memoryDb(records),native=db.runTransaction;
 db.runTransaction=(run)=>native(async tx=>{let writing=false;return run({...tx,get:ref=>{assert.equal(writing,false,'all reads precede writes');return tx.get(ref);},set:(...args)=>{writing=true;return tx.set(...args);},create:(...args)=>{writing=true;return tx.create(...args);},update:(ref,changes)=>{writing=true;const patch={...changes};for(const key of Object.keys(changes).filter(k=>k.includes('.'))){const[parent,field]=key.split('.');patch[parent]={...records.get(ref.path)?.[parent],...patch[parent],[field]:changes[key]};delete patch[key];}return tx.update(ref,patch);}});});
 const identity={provider:'firebase',subject:'employee'},actorId=moduleGraph({'server-only':{}})('src/lib/access/authority.ts').principalKey(identity);
 records.set('platformAdminControl/access-v1',{principals:[{id:actorId,active:true}],companies:[{id:'company',active:true,locationIds:['l'],orderflyBrandIds:['b']}],roles:[{id:'employee',name:'Employee',companyId:'company',kind:'company_user',active:true,permissions:['orderfly.orders:view','orderfly.orders:edit','orderfly.catalog:view']}],memberships:[{id:'membership',principalId:actorId,companyId:'company',locationIds:['l'],roleIds:['employee'],active:true}]});
 const mocks={'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db,getAdminFieldValue:()=>({serverTimestamp:()=>new Date()})},'@/lib/access/orderfly-session':{verifiedOrderflyIdentity:async()=>identity},'@/lib/analytics-server':{trackServerEvent:async()=>{}},'@/lib/marketing/config':{paidOrderMarketingEnabled:()=>false},'@/lib/feedback/mail-queue':{queueOrderFeedback:async()=>{}},'next/cache':{revalidatePath:()=>{},revalidateTag:()=>{}}};
 return{...created,db,mocks,orderId:created.result.orderId,order:()=>records.get('orders/'+created.result.orderId)};
}
async function fixture(options = {}) {
  const f = await nativeCheckout();
  f.records.set('platform_settings/payment_gateway',{activeMode:'live',live:{secretKey:'sk_live_current_unused'}});
  f.records.get('brands/b').status = 'active';
  Object.assign(f.order(), { status:'Pending',psp:{provider:'worldline',transactionId:'123',checkoutSessionId:'worldline-session'} });
  f.records.set('categories/pizza', { isActive: true, locationIds: ['l'] });
  const printer = id => ({ schemaVersion: 1, configuration: { id, brandId: 'b', locationId: 'l', name: id,
    manufacturer: 'star', model: 'mc-print3', transport: 'cloudprnt-http', paperWidthMm: 80, state: 'paused' }, revision: 1, deletedAt: null });
  for (const id of ['pizza']) f.records.set(printerPath(id), printer(id));
  f.records.set(policyPath, { schemaVersion: 1, id: 'original', brandId: 'b', locationId: 'l', revision: 1, enabled: true, deletedAt: null,
    targets: ['pizza'].map(printerId => ({ printerId, printerRevision: 1, kinds: ['kitchen'] })) });
  f.records.set(rulesPath, { schemaVersion: 1, id: 'original', brandId: 'b', locationId: 'l', revision: 1, deletedAt: null,
    rules: ['pizza'].map(printerId => ({ id: 'rule-' + printerId, brandId: 'b', locationId: 'l', printerId, match: { type: 'category', id: 'pizza' }, effect: 'include' })) });
  const collection = f.db.collection;
  const wrapRef = ref => ({ ...ref, collection: child => query(collection(ref.path + '/' + child)) });
  const query = native => ({ ...native, doc: id => wrapRef(native.doc(id)),
    where: (...args) => query(native.where(...args)), orderBy: (...args) => query(native.orderBy(...args)), limit: count => query(native.limit(count)),
    get: async () => { const result = await native.get(); return { ...result, size: result.docs.length }; },
  });
  f.db.collection = name => query(collection(name));
  // memoryDb serializes commits; the native payment fixture asserts all reads precede writes.
  const scope={brandId:'b',locationId:'l',orderId:f.orderId},requestDigest='a'.repeat(64);
  Object.assign(f.order(),{paymentStatus:'Pending',deliveryType:'Delivery',managedDelivery:{version:1,providerId:'wolt',quoteRef:'quote',requestDigest}});
  // The generic fixture starts as pickup; managed checkout has no acceptance notification yet.
  for(const [path] of f.records)if(path.startsWith('orderNotificationJobs/')||path.startsWith('marketingOrderOutbox/'))f.records.delete(path);
  f.records.set('worldlinePaymentJobs/'+f.orderId,{state:'pending',orderId:f.orderId,brandId:'b',locationId:'l',transactionId:'123',nextAttemptAt:Date.now()});
  const amountMinor=Math.round(f.order().totalAmount*100);
  let captured=0,credited=0,loseNextPaymentRead=false;const paymentNetwork=[];
  const afterCallbacks=[];
  const load = moduleGraph({ ...f.mocks, react:require('next/dist/compiled/react'), 'next/server':{after:callback=>{assert.equal(f.order().paymentStatus,'Paid');assert.equal(f.records.get('deliveryDispatchJobs/'+f.orderId)?.state,'pending');if(options.scheduleFailure)throw Error('no request lifecycle');afterCallbacks.push(callback);}}, 'next/headers': { cookies: async () => ({ get: () => undefined }) }, stripe:{default:class{constructor(){throw Error('Managed Worldline must never instantiate Stripe');}}},
    '@google-cloud/secret-manager': { SecretManagerServiceClient: class { async accessSecretVersion() { return [{payload:{data:Buffer.from('fixture-secret-with-at-least-32-characters')}}]; } } },
    '@/lib/server/payment-settings': { getActiveStripeSecretKey:async()=>{throw Error('Unexpected global Stripe credentials');} },
    '@/lib/payments/worldline-store':{readPinnedWorldlineAgreement:async value=>{assert.deepEqual(value,worldlineBinding);return{binding:worldlineBinding,credentials:worldlineCredentials};}},
    './worldline-store':{readPinnedWorldlineAgreement:async value=>{assert.deepEqual(value,worldlineBinding);return{binding:worldlineBinding,credentials:worldlineCredentials};}},
    'firebase-admin/firestore': { FieldPath: { documentId: () => '__name__' }, FieldValue: { serverTimestamp: () => 'fixture-server-time' } },
  });
  const settings = load('src/lib/delivery/settings/schema.ts');
  const binding = load('src/lib/delivery/integrations/wolt-binding.ts');
  const provider = load('src/lib/delivery/providers/wolt/provider.ts');
  const dispatcher = load('src/lib/delivery/booking/dispatcher.ts');
  const inbox = load('src/lib/delivery/events/wolt-inbox.ts');
  const nativeScope = {brandId:'b',locationId:'l'};
  const key='fixture_callback_key_at_least_32_chars';
  const now=Date.now(),ready=new Date(now+600000).toISOString();
  const price={rules:{version:'1',currency:'DKK',taxBasis:'inclusive',maxDistanceMeters:10000,minimumMinor:0,maximumCustomerFeeMinor:5000,maximumSubsidyMinor:5000,tariff:{kind:'kilometer',baseMinor:1000,includedMeters:0,perKmMinor:100}},route:{meters:1000,method:'route',source:'fixture',profile:'car',calculatedAt:new Date(now).toISOString()},itemSubtotalAfterDiscountMinor:10000,providerCost:{amountMinor:2000,currency:'DKK',taxBasis:'inclusive'}};
  const addr={country:'DK',postcode:'2300',city:'Copenhagen',street:'Test',building:'1',unit:null,coordinates:{latitude:55.6,longitude:12.6,source:'fixture'}};
  const fulfillment={version:1,scope:nativeScope,checkoutRef:'C',providerId:'wolt',pickup:addr,dropoff:addr,pickupContact:{name:'Restaurant',phone:'+4512345678'},dropoffContact:{name:'Customer',phone:'+4587654321'},instructions:'',readyAt:ready,desiredDelivery:{kind:'asap'},items:[{name:'Pizza',quantity:1}],bagCount:1,requirements:[]};
  const providerQuote={kind:'available',providerId:'wolt',quoteRef:'native',cost:{...price.providerCost,taxMinor:null},surcharges:[],expiresAt:null,pickupEstimateProvenance:null,pickupInterval:null,deliveryInterval:null,distance:null,capabilities:provider.woltCapabilities};
  const {quote}=load('src/lib/delivery/quotes/binding.ts').buildQuote({binding:{...nativeScope,checkoutReference:'C',providerId:'wolt',normalizedAddress:'DK Test',cartDigest:'a'.repeat(64),fulfillmentAt:ready,brandRevision:1,locationRevision:0},quoteRef:'Q',providerQuoteRef:'native',nowMs:now,freshnessMs:300000,providerExpiresAtMs:null,price,fulfillment,providerQuote});
  // Lifecycle cases require an open pickup window; default inherited hours
  // are absent in the synthetic payment fixture. Schedule behavior has its own suite.
  f.records.set('deliverySettings/b',{schemaVersion:1,brandId:'b',locationId:null,revision:1,settings:{...settings.defaultDeliverySettings(),enabled:true,providerId:'wolt',pricingRules:price.rules,scheduleMode:'manual',weeklyHours:Array.from({length:7},(_,day)=>({day,intervals:[{startMinute:0,endMinute:1440}]}))}});
  f.records.set('deliveryProviderBindings/'+binding.woltBindingDocumentId(nativeScope,'sandbox'),{schemaVersion:1,...nativeScope,provider:'wolt',environment:'sandbox',active:true,revision:1,merchantId:'merchant',venueId:'venue',secretRef:'projects/test-project/secrets/orderfly-wolt-sandbox-merchant/versions/1'});
  f.records.set('deliveryWoltMerchants/'+binding.woltMerchantDocumentId('sandbox','merchant'),{version:1,environment:'sandbox',merchantId:'merchant',...nativeScope,venueId:'venue',callbackId:inbox.woltCallbackId(key),active:true});
  await (await binding.createAuthorizedWoltStorage(nativeScope,'sandbox')).saveQuote({scope:nativeScope,quoteRef:'native',fingerprint:options.changedPrivateQuote?'b'.repeat(64):provider.woltFulfillmentFingerprint(fulfillment),bindingRevision:'1',merchantId:'merchant',venueId:'venue',environment:'sandbox',cost:providerQuote.cost,native:{promiseId:'native',venueId:'venue',validUntil:null,fetchedAt:new Date(now).toISOString(),dropoff:{coordinates:{lat:55.6,lon:12.6},formattedAddress:'Test 1'},scheduledDropoffTime:null,preparationMinutes:10}});
  f.records.set('deliveryQuotes/Q',quote);
  f.order().managedDelivery={version:1,providerId:'wolt',quoteRef:'Q',requestDigest:quote.contentDigest};
  f.records.set('deliveryProviderCallbacks/'+inbox.woltCallbackId(key),{version:1,active:true,...nativeScope,environment:'sandbox',merchantId:'merchant',venueId:'venue',bindingRevision:1,revision:1,signingSecretRef:'projects/test-project/secrets/orderfly-wolt-webhook-sandbox-merchant/versions/1'});
  const network=[];
  const fetch = async (url,init) => {
    const host=new URL(url).hostname;
    if(host==='merchant-v1.api-eu.bambora.com'){
      assert.equal(init.method,'GET');paymentNetwork.push('read');if(loseNextPaymentRead){loseNextPaymentRead=false;throw Error('Lost credit observation');}
      return Response.json({meta:{result:true},transaction:{id:'123',orderid:f.orderId,merchantnumber:'T123',status:'approved',currency:{code:'DKK',minorunits:2},total:{authorized:amountMinor,captured,credited}}});
    }
    if(host==='transaction-v1.api-eu.bambora.com'){
      assert.equal(init.method,'POST');const operation=new URL(url).pathname.split('/').at(-1),amount=JSON.parse(init.body).amount;
      assert.equal(amount,amountMinor);assert.equal(init.headers.Authorization,`Basic ${Buffer.from('fixture-access@T123:fixture-secret').toString('base64')}`);
      paymentNetwork.push(operation);
      if(operation==='capture'){assert.ok(f.order().paymentOperation);captured=amount;if(options.lostCapture){loseNextPaymentRead=true;throw Error('Lost capture response');}}
      else{assert.equal(operation,'credit');assert.equal(f.records.get('orders/'+f.orderId+'/deliveryRefunds/original').state,'submitting');credited=amount;if(options.lostCredit){loseNextPaymentRead=true;throw Error('Lost credit response');}}
      return Response.json({meta:{result:true}});
    }

    assert.equal(new URL(url).origin,'https://daas-public-api.development.dev.woltapi.com');
    assert.equal(init.method,'POST');
    network.push({url:String(url),body:JSON.parse(init.body)});
    assert.equal(f.records.get('orders/'+f.orderId+'/deliveryAttempts/original').state,'submitting');
    assert.equal(typeof f.records.get('orders/'+f.orderId+'/deliveryDispatch/original').networkStartedAtMs,'number');
    if(options.lostResponse)throw new Error('simulated network response loss');
    return new Response(JSON.stringify({id:'delivery',wolt_order_reference_id:'native-order',merchant_order_reference_id:JSON.parse(init.body).merchant_order_reference_id,status:'INFO_RECEIVED'}),{status:201,headers:{'content-type':'application/json'}});
  };
  const request=(merchantOrderReference,type='order.picked_up')=>{
    const payload={dispatched_at:new Date().toISOString(),type,details:{id:'event-one',venue_id:'venue',wolt_order_reference_id:'native-order',...(merchantOrderReference?{merchant_order_reference_id:merchantOrderReference}:{})}};
    const h=Buffer.from(JSON.stringify({alg:'HS256'})).toString('base64url'),p=Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature=createHmac('sha256','fixture-secret-with-at-least-32-characters').update(`${h}.${p}`).digest('base64url');
    return new Request('https://fixture.test/callback',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:`${h}.${p}.${signature}`})});
  };
  return {...f,afterCallbacks,scope,dispatcher,inbox,paymentNetwork,reconcile:load('src/lib/payments/worldline-reconcile.ts').reconcileWorldlineOrder,refund:load('src/lib/delivery/payments/refund-worker.ts').processManagedDeliveryRefund,key,request,network,fetch, jobs:()=>[...f.records].filter(([path])=>path.includes('/jobs/'))};
}


// This is isolated native integration: real domain code and HTTP mappers, synthetic
// transactional storage, session identity and provider transport. No live courier/payment.
test('Worldline authorization -> locked capture -> native invoice -> Wolt acceptance -> print and signed event replay',async t=>{
 const f=await fixture(),originalFetch=global.fetch;global.fetch=f.fetch;t.after(()=>global.fetch=originalFetch);
 const customerId=f.order().customerDetails.id,customerBefore=structuredClone(f.records.get('customers/'+customerId));
 assert.equal(f.order().paymentStatus,'Pending');assert.equal(f.order().invoice,undefined);assert.equal(f.records.has('deliveryDispatchJobs/'+f.orderId),false);
 await f.reconcile(f.orderId);
 assert.equal(f.order().paymentStatus,'Paid');assert.equal(f.order().status,'Pending');assert.equal(f.order().psp.captured,true);
 assert.ok(f.order().invoice?.number);assert.equal(f.network.length,0);assert.equal(f.jobs().length,0);
 assert.equal(f.paymentNetwork.filter(x=>x==='capture').length,1);assert.equal(f.afterCallbacks.length,1);
 const invoice=structuredClone(f.order().invoice),paidCustomer=structuredClone(f.records.get('customers/'+customerId));
 assert.equal(paidCustomer.totalSpend,(customerBefore.totalSpend||0)+f.order().totalAmount);
 await Promise.all([f.afterCallbacks[0](),f.dispatcher.runDeliveryDispatchWorker()]);
 assert.equal(f.network.length,1);assert.equal(f.order().status,'Received');assert.equal(f.jobs().length,1);
 assert.equal([...f.records].filter(([p])=>p.startsWith('orderNotificationJobs/')).length,1);
 const event=f.request(),duplicate=event.clone();assert.equal((await f.inbox.receiveNativeWoltCallback(event,f.key)).status,200);assert.equal((await f.inbox.receiveNativeWoltCallback(duplicate,f.key)).status,200);
 assert.equal(f.records.get('orders/'+f.orderId+'/deliveryState/current').status,'picked_up');
 assert.equal([...f.records].filter(([p])=>p.includes('/deliveryEvents/')).length,1);
 await f.reconcile(f.orderId);await f.dispatcher.runDeliveryDispatchWorker();
 assert.equal(f.paymentNetwork.filter(x=>x==='capture').length,1);assert.equal(f.network.length,1);assert.equal(f.jobs().length,1);
 assert.deepEqual(f.order().invoice,invoice);assert.deepEqual(f.records.get('customers/'+customerId),paidCustomer);
});
test('definitive local Wolt quote rejection compensates original Worldline account once without print or kitchen acceptance',async t=>{
 const f=await fixture({changedPrivateQuote:true}),originalFetch=global.fetch;global.fetch=f.fetch;t.after(()=>global.fetch=originalFetch);
 const customerId=f.order().customerDetails.id,before=f.records.get('customers/'+customerId).totalSpend||0;
 await f.reconcile(f.orderId);const invoice=structuredClone(f.order().invoice);
 assert.equal((await f.dispatcher.dispatchManagedDelivery(f.scope)).state,'rejected');
 assert.equal(f.network.length,0);assert.equal(f.order().status,'Canceled');assert.equal(f.jobs().length,0);
 assert.equal(f.paymentNetwork.filter(x=>x==='capture').length,1);assert.equal(f.paymentNetwork.filter(x=>x==='credit').length,1);
 assert.equal(f.order().refundedAmountOre,Math.round(f.order().totalAmount*100));assert.equal(f.records.get('customers/'+customerId).totalSpend,before);
 assert.equal(f.records.get('orders/'+f.orderId+'/deliveryRefunds/original').state,'succeeded');
 await f.dispatcher.runDeliveryDispatchWorker();await f.refund(f.scope);
 assert.equal(f.paymentNetwork.filter(x=>x==='credit').length,1);assert.equal([...f.records].filter(([p])=>p.includes('/financialAdjustments/')).length,1);
 assert.deepEqual(f.order().invoice,invoice);assert.equal([...f.records].filter(([p])=>p.startsWith('orderNotificationJobs/')).length,0);
});
test('uncertain Wolt create remains Paid but unaccepted without a duplicate courier, credit or print',async t=>{
 const f=await fixture({lostResponse:true}),originalFetch=global.fetch;global.fetch=f.fetch;t.after(()=>global.fetch=originalFetch);
 await f.reconcile(f.orderId);assert.equal((await f.dispatcher.dispatchManagedDelivery(f.scope)).state,'unknown');
 await f.dispatcher.dispatchManagedDelivery(f.scope);await f.dispatcher.runDeliveryDispatchWorker();
 assert.equal(f.network.length,1);assert.equal(f.order().paymentStatus,'Paid');assert.equal(f.order().status,'Pending');
 assert.equal(f.jobs().length,0);assert.equal(f.paymentNetwork.filter(x=>x==='credit').length,0);assert.equal(f.paymentNetwork.filter(x=>x==='capture').length,1);
 assert.equal(f.records.get('orders/'+f.orderId+'/deliveryAttempts/original').state,'unknown');
 assert.equal([...f.records].filter(([p])=>p.startsWith('orderNotificationJobs/')).length,0);
});
test('lost Worldline credit reply and observation recover by readback with one credit and one accounting delta',async t=>{
 const f=await fixture({changedPrivateQuote:true,lostCredit:true}),originalFetch=global.fetch;global.fetch=f.fetch;t.after(()=>global.fetch=originalFetch);
 const customerId=f.order().customerDetails.id,before=f.records.get('customers/'+customerId).totalSpend||0;
 await f.reconcile(f.orderId);await f.dispatcher.dispatchManagedDelivery(f.scope);
 assert.equal(f.records.get('orders/'+f.orderId+'/deliveryRefunds/original').state,'unknown');
 assert.ok(f.order().paymentOperation);assert.equal(f.order().refundedAmountOre,undefined);
 assert.equal(f.records.get('customers/'+customerId).totalSpend,before+f.order().totalAmount);
 assert.equal((await f.refund(f.scope)).state,'succeeded');await f.refund(f.scope);
 assert.equal(f.paymentNetwork.filter(x=>x==='credit').length,1);assert.equal(f.order().paymentOperation,null);
 assert.equal(f.records.get('customers/'+customerId).totalSpend,before);assert.equal([...f.records].filter(([p])=>p.includes('/financialAdjustments/')).length,1);
 assert.equal(f.jobs().length,0);assert.equal(f.network.length,0);
});

test('managed return observation recovers a lost capture response without another capture or premature courier request',async t=>{
 const f=await fixture({lostCapture:true}),originalFetch=global.fetch;global.fetch=f.fetch;t.after(()=>global.fetch=originalFetch);
 await assert.rejects(f.reconcile(f.orderId),/Capture requires reconciliation/);
 assert.equal(f.order().paymentStatus,'Pending');assert.ok(f.order().paymentOperation);assert.equal(f.order().invoice,undefined);
 assert.equal(f.paymentNetwork.filter(x=>x==='capture').length,1);assert.equal(f.network.length,0);assert.equal(f.jobs().length,0);
 await f.reconcile(f.orderId,{observationOnly:true,retryReadFailures:true});
 assert.equal(f.order().paymentStatus,'Paid');assert.equal(f.order().paymentOperation,null);assert.equal(f.order().psp.captured,true);
 assert.ok(f.order().invoice?.number);assert.equal(f.order().status,'Pending');assert.equal(f.network.length,0);assert.equal(f.jobs().length,0);
 assert.equal(f.paymentNetwork.filter(x=>x==='capture').length,1);assert.equal(f.afterCallbacks.length,1);
});
