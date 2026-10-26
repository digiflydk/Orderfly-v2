const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {z}=require('zod');
const {loadTs}=require('../helpers/load-ts.cjs');
function fixture(livemode=false){
 const token='a'.repeat(64),calls={gateway:[],active:0,retrieve:0,expire:0,release:[]};
 const order={brandId:'b',locationId:'l',deliveryType:'Delivery',managedDelivery:{},managedStripeAccount:{accountId:'acct_expected',livemode},psp:{provider:'stripe',checkoutSessionId:'cs_pinned'},cancelTokenHash:createHash('sha256').update(token).digest('hex')};
 const session={id:'cs_pinned',livemode,status:'open',payment_status:'unpaid',metadata:{orderId:'ORD-ONE',brandId:'b',locationId:'l'}};
 const f={order,session,calls,token,binding:{...order.managedStripeAccount},after:null,fallback:null,fail:false};
 const stripe={checkout:{sessions:{retrieve:async id=>{assert.equal(id,'cs_pinned');calls.retrieve++;return calls.retrieve>1&&f.fallback?f.fallback:session;},expire:async id=>{assert.equal(id,'cs_pinned');calls.expire++;if(f.fail)throw Error('timeout');return f.after||{...session,status:'expired'};}}}};
 f.api=loadTs('src/app/checkout/cancel-actions.ts',{
  '@/lib/server/firestore-compat':{db:{},doc:(_,collection,id)=>{assert.equal(collection,'orders');assert.equal(id,'ORD-ONE');return id;},getDoc:async()=>({exists:()=>true,data:()=>order})},
  '@/lib/server/payment-settings':{getActiveStripeSecretKey:async()=>{calls.active++;return 'legacy-active-key';}},
  '@/lib/delivery/payments/stripe-authority':{managedStripeAccountSchema:z.object({accountId:z.string().regex(/^acct_[A-Za-z0-9]+$/),livemode:z.boolean()}).strict(),resolveManagedStripeGateway:async environment=>{calls.gateway.push(environment);return {stripe,binding:f.binding};}},
  '@/lib/discount-reservations':{releaseDiscount:async(...args)=>calls.release.push(args)},
  stripe:{default:class {constructor(){return stripe;}}},
 });
 return f;
}
for(const live of [false,true])test(`managed ${live?'live':'test'} cancellation uses pinned mode regardless active gateway`,async()=>{
 const f=fixture(live);assert.equal((await f.api.cancelCheckout('ORD-ONE',f.token)).status,'canceled');
 assert.deepEqual(f.calls,{gateway:[live?'production':'sandbox'],active:0,retrieve:1,expire:1,release:[['ORD-ONE','b','cs_pinned','l']]});
});
test('legacy cancellation retains active gateway and scoped release',async()=>{
 const f=fixture();delete f.order.managedDelivery;delete f.order.managedStripeAccount;
 assert.equal((await f.api.cancelCheckout('ORD-ONE',f.token)).status,'canceled');assert.equal(f.calls.active,1);assert.deepEqual(f.calls.gateway,[]);
});
test('capability and malformed stored authority fail before gateway access',async()=>{
 for(const variant of ['token','binding','provider','delivery']){
  const f=fixture();if(variant==='binding')delete f.order.managedStripeAccount;if(variant==='provider')f.order.psp.provider='other';if(variant==='delivery')f.order.deliveryType='Pickup';
  assert.equal((await f.api.cancelCheckout('ORD-ONE',variant==='token'?'b'.repeat(64):f.token)).status,'error');
  assert.equal(f.calls.active+f.calls.retrieve+f.calls.expire+f.calls.release.length+f.calls.gateway.length,0);
 }
});
test('changed account or mode never accesses session or releases discount',async()=>{
 for(const variant of ['accountId','livemode']){const f=fixture();f.binding[variant]=variant==='accountId'?'acct_other':true;
  assert.equal((await f.api.cancelCheckout('ORD-ONE',f.token)).status,'error');assert.equal(f.calls.retrieve+f.calls.expire+f.calls.release.length,0);
 }
});
for(const phase of ['initial','expire','fallback'])test(`${phase} session identity/mode/tenant mismatches fail closed`,async()=>{
 for(const variant of ['id','livemode','orderId','brandId','locationId']){
  const f=fixture(),bad=structuredClone(f.session);bad.status='expired';
  if(variant==='id')bad.id='cs_other';else if(variant==='livemode')bad.livemode=true;else bad.metadata[variant]='other';
  if(phase==='initial')Object.assign(f.session,bad);else if(phase==='expire')f.after=bad;else {f.fail=true;f.fallback=bad;}
  assert.equal((await f.api.cancelCheckout('ORD-ONE',f.token)).status,'error');assert.equal(f.calls.release.length,0);assert.equal(f.calls.expire,phase==='initial'?0:1);
 }
});
test('payment races and unconfirmed expiration retain reservation; confirmed fallback releases once',async()=>{
 for(const state of ['paid','open','expired']){
  const f=fixture();f.fail=true;f.fallback={...f.session,status:state==='paid'?'complete':state,payment_status:state==='paid'?'paid':'unpaid'};
  assert.equal((await f.api.cancelCheckout('ORD-ONE',f.token)).status,state==='paid'?'paid':state==='expired'?'canceled':'error');
  assert.equal(f.calls.expire,1);assert.equal(f.calls.release.length,state==='expired'?1:0);
 }
});
test('already paid session cannot expire and stored paid order needs no gateway',async()=>{
 for(const stored of [false,true]){const f=fixture();if(stored)f.order.paymentStatus='Paid';else f.session.payment_status='paid';
  assert.equal((await f.api.cancelCheckout('ORD-ONE',f.token)).status,'paid');assert.equal(f.calls.expire+f.calls.release.length,0);if(stored)assert.equal(f.calls.gateway.length,0);
 }
});
