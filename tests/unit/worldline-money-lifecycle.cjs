const {test}=require('node:test');
const assert=require('node:assert/strict');
const {moduleGraph}=require('../helpers/load-ts-graph.cjs');
const {memoryDb}=require('../helpers/marketing-db.cjs');

// Isolated financial lifecycle integration: production admin authorization,
// HTTP client, journal, settlement, invoice and print outbox run together.
// Only persistence, transport, verified identity and pinned-secret I/O are fake.
// The void reservation-release handoff is a checked stub; this does not certify
// actual provider settlement, a live admin session or physical printer output.

const identity={provider:'firebase',subject:'test-employee'};
const reference=`projects/orderfly-39325/secrets/orderfly-worldline-${'a'.repeat(64)}-test/versions/7`;
const binding={provider:'worldline',mode:'test',owner:{brandId:'b',locationId:'l'},merchantNumber:'T123',revision:3,reference};
const keys={merchantNumber:'T123',accessToken:'synthetic-access',secretToken:'synthetic-secret',md5Key:'synthetic-md5'};
const requestId=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

function fixture(options={}){
 const rows=new Map([
  ['orders/ORD-LIFECYCLE',{id:'ORD-LIFECYCLE',brandId:'b',locationId:'l',customerDetails:{id:'c',address:'For Pickup'},customerName:'Synthetic guest',customerContact:'test@example.test',createdAt:new Date().toISOString(),
   deliveryType:'Pickup',deliveryTime:new Date().toISOString(),expectedDeliveryAt:new Date().toISOString(),status:'Pending',paymentStatus:'Pending',paymentMethod:'Worldline',discountReservation:'held',totalAmount:104,
   psp:{provider:'worldline',transactionId:'123',checkoutSessionId:'synthetic-window'},paymentAgreement:structuredClone(binding),
   productItems:[{id:'p',name:'Pizza',categoryId:'pizza',itemType:'product',quantity:1,unitPrice:100,totalPrice:100,listTotalPrice:100,toppings:[]}],
   paymentDetails:{subtotal:100,itemDiscountTotal:0,cartDiscountTotal:0,discountTotal:0,taxes:0,deliveryFee:0,bagFee:4,adminFee:0,tips:0,vatAmount:20.8}}],
  ['brands/b',{id:'b',slug:'brand',name:'Synthetic brand',status:'active',companyName:'Synthetic ApS',companyRegNo:'12345678',street:'Testvej 1',zipCode:'1000',city:'København',country:'DK',currency:'DKK',vatPercentage:25}],
  ['locations/l',{id:'l',brandId:'b',slug:'location',name:'Synthetic location',address:'Testvej 1, 1000 København, DK'}],
  ['customers/c',{id:'c',brandId:'b',email:'test@example.test',marketingConsent:false,totalOrders:0,totalSpend:0}],
  ['categories/pizza',{id:'pizza',brandId:'b',isActive:true,locationIds:['l'],name:'Pizza'}],
  ['products/p',{id:'p',brandId:'b',locationIds:['l'],categoryId:'pizza',isActive:true,price:100,productName:'Pizza'}],
 ]);
 const db=memoryDb(rows),originalCollection=db.collection;
 const wrapRef=ref=>({...ref,collection:child=>wrapQuery(originalCollection(ref.path+'/'+child))});
 const wrapQuery=query=>({...query,doc:id=>wrapRef(query.doc(id)),where:(...args)=>wrapQuery(query.where(...args)),limit:n=>wrapQuery(query.limit(n)),get:async()=>{const result=await query.get();return {...result,size:result.docs.length};}});
 db.collection=name=>wrapQuery(originalCollection(name));
 const originalTransaction=db.runTransaction;
 db.runTransaction=run=>originalTransaction(async tx=>{
  let writes=false;
  return run({...tx,get:ref=>{assert.equal(writes,false,'financial, access and print reads precede writes');return tx.get(ref);},
   create:(...args)=>{writes=true;return tx.create(...args);},set:(...args)=>{writes=true;return tx.set(...args);},
   update:(ref,data)=>{writes=true;const patch={...data};for(const key of Object.keys(data).filter(k=>k.includes('.'))){const [parent,field]=key.split('.');patch[parent]={...rows.get(ref.path)?.[parent],...patch[parent],[field]:data[key]};delete patch[key];}return tx.update(ref,patch);},
  });
 });
 let provider={id:'123',orderid:'ORD-LIFECYCLE',merchantnumber:'T123',status:'approved',currency:{code:'DKK',minorunits:2},total:{authorized:10400,captured:0,credited:0}};
 const requests=[],secretReads=[],releases=[];
 let loseReply=options.loseReply,moveMoney=options.moveMoney!==false,afterRead=options.afterRead;
 const transport=async(url,input={})=>{
  const parsed=new URL(url),method=input.method||'GET';
  assert.equal(input.headers.Authorization,'Basic '+Buffer.from('synthetic-access@T123:synthetic-secret').toString('base64'));
  requests.push({host:parsed.hostname,path:parsed.pathname,method});
  if(method==='GET'){
   assert.equal(parsed.hostname,'merchant-v1.api-eu.bambora.com');assert.equal(parsed.pathname,'/transactions/123');
   afterRead?.(provider,rows);
   return Response.json({meta:{result:true},transaction:structuredClone(provider)});
  }
  assert.equal(method,'POST');assert.equal(parsed.hostname,'transaction-v1.api-eu.bambora.com');
  const operation=parsed.pathname.split('/').at(-1),data=JSON.parse(input.body);
  if(operation==='capture'){assert.equal(data.currency,'DKK');if(moveMoney)provider.total.captured=data.amount;}
  else if(operation==='credit'){assert.equal(data.currency,'DKK');if(moveMoney)provider.total.credited+=data.amount;}
  else{assert.equal(operation,'delete');assert.equal(data.deletetype,'instant');if(moveMoney)provider.status='deleted';}
  if(loseReply)throw Error('synthetic lost provider reply');
  return Response.json({meta:{result:true}});
 };
 const store={readPinnedWorldlineAgreement:async original=>{assert.deepEqual(original,binding);secretReads.push(original.reference);return {binding:structuredClone(binding),credentials:keys};}};
 const session={orderflySession:async()=>({actorId:'firebase:test-employee',identity,name:'Synthetic employee',superuser:false,permissions:[]}),verifiedOrderflyIdentity:async()=>identity};
 const mocks={'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db,getAdminFieldValue:()=>({serverTimestamp:()=>new Date()})},'@/lib/access/orderfly-session':session,'./orderfly-session':session,
  '@/lib/payments/worldline-store':store,'./worldline-store':store,
  '@/lib/analytics-server':{trackServerEvent:async()=>{}},'@/lib/marketing/config':{paidOrderMarketingEnabled:()=>false},'@/lib/feedback/mail-queue':{queueOrderFeedback:async()=>{}},
  '@/lib/discount-reservations':{releaseDiscount:async(orderId,brandId,sessionId,locationId)=>{const order=rows.get('orders/'+orderId);assert.equal(order.status,'Canceled');assert.equal(order.psp.voided,true);assert.equal(brandId,'b');assert.equal(locationId,'l');releases.push({orderId,brandId,locationId});order.discountReservation='released';order.paymentStatus='Failed';}},
  'next/cache':{revalidatePath:()=>{},revalidateTag:()=>{}},'firebase-admin/firestore':{FieldValue:{serverTimestamp:()=>new Date()}},
 };
 const load=moduleGraph(mocks),{principalKey}=load('src/lib/access/authority.ts');
 const principalId=principalKey(identity);
 rows.set('platformAdminControl/access-v1',{principals:[{id:principalId,active:true,name:'Synthetic employee'}],companies:[{id:'company',active:true,locationIds:['l'],orderflyBrandIds:['b']}],roles:[{id:'employee',name:'Employee',companyId:'company',kind:'company_user',active:true,permissions:['orderfly.orders:view','orderfly.orders:edit']}],memberships:[{id:'member',principalId,companyId:'company',locationIds:['l'],roleIds:['employee'],active:true}]});
 for(const printerId of ['pizza','packing'])rows.set('locations/l/printers/'+printerId,{schemaVersion:1,configuration:{id:printerId,brandId:'b',locationId:'l',name:printerId,manufacturer:'star',model:'mc-print3',transport:'cloudprnt-http',paperWidthMm:80,state:'paused'},revision:1,deletedAt:null});
 rows.set('locations/l/printIntentPolicies/original',{schemaVersion:1,id:'original',brandId:'b',locationId:'l',revision:1,enabled:true,deletedAt:null,targets:['pizza','packing'].map(printerId=>({printerId,printerRevision:1,kinds:['kitchen']}))});
 rows.set('locations/l/printerRouting/original',{schemaVersion:1,id:'original',brandId:'b',locationId:'l',revision:1,deletedAt:null,rules:['pizza','packing'].map(printerId=>({id:'rule-'+printerId,brandId:'b',locationId:'l',printerId,match:{type:'category',id:'pizza'},effect:'include'}))});
 return {rows,db,load,transport,requests,secretReads,releases,order:()=>rows.get('orders/ORD-LIFECYCLE'),provider:()=>provider,
  operations:load('src/lib/payments/worldline-operations.ts'),admin:load('src/app/superadmin/payments/worldline-operations-actions.ts'),settlement:load('src/lib/server/settle-checkout.ts'),proof:load('src/lib/payments/worldline-proof.ts'),
  mutateOptions:options=>{if('loseReply'in options)loseReply=options.loseReply;if('moveMoney'in options)moveMoney=options.moveMoney;},
  moneyPosts:()=>requests.filter(r=>r.method==='POST'),jobs:()=>[...rows].filter(([path])=>path.includes('/jobs/')),
 };
}
async function withTransport(f,run){const previous=global.fetch,printFlag=process.env.ORDERFLY_PRINT_INTENTS_ENABLED;global.fetch=f.transport;process.env.ORDERFLY_PRINT_INTENTS_ENABLED='true';try{return await run();}finally{global.fetch=previous;if(printFlag===undefined)delete process.env.ORDERFLY_PRINT_INTENTS_ENABLED;else process.env.ORDERFLY_PRINT_INTENTS_ENABLED=printFlag;}}
const capture=f=>f.operations.runWorldlineOperation({orderId:'ORD-LIFECYCLE',transactionId:'123',requestId:'initial-capture',operation:'capture',amountMinor:10400,actorId:'worldline-worker'});
const credit=(f,n,amountMinor)=>f.admin.worldlineOrderOperation({orderId:'ORD-LIFECYCLE',requestId:requestId(n),operation:'credit',amountMinor});

