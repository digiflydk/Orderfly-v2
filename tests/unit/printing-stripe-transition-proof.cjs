const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const reference='cs_test_abcdefgh12345678';
const goodSession=()=>({id:reference,mode:'payment',status:'complete',payment_status:'paid',currency:'dkk',amount_total:15900,metadata:{orderId:'o1',brandId:'b1',locationId:'l1',customerEmail:'must-not-escape'}});
const goodOrder=()=>({brandId:'b1',locationId:'l1',status:'Pending',paymentStatus:'Pending',paymentMethod:'Stripe',deliveryType:'Pickup',totalAmount:159,psp:{checkoutSessionId:reference},customerContact:'private'});
function fixture({session=goodSession(),order=goodOrder(),key='test-only',retrieveFailure=false,brand={},location={brandId:'b1'}}={}){
 const calls=[],writes=[];
 const rows=new Map([['orders/o1',order],['brands/b1',brand],['locations/l1',location]]);
 const db={collection:name=>({doc:id=>({path:name+'/'+id,id})})};
 const tx={get:async ref=>{calls.push(['read',ref.path]);const value=rows.get(ref.path);return {id:ref.id,exists:value!==undefined,data:()=>value};},set:()=>writes.push('set'),update:()=>writes.push('update')};
 class FakeStripe {constructor(secret,options){calls.push(['stripe',secret,options]);} checkout={sessions:{retrieve:async id=>{calls.push(['retrieve',id]);if(retrieveFailure)throw Error('SECRET_DETAIL');return session;}}};}
 const api=loadTs('src/lib/printing/stripe-transition-proof.ts',{'server-only':{},stripe:{default:FakeStripe},'@/lib/firebase-admin':{getAdminDb:()=>db},'@/lib/server/payment-settings':{getActiveStripeSecretKey:async()=>key}});
 return {...api,calls,writes,rows,context:{db,transaction:tx}};
}
test('server retrieval produces opaque proof, transaction projection reads native ownership and never writes',async()=>{
 const f=fixture();const proof=await f.verifyStripePrintPayment(reference);
 assert.equal(JSON.stringify(proof),'{}');assert.ok(Object.isFrozen(proof));
 const handle=await f.prepareStripePrintTransition(f.context,proof);assert.equal(JSON.stringify(handle),'{}');
 const value=f.stripePrintTransitionProjection(f.context,handle);
 assert.deepEqual(value,{order:{id:'o1',brandId:'b1',locationId:'l1',status:'Received',paymentStatus:'Paid',paymentMethod:'Stripe',deliveryType:'Pickup'},previousPaymentStatus:'Pending',replay:false});
 assert.ok(Object.isFrozen(value)&&Object.isFrozen(value.order));assert.deepEqual(f.writes,[]);
 assert.deepEqual(f.calls.filter(x=>x[0]==='read').map(x=>x[1]).sort(),['brands/b1','locations/l1','orders/o1']);
 assert.doesNotMatch(JSON.stringify(value),/customer|private|session|amount|SECRET/);
});
test('caller session objects and fake/cross-instance proof handles cannot authorize reads',async()=>{
 const f=fixture();await assert.rejects(f.verifyStripePrintPayment(goodSession()),e=>e.code==='invalid_payment_reference');
 for(const fake of [{},goodSession(),null])await assert.rejects(f.prepareStripePrintTransition(f.context,fake),e=>e.code==='payment_unverified');
 const other=fixture();const proof=await other.verifyStripePrintPayment(reference);
 await assert.rejects(f.prepareStripePrintTransition(f.context,proof),e=>e.code==='payment_unverified');
 assert.equal(f.calls.filter(x=>x[0]==='read').length,0);
});
test('unpaid/incomplete/foreign/currency/amount/malformed Stripe retrievals fail closed',async()=>{
 const patches=[{id:'cs_test_foreign000'},{mode:'subscription'},{status:'open'},{payment_status:'unpaid'},{currency:'eur'},{amount_total:0},{amount_total:1.5},{amount_total:Number.MAX_SAFE_INTEGER+1},{metadata:{orderId:'../o1',brandId:'b1',locationId:'l1'}},{metadata:null}];
 for(const patch of patches){const f=fixture({session:{...goodSession(),...patch}});await assert.rejects(f.verifyStripePrintPayment(reference),e=>e.code==='payment_unverified');assert.deepEqual(f.writes,[]);}
});
test('missing server key and provider errors return generic safe unavailable proof failure',async()=>{
 for(const options of [{key:''},{retrieveFailure:true}]){const f=fixture(options);await assert.rejects(f.verifyStripePrintPayment(reference),e=>e.code==='proof_unavailable'&&!e.message.includes('SECRET'));assert.equal(f.calls.filter(x=>x[0]==='read').length,0);}
});
test('persisted scope/session/amount/payment/lifecycle and native seller ownership must all match',async()=>{
 const patches=[{brandId:'other'},{locationId:'other'},{psp:{checkoutSessionId:'cs_test_other00000'}},{totalAmount:158},{totalAmount:'159'},{paymentMethod:'PayAtPickup'},{deliveryType:'Dining'},{status:'Canceled'},{status:'Delivered'},{paymentStatus:'Refunded'},{paymentStatus:'Paid',status:'Pending'}];
 for(const patch of patches){const f=fixture({order:{...goodOrder(),...patch}});const proof=await f.verifyStripePrintPayment(reference);await assert.rejects(f.prepareStripePrintTransition(f.context,proof),e=>e.code==='transition_unverified');assert.deepEqual(f.writes,[]);}
 for(const options of [{brand:undefined},{location:undefined},{location:{brandId:'other'}}]){const f=fixture();if('brand'in options)f.rows.delete('brands/b1');else if(options.location===undefined)f.rows.delete('locations/l1');else f.rows.set('locations/l1',options.location);const proof=await f.verifyStripePrintPayment(reference);await assert.rejects(f.prepareStripePrintTransition(f.context,proof),e=>e.code==='transition_unverified');}
});
test('already-paid replay preserves production state and original identity',async()=>{
 for(const status of ['Received','In Progress','Ready']){const f=fixture({order:{...goodOrder(),status,paymentStatus:'Paid'}});const proof=await f.verifyStripePrintPayment(reference);const handle=await f.prepareStripePrintTransition(f.context,proof);const p=f.stripePrintTransitionProjection(f.context,handle);assert.equal(p.replay,true);assert.equal(p.order.status,status);assert.equal(p.order.id,'o1');assert.deepEqual(f.writes,[]);}
});
test('recorded partial and full refunds reject every otherwise eligible paid replay',async()=>{
 for(const status of ['Received','In Progress','Ready'])for(const refundedAmountOre of [1,15900]){
  const f=fixture({order:{...goodOrder(),status,paymentStatus:'Paid',refundedAmountOre}});
  const proof=await f.verifyStripePrintPayment(reference);
  await assert.rejects(f.prepareStripePrintTransition(f.context,proof),e=>e.code==='transition_unverified');
  assert.deepEqual(f.writes,[]);
 }
});
test('refund state accepts legacy absence or explicit zero and rejects malformed values',async()=>{
 for(const payment of [{status:'Pending',paymentStatus:'Pending'},{status:'Received',paymentStatus:'Paid'}]){
  for(const refundedAmountOre of [undefined,0]){
   const f=fixture({order:{...goodOrder(),...payment,...(refundedAmountOre===undefined?{}:{refundedAmountOre})}});
   const proof=await f.verifyStripePrintPayment(reference);
   const handle=await f.prepareStripePrintTransition(f.context,proof);
   assert.equal(f.stripePrintTransitionProjection(f.context,handle).replay,payment.paymentStatus==='Paid');
   assert.deepEqual(f.writes,[]);
  }
  for(const refundedAmountOre of [-1,0.5,'0',null,NaN,Infinity,{},Number.MAX_SAFE_INTEGER+1]){
   const f=fixture({order:{...goodOrder(),...payment,refundedAmountOre}});
   const proof=await f.verifyStripePrintPayment(reference);
   await assert.rejects(f.prepareStripePrintTransition(f.context,proof),e=>e.code==='transition_unverified');
   assert.deepEqual(f.writes,[]);
  }
 }
});
test('legacy refund amount and timestamp markers reject before preparing any paid replay',async()=>{
 const markers=[{refundedAmount:0.01},{refundedAmount:159},{refundedAt:'2026-10-21T11:00:00Z'},
  {refundedAt:new Date('2026-10-21T11:00:00Z')},{refundedAt:{seconds:1792580400,nanoseconds:0}}];
 for(const status of ['Received','In Progress','Ready'])for(const marker of markers){
  const f=fixture({order:{...goodOrder(),status,paymentStatus:'Paid',...marker}});
  const proof=await f.verifyStripePrintPayment(reference);
  await assert.rejects(f.prepareStripePrintTransition(f.context,proof),e=>e.code==='transition_unverified');
  assert.deepEqual(f.writes,[]);
 }
 for(const marker of [{refundedAmount:0},{refundedAt:null},{refundedAmountOre:0,refundedAmount:0,refundedAt:null}]){
  const f=fixture({order:{...goodOrder(),...marker}}),proof=await f.verifyStripePrintPayment(reference);
  assert.ok(await f.prepareStripePrintTransition(f.context,proof));
 }
 for(const marker of [{refundedAmount:-1},{refundedAmount:'0'},{refundedAmount:null},{refundedAmount:NaN},
  {refundedAmount:Infinity},{refundedAt:false},{refundedAt:0},{refundedAt:''}]){
  const f=fixture({order:{...goodOrder(),...marker}}),proof=await f.verifyStripePrintPayment(reference);
  await assert.rejects(f.prepareStripePrintTransition(f.context,proof),e=>e.code==='transition_unverified');
 }
});
test('expired or future-dated proofs fail before native reads and stay invalid after clock recovery',async()=>{
 const original=Date.now;let time;Date.now=()=>time;
 try {for(const observation of [1300000,999999]){
  time=1000000;const f=fixture(),proof=await f.verifyStripePrintPayment(reference);
  time=observation;await assert.rejects(f.prepareStripePrintTransition(f.context,proof),e=>e.code==='proof_expired');
  time=1000001;await assert.rejects(f.prepareStripePrintTransition(f.context,proof),e=>e.code==='proof_expired');
  assert.equal(f.calls.filter(x=>x[0]==='read').length,0);
 }}finally{Date.now=original;}
});
test('context identity prevents cross-attempt projection reuse and retry rereads changed lifecycle',async()=>{
 const f=fixture(),proof=await f.verifyStripePrintPayment(reference);
 const handle=await f.prepareStripePrintTransition(f.context,proof);
 assert.throws(()=>f.stripePrintTransitionProjection({...f.context},handle),e=>e.code==='transition_unverified');
 assert.throws(()=>f.stripePrintTransitionProjection(f.context,{}),e=>e.code==='transition_unverified');
 f.rows.set('orders/o1',{...goodOrder(),status:'Canceled'});
 await assert.rejects(f.prepareStripePrintTransition({...f.context},proof),e=>e.code==='transition_unverified');
});
test('expiry observed through any handle permanently invalidates its origin and every sibling handle',async()=>{
 const original=Date.now;let time;Date.now=()=>time;
 try {for(const observation of ['prepare','projection']){
  time=1000000;const f=fixture(),proof=await f.verifyStripePrintPayment(reference),otherContext={...f.context};
  const first=await f.prepareStripePrintTransition(f.context,proof),second=await f.prepareStripePrintTransition(otherContext,proof);
  time=1300000;
  if(observation==='prepare')await assert.rejects(f.prepareStripePrintTransition(f.context,proof),e=>e.code==='proof_expired');
  else assert.throws(()=>f.stripePrintTransitionProjection(f.context,first),e=>e.code==='proof_expired');
  time=1000001;
  for(const [context,handle]of [[f.context,first],[otherContext,second]])assert.throws(()=>f.stripePrintTransitionProjection(context,handle),e=>e.code==='proof_expired');
  await assert.rejects(f.prepareStripePrintTransition(f.context,proof),e=>e.code==='proof_expired');
  const independent=await f.verifyStripePrintPayment(reference);
  assert.ok(await f.prepareStripePrintTransition(f.context,independent));assert.deepEqual(f.writes,[]);
 }}finally{Date.now=original;}
});
test('backwards movement inside TTL invalidates all handles, including when observed after transaction reads',async()=>{
 const original=Date.now;let time;Date.now=()=>time;
 try {for(const observation of ['prepare','projection','after-read']){
  time=1000000;const f=fixture(),proof=await f.verifyStripePrintPayment(reference),handle=await f.prepareStripePrintTransition(f.context,proof);
  time=1000200;f.stripePrintTransitionProjection(f.context,handle);
  if(observation==='after-read'){
   time=1000300;const get=f.context.transaction.get;
   f.context.transaction.get=async ref=>{const result=await get(ref);time=1000250;return result;};
   await assert.rejects(f.prepareStripePrintTransition(f.context,proof),e=>e.code==='proof_expired');
  }else{
   time=1000100;
   if(observation==='prepare')await assert.rejects(f.prepareStripePrintTransition(f.context,proof),e=>e.code==='proof_expired');
   else assert.throws(()=>f.stripePrintTransitionProjection(f.context,handle),e=>e.code==='proof_expired');
  }
  time=1000400;assert.throws(()=>f.stripePrintTransitionProjection(f.context,handle),e=>e.code==='proof_expired');
  await assert.rejects(f.prepareStripePrintTransition(f.context,proof),e=>e.code==='proof_expired');assert.deepEqual(f.writes,[]);
 }}finally{Date.now=original;}
});

