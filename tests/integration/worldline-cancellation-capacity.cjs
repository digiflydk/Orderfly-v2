const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {moduleGraph}=require('../helpers/load-ts-graph.cjs');
const {memoryDb}=require('../helpers/marketing-db.cjs');

// Real cancellation, Firestore compatibility adapter, releaseDiscount and
// capacity writer; only cloud persistence, secret access and provider I/O are
// synthetic. In particular, releaseDiscount is not a stub.
const key=parts=>createHash('sha256').update(JSON.stringify(parts)).digest('hex');
const capacityPaths=(customer,discount)=>[
 'checkout_customer_capacity/'+key(['b',customer]),
 'checkout_discount_capacity/'+key(['b',discount]),
 'checkout_customer_discount_capacity/'+key(['b',customer,discount]),
];
const originalIdentity={customerDetails:{id:'original'},appliedDiscountId:'original-discount',firstTimeReservation:true};
function fixture(options={}){
 const binding={provider:'worldline',mode:'test',owner:{brandId:'b'},merchantNumber:'T123',reference:'synthetic-pinned-version'};
 const order={id:'ORD-CAPACITY',brandId:'b',locationId:'l',paymentMethod:'Worldline',paymentStatus:'Pending',status:'Pending',totalAmount:125,
  discountReservation:'held',...structuredClone(originalIdentity),psp:{provider:'worldline',checkoutSessionId:'synthetic-window'},paymentAgreement:binding,...options.order};
 const original=capacityPaths(order.customerDetails.id,order.appliedDiscountId||'original-discount'),other=capacityPaths('other','other-discount');
 const rows=new Map([['orders/ORD-CAPACITY',order],
  [original[0],{paid:0,held:1,firstTimeHeld:true}],[original[1],{paid:0,held:1}],[original[2],{paid:0,held:1}],
  [other[0],{paid:2,held:4,firstTimeHeld:true}],[other[1],{paid:2,held:4}],[other[2],{paid:2,held:4}],
 ]);
 const db=memoryDb(rows),collection=db.collection,transact=db.runTransaction;
 const reference=path=>{const parts=path.split('/'),id=parts.pop();return {...collection(parts.join('/')).doc(id),collection:child=>db.collection(path+'/'+child)};};
 db.doc=reference;
 db.collection=name=>({...collection(name),doc:id=>reference(name+'/'+id)});
 let afterCancelUsed=false,expiryCalls=0,catalogCalls=0;
 db.runTransaction=async run=>{
  const result=await transact(async tx=>{
   let writes=false;
   const update=(ref,data)=>{
    writes=true;const patch={...data};
    for(const field of Object.keys(data).filter(k=>k.includes('.'))){const [parent,child]=field.split('.');patch[parent]={...rows.get(ref.path)?.[parent],...patch[parent],[child]:data[field]};delete patch[field];}
    return tx.update(ref,patch);
   };
   return run({...tx,get:ref=>{assert.equal(writes,false,'capacity reads precede writes');return tx.get(ref);},
    set:(...args)=>{writes=true;return tx.set(...args);},create:(...args)=>{writes=true;return tx.create(...args);},update});
  });
  if(!afterCancelUsed&&rows.get('orders/ORD-CAPACITY').status==='Canceled'&&rows.get('orders/ORD-CAPACITY').discountReservation==='held'&&options.afterCancelCommit){
   afterCancelUsed=true;options.afterCancelCommit(rows.get('orders/ORD-CAPACITY'));
  }
  return result;
 };
 const load=moduleGraph({'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db},
  'firebase-admin/firestore':{FieldValue:{serverTimestamp:()=> 'synthetic-server-time'},Timestamp:class{}},
  './worldline-store':{readPinnedWorldlineAgreement:async pin=>{assert.deepEqual(pin,binding);return {binding,credentials:{merchantNumber:'T123',accessToken:'synthetic-access',secretToken:'synthetic-secret'}};}},
  './worldline-operations':{runWorldlineOperation:async()=>{throw Error('No money operation belongs to session expiry');}},
 });
 const transport=async(url,input)=>{
  if(url==='https://data-v1.api-eu.bambora.com/responsecodes/BEC/40200'){
   catalogCalls++;assert.equal(input.method,'GET');assert.equal(input.redirect,'error');
   assert.equal(input.headers.Authorization,'Basic '+Buffer.from('synthetic-access@T123:synthetic-secret').toString('base64'));
   assert.match(rows.get('orders/ORD-CAPACITY').paymentOperation,/^session-expiry:/);
   options.duringCatalog?.(rows.get('orders/ORD-CAPACITY'));
   return Response.json({meta:{result:true},responsecode:{source:'BEC',actioncode:'40200',merchantlabel:options.catalogLabel,enduserlabel:'Error'}});
  }
  assert.equal(url,'https://api.v1.checkout.bambora.com/sessions/synthetic-window');assert.equal(input.method,'DELETE');expiryCalls++;
  options.duringExpiry?.(rows.get('orders/ORD-CAPACITY'));
  if(options.catalogLabel)return Response.json({meta:{result:false,action:{source:'BEC',code:'40200',type:'generalerror'}}},{status:403});
  return Response.json({meta:{result:true}});
 };
 const cancel=async()=>{const previous=global.fetch;global.fetch=transport;try{return await load('src/lib/payments/worldline-expiry.ts').cancelWorldlineCheckout('ORD-CAPACITY');}finally{global.fetch=previous;}};
 const capacities=()=>[...rows].filter(([path])=>path.startsWith('checkout_'));
 return {rows,cancel,capacities,original,other,expiryCalls:()=>expiryCalls,catalogCalls:()=>catalogCalls,load};
}
async function unresolved(run){let result;try{result=await run();}catch{result='error';}assert.ok(result==='unknown'||result==='error','unproven cancellation stays unresolved');return result;}
test('real cancellation releases original customer/discount counters once after provider expiry',async()=>{
 const f=fixture();assert.equal(await f.cancel(),'canceled');
 assert.deepEqual(f.rows.get(f.original[0]),{paid:0,held:0,firstTimeHeld:false});assert.deepEqual(f.rows.get(f.original[1]),{paid:0,held:0});assert.deepEqual(f.rows.get(f.original[2]),{paid:0,held:0});
 assert.deepEqual(f.rows.get(f.other[0]),{paid:2,held:4,firstTimeHeld:true});
 const saved=structuredClone(f.capacities());assert.equal(await f.cancel(),'canceled');assert.deepEqual(f.capacities(),saved);assert.equal(f.expiryCalls(),1);
});
test('an ordinary checkout without a coupon releases only its customer hold and preserves another first-order hold',async()=>{
 const f=fixture({order:{appliedDiscountId:null,firstTimeReservation:false}});
 f.rows.set(f.original[0],{paid:0,held:2,firstTimeHeld:true});
 assert.equal(await f.cancel(),'canceled');assert.deepEqual(f.rows.get(f.original[0]),{paid:0,held:1,firstTimeHeld:true});
 assert.deepEqual(f.rows.get(f.original[1]),{paid:0,held:1});assert.deepEqual(f.rows.get(f.original[2]),{paid:0,held:1});assert.equal(f.expiryCalls(),1);
});
test('existing valid customer and discount document IDs are preserved without introducing a narrower checkout schema',async()=>{
 const f=fixture({order:{customerDetails:{id:'cust:user@example.test'},appliedDiscountId:'summer.discount'}});
 assert.equal(await f.cancel(),'canceled');assert.equal(f.rows.get(f.original[0]).held,0);assert.equal(f.rows.get(f.original[1]).held,0);assert.equal(f.rows.get(f.original[2]).held,0);
});
test('capacity identity changed during provider expiry cannot release another reservation',async()=>{
 for(const change of [o=>o.customerDetails={id:'other'},o=>o.appliedDiscountId='other-discount',o=>o.firstTimeReservation=false]){
  const f=fixture({duringExpiry:change}),before=structuredClone(f.capacities());await unresolved(f.cancel);assert.deepEqual(f.capacities(),before);assert.equal(f.rows.get('orders/ORD-CAPACITY').discountReservation,'held');
 }
});
test('identity changed after native cancellation commit is guarded inside the real capacity transaction',async()=>{
 const f=fixture({afterCancelCommit:o=>Object.assign(o,{customerDetails:{id:'other'},appliedDiscountId:'other-discount',firstTimeReservation:false})}),before=structuredClone(f.capacities());
 await unresolved(f.cancel);assert.deepEqual(f.capacities(),before);assert.equal(f.rows.get('orders/ORD-CAPACITY').discountReservation,'held');
 await unresolved(f.cancel);assert.deepEqual(f.capacities(),before);assert.equal(f.expiryCalls(),1,'verified expiry is reused without another checkout or financial operation');
 Object.assign(f.rows.get('orders/ORD-CAPACITY'),structuredClone(originalIdentity));assert.equal(await f.cancel(),'canceled');
 assert.equal(f.rows.get(f.original[0]).held,0);assert.equal(f.rows.get(f.original[0]).firstTimeHeld,false);assert.equal(f.rows.get(f.other[0]).held,4);
 const saved=structuredClone(f.capacities());assert.equal(await f.cancel(),'canceled');assert.deepEqual(f.capacities(),saved);assert.equal(f.expiryCalls(),1);
});
test('a new cancellation request cannot rebaseline capacity identity after an earlier expiry attempt',async()=>{
 const f=fixture({duringExpiry:o=>{o.customerDetails={id:'other'};}}),before=structuredClone(f.capacities());
 await unresolved(f.cancel);assert.deepEqual(f.capacities(),before);
 await unresolved(f.cancel);assert.deepEqual(f.capacities(),before);assert.equal(f.rows.get('orders/ORD-CAPACITY').discountReservation,'held');assert.equal(f.expiryCalls(),1);
});
test('historical verified cancellation without original reservation identity does not guess a held counter owner',async()=>{
 const f=fixture({order:{status:'Canceled',psp:{provider:'worldline',checkoutSessionId:'synthetic-window',sessionExpired:true}}}),before=structuredClone(f.capacities());
 await unresolved(f.cancel);assert.deepEqual(f.capacities(),before);assert.equal(f.rows.get('orders/ORD-CAPACITY').discountReservation,'held');assert.equal(f.expiryCalls(),0);
});
test('historical cancellation whose hold is already released stays idempotently canceled',async()=>{
 const f=fixture({order:{status:'Canceled',paymentStatus:'Failed',discountReservation:'released',psp:{provider:'worldline',checkoutSessionId:'synthetic-window',sessionExpired:true}}});
 f.rows.set(f.original[0],{paid:0,held:0,firstTimeHeld:false});f.rows.set(f.original[1],{paid:0,held:0});f.rows.set(f.original[2],{paid:0,held:0});
 const before=structuredClone(f.capacities());assert.equal(await f.cancel(),'canceled');assert.deepEqual(f.capacities(),before);assert.equal(f.expiryCalls(),0);
});
test('generic Stripe capacity release keeps its existing default calling contract',async()=>{
 const f=fixture({order:{paymentMethod:'Stripe',psp:{provider:'stripe',checkoutSessionId:'synthetic-window'}}});
 await f.load('src/lib/discount-reservations.ts').releaseDiscount('ORD-CAPACITY','b','synthetic-window','l');
 assert.equal(f.rows.get(f.original[0]).held,0);assert.equal(f.rows.get(f.original[0]).firstTimeHeld,false);assert.equal(f.rows.get('orders/ORD-CAPACITY').discountReservation,'released');assert.equal(f.expiryCalls(),0);
});

