// Isolated integration, not a live provider test: production checkout, account
// resolver, HTTP client, callback/return, capture journal, settlement and native
// print authority share one graph. Only external persistence/cloud/HTTP I/O is fake.
const {test,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {checkout}=require('../helpers/checkout-fixture.cjs');
const {memoryDb}=require('../helpers/marketing-db.cjs');
const {moduleGraph}=require('../helpers/load-ts-graph.cjs');
const originalFetch=global.fetch;
const originalPrint=process.env.ORDERFLY_PRINT_INTENTS_ENABLED;
afterEach(()=>{global.fetch=originalFetch;if(originalPrint===undefined)delete process.env.ORDERFLY_PRINT_INTENTS_ENABLED;else process.env.ORDERFLY_PRINT_INTENTS_ENABLED=originalPrint;});

async function fixture(options={}){
 process.env.ORDERFLY_PRINT_INTENTS_ENABLED='true';
 const orderId='ORD-TEST',transactionId='123',credentials={merchantNumber:'T123',accessToken:'synthetic-access',secretToken:'synthetic-secret',md5Key:'synthetic-callback-md5'};
 const owner={brandId:'b',...(options.ownLocation?{locationId:'l'}:{})};
 const hash=scope=>createHash('sha256').update(JSON.stringify([scope.brandId,scope.locationId||null])).digest('hex');
 const reference=`projects/orderfly-39325/secrets/orderfly-worldline-${hash(owner)}-test/versions/1`;
 const secretVersions=new Map([[reference,credentials]]),secretReads=[],http=[],after=[],analytics=[];
 let db,records,load,sessionInput,observation,captureMoved=false;
 const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
 global.fetch=async(input,init={})=>{
  const url=new URL(String(input)),method=init.method||'GET';
  assert.equal(init.redirect,'error','Provider redirects must never receive authentication');
  assert.equal(init.headers.Authorization,`Basic ${Buffer.from(`${credentials.accessToken}@${credentials.merchantNumber}:${credentials.secretToken}`).toString('base64')}`);
  http.push({host:url.host,path:url.pathname,method});
  if(url.host==='api.v1.checkout.bambora.com'&&url.pathname==='/sessions'&&method==='POST'){
   sessionInput=JSON.parse(init.body);assert.equal(sessionInput.instantcaptureamount,0);
   observation={id:transactionId,orderid:orderId,merchantnumber:'T123',status:'approved',currency:{code:'DKK',minorunits:2},total:{authorized:sessionInput.order.amount,captured:0,credited:0}};
   return json({meta:{result:true},token:'synthetic-session',url:'https://v1.checkout.bambora.com/synthetic-session'});
  }
  if(url.host==='merchant-v1.api-eu.bambora.com'&&url.pathname===`/transactions/${transactionId}`&&method==='GET'){
   if(options.onRead)await options.onRead({records,observation,http});
   return json({meta:{result:true},transaction:structuredClone(observation)});
  }
  if(url.host==='transaction-v1.api-eu.bambora.com'&&url.pathname===`/transactions/${transactionId}/capture`&&method==='POST'){
   const amount=JSON.parse(init.body).amount;assert.equal(amount,sessionInput.order.amount);
   if(options.captureDelay)await new Promise(resolve=>setTimeout(resolve,options.captureDelay));
   if(options.captureMoves!==false){observation.total.captured=amount;captureMoved=true;}
   if(options.lostCaptureReply)throw new TypeError('Synthetic lost provider response');
   return json({meta:{result:true}});
  }
  throw Error('Unexpected external I/O in isolated Worldline scenario');
 };
 const created=await checkout({kind:'code',realReservations:true,customerOverrides:{paymentMethod:'online'},
  brandOverrides:{status:'active',companyName:'Synthetic ApS',companyRegNo:'12345678',street:'Testvej 1',zipCode:'2300',city:'København',country:'DK',currency:'DKK'},
  ...options.checkout,
  configureMocks:({mocks,records:input,marketingDb})=>{
   records=input;db=marketingDb;
   const external={
    'server-only':{},react:require('next/dist/compiled/react'),
    '@/lib/firebase-admin':{getAdminDb:()=>db,getAdminApp:()=>({options:{projectId:'orderfly-39325'}}),getAdminFieldValue:()=>({serverTimestamp:()=>new Date()})},
    '@google-cloud/secret-manager':{SecretManagerServiceClient:class{async accessSecretVersion({name}){secretReads.push(name);if(!secretVersions.has(name))throw Error('Synthetic missing original secret version');return[{payload:{data:Buffer.from(JSON.stringify(secretVersions.get(name)))}}];}}},
    'next/server':{after:fn=>after.push(fn)},'next/cache':{revalidatePath:()=>{},revalidateTag:()=>{}},'next/headers':{cookies:async()=>({get:()=>undefined})},
    '@/lib/access/orderfly-session':{orderflySession:async()=>{throw Error('Guest settlement must not borrow staff authority');}},
    '@/lib/analytics-server':{trackServerEvent:async(name,value)=>analytics.push({name,orderId:value.orderId})},
    '@/lib/marketing/config':{paidOrderMarketingEnabled:()=>false},
    '@/lib/server/payment-settings':{getActiveStripeSecretKey:async()=>{throw Error('Worldline must not use Stripe');}},
    '@/app/checkout/order-actions':{getOrderById:async id=>{const row=records.get('orders/'+id);return row?{...structuredClone(row),id}:null;}},
    'firebase-admin/firestore':{FieldValue:{serverTimestamp:()=>new Date()}},
   };
   load=moduleGraph(external);
   const store=load('src/lib/payments/worldline-store.ts');
   records.set(store.worldlineSettingsRef({brandId:'b'}).path,{source:'own',provider:'worldline',mode:'test',test:reference,revision:1});
   if(options.ownLocation){
    const brandRef=`projects/orderfly-39325/secrets/orderfly-worldline-${hash({brandId:'b'})}-test/versions/2`;
    secretVersions.set(brandRef,{...credentials,merchantNumber:'T999'});
    records.set(store.worldlineSettingsRef({brandId:'b'}).path,{source:'own',provider:'worldline',mode:'test',test:brandRef,revision:2});
    records.set(store.worldlineSettingsRef(owner).path,{source:'own',provider:'worldline',mode:'test',test:reference,revision:1});
   }
   mocks['@/lib/payments/merchant-agreement']=load('src/lib/payments/merchant-agreement.ts');
   mocks['@/lib/payments/worldline-client']=load('src/lib/payments/worldline-client.ts');
  }});
 assert.equal(created.result.success,true,created.result.error);
 const native=memoryDb(records),collection=native.collection,run=native.runTransaction;
 const wrapRef=ref=>({...ref,collection:name=>wrapQuery(collection(ref.path+'/'+name))});
 const wrapQuery=q=>({...q,doc:id=>wrapRef(q.doc(id)),where:(...args)=>wrapQuery(q.where(...args)),limit:n=>wrapQuery(q.limit(n)),orderBy:(...args)=>wrapQuery(q.orderBy(...args)),get:async()=>{const result=await q.get();return{...result,size:result.docs.length};}});
 native.collection=name=>wrapQuery(collection(name));
 native.runTransaction=fn=>run(tx=>{
  let wrote=false;
  return fn({...tx,get:ref=>{assert.equal(wrote,false,'Financial and print reads precede writes');return tx.get(ref);},
   set:(...args)=>{wrote=true;return tx.set(...args);},create:(...args)=>{wrote=true;return tx.create(...args);},
   update:(ref,input)=>{wrote=true;const patch={...input};for(const key of Object.keys(input).filter(key=>key.includes('.'))){const [parent,child]=key.split('.');patch[parent]={...records.get(ref.path)?.[parent],...patch[parent],[child]:input[key]};delete patch[key];}return tx.update(ref,patch);}});
 });db=native;
 records.set('categories/pizza',{isActive:true,locationIds:['l']});
 const printer={schemaVersion:1,configuration:{id:'pizza',brandId:'b',locationId:'l',name:'Synthetic kitchen',manufacturer:'star',model:'mc-print3',transport:'cloudprnt-http',paperWidthMm:80,state:'paused'},revision:1,deletedAt:null};
 records.set('locations/l/printers/pizza',printer);
 records.set('locations/l/printIntentPolicies/original',{schemaVersion:1,id:'original',brandId:'b',locationId:'l',revision:1,enabled:true,deletedAt:null,targets:[{printerId:'pizza',printerRevision:1,kinds:['kitchen']}]});
 records.set('locations/l/printerRouting/original',{schemaVersion:1,id:'original',brandId:'b',locationId:'l',revision:1,deletedAt:null,rules:[{id:'pizza',brandId:'b',locationId:'l',printerId:'pizza',match:{type:'category',id:'pizza'},effect:'include'}]});
 const accept=new URL(sessionInput.url.accept),receiptToken=accept.searchParams.get('receipt_token');
 const request=patch=>new Request('https://example.test/api/payments/worldline/return?'+new URLSearchParams({order_id:orderId,receipt_token:receiptToken,txnid:transactionId,...patch}));
 const callback=(patch={},invalid=false)=>{const query=new URLSearchParams({txnid:transactionId,orderid:orderId,amount:String(sessionInput.order.amount),currency:'DKK',...patch});query.set('hash',invalid?'0'.repeat(32):createHash('md5').update([...query.values()].join('')+credentials.md5Key).digest('hex'));return new Request('https://example.test/api/payments/worldline/callback?'+query);};
 const completion=load('src/lib/payments/worldline-callback-completion.ts');
 // Bound synthetic unresolved scenarios, while the real delayed-capture case
 // explicitly keeps the production-size budget. Both observers keep their
 // original payment/terminal validators.
 for(const name of ['waitForWorldlineCallbackFinancialCompletion','waitForWorldlineReturnOutcome']){
  const wait=completion[name];
  completion[name]=input=>wait({...input,timeoutMs:Math.min(input.timeoutMs??3500,options.waitBudget??200),pollIntervalMs:1});
 }
 const api=load('src/app/api/payments/worldline/return/route.ts'),callbacks=load('src/app/api/payments/worldline/callback/route.ts'),reconcile=load('src/lib/payments/worldline-reconcile.ts');
 const drain=async()=>{for(let i=0;i<after.length;i++)await after[i]();};
 const count=prefix=>[...records.keys()].filter(path=>path.startsWith(prefix)).length;
 return {created,records,db,load,api,callbacks,reconcile,request,callback,drain,http,secretReads,secretVersions,sessionInput,reference,owner,analytics,observation,
  order:()=>records.get('orders/'+orderId),capturePosts:()=>http.filter(x=>x.method==='POST'&&x.path.endsWith('/capture')).length,
  counts:()=>({orders:count('orders/'),invoices:count('invoiceCounters/'),confirmation:count('orderNotificationJobs/'),printJobs:count('locations/l/printers/pizza/jobs/'),paymentJobs:count('worldlinePaymentJobs/')}),captureMoved:()=>captureMoved};
}

function assertSettledOnce(f){
 const order=f.order();assert.equal(order.paymentStatus,'Paid');assert.equal(order.status,'Received');assert.equal(order.psp.captured,true);
 assert.equal(order.paymentAgreement.reference,f.reference);assert.deepEqual(order.paymentAgreement.owner,f.owner);assert.match(order.invoice.number,/^INV-\d{4}-\d{6}$/);
 assert.equal(order.invoice.paymentMethod,'Worldline');assert.equal(f.records.get('customers/'+order.customerDetails.id).totalOrders,1);
 assert.equal(f.records.get('customers/'+order.customerDetails.id).totalSpend,order.totalAmount);
 assert.equal(f.records.get('discounts/d').usedCount,order.appliedDiscountId?1:0);assert.equal(order.discountReservation,order.appliedDiscountId?'consumed':'none');
 assert.equal(f.capturePosts(),1);assert.equal(f.counts().confirmation,1);assert.equal(f.counts().printJobs,1);assert.equal(f.analytics.filter(x=>x.name==='payment_succeeded').length,1);
}

test('isolated end-to-end callback-first: actual capture/settlement creates one invoice, discount consumption, notification and verified print',async()=>{
 const f=await fixture();assert.equal(f.order().paymentStatus,'Pending');assert.equal(f.counts().printJobs,0);
 assert.equal((await f.callbacks.GET(f.callback())).status,200);await f.drain();assertSettledOnce(f);
 const invoice=f.order().invoice.number;
 const returned=await f.api.GET(f.request({amount:'1',currency:'EUR',status:'approved',return_url:'https://evil.example'}));assert.equal(returned.status,302);
 const destination=new URL(returned.headers.get('Location'),'https://example.test');
 const receipt=await f.load('src/lib/server/guest-receipt.ts').readGuestReceipt({orderId:'ORD-TEST',receiptToken:destination.searchParams.get('receipt_token'),brandId:'b',locationId:'l'},{reconcilePayment:false});
 assert.equal(receipt.paymentStatus,'Paid');assert.equal(receipt.invoice.number,invoice);assert.equal(receipt.totalAmount,f.order().totalAmount);
 assert.doesNotMatch(JSON.stringify(receipt),/synthetic-access|synthetic-secret|synthetic-callback-md5|paymentAgreement|receiptTokenHash|cancelTokenHash|transactionId/);
 assert.equal((await f.callbacks.GET(f.callback())).status,200);await f.drain();assertSettledOnce(f);assert.equal(f.order().invoice.number,invoice);assert.equal(f.counts().paymentJobs,1);
});
test('isolated end-to-end return-first and concurrent callback share the original capture journal',async()=>{
 const f=await fixture({captureDelay:20,waitBudget:1000});
 const [returned,callback]=await Promise.all([f.api.GET(f.request()),f.callbacks.GET(f.callback())]);await f.drain();
 assert.equal(returned.status,302);assert.equal(callback.status,200);assertSettledOnce(f);assert.equal(f.counts().paymentJobs,1);
});
test('own location account stays pinned after merchant settings select another account',async()=>{
 const f=await fixture({ownLocation:true});
 const store=f.load('src/lib/payments/worldline-store.ts'),changedRef=f.reference.replace('/versions/1','/versions/9');
 f.secretVersions.set(changedRef,{merchantNumber:'T999',accessToken:'other-synthetic-access',secretToken:'other-synthetic-secret',md5Key:'other-synthetic-md5'});
 f.records.set(store.worldlineSettingsRef({brandId:'b',locationId:'l'}).path,{source:'own',provider:'stripe',mode:'live',revision:9,live:changedRef});
 assert.equal((await f.api.GET(f.request())).status,302);await f.drain();assertSettledOnce(f);
 assert.ok(f.secretReads.every(name=>name===f.reference),'Old order must never read current settings or another version');
});
test('wrong receipt capability or callback hash cannot admit a job, capture, settle or print',async()=>{
 const f=await fixture();assert.equal((await f.api.GET(f.request({receipt_token:'b'.repeat(64)}))).status,403);
 assert.notEqual((await f.callbacks.GET(f.callback({},true))).status,200);assert.equal(f.counts().paymentJobs,0);assert.equal(f.capturePosts(),0);assert.equal(f.counts().confirmation,0);assert.equal(f.counts().printJobs,0);
 assert.equal(f.http.filter(x=>x.method==='GET').length,0,'Private capability must be validated before provider reads');
});
test('wrong provider order, merchant, amount or currency is rejected without financial or fulfillment effects',async()=>{
 for(const patch of [{orderid:'OTHER'},{merchantnumber:'T999'},{total:{authorized:1,captured:0,credited:0}},{currency:{code:'EUR',minorunits:2}},{status:'declined'}]){
  const f=await fixture();Object.assign(f.observation,patch);const response=await f.api.GET(f.request());
  assert.notEqual(response.status,302);assert.equal(response.headers.get('Location'),null);assert.equal(f.capturePosts(),0);assert.equal(f.order().paymentStatus,'Pending');assert.equal(f.counts().confirmation,0);assert.equal(f.counts().printJobs,0);
 }
});
test('tampered original owner or test/live binding cannot select another account',async()=>{
 for(const paymentAgreement of [{owner:{brandId:'other'}},{mode:'live'},{reference:'projects/orderfly-39325/secrets/other-test/versions/1'}]){
  const f=await fixture();f.order().paymentAgreement={...f.order().paymentAgreement,...paymentAgreement};
  const response=await f.api.GET(f.request());assert.notEqual(response.status,302);assert.equal(response.headers.get('Location'),null);
  assert.equal(f.capturePosts(),0);assert.equal(f.http.filter(x=>x.method==='GET').length,0);assert.equal(f.order().paymentStatus,'Pending');assert.equal(f.counts().paymentJobs,0);assert.equal(f.counts().printJobs,0);
 }
});
test('late cancellation, refund or active money operation invalidates the proof before invoice/print commit',async()=>{
 for(const patch of [{status:'Canceled'},{refundedAmountOre:9400,refundedAt:new Date()},{paymentOperation:'another-refund-operation'}]){
  let injected=false;
  const f=await fixture({onRead:({records,http})=>{
   if(!injected&&http.filter(x=>x.method==='GET').length===5){injected=true;Object.assign(records.get('orders/ORD-TEST'),patch);}
  }});
  const response=await f.api.GET(f.request());await f.drain();assert.equal(injected,true);assert.notEqual(response.status,302);assert.equal(response.headers.get('Location'),null);
  assert.equal(f.capturePosts(),1);assert.equal(f.order().paymentStatus,'Pending');assert.equal(f.order().invoice,undefined);assert.equal(f.counts().confirmation,0);assert.equal(f.counts().printJobs,0);assert.equal(f.records.get('discounts/d').usedCount,0);
 }
});
test('lost successful capture reply is reconciled by actual provider readback and never captured twice',async()=>{
 const f=await fixture({lostCaptureReply:true});assert.equal((await f.api.GET(f.request())).status,302);await f.drain();assertSettledOnce(f);
 assert.equal((await f.callbacks.GET(f.callback())).status,200);await f.drain();assertSettledOnce(f);
});
test('unresolved capture timeout retains the journal and later captured observation settles without another money request',async()=>{
 const f=await fixture({lostCaptureReply:true,captureMoves:false,waitBudget:20});
 assert.notEqual((await f.api.GET(f.request())).status,302);await f.drain();assert.equal(f.capturePosts(),1);assert.equal(f.order().paymentStatus,'Pending');assert.ok(f.order().paymentOperation);assert.equal(f.counts().printJobs,0);
 f.observation.total.captured=f.sessionInput.order.amount;
 await f.reconcile.reconcileWorldlineOrder('ORD-TEST');assertSettledOnce(f);
 assert.equal((await f.api.GET(f.request())).status,302);assert.equal(f.capturePosts(),1);
});
test('transient pre-journal provider read failure recovers before the only capture request',async()=>{
 let failed=false;
 const f=await fixture({waitBudget:3000,onRead:({http})=>{
  if(!failed&&http.filter(x=>x.method==='GET').length===2){failed=true;throw Error('Synthetic temporary transaction-read failure');}
 }});
 assert.equal((await f.api.GET(f.request())).status,302);await f.drain();assert.equal(failed,true);assertSettledOnce(f);
});
test('return automatically confirms a late capture observation after an uncertain reply without another capture request',async()=>{
 let observedLate=false;
 const f=await fixture({lostCaptureReply:true,captureMoves:false,waitBudget:3000,onRead:({http,observation})=>{
  if(http.filter(x=>x.method==='GET').length>=5){observedLate=true;observation.total.captured=observation.total.authorized;}
 }});
 assert.equal((await f.api.GET(f.request())).status,302);await f.drain();assert.equal(observedLate,true);assertSettledOnce(f);
});
test('observation-only financial recovery cannot create a missing journal or recover a changed journal identity',async()=>{
 const missing=await fixture();missing.order().psp.transactionId='123';
 const input={orderId:'ORD-TEST',transactionId:'123',requestId:'initial-capture',operation:'capture',amountMinor:missing.sessionInput.order.amount,actorId:'worldline-worker'};
 await assert.rejects(missing.load('src/lib/payments/worldline-operations.ts').runWorldlineOperation(input,undefined,{observationOnly:true}));
 assert.equal(missing.capturePosts(),0);assert.equal([...missing.records.keys()].filter(path=>path.includes('/paymentOperations/')).length,0);assert.equal(missing.order().paymentStatus,'Pending');
 for(const changed of ['fingerprint','binding']){
  const f=await fixture({lostCaptureReply:true,captureMoves:false,waitBudget:20});
  assert.notEqual((await f.api.GET(f.request())).status,302);await f.drain();
  const journal=[...f.records].find(([path])=>path.includes('/paymentOperations/'))[1];
  if(changed==='fingerprint')journal.fingerprint='0'.repeat(64);else journal.binding={...journal.binding,owner:{brandId:'other'}};
  f.observation.total.captured=f.sessionInput.order.amount;
  await assert.rejects(f.reconcile.reconcileWorldlineOrder('ORD-TEST',{observationOnly:true}));
  assert.equal(f.capturePosts(),1);assert.equal(f.order().paymentStatus,'Pending');assert.equal(f.order().invoice,undefined);assert.equal(f.counts().printJobs,0);
 }
});
test('existing Club member buying a 99 DKK pizza-and-drink combo receives one stamp and one financial/print settlement',async()=>{
 const cart=require('../helpers/cart-fixture.cjs'),{loadTs}=require('../helpers/load-ts.cjs');
 const catalog=cart.catalog();catalog.products[0]={...catalog.products[0],productName:'Margherita',price:79,toppingGroupIds:[]};
 catalog.products.push({id:'soda',brandId:'b',locationIds:['l'],isActive:true,productName:'Faxe Kondi free',price:20,categoryId:'pizza',toppingGroupIds:[]});
 catalog.combos[0]={...catalog.combos[0],comboName:'Pizza Combo',pickupPrice:95,productGroups:[{id:'pg',groupName:'Pizza',productIds:['pizza'],minSelection:1,maxSelection:1},{id:'drink',groupName:'Sodavand',productIds:['soda'],minSelection:1,maxSelection:1}]};
 const choice={...cart.comboChoice,comboSelections:[{groupId:'pg',groupName:'Pizza',products:[{id:'pizza',modifiers:[]}]},{groupId:'drink',groupName:'Sodavand',products:[{id:'soda',modifiers:[]}]}]};
 const items=loadTs('src/lib/checkout-items.ts').checkoutItems(cart.restoreCartItems([choice],catalog,cart.scope).items);
 const seed=[...catalog.products.map(product=>['products/'+product.id,product]),['comboMenus/combo',catalog.combos[0]]];
 const f=await fixture({checkout:{kind:'none',existing:true,items,seed,paymentOverrides:{subtotal:95}}});
 assert.equal(f.order().totalAmount,99);assert.equal(f.order().productItems[0].itemType,'combo');assert.equal(f.order().productItems[0].comboSelections.length,2);
 const {defaultProgramSettings}=f.load('src/lib/loyalty/stamp-card/rules.ts');
 f.records.set('platformAdminControl/access-v1',{principals:[],companies:[{id:'company',active:true,locationIds:['l'],orderflyBrandIds:['b']}],roles:[],memberships:[]});
 f.records.set('loyaltyPrograms/b',{brandId:'b',version:1,settings:{...defaultProgramSettings('Synthetic'),active:true,minimumAmountOre:9500,reward:{type:'free_product',productIds:['pizza'],categoryIds:[]},rewardDescription:'Pizza',terms:'Synthetic terms',consentText:'Synthetic consent'}});
 f.records.set('loyaltyMembers/member',{brandId:'b',companyId:'company',customerId:f.order().customerDetails.id,name:'Existing synthetic member',normalizedEmail:'test@example.test',status:'active',joinedAt:Date.now()-86400000,currentCardId:null,stampDay:null,stampsOnDay:0,consent:{status:'given',at:Date.now()-86400000,source:'portal',eventId:'prior-consent'},termsVersion:'v1'});
 assert.equal((await f.api.GET(f.request())).status,302);await f.drain();assertSettledOnce(f);
 const events=[...f.records].filter(([path,value])=>path.startsWith('loyaltyEvents/')&&value.type==='stamp_added');assert.equal(events.length,1);assert.equal(events[0][1].orderId,'ORD-TEST');assert.equal(events[0][1].amountOre,9900);
 const member=f.records.get('loyaltyMembers/member');assert.ok(member.currentCardId);assert.equal(f.records.get('loyaltyCards/'+member.currentCardId).stamps,1);
 const invoice=f.order().invoice.number;assert.equal((await f.callbacks.GET(f.callback())).status,200);assert.equal((await f.api.GET(f.request())).status,302);await f.drain();assertSettledOnce(f);assert.equal(f.order().invoice.number,invoice);
 assert.equal([...f.records].filter(([path,value])=>path.startsWith('loyaltyEvents/')&&value.type==='stamp_added').length,1);assert.equal(f.records.get('loyaltyCards/'+member.currentCardId).stamps,1);
});

test('a captured financial commit beyond ten seconds reaches the real receipt without another capture request',async()=>{
 const f=await fixture({captureDelay:11000,waitBudget:60000}),started=Date.now();
 const response=await f.api.GET(f.request());
 assert.equal(response.status,302);assert.ok(Date.now()-started>=11000);await f.drain();assertSettledOnce(f);
 const proof=new URL(f.request().url).searchParams;
 const receipt=await f.load('src/lib/server/guest-receipt.ts').readGuestReceipt({orderId:'ORD-TEST',receiptToken:proof.get('receipt_token')},{reconcilePayment:false});
 assert.equal(receipt.paymentStatus,'Paid');assert.equal(receipt.invoice.number,f.order().invoice.number);assert.equal(f.capturePosts(),1);
});
