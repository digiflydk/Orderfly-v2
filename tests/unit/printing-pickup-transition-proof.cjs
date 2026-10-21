const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {principalKey}=loadTs('src/lib/access/authority.ts',{'server-only':{}});
const identity={provider:'firebase',subject:'pickup-staff'},actorId=principalKey(identity);
const goodOrder=()=>({brandId:'brand',locationId:'location',status:'Received',paymentStatus:'Pending',paymentMethod:'PayAtPickup',deliveryType:'Pickup',discountReservation:'held',customerContact:'PRIVATE_EMAIL'});
const collected=(method='cash')=>({method,receivedAt:'2026-10-21T12:00:00.000Z',employeeId:actorId,employeeName:'PRIVATE_STAFF'});
const policy=()=>({principals:[{id:actorId,active:true}],companies:[{id:'company',active:true,orderflyBrandIds:['brand'],locationIds:['location','other']}],roles:[{id:'staff',name:'Staff',companyId:'company',kind:'company_user',active:true,permissions:['orderfly.orders:edit']}],memberships:[{id:'member',principalId:actorId,companyId:'company',active:true,locationIds:['location'],roleIds:['staff']}]});
function fixture({order=goodOrder()}={}){
 const calls=[],writes=[],rows=new Map([['orders/order',order],['brands/brand',{}],['locations/location',{brandId:'brand'}],['platformAdminControl/access-v1',policy()]]);
 let current={identity,actorId,superuser:false,name:'PRIVATE_STAFF',permissions:[]},sessionError=false;
 const db={collection:name=>({doc:id=>({path:name+'/'+id,id})})};
 const tx={get:async ref=>{calls.push(['read',ref.path]);const row=rows.get(ref.path);return {id:ref.id,exists:rows.has(ref.path),data:()=>row};},set:()=>writes.push('set'),update:()=>writes.push('update'),create:()=>writes.push('create'),delete:()=>writes.push('delete')};
 const api=loadTs('src/lib/printing/pickup-transition-proof.ts',{'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db},'@/lib/access/orderfly-session':{orderflySession:async()=>{calls.push(['session']);if(sessionError)throw Error('SECRET_SESSION');return current;}}});
 return {...api,rows,calls,writes,context:{db,transaction:tx},setActor:value=>current=value,failSession:()=>sessionError=true,
  prove:method=>api.verifyPickupPrintPayment({orderId:'order',method:method||'cash'})};
}
const rejects=(promise,code)=>assert.rejects(promise,e=>e.code===code&&!/PRIVATE|SECRET/.test(e.message));
async function projected(f,method){const proof=await f.prove(method),handle=await f.preparePickupPrintTransition(f.context,proof);return f.pickupPrintTransitionProjection(f.context,handle);}

test('trusted server session and actual transaction authorization prepare immutable private-free pickup projection',async()=>{
 const f=fixture(),proof=await f.prove();assert.equal(JSON.stringify(proof),'{}');assert.ok(Object.isFrozen(proof));
 const handle=await f.preparePickupPrintTransition(f.context,proof);assert.equal(JSON.stringify(handle),'{}');
 const p=f.pickupPrintTransitionProjection(f.context,handle);
 assert.deepEqual(p,{order:{id:'order',brandId:'brand',locationId:'location',status:'Received',paymentStatus:'Paid',paymentMethod:'PayAtPickup',deliveryType:'Pickup'},previousPaymentStatus:'Pending',replay:false,collectionMethod:'cash'});
 assert.ok(Object.isFrozen(p)&&Object.isFrozen(p.order));assert.deepEqual(f.writes,[]);
 assert.equal(f.calls.filter(x=>x[0]==='session').length,2);
 assert.deepEqual(new Set(f.calls.filter(x=>x[0]==='read').map(x=>x[1])),new Set(['orders/order','brands/brand','locations/location','platformAdminControl/access-v1']));
 assert.doesNotMatch(JSON.stringify(p),/PRIVATE|SECRET|actor|employee|customer|permissions|psp/);
 assert.equal(f.rows.get('orders/order').paymentStatus,'Pending');
});
test('strict request rejects client identities, payment claims, invalid methods and unsafe order IDs before session I/O',async()=>{
 for(const input of [null,{},[],{orderId:'../order',method:'cash'},{orderId:'order',method:'Stripe'},{orderId:'order',method:'card',identity},{orderId:'order',method:'cash',paid:true},{orderId:'x'.repeat(129),method:'cash'},{orderId:42,method:'cash'}]){
  const f=fixture();await rejects(f.verifyPickupPrintPayment(input),'invalid_pickup_reference');assert.deepEqual(f.calls,[]);
 }
 for(const method of ['cash','card'])assert.equal((await projected(fixture(),method)).collectionMethod,method);
});
test('missing server session or malformed native actor cannot mint proof or read an order',async()=>{
 for(const mutate of [f=>f.failSession(),f=>f.setActor({identity,actorId:'forged'}),f=>f.setActor({identity:{provider:'client',subject:'staff'},actorId})]){
  const f=fixture();mutate(f);await rejects(f.prove(),'pickup_unverified');assert.equal(f.calls.filter(x=>x[0]==='read').length,0);
 }
});
test('fake, serialized, cross-module and raw staff proof objects cannot authorize reads',async()=>{
 const f=fixture(),other=fixture(),otherProof=await other.prove();
 for(const proof of [{},{orderId:'order',method:'cash',identity,actorId},null,otherProof,JSON.parse(JSON.stringify(await f.prove()))])await rejects(f.preparePickupPrintTransition(f.context,proof),'pickup_unverified');
 assert.equal(f.calls.filter(x=>x[0]==='read').length,0);assert.deepEqual(f.writes,[]);
});
test('current actor/session is read again before every preparation and cannot switch identities',async()=>{
 for(const mutate of [f=>f.failSession(),f=>{const i={provider:'firebase',subject:'other'};f.setActor({identity:i,actorId:principalKey(i)});}]){
  const f=fixture(),proof=await f.prove();mutate(f);await rejects(f.preparePickupPrintTransition(f.context,proof),'pickup_unverified');assert.equal(f.calls.filter(x=>x[0]==='read').length,0);
 }
});
test('current native grants reject revocation and do not trust captured session permission arrays',async()=>{
 const changes=[p=>p.principals[0].active=false,p=>p.memberships[0].active=false,p=>p.roles[0].active=false,p=>p.roles[0].permissions=['orderfly.orders:view'],p=>p.companies[0].active=false,p=>p.companies[0].orderflyBrandIds=['other-brand'],p=>p.memberships[0].locationIds=['other']];
 for(const mutate of changes){const f=fixture(),proof=await f.prove();mutate(f.rows.get('platformAdminControl/access-v1'));await rejects(f.preparePickupPrintTransition(f.context,proof),'pickup_unverified');assert.deepEqual(f.writes,[]);}
 const f=fixture(),proof=await f.prove();f.rows.delete('platformAdminControl/access-v1');await rejects(f.preparePickupPrintTransition(f.context,proof),'pickup_unverified');
});
test('native order identity, scope, nonterminal accepted pickup and held reservation are mandatory',async()=>{
 for(const patch of [{id:'other'},{brandId:'foreign'},{locationId:'other'},{brandId:''},{locationId:null},{status:'Pending'},{status:'Completed'},{status:'Canceled'},{status:'Delivered'},{status:'Error'},{paymentStatus:'Failed'},{paymentMethod:'Stripe'},{paymentMethod:'Cash'},{deliveryType:'Delivery'},{psp:{}},{psp:false},{discountReservation:'none'},{discountReservation:'consumed'},{discountReservation:undefined},{paymentCollection:collected()}]){
  const f=fixture({order:{...goodOrder(),...patch}});await assert.rejects(projected(f),e=>['transition_unverified','pickup_unverified'].includes(e.code));assert.deepEqual(f.writes,[]);
 }
 const f=fixture(),proof=await f.prove();f.rows.delete('orders/order');await rejects(f.preparePickupPrintTransition(f.context,proof),'transition_unverified');
});
test('native seller existence/ownership/identity and deleted markers fail closed',async()=>{
 for(const mutate of [f=>f.rows.delete('brands/brand'),f=>f.rows.delete('locations/location'),f=>f.rows.set('locations/location',{brandId:'foreign'}),f=>f.rows.set('brands/brand',{id:'other'}),f=>f.rows.set('locations/location',{id:'other',brandId:'brand'}),...['orders/order','brands/brand','locations/location'].flatMap(path=>[{deletedAt:'2026-10-21'},{deleted:true},{isDeleted:true},{deletedAt:false},{deleted:'false'}].map(patch=>f=>f.rows.set(path,{...f.rows.get(path),...patch})))]){
  const f=fixture();mutate(f);await assert.rejects(projected(f));assert.deepEqual(f.writes,[]);
 }
});
test('all recognized legacy/current refunds and malformed markers reject pending and paid preparations',async()=>{
 const markers=[{refundedAmountOre:1},{refundedAmountOre:15900},{refundedAmountOre:'0'},{refundedAmountOre:-1},{refundedAmountOre:NaN},{refundedAmount:0.01},{refundedAmount:'0'},{refundedAmount:null},{refundedAt:'2026-10-21T12:00:00Z'},{refundedAt:new Date()},{refundedAt:0},{refundedAt:{seconds:123}}];
 for(const paid of [false,true])for(const patch of markers){const f=fixture({order:{...goodOrder(),...(paid?{paymentStatus:'Paid',discountReservation:'consumed',paymentCollection:collected()}:{}),...patch}});await rejects(projected(f),'transition_unverified');assert.deepEqual(f.writes,[]);}
 assert.ok(await projected(fixture({order:{...goodOrder(),refundedAmountOre:0,refundedAmount:0,refundedAt:null}})));
});
test('paid replay preserves original order/status and requires matching recorded collection method',async()=>{
 for(const status of ['Received','In Progress','Ready'])for(const method of ['cash','card']){
  const f=fixture({order:{...goodOrder(),status,paymentStatus:'Paid',discountReservation:'consumed',paymentCollection:collected(method)}}),p=await projected(f,method);
  assert.equal(p.replay,true);assert.equal(p.order.status,status);assert.equal(p.order.id,'order');assert.deepEqual(f.writes,[]);
 }
 for(const paymentCollection of [undefined,null,{},collected('card'),{...collected(),receivedAt:'yesterday'},{...collected(),employeeId:'forged'},{...collected(),method:'Stripe'}]){
  const f=fixture({order:{...goodOrder(),paymentStatus:'Paid',discountReservation:'consumed',paymentCollection}});await rejects(projected(f),'transition_unverified');
 }
});
test('Paid replay rejects held or missing reservation and accepts only settled consumed/none lifecycle',async()=>{
 for(const discountReservation of ['held',undefined,null,'invalid']){
  const f=fixture({order:{...goodOrder(),paymentStatus:'Paid',paymentCollection:collected(),discountReservation}});
  await rejects(projected(f),'transition_unverified');assert.deepEqual(f.writes,[]);
 }
 for(const discountReservation of ['consumed','none']){
  const f=fixture({order:{...goodOrder(),paymentStatus:'Paid',paymentCollection:collected(),discountReservation}});
  assert.equal((await projected(f)).replay,true);assert.deepEqual(f.writes,[]);
 }
});
test('context identity alone is not proof; foreign database, missing context and fabricated projection handles reject',async()=>{
 const f=fixture(),proof=await f.prove();for(const context of [null,{}, {...f.context,db:{}}])await rejects(f.preparePickupPrintTransition(context,proof),'transition_unverified');
 assert.equal(f.calls.filter(x=>x[0]==='read').length,0);
 const handle=await f.preparePickupPrintTransition(f.context,proof);
 assert.throws(()=>f.pickupPrintTransitionProjection({...f.context},handle),e=>e.code==='transition_unverified');
 assert.throws(()=>f.pickupPrintTransitionProjection(f.context,{}),e=>e.code==='transition_unverified');
});
test('a retried attempt rereads current order, native seller and grants even with the same SDK transaction object',async()=>{
 for(const mutate of [f=>f.rows.get('orders/order').status='Canceled',f=>f.rows.get('locations/location').brandId='foreign',f=>f.rows.get('platformAdminControl/access-v1').memberships[0].active=false]){
  const f=fixture(),proof=await f.prove(),first=await f.preparePickupPrintTransition(f.context,proof);mutate(f);await assert.rejects(f.preparePickupPrintTransition({...f.context},proof));
  assert.throws(()=>f.pickupPrintTransitionProjection({...f.context},first),e=>e.code==='transition_unverified');assert.deepEqual(f.writes,[]);
 }
});
test('expiry/backwards clock permanently invalidates origin and all sibling handles, including after recovery',async()=>{
 const original=Date.now;let time;Date.now=()=>time;
 try{for(const observed of [1300000,1000050]){
  time=1000000;const f=fixture(),proof=await f.prove(),ctx={...f.context},first=await f.preparePickupPrintTransition(f.context,proof),second=await f.preparePickupPrintTransition(ctx,proof);
  time=1000100;f.pickupPrintTransitionProjection(f.context,first);time=observed;
  assert.throws(()=>f.pickupPrintTransitionProjection(ctx,second),e=>e.code==='proof_expired');time=1000200;
  for(const [c,h]of [[f.context,first],[ctx,second]])assert.throws(()=>f.pickupPrintTransitionProjection(c,h),e=>e.code==='proof_expired');
  await rejects(f.preparePickupPrintTransition({...f.context},proof),'proof_expired');assert.ok(await projected(f));assert.deepEqual(f.writes,[]);
 }}finally{Date.now=original;}
});
test('invalid clocks fail safely, and expiration/backwards movement during reads cannot mint a transition',async()=>{
 const original=Date.now;let time;Date.now=()=>time;
 try{
  for(const invalid of [NaN,Infinity,0,-1,1000000.5]){
   time=1000000;const f=fixture(),proof=await f.prove(),handle=await f.preparePickupPrintTransition(f.context,proof);time=invalid;
   assert.throws(()=>f.pickupPrintTransitionProjection(f.context,handle),e=>e.code==='proof_unavailable');time=1000001;
   await rejects(f.preparePickupPrintTransition(f.context,proof),'proof_expired');
  }
  for(const moved of [1300000,999999]){
   time=1000000;const f=fixture(),proof=await f.prove(),get=f.context.transaction.get;
   f.context.transaction.get=async ref=>{const result=await get(ref);time=moved;return result;};await rejects(f.preparePickupPrintTransition(f.context,proof),'proof_expired');assert.deepEqual(f.writes,[]);
  }
 }finally{Date.now=original;}
});
test('oversized raw identifiers reject before regex refinements and sparse array values are not traversed',async()=>{
 const original=RegExp.prototype.test;
 try{
  const f=fixture();RegExp.prototype.test=function(value){if(typeof value==='string'&&value.length>128)throw Error('unbounded-regex');return original.call(this,value);};
  await rejects(f.verifyPickupPrintPayment({orderId:'a'.repeat(1000000),method:'cash'}),'invalid_pickup_reference');
  for(const patch of [{brandId:'b'.repeat(1000000)},{locationId:'l'.repeat(1000000)},{paymentCollection:{method:'cash',employeeId:'e'.repeat(1000000),receivedAt:'2026-10-21T12:00:00Z'}}])await rejects(projected(fixture({order:{...goodOrder(),...patch}})),'transition_unverified');
 }finally{RegExp.prototype.test=original;}
 const sparse=new Array(1000000);Object.defineProperty(sparse,0,{get(){throw Error('must-not-traverse');}});
 for(const patch of [{brandId:sparse},{psp:sparse},{paymentCollection:sparse}])await rejects(projected(fixture({order:{...goodOrder(),...patch}})),'transition_unverified');
});