test('invalid observed server clock permanently invalidates already issued sibling handles',async()=>{
 const original=Date.now;let time;Date.now=()=>time;
 try {for(const invalidTime of [NaN,Infinity,0,-1,1000000.5]){
  time=1000000;const f=fixture(),proof=await f.verifyStripePrintPayment(reference),handle=await f.prepareStripePrintTransition(f.context,proof);
  time=invalidTime;assert.throws(()=>f.stripePrintTransitionProjection(f.context,handle),e=>e.code==='proof_unavailable');
  time=1000001;assert.throws(()=>f.stripePrintTransitionProjection(f.context,handle),e=>e.code==='proof_expired');
  await assert.rejects(f.prepareStripePrintTransition(f.context,proof),e=>e.code==='proof_expired');assert.deepEqual(f.writes,[]);
 }}finally{Date.now=original;}
});
test('foreign native database contexts and missing order never produce a projection',async()=>{
 const f=fixture();const proof=await f.verifyStripePrintPayment(reference);
 await assert.rejects(f.prepareStripePrintTransition({...f.context,db:{}},proof),e=>e.code==='transition_unverified');
 assert.equal(f.calls.filter(x=>x[0]==='read').length,0);f.rows.delete('orders/o1');
 await assert.rejects(f.prepareStripePrintTransition(f.context,proof),e=>e.code==='transition_unverified');
});