test('real capture client, settlement, invoice/print and two admin refunds form one original-account lifecycle',async()=>{
 const f=fixture();await withTransport(f,async()=>{
  assert.equal((await capture(f)).state,'confirmed');assert.equal(f.order().paymentStatus,'Pending');assert.equal(f.jobs().length,0);
  assert.equal(await f.settlement.settleWorldlineOrder('ORD-LIFECYCLE','123'),true);
  assert.equal(f.order().paymentStatus,'Paid');assert.equal(f.order().status,'Received');assert.equal(f.jobs().length,2);assert.equal(f.rows.get('customers/c').totalSpend,104);assert.equal(f.rows.get('customers/c').totalOrders,1);
  const originalInvoice=structuredClone(f.order().invoice),invoice=originalInvoice.number;assert.equal(f.order().invoice.paymentMethod,'Worldline');assert.equal(await f.settlement.settleWorldlineOrder('ORD-LIFECYCLE','123'),false);assert.equal(f.jobs().length,2);
  f.rows.set('platform_settings/worldline-current',{merchantNumber:'P999',mode:'live',reference:'changed-current-setting'});
  f.mutateOptions({loseReply:true});
  assert.equal((await credit(f,1,1000)).state,'confirmed');assert.equal((await credit(f,1,1000)).state,'confirmed');assert.equal(f.order().refundedAmountOre,1000);assert.equal(f.rows.get('customers/c').totalSpend,94);
  assert.equal((await credit(f,2,9400)).state,'confirmed');assert.equal(f.provider().total.credited,10400);assert.equal(f.rows.get('customers/c').totalSpend,0);assert.deepEqual(f.order().invoice,originalInvoice);
  const adjustments=[...f.rows].filter(([p])=>p.includes('/financialAdjustments/'));assert.equal(adjustments.length,2);assert.ok(adjustments.every(([,v])=>v.originalInvoiceNumber===invoice&&v.actorId==='firebase:test-employee'&&v.customerApplied));
  assert.equal(f.moneyPosts().length,3);assert.ok(f.secretReads.every(x=>x===reference));assert.equal(f.jobs().length,2);
  await assert.rejects(f.settlement.settleWorldlineOrder('ORD-LIFECYCLE','123'));assert.equal(f.jobs().length,2);
 });
});
test('authorization cannot print; authenticated void uses provider delete then native cancellation and release',async()=>{
 const f=fixture();await withTransport(f,async()=>{
  await assert.rejects(f.settlement.settleWorldlineOrder('ORD-LIFECYCLE','123'));assert.equal(f.jobs().length,0);assert.equal(f.order().paymentStatus,'Pending');
  assert.equal((await f.admin.worldlineOrderOperation({orderId:'ORD-LIFECYCLE',requestId:requestId(3),operation:'delete'})).state,'confirmed');
  assert.equal(f.provider().status,'deleted');assert.equal(f.order().status,'Canceled');assert.equal(f.order().paymentStatus,'Failed');assert.equal(f.releases.length,1);assert.equal(f.moneyPosts().length,1);assert.equal(f.jobs().length,0);
 });
});
test('uncertain capture with money moved recovers by actual provider readback and never resends',async()=>{
 const f=fixture({loseReply:true});await withTransport(f,async()=>{assert.equal((await capture(f)).state,'confirmed');assert.equal((await capture(f)).state,'confirmed');assert.equal(f.moneyPosts().length,1);assert.equal(f.provider().total.captured,10400);assert.equal(await f.settlement.settleWorldlineOrder('ORD-LIFECYCLE','123'),true);assert.equal(f.jobs().length,2);});
});
test('uncertain capture stays locked until read-only recovery observes completion, then settles/prints once',async()=>{
 const f=fixture({loseReply:true,moveMoney:false});await withTransport(f,async()=>{assert.equal((await capture(f)).state,'unknown');assert.equal((await capture(f)).state,'unknown');assert.equal(f.moneyPosts().length,1);await assert.rejects(f.admin.worldlineOrderOperation({orderId:'ORD-LIFECYCLE',requestId:requestId(4),operation:'delete'}));await assert.rejects(f.settlement.settleWorldlineOrder('ORD-LIFECYCLE','123'));assert.equal(f.order().paymentStatus,'Pending');assert.ok(f.order().paymentOperation);assert.equal(f.jobs().length,0);assert.equal(f.moneyPosts().length,1);
  f.provider().total.captured=10400;
  assert.equal((await capture(f)).state,'confirmed');assert.equal(f.moneyPosts().length,1);assert.equal(f.order().paymentOperation,null);assert.equal(await f.settlement.settleWorldlineOrder('ORD-LIFECYCLE','123'),true);assert.equal(await f.settlement.settleWorldlineOrder('ORD-LIFECYCLE','123'),false);assert.equal(f.jobs().length,2);assert.equal(f.rows.get('customers/c').totalOrders,1);
 });
});
test('unknown admin refund reuses its journal after late credit and writes customer adjustment exactly once',async()=>{
 const f=fixture();await withTransport(f,async()=>{
  await capture(f);await f.settlement.settleWorldlineOrder('ORD-LIFECYCLE','123');f.mutateOptions({loseReply:true,moveMoney:false});
  assert.equal((await credit(f,6,1000)).state,'unknown');const view=await f.admin.loadWorldlineOrderPayment('ORD-LIFECYCLE');assert.equal(view.locked,true);assert.equal(view.canRefund,false);assert.equal(view.pending.requestId,requestId(6));
  assert.equal((await credit(f,6,1000)).state,'unknown');await assert.rejects(credit(f,7,1000));assert.equal(f.moneyPosts().length,2);assert.equal(f.rows.get('customers/c').totalSpend,104);
  f.provider().total.credited=1000;assert.equal((await credit(f,6,1000)).state,'confirmed');assert.equal((await credit(f,6,1000)).state,'confirmed');assert.equal(f.moneyPosts().length,2);assert.equal(f.order().refundedAmountOre,1000);assert.equal(f.rows.get('customers/c').totalSpend,94);assert.equal([...f.rows].filter(([p])=>p.includes('/financialAdjustments/')).length,1);assert.equal(f.jobs().length,2);
 });
});
test('refund after customer deletion records explicit reconciliation without inventing a customer balance',async()=>{
 const f=fixture();await withTransport(f,async()=>{
  await capture(f);await f.settlement.settleWorldlineOrder('ORD-LIFECYCLE','123');f.rows.delete('customers/c');
  assert.equal((await credit(f,8,1000)).state,'confirmed');assert.equal((await credit(f,8,1000)).state,'confirmed');
  assert.equal(f.rows.has('customers/c'),false);assert.equal(f.order().refundedAmountOre,1000);assert.equal(f.moneyPosts().length,2);
  const adjustments=[...f.rows].filter(([p])=>p.includes('/financialAdjustments/'));assert.equal(adjustments.length,1);assert.equal(adjustments[0][1].customerApplied,false);assert.equal(adjustments[0][1].requiresCustomerReconciliation,true);assert.equal(adjustments[0][1].originalInvoiceNumber,f.order().invoice.number);
 });
});
test('real scoped admin policy rejects revoked or foreign employees before any provider access',async()=>{
 for(const change of [policy=>policy.memberships[0].active=false,policy=>policy.companies[0].orderflyBrandIds=['foreign'],policy=>policy.memberships[0].locationIds=['foreign']]){
  const f=fixture();change(f.rows.get('platformAdminControl/access-v1'));await withTransport(f,async()=>{await assert.rejects(f.admin.loadWorldlineOrderPayment('ORD-LIFECYCLE'));await assert.rejects(credit(f,5,100));assert.equal(f.requests.length,0);assert.equal(f.secretReads.length,0);});
 }
});
test('native amount, tenant, method or provider changes between verification and journal claim never move money',async()=>{
 for(const change of [o=>o.totalAmount=105,o=>o.brandId='foreign',o=>o.locationId='foreign',o=>o.paymentMethod='Stripe',o=>o.psp.provider='stripe']){
  let changed=false;const f=fixture({afterRead:(_provider,rows)=>{if(!changed){changed=true;change(rows.get('orders/ORD-LIFECYCLE'));}}});
  await withTransport(f,async()=>{await assert.rejects(capture(f));assert.equal(f.moneyPosts().length,0);assert.equal(f.order().paymentStatus,'Pending');assert.equal(f.jobs().length,0);});
 }
});
test('foreign identity, wrong totals/currency, partial capture or declined payment cannot settle or print',async()=>{
 for(const change of [p=>p.merchantnumber='T999',p=>p.orderid='FOREIGN',p=>p.id='456',p=>p.total.authorized=10401,p=>p.currency.code='EUR',p=>p.total.captured=5200,p=>p.status='declined']){
  const f=fixture();change(f.provider());await withTransport(f,async()=>{await assert.rejects(capture(f));await assert.rejects(f.settlement.settleWorldlineOrder('ORD-LIFECYCLE','123'));assert.equal(f.moneyPosts().length,0);assert.equal(f.jobs().length,0);assert.equal(f.order().paymentStatus,'Pending');});
 }
});
test('plain objects cannot forge native Worldline payment or print capabilities',async()=>{
 const f=fixture();assert.throws(()=>f.proof.worldlinePaymentProjection({}));assert.throws(()=>f.proof.worldlinePrintTransitionProjection({db:f.db,transaction:{}},{}));assert.equal(f.jobs().length,0);
});
