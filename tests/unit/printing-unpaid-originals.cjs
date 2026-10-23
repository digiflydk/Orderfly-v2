const { test } = require('node:test');
const assert = require('node:assert/strict');
const { moduleGraph } = require('../helpers/load-ts-graph.cjs');
const { memoryDb } = require('../helpers/marketing-db.cjs');
const input = { orderId: 'order', brandId: 'b', locationId: 'l', selection: 'asap' };
const policyPath = 'locations/l/printIntentPolicies/original';
const printerPath = 'locations/l/printers/pizza';

test('#549 supervised pilot preserves ordinary unpaid combo acceptance without partial print intents', () => enabled(async () => {
  const before = process.env.ORDERFLY_PRINTER_ORDER_TEST_OUTPUT_ENABLED;
  process.env.ORDERFLY_PRINTER_ORDER_TEST_OUTPUT_ENABLED = 'true';
  try {
    const f = await fixture(), now = Date.now();
    f.records.get(policyPath).supervisedOrderTest = true;
    f.records.get(printerPath).configuration.state = 'active';
    const scope = { brandId: 'b', locationId: 'l', printerId: 'pizza', printerRevision: 1, credentialRevision: 1 };
    f.records.set(printerPath + '/deviceCredentials/current', f.load('src/lib/printing/device-auth.ts').createPrinterDeviceCredentialDraft(scope).record);
    f.records.set(printerPath + '/orderTestWindows/current', { schemaVersion: 1, ...scope,
      model: 'mc-print3', paperWidthMm: 80, qualificationId: 'q'.repeat(43), routingRevision: 1,
      issuedAt: now, expiresAt: now + 3600000, stoppedAt: null, actorId: 'firebase:supervisor',
      trust: 'supervised_order_test', physicalPaperCheckedByOperator: true, unattendedAuthorized: false });
    const eligible = await f.db.runTransaction(transaction => f.load('src/lib/printing/intent-target-policy.ts')
      .preparePrintIntentTargetPolicy({ db: f.db, transaction }, { brandId: 'b', locationId: 'l', orderId: 'order' }));
    assert.equal(eligible.enabled, true, 'the test window actually enables ordinary products before adding a combo');
    f.records.get('orders/order').productItems.push({ id: 'menu', itemType: 'combo', name: 'Menu', quantity: 1,
      comboSelections: [{ groupName: 'Pizza', products: [{ id: 'p', name: 'Pizza' }] }] });
    await f.accept();
    assert.equal(f.records.get('orders/order').status, 'Received');
    assert.equal(f.records.get('orders/order').paymentStatus, 'Pending');
    assert.equal(f.records.has('orders/order/printIntents/original'), false);
    assert.equal(f.records.has(printerPath + '/queue/state'), false);
    assert.equal([...f.records.keys()].some(p => p.includes('/jobs/')), false);
  } finally {
    if (before === undefined) delete process.env.ORDERFLY_PRINTER_ORDER_TEST_OUTPUT_ENABLED;
    else process.env.ORDERFLY_PRINTER_ORDER_TEST_OUTPUT_ENABLED = before;
  }
}));
async function fixture(options = {}) {
  const records = new Map([
    ['brands/b', { status: 'active' }],
    ['locations/l', { brandId:'b',isActive:true,paymentMethods:{payAtPickup:true,online:true},deliveryTypes:['pickup'],allowPreOrder:true,prep_time:20,
      openingHours:Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day=>[day,{isOpen:true,open:'00:00',close:'23:59'}])) }],
    ['orders/order', { id:'order',brandId:'b',locationId:'l',status:'Pending',paymentStatus:'Pending',paymentMethod:'PayAtPickup',deliveryType:'Pickup',discountReservation:'held',
      productItems:[{id:'p',itemType:'product',name:'Pizza',quantity:1}],customerContact:'PRIVATE_CUSTOMER' }],
    ['products/p',{brandId:'b',locationIds:['l'],categoryId:'pizza',price:100,isActive:true,productName:'Pizza'}],
    ['categories/pizza',{isActive:true,locationIds:['l']}],
    [printerPath,{schemaVersion:1,configuration:{id:'pizza',brandId:'b',locationId:'l',name:'Pizza',manufacturer:'star',model:'mc-print3',transport:'cloudprnt-http',paperWidthMm:80,state:'paused'},revision:1,deletedAt:null}],
    [policyPath,{schemaVersion:1,id:'original',brandId:'b',locationId:'l',revision:1,enabled:true,deletedAt:null,targets:[{printerId:'pizza',printerRevision:1,kinds:['kitchen','packing']}]}],
    ['locations/l/printerRouting/original',{schemaVersion:1,id:'original',brandId:'b',locationId:'l',revision:1,deletedAt:null,rules:[{id:'r',brandId:'b',locationId:'l',printerId:'pizza',match:{type:'category',id:'pizza'},effect:'include'}]}],
  ]);
  const db=memoryDb(records), original=db.collection;
  const ref = native => ({...native,collection:child=>query(original(native.path+'/'+child))});
  const query = native => ({...native,doc:id=>ref(native.doc(id)),limit:n=>query(native.limit(n)),get:async()=>{const result=await native.get();return {...result,size:result.docs.length};}});
  db.collection=name=>query(original(name));
  const load=moduleGraph({react:require('next/dist/compiled/react'),'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db,getAdminFieldValue:()=>({serverTimestamp:()=> 'SERVER'})},
    'firebase-admin/firestore':{FieldValue:{serverTimestamp:()=> 'SERVER'}}});
  const acceptance=load('src/lib/server/accept-pickup-checkout.ts'), adapter=load('src/lib/printing/unpaid-acceptance-originals.ts'),outbox=load('src/lib/printing/outbox.ts');
  const events=[];
  async function run(callback) { return db.runTransaction(async tx=>{
    let wrote=false;
    const write=method=>(r,d)=>{wrote=true;events.push([method,r.path]);if(options.failPath&&r.path.startsWith(options.failPath))throw Error('late failure');return tx[method](r,d);};
    const context=Object.freeze({db,transaction:{get:r=>{assert.equal(wrote,false,'all native reads before any write');events.push(['get',r.path]);return tx.get(r);},create:write('create'),update:write('update'),set:write('set')}});
    return callback(context);
  }); }
  const accept=()=>run(async c=>{const plan=await acceptance.preparePickupCheckoutAcceptance(c,input);const print=await adapter.prepareUnpaidAcceptanceOriginals(c,plan.capability);plan.apply();print?.apply();return print;});
  return {records,db,load,acceptance,adapter,outbox,events,run,accept};
}
const enabled = async fn => {const old=process.env.ORDERFLY_PRINT_INTENTS_ENABLED;process.env.ORDERFLY_PRINT_INTENTS_ENABLED='true';try{return await fn();}finally{if(old===undefined)delete process.env.ORDERFLY_PRINT_INTENTS_ENABLED;else process.env.ORDERFLY_PRINT_INTENTS_ENABLED=old;}};