test('real diagnostic catalog cannot release held capacity or prove unpaid cancellation after a 403',async()=>{
 for(const [label,category] of [['Session has expired','SESSION_EXPIRED'],['Invalid session status','SESSION_STATE'],['Access denied','ACCESS_DENIED']]){
  const f=fixture({catalogLabel:label}),before=structuredClone(f.capacities());assert.equal(await f.cancel(),'unknown');
  assert.equal(f.expiryCalls(),1);assert.equal(f.catalogCalls(),1);assert.deepEqual(f.capacities(),before);
  const order=f.rows.get('orders/ORD-CAPACITY');assert.equal(order.paymentStatus,'Pending');assert.equal(order.status,'Pending');assert.equal(order.discountReservation,'held');
  assert.equal(order.psp.sessionExpired,undefined);assert.match(order.paymentOperation,/^session-expiry:/);
  assert.equal(order.psp.cancellationErrorCode,'WORLDLINE_CANCEL_EXPIRY_HTTP_403_PROVIDER_40200_SRC_BEC_REASON_'+category);
  assert.doesNotMatch(JSON.stringify([...f.rows]),/synthetic-secret|synthetic-access|merchantlabel|enduserlabel/);
 }
});

test('payment that completes during the diagnostic read remains paid and is not reclassified pending',async()=>{
 const f=fixture({catalogLabel:'Session has expired',duringCatalog:order=>{order.paymentStatus='Paid';}}),before=structuredClone(f.capacities());
 assert.equal(await f.cancel(),'paid');assert.deepEqual(f.capacities(),before);assert.equal(f.expiryCalls(),1);assert.equal(f.catalogCalls(),1);
 assert.equal(f.rows.get('orders/ORD-CAPACITY').psp.cancellationErrorCode,undefined);
 assert.equal(f.rows.get('orders/ORD-CAPACITY').paymentStatus,'Paid');
});
