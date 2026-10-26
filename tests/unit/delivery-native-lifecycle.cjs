const { test } = require('node:test');
const { createHmac } = require('node:crypto');
const assert = require('node:assert/strict');
const { paymentFixture } = require('../helpers/merchant-payment-fixture.cjs');
const { moduleGraph } = require('../helpers/load-ts-graph.cjs');

// All domain modules are real. Only external I/O and native database/session fixtures are synthetic.
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
async function fixture(options = {}) {
  const f = await paymentFixture();
  f.records.get('brands/b').status = 'active';
  Object.assign(f.order(), { paymentMethod: 'Stripe', status: 'Pending', psp: { checkoutSessionId: 'cs_test_atomic_349_reference' } });
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
  Object.assign(f.order(),{paymentStatus:'Paid',deliveryType:'Delivery',managedStripeAccount:{accountId:'acct_test',livemode:false},managedDelivery:{version:1,providerId:'wolt',quoteRef:'quote',requestDigest}});
  // The generic fixture starts as pickup; managed checkout has no acceptance notification yet.
  for(const [path] of f.records)if(path.startsWith('orderNotificationJobs/')||path.startsWith('marketingOrderOutbox/'))f.records.delete(path);
  Object.assign(f.order().psp,{provider:'stripe',paymentIntentId:'pi_test'});
  const session = { livemode:false,payment_intent:'pi_test',id: 'cs_test_atomic_349_reference', mode: 'payment', status: 'complete', payment_status: 'paid', currency: 'dkk',
    amount_total: Math.round(f.order().totalAmount * 100), metadata: { orderId: f.orderId, brandId: 'b', locationId: 'l' } };
  const refunds=[];
  class Provider {
    refunds={create:async(params,opts)=>{assert.equal(f.records.get('orders/'+f.orderId+'/deliveryRefunds/original').state,'submitting');assert.match(opts.idempotencyKey,/^delivery-refund-[a-f0-9]{64}$/);const refund={id:'re_fixture',charge:'ch_test',payment_intent:'pi_test',amount:session.amount_total,currency:'dkk',metadata:params.metadata,status:'succeeded'};refunds.push(refund);return refund;},list:async()=>({data:refunds,has_more:false})};
    accounts={retrieve:async()=>{options.afterAccountRead?.(f);return {id:'acct_test'};}};
    checkout={sessions:{retrieve:async()=>{return session;}}};
    paymentIntents={retrieve:async()=>({id:'pi_test',status:'succeeded',livemode:false,currency:'dkk',amount:session.amount_total,amount_received:session.amount_total,metadata:scope,
      latest_charge:{id:'ch_test',paid:true,disputed:false,livemode:false,currency:'dkk',amount:session.amount_total,amount_refunded:0,payment_intent:'pi_test'}})};
  }
  const load = moduleGraph({ ...f.mocks, 'next/headers': { cookies: async () => ({ get: () => undefined }) }, stripe: { default: Provider },
    '@google-cloud/secret-manager': { SecretManagerServiceClient: class { async accessSecretVersion() { return [{payload:{data:Buffer.from('fixture-secret-with-at-least-32-characters')}}]; } } },
    '@/lib/server/payment-settings': { getActiveStripeSecretKey: async () => 'sk_test_fake' },
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
  f.records.set('deliverySettings/b',{schemaVersion:1,brandId:'b',locationId:null,revision:1,settings:{...settings.defaultDeliverySettings(),enabled:true,providerId:'wolt',pricingRules:price.rules}});
  f.records.set('deliveryProviderBindings/'+binding.woltBindingDocumentId(nativeScope,'sandbox'),{schemaVersion:1,...nativeScope,provider:'wolt',environment:'sandbox',active:true,revision:1,merchantId:'merchant',venueId:'venue',secretRef:'projects/test-project/secrets/orderfly-wolt-sandbox-merchant/versions/1'});
  f.records.set('deliveryWoltMerchants/'+binding.woltMerchantDocumentId('sandbox','merchant'),{version:1,environment:'sandbox',merchantId:'merchant',...nativeScope,venueId:'venue',callbackId:inbox.woltCallbackId(key),active:true});
  await (await binding.createAuthorizedWoltStorage(nativeScope,'sandbox')).saveQuote({scope:nativeScope,quoteRef:'native',fingerprint:options.changedPrivateQuote?'b'.repeat(64):provider.woltFulfillmentFingerprint(fulfillment),bindingRevision:'1',merchantId:'merchant',venueId:'venue',environment:'sandbox',cost:providerQuote.cost,native:{promiseId:'native',venueId:'venue',validUntil:null,fetchedAt:new Date(now).toISOString(),dropoff:{coordinates:{lat:55.6,lon:12.6},formattedAddress:'Test 1'},scheduledDropoffTime:null,preparationMinutes:10}});
  f.records.set('deliveryQuotes/Q',quote);
  f.order().managedDelivery={version:1,providerId:'wolt',quoteRef:'Q',requestDigest:quote.contentDigest};
  f.records.set('deliveryDispatchJobs/'+f.orderId,{version:1,...scope,providerId:'wolt',requestDigest:quote.contentDigest,state:'pending',createdAtMs:now,updatedAtMs:now});
  f.records.set('deliveryProviderCallbacks/'+inbox.woltCallbackId(key),{version:1,active:true,...nativeScope,environment:'sandbox',merchantId:'merchant',venueId:'venue',bindingRevision:1,revision:1,signingSecretRef:'projects/test-project/secrets/orderfly-wolt-webhook-sandbox-merchant/versions/1'});
  const network=[];
  const fetch = async (url,init) => {
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
  return {...f,scope,session,feedbackDrain:load('src/lib/feedback/delivery-requests.ts').drainDeliveryFeedbackRequests,terminal:load('src/lib/orders/terminal-read.ts'),settlement:load('src/lib/server/settle-checkout.ts'),dispatcher,inbox,refunds,key,request,network,fetch, jobs:()=>[...f.records].filter(([path])=>path.includes('/jobs/'))};
}

test('real dispatcher, private binding, provider, payment acceptance and signed callback share one native lifecycle',async t=>{
 const f=await fixture();const originalFetch=global.fetch;global.fetch=f.fetch;t.after(()=>global.fetch=originalFetch);
 const customerBefore=structuredClone(f.records.get('customers/'+f.order().customerDetails.id));
 assert.equal((await f.dispatcher.dispatchManagedDelivery(f.scope)).state,'booked');
 assert.equal(f.network.length,1);assert.equal(f.order().status,'Received');assert.equal(f.jobs().length,1);
 assert.equal([...f.records].filter(([p])=>p.startsWith('orderNotificationJobs/')).length,1);
 await f.dispatcher.runDeliveryDispatchWorker();
 assert.equal(f.network.length,1);assert.equal(f.jobs().length,1);
 const event=f.request(),duplicate=event.clone();
 assert.equal((await f.inbox.receiveNativeWoltCallback(event,f.key)).status,200);
 assert.equal((await f.inbox.receiveNativeWoltCallback(duplicate,f.key)).status,200);
 assert.equal(f.records.get('orders/'+f.orderId+'/deliveryState/current').status,'picked_up');
 assert.equal([...f.records].filter(([p])=>p.includes('/deliveryEvents/')).length,1);
 assert.equal(f.jobs().length,1);assert.deepEqual(f.records.get('customers/'+f.order().customerDetails.id),customerBefore);
});
test('real lost create response stays unknown across repeated dispatch and worker attempts',async t=>{
 const f=await fixture({lostResponse:true});const originalFetch=global.fetch;global.fetch=f.fetch;t.after(()=>global.fetch=originalFetch);
 assert.equal((await f.dispatcher.dispatchManagedDelivery(f.scope)).state,'unknown');
 await f.dispatcher.dispatchManagedDelivery(f.scope);await f.dispatcher.runDeliveryDispatchWorker();
 assert.equal(f.network.length,1);assert.equal(f.order().status,'Pending');assert.equal(f.jobs().length,0);
 assert.equal([...f.records].filter(([p])=>p.startsWith('orderNotificationJobs/')).length,0);
 assert.equal(f.records.get('orders/'+f.orderId+'/deliveryAttempts/original').state,'unknown');
});

test('authentic facade rejection before network consumption refunds once without courier or print',async t=>{
 const f=await fixture({changedPrivateQuote:true});const originalFetch=global.fetch;global.fetch=f.fetch;t.after(()=>global.fetch=originalFetch);
 const customer=f.records.get('customers/'+f.order().customerDetails.id);
 customer.totalSpend=f.order().totalAmount+25;
 assert.equal((await f.dispatcher.dispatchManagedDelivery(f.scope)).state,'rejected');
 assert.equal(f.network.length,0);assert.equal(f.refunds.length,1);
 assert.equal(f.records.get('orders/'+f.orderId+'/deliveryDispatch/original').networkStartedAtMs,null);
 assert.equal(f.records.get('orders/'+f.orderId+'/deliveryDispatchResults/original').result.error.code,'quote_changed_or_expired');
 assert.equal(f.records.get('orders/'+f.orderId+'/deliveryRefunds/original').state,'succeeded');
 assert.equal(f.order().status,'Canceled');assert.equal(f.order().refundedAmountOre,Math.round(f.order().totalAmount*100));
 assert.equal(f.records.get('customers/'+f.order().customerDetails.id).totalSpend,25);
 await f.dispatcher.runDeliveryDispatchWorker();
 assert.equal(f.network.length,0);assert.equal(f.refunds.length,1);assert.equal(f.jobs().length,0);
 assert.equal([...f.records].filter(([p])=>p.includes('/financialAdjustments/')).length,1);
 assert.equal([...f.records].filter(([p])=>p.startsWith('orderNotificationJobs/')).length,0);
});

test('first native managed settlement resolves PI from saved session then queues one delivery',async t=>{
 const f=await fixture();const originalFetch=global.fetch;global.fetch=f.fetch;t.after(()=>global.fetch=originalFetch);
 f.order().paymentStatus='Pending';delete f.order().psp.paymentIntentId;
 f.records.delete('deliveryDispatchJobs/'+f.orderId);
 const customerId=f.order().customerDetails.id, before=structuredClone(f.records.get('customers/'+customerId));
 assert.equal(await f.settlement.settlePaidCheckoutSession(f.session),true);
 assert.equal(f.order().psp.paymentIntentId,'pi_test');assert.equal(f.order().paymentStatus,'Paid');assert.equal(f.order().status,'Pending');
 assert.equal(f.records.get('deliveryDispatchJobs/'+f.orderId).state,'pending');
 assert.equal(f.records.get('customers/'+customerId).totalSpend,(before.totalSpend||0)+f.order().totalAmount);
 assert.equal(f.records.get('customers/'+customerId).totalOrders,(before.totalOrders||0)+1);
 const invoice=structuredClone(f.order().invoice),customer=structuredClone(f.records.get('customers/'+customerId));
 assert.equal(await f.settlement.settlePaidCheckoutSession(f.session),false);
 assert.deepEqual(f.order().invoice,invoice);assert.deepEqual(f.records.get('customers/'+customerId),customer);
 assert.equal(f.jobs().length,0);assert.equal(f.network.length,0);
 assert.equal((await f.dispatcher.dispatchManagedDelivery(f.scope)).state,'booked');
 assert.equal(f.network.length,1);assert.equal(f.jobs().length,1);assert.equal(f.order().status,'Received');
});
test('first managed settlement rejects stored PI or authoritative session scope conflicts without writes',async()=>{
 for(const mutate of [f=>f.order().psp.paymentIntentId='pi_other',f=>f.session.metadata={...f.session.metadata,brandId:'foreign'},f=>f.session.payment_intent='pi_other']){
  const f=await fixture();f.order().paymentStatus='Pending';delete f.order().psp.paymentIntentId;f.records.delete('deliveryDispatchJobs/'+f.orderId);mutate(f);
  const before=structuredClone([...f.records]);await assert.rejects(f.settlement.settlePaidCheckoutSession(f.session));
  assert.deepEqual([...f.records],before);assert.equal(f.network.length,0);
 }
});

test('managed settlement transaction rejects concurrent PSP binding edits',async()=>{
 for(const field of ['provider','checkoutSessionId','paymentIntentId']){
  const f=await fixture({afterAccountRead:f=>{f.order().psp[field]='changed';}});
  f.order().paymentStatus='Pending';delete f.order().psp.paymentIntentId;f.records.delete('deliveryDispatchJobs/'+f.orderId);
  await assert.rejects(f.settlement.settlePaidCheckoutSession(f.session),/Managed delivery payment changed/);
  assert.equal(f.order().paymentStatus,'Pending');assert.equal(f.records.has('deliveryDispatchJobs/'+f.orderId),false);assert.equal(f.order().invoice,undefined);
 }
});

test('real signed callback after unknown create retains scoped operator evidence without invented booking',async t=>{
 const f=await fixture({lostResponse:true});const originalFetch=global.fetch;global.fetch=f.fetch;t.after(()=>global.fetch=originalFetch);
 assert.equal((await f.dispatcher.dispatchManagedDelivery(f.scope)).state,'unknown');
 const nativeReference=f.network[0].body.merchant_order_reference_id;
 const event=f.request(nativeReference),duplicate=event.clone();
 assert.equal((await f.inbox.receiveNativeWoltCallback(event,f.key)).status,200);
 assert.equal((await f.inbox.receiveNativeWoltCallback(duplicate,f.key)).status,200);
 const review=f.records.get('orders/'+f.orderId+'/deliveryReconciliation/original');
 assert.equal(review.state,'operator_review_required');assert.equal(review.providerDeliveryId,null);assert.equal(review.nativeOrderReference,'native-order');
 assert.equal(f.order().deliveryReconciliationRequired,true);
 assert.equal(f.records.get('orders/'+f.orderId+'/deliveryAttempts/original').state,'unknown');
 assert.equal([...f.records].filter(([p])=>p.startsWith('deliveryProviderReferences/')).length,0);
 await f.dispatcher.runDeliveryDispatchWorker();assert.equal(f.network.length,1);assert.equal(f.refunds.length,0);assert.equal(f.jobs().length,0);
 assert.equal([...f.records].filter(([p,v])=>p.startsWith('deliveryWoltInbox/')&&v.state==='reconciliation_required').length,1);
});


test('verified delivered callback removes kitchen Ready from active terminal but preserves history and rejects foreign evidence',async t=>{
 const f=await fixture();const originalFetch=global.fetch;global.fetch=f.fetch;t.after(()=>global.fetch=originalFetch);
 await f.dispatcher.dispatchManagedDelivery(f.scope);
 Object.assign(f.order(),{status:'Ready',fulfillmentAt:new Date().toISOString()});
 assert.equal((await f.terminal.readTerminalOrders({view:'board'})).orders.some(o=>o.id===f.orderId),true);
 assert.equal((await f.inbox.receiveNativeWoltCallback(f.request(undefined,'order.delivered'),f.key)).status,200);
 assert.equal(f.order().status,'Ready');
 assert.equal(f.records.get('orders/'+f.orderId+'/deliveryState/current').status,'delivered');
 const completion=f.order().managedDeliveryCompletion;
 assert.equal(completion.orderId,f.orderId);assert.equal(completion.requestDigest,f.order().managedDelivery.requestDigest);
 assert.equal(f.records.get('deliveryFeedbackRequests/'+f.orderId).state,'pending');
 assert.deepEqual(f.records.get('deliveryFeedbackRequests/'+f.orderId).completion,completion);
 assert.equal([...f.records.keys()].filter(k=>k.startsWith('feedbackMailJobs/')).length,0,'callback never queues or sends mail outside its durable transaction');

 assert.equal((await f.terminal.readTerminalOrders({view:'board'})).orders.some(o=>o.id===f.orderId),false);
 const history=(await f.terminal.readTerminalOrders({view:'history'})).orders.find(o=>o.id===f.orderId);
 assert.equal(history.status,'Ready');assert.equal(history.managedDeliveryTracking.deliveryStatus,'delivered');
 const state=f.records.get('orders/'+f.orderId+'/deliveryState/current');
 for(const patch of [{providerDeliveryId:'foreign'},{brandId:'foreign'},{status:'unknown'}]){
  f.records.set('orders/'+f.orderId+'/deliveryState/current',{...state,...patch});
  assert.equal((await f.terminal.readTerminalOrders({view:'board'})).orders.some(o=>o.id===f.orderId),true);
 }
});


test('verified delivered evidence and durable feedback request survive canceled/refunded native order',async t=>{
 const f=await fixture();const originalFetch=global.fetch;global.fetch=f.fetch;t.after(()=>global.fetch=originalFetch);
 await f.dispatcher.dispatchManagedDelivery(f.scope);Object.assign(f.order(),{status:'Canceled',refundedAmountOre:100});
 const callback=f.request(undefined,'order.delivered'),repeat=callback.clone();
 assert.equal((await f.inbox.receiveNativeWoltCallback(callback,f.key)).status,200);
 assert.equal((await f.inbox.receiveNativeWoltCallback(repeat,f.key)).status,200);
 assert.equal(f.records.get('orders/'+f.orderId+'/deliveryState/current').status,'delivered');
 assert.equal(f.order().status,'Canceled');assert.equal(f.order().refundedAmountOre,100);
 assert.equal(f.records.get('deliveryFeedbackRequests/'+f.orderId).state,'pending');
 assert.equal([...f.records.keys()].filter(k=>k.startsWith('deliveryFeedbackRequests/')).length,1);
});


test('delivered before native acceptance remains retryable and queues after acceptance without duplicate feedback',async t=>{
 const values={ORDERFLY_NOTIFICATION_ENDPOINT:'https://notifications.example.test/enqueue',ORDERFLY_NOTIFICATION_ORGANIZATION_ID:'11111111-1111-4111-8111-111111111111',ORDERFLY_NOTIFICATION_SECRET:'synthetic-feedback-secret-at-least-32-chars',ORDERFLY_FEEDBACK_TOKEN_SECRET:'synthetic-feedback-token-at-least-32-chars'};
 const previous=Object.fromEntries(Object.keys(values).map(k=>[k,process.env[k]]));Object.assign(process.env,values);t.after(()=>{for(const[k,v]of Object.entries(previous))v===undefined?delete process.env[k]:process.env[k]=v;});
 const f=await fixture();const originalFetch=global.fetch;global.fetch=f.fetch;t.after(()=>global.fetch=originalFetch);
 f.records.set('feedbackSettings/b',{emailEnabled:true,automaticRequests:true,delayHours:2,language:'da'});
 f.records.set('feedbackQuestionsVersion/delivery',{versionLabel:'Delivery',isActive:true,language:'da',orderTypes:['delivery'],questions:[{questionId:'rating',label:'Feedback',type:'stars',isRequired:true}]});
 const run=f.db.runTransaction.bind(f.db);let intercepted=false;
 f.db.runTransaction=async(...args)=>{
  const result=await run(...args);
  if(!intercepted&&f.order().status==='Pending'&&f.records.get('orders/'+f.orderId+'/deliveryAttempts/original')?.state==='booked'){
   intercepted=true;
   assert.equal((await f.inbox.receiveNativeWoltCallback(f.request(undefined,'order.delivered'),f.key)).status,200);
   await f.feedbackDrain(Date.now()+1000);
   assert.equal(f.records.get('deliveryFeedbackRequests/'+f.orderId).state,'pending');
   assert.equal([...f.records.keys()].filter(k=>k.startsWith('feedbackMailJobs/')).length,0);
  }
  return result;
 };
 await f.dispatcher.dispatchManagedDelivery(f.scope);assert.equal(intercepted,true);assert.equal(f.order().status,'Received');
 await f.feedbackDrain(Date.now()+120000);await f.feedbackDrain(Date.now()+180000);
 assert.equal(f.records.get('deliveryFeedbackRequests/'+f.orderId).state,'queued');
 assert.equal([...f.records.keys()].filter(k=>k.startsWith('feedbackMailJobs/')).length,1);
 assert.equal([...f.records.keys()].filter(k=>k.startsWith('feedbackInvitations/')).length,1);
 assert.equal(f.network.length,1,'only mocked courier create was requested, never mail');
});