test('#506 actual native acceptance commits Received, notification, canonical manifest, two jobs and one ledger atomically',()=>enabled(async()=>{
 const f=await fixture();const plan=await f.accept();
 assert.equal(f.records.get('orders/order').status,'Received');assert.equal(f.records.get('orders/order').paymentStatus,'Pending');
 const manifest=f.records.get('orders/order/printIntents/original');assert.equal(manifest.originalRevision,0);assert.equal(manifest.targets.length,1);assert.deepEqual(manifest.targets[0].kinds,['kitchen','packing']);
 assert.equal([...f.records.keys()].filter(k=>k.includes('/jobs/')).length,2);assert.equal([...f.records.keys()].filter(k=>k.startsWith('orderNotificationJobs/')).length,1);
 const ledger=f.records.get(printerPath+'/queue/state');assert.equal(ledger.pendingCount,2);assert.equal(ledger.revision,1);assert.equal(plan.writeCount,4);
 assert.doesNotMatch(JSON.stringify(manifest),/PRIVATE_CUSTOMER|secret|customer/);
 const before=structuredClone([...f.records]);await assert.rejects(f.accept());assert.deepEqual([...f.records],before);
}));
test('#506 process OFF and native policy OFF preserve acceptance without original writes',async()=>{
 const old=process.env.ORDERFLY_PRINT_INTENTS_ENABLED;
 try {for(const off of ['process','policy']) {const f=await fixture();process.env.ORDERFLY_PRINT_INTENTS_ENABLED=off==='process'?'false':'true';if(off==='policy')Object.assign(f.records.get(policyPath),{enabled:false,targets:[]});
 assert.equal(await f.accept(),null);assert.equal(f.records.get('orders/order').status,'Received');assert.equal(f.records.has('orders/order/printIntents/original'),false);assert.equal(f.events.some(([m,p])=>m!=='get'&&p.includes('/printers/')),false);}}
 finally{if(old===undefined)delete process.env.ORDERFLY_PRINT_INTENTS_ENABLED;else process.env.ORDERFLY_PRINT_INTENTS_ENABLED=old;}
});
test('#506 late job/ledger/notification failure rolls back acceptance, manifest and every queue mutation',()=>enabled(async()=>{
 for(const failPath of [printerPath+'/jobs/',printerPath+'/queue/', 'orderNotificationJobs/']) {const f=await fixture({failPath}),before=structuredClone([...f.records]);await assert.rejects(f.accept(),/late failure/);assert.deepEqual([...f.records],before);}
}));
test('#506 foreign policy, stale printer revision, absent routing and corrupt queue fail before writes',()=>enabled(async()=>{
 for(const mutate of [f=>f.records.get(policyPath).brandId='foreign',f=>f.records.get(printerPath).revision=2,f=>f.records.delete('locations/l/printerRouting/original'),f=>f.records.set(printerPath+'/queue/state',{})]) {
 const f=await fixture();mutate(f);const before=structuredClone([...f.records]);await assert.rejects(f.accept());assert.deepEqual([...f.records],before);assert.equal(f.events.some(([m])=>m!=='get'),false);}
}));
test('#506 forged/cross-attempt capability and outbox apply before actual acceptance reject',()=>enabled(async()=>{
 const f=await fixture();await f.run(async c=>{for(const fake of [{},null,{order:input}])await assert.rejects(f.adapter.prepareUnpaidAcceptanceOriginals(c,fake),/Unverified/);
 const plan=await f.acceptance.preparePickupCheckoutAcceptance(c,input);await assert.rejects(f.adapter.prepareUnpaidAcceptanceOriginals({...c},plan.capability),/Unverified/);
 const print=await f.adapter.prepareUnpaidAcceptanceOriginals(c,plan.capability);assert.throws(()=>print.apply(),/Unverified/);});assert.equal(f.records.get('orders/order').status,'Pending');
}));
test('#506 existing manifest or matching orphan selected job cannot be adopted as new acceptance history',()=>enabled(async()=>{
 for(const mode of ['manifest','job']) {const f=await fixture();if(mode==='manifest')f.records.set('orders/order/printIntents/original',{});else {
 const domain=f.load('src/lib/printing/domain.ts'),identity={orderId:'order',brandId:'b',locationId:'l',printerId:'pizza',kind:'kitchen',revision:0},id=domain.printJobId(identity),createdAt=Date.now()-1;
 f.records.set(printerPath+'/jobs/'+id,{schemaVersion:1,...identity,id,printerRevision:1,state:'queued',attempts:0,createdAt,updatedAt:'SERVER'});f.records.set(printerPath+'/queue/state',{schemaVersion:1,brandId:'b',locationId:'l',printerId:'pizza',revision:1,pendingCount:1,oldestPendingAt:createdAt,updatedAt:'SERVER'});}
 const before=structuredClone([...f.records]);await assert.rejects(f.accept(),/job_conflict/);assert.deepEqual([...f.records],before);}
}));
test('#506 discarded attempt rebuilds current native authority and cannot leak jobs into retry',()=>enabled(async()=>{
 const f=await fixture(),before=structuredClone([...f.records]);let oldCapability;
 await assert.rejects(f.run(async c=>{const plan=await f.acceptance.preparePickupCheckoutAcceptance(c,input);oldCapability=plan.capability;const print=await f.adapter.prepareUnpaidAcceptanceOriginals(c,plan.capability);plan.apply();print.apply();throw Error('SDK retry discard');}),/discard/);
 assert.deepEqual([...f.records],before);f.records.get(printerPath).revision=2;
 await assert.rejects(f.run(async c=>{await assert.rejects(f.adapter.prepareUnpaidAcceptanceOriginals(c,oldCapability),/Unverified/);const plan=await f.acceptance.preparePickupCheckoutAcceptance(c,input);return f.adapter.prepareUnpaidAcceptanceOriginals(c,plan.capability);}),/target_unverified/);
 assert.equal(f.records.get('orders/order').status,'Pending');assert.equal(f.records.has('orders/order/printIntents/original'),false);
 f.records.get(printerPath).revision=1;await f.accept();assert.equal(f.records.get(printerPath+'/queue/state').pendingCount,2);
}));
test('#506 lifetime expiration after acceptance writes rolls back the whole transaction',()=>enabled(async()=>{
 const f=await fixture(),before=structuredClone([...f.records]),actual=Date.now;let now=actual();Date.now=()=>now;
 try{await assert.rejects(f.run(async c=>{const plan=await f.acceptance.preparePickupCheckoutAcceptance(c,input);const print=await f.adapter.prepareUnpaidAcceptanceOriginals(c,plan.capability);plan.apply();now+=300000;print.apply();}),/expired/);assert.deepEqual([...f.records],before);}finally{Date.now=actual;}
}));
test('#506 full canonical queue rejects Received and notification rather than partially accepting',()=>enabled(async()=>{
 const f=await fixture(),domain=f.load('src/lib/printing/domain.ts'),limit=f.load('src/lib/printing/queue-storage.ts').PRINT_QUEUE_LIMIT,createdAt=Date.now()-1;
 for(let i=0;i<limit;i++){const identity={orderId:'prior'+i,brandId:'b',locationId:'l',printerId:'pizza',kind:'kitchen',revision:0},id=domain.printJobId(identity);f.records.set(printerPath+'/jobs/'+id,{schemaVersion:1,...identity,id,printerRevision:1,state:'queued',attempts:0,createdAt,updatedAt:'SERVER'});}
 f.records.set(printerPath+'/queue/state',{schemaVersion:1,brandId:'b',locationId:'l',printerId:'pizza',revision:1,pendingCount:limit,oldestPendingAt:createdAt,updatedAt:'SERVER'});
 const before=structuredClone([...f.records]);await assert.rejects(f.accept(),/queue_unverified/);assert.deepEqual([...f.records],before);assert.equal(f.events.some(([m])=>m!=='get'),false);
}));
test('#506 real checkout action wires the same native capability into enabled queue producer',()=>enabled(async()=>{
 const {checkout}=require('../helpers/checkout-fixture.cjs');const seedSource=await fixture();const seed=[...seedSource.records].filter(([p])=>!p.startsWith('orders/')&&!p.startsWith('products/')&&p!=='locations/l'&&p!=='brands/b');
 const f=await checkout({realReservations:true,kind:'code',seed,brandOverrides:{status:'active'},locationOverrides:{paymentMethods:{online:true,payAtPickup:true}},customerOverrides:{paymentMethod:'pay_at_pickup'}});
 assert.equal(f.result.success,true,f.result.error);assert.equal(f.records.get('orders/ORD-TEST').status,'Received');assert.equal(f.records.has('orders/ORD-TEST/printIntents/original'),true);assert.equal(f.records.get(printerPath+'/queue/state').pendingCount,2);assert.equal(f.events.includes('stripe'),false);
}));
test('#506 real checkout rejects print preparation before acceptance and releases limited discount capacity',()=>enabled(async()=>{
 const {checkout}=require('../helpers/checkout-fixture.cjs');
 for(const failure of ['routing','revision','queue']) {
  const source=await fixture();
  if(failure==='routing')source.records.delete('locations/l/printerRouting/original');
  if(failure==='revision')source.records.get(printerPath).revision=2;
  if(failure==='queue')source.records.set(printerPath+'/queue/state',{});
  const seed=[...source.records].filter(([p])=>!p.startsWith('orders/')&&!p.startsWith('products/')&&p!=='locations/l'&&p!=='brands/b');
  const f=await checkout({realReservations:true,kind:'code',seed,brandOverrides:{status:'active'},locationOverrides:{paymentMethods:{online:true,payAtPickup:true}},customerOverrides:{paymentMethod:'pay_at_pickup'}});
  assert.equal(f.result.success,false);assert.equal(f.result.retryable,true,failure);
  assert.equal(f.records.get('orders/ORD-TEST').discountReservation,'released',failure);
  assert.deepEqual([...f.records].filter(([p])=>p.startsWith('checkout_')).map(([,row])=>row.held),[0,0,0],failure);
  assert.equal(f.records.get('orders/ORD-TEST').status,'Canceled',failure);
  assert.equal(f.records.has('orders/ORD-TEST/printIntents/original'),false);
  assert.equal([...f.records.keys()].some(p=>p.startsWith('orderNotificationJobs/')),false);
  assert.equal(f.events.includes('stripe'),false);assert.equal(f.events.includes('release'),true);
 }
}));
test('#506 lost acceptance commit response keeps holds and disallows blind retry',()=>enabled(async()=>{
 const {checkout}=require('../helpers/checkout-fixture.cjs');const source=await fixture();
 const seed=[...source.records].filter(([p])=>!p.startsWith('orders/')&&!p.startsWith('products/')&&p!=='locations/l'&&p!=='brands/b');
 const f=await checkout({realReservations:true,kind:'code',fault:'pickup-response',seed,brandOverrides:{status:'active'},locationOverrides:{paymentMethods:{online:true,payAtPickup:true}},customerOverrides:{paymentMethod:'pay_at_pickup'}});
 assert.equal(f.result.success,false);assert.equal(f.result.retryable,false);
 assert.equal(f.records.get('orders/ORD-TEST').status,'Received');
 assert.equal(f.records.get('orders/ORD-TEST').discountReservation,'held');
 assert.deepEqual([...f.records].filter(([p])=>p.startsWith('checkout_')).map(([,row])=>row.held),[1,1,1]);
 assert.equal(f.records.has('orders/ORD-TEST/printIntents/original'),true);
 assert.equal(f.events.includes('release'),false);assert.equal(f.events.includes('stripe'),false);
}));
