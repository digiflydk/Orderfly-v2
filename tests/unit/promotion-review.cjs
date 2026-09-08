const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(path, mocks = {}) {
 const mod = { exports: {} };
 const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
 new Function('require', 'module', 'exports', code)(name => { if (!(name in mocks)) throw Error(name); return mocks[name]; }, mod, mod.exports);
 return mod.exports;
}
const rules = load('src/lib/promotion-rules.ts');
test('locked combos and item offers excluded; full price product eligible', () => {
 assert.equal(rules.cartLineEligible(true, 100, 100, false), false);
 assert.equal(rules.cartLineEligible(false, 100, 80, false), false);
 assert.equal(rules.cartLineEligible(false, 100, 100, true), false);
 assert.equal(rules.cartLineEligible(false, 100, 100, false), true);
});
test('Copenhagen midnight and promotion hour in winter and summer', () => {
 assert.deepEqual(rules.restaurantClock(new Date('2026-01-04T23:30:00Z')), {day:'monday', time:'00:30'});
 assert.deepEqual(rules.restaurantClock(new Date('2026-07-05T22:30:00Z')), {day:'monday', time:'00:30'});
 assert.equal(rules.restaurantClock(new Date('2026-01-01T16:00:00Z')).time, '17:00');
 assert.equal(rules.restaurantClock(new Date('2026-07-01T15:00:00Z')).time, '17:00');
});
test('assigned checkout identity succeeds, other identity rejected', () => {
 assert.equal(rules.assignedCustomerMatches('cust-1','cust-1'), true);
 assert.equal(rules.assignedCustomerMatches('cust-1','cust-2'), false);
});
test('newsletter canceled retry remains eligible; subscriber and paid reuse rejected', () => {
 assert.equal(rules.newsletterEligible(false, undefined, 'offer', 0), true);
 assert.equal(rules.newsletterEligible(true, 'offer', 'offer', 0), true);
 assert.equal(rules.newsletterEligible(true, undefined, 'offer', 0), false);
 assert.equal(rules.newsletterEligible(true, 'offer', 'offer', 1), false);
});
test('webhook atomic failure retries and duplicate delivery counts once', async () => {
 let state = {
  'orders/o': {paymentStatus:'Pending', brandId:'b', locationId:'l', psp:{checkoutSessionId:'s'}, customerDetails:{id:'c'}, appliedDiscountId:'d', totalAmount:100},
  'customers/c': {brandId:'b',totalOrders:0,totalSpend:0}, 'discounts/d':{brandId:'b',usedCount:0},
 };
 let fail = true;
 const session={id:'s',payment_status:'paid',payment_intent:'pi',amount_total:10000,metadata:{orderId:'o',brandId:'b',locationId:'l'}};
 class Stripe { webhooks = {constructEventAsync: async()=>({type:'checkout.session.completed',data:{object:session}})}; }
 const mocks={
  'server-only':{},
  '@/lib/discount-reservations':{
   releaseDiscount:async()=>{},
   prepareCapacitySettlement:async(tx,order,paid)=>load('src/lib/discount-reservations.ts',{
     'node:crypto':require('node:crypto'), '@/lib/firebase':{db:{}},
     'firebase/firestore':{doc:(_,c,id)=>c+'/'+id},
   }).prepareCapacitySettlement(tx,order,paid),
  },
  'next/server':{}, stripe:{default:Stripe},
  '@/app/superadmin/settings/actions':{getActiveStripeSecretKey:async()=> 'test',getActiveStripeWebhookSecret:async()=> 'test'},
  'next/headers':{headers:async()=>({get:()=> 'signature'})}, '@/lib/firebase':{db:{}},
  '@/lib/analytics-server':{trackServerEvent:async()=>{}},
  'firebase/firestore':{
   doc:(_,collection,id)=>collection+'/'+id, serverTimestamp:()=> 'now',
   runTransaction:async(_,fn)=>{
    const draft=structuredClone(state); let writes=0;
    const result=await fn({set:(ref,data)=>{draft[ref]=data;},get:async ref=>({exists:()=>!!draft[ref], data:()=>draft[ref]}),update:(ref,data)=>{
     draft[ref]={...draft[ref],...data};
     if(fail && ++writes===2) throw Error('simulated mid-fulfillment failure');
    }});
    state=draft; return result;
   },
  },
 };
 mocks['@/lib/server/settle-checkout']=load('src/lib/server/settle-checkout.ts',mocks);
 const route=load('src/app/api/stripe/webhook/route.ts',mocks);
 assert.equal((await route.POST(new Request('https://test',{method:'POST',body:'event'}))).status,500);
 assert.equal(state['orders/o'].paymentStatus,'Pending');
 assert.equal(state['discounts/d'].usedCount,0);
 fail=false;
 for(let i=0;i<2;i++) assert.equal((await route.POST(new Request('https://test',{method:'POST',body:'event'}))).status,200);
 assert.equal(state['orders/o'].paymentStatus,'Paid');
 assert.equal(state['discounts/d'].usedCount,1);
 assert.equal(state['customers/c'].discountUsage.d,1);
 assert.equal(state['customers/c'].totalOrders,1);
 for (const missing of ['customers/c', 'discounts/d']) {
  state['orders/o'].paymentStatus='Pending';
  delete state[missing];
  assert.equal((await route.POST(new Request('https://test',{method:'POST',body:'event'}))).status,200);
  assert.equal(state['orders/o'].paymentStatus,'Paid');
  assert.ok(state['orders/o'].fulfillmentWarnings.length > 0);
 }

});

test('reservation serializes concurrent sessions, releases safely, preserves paid holds', async () => {
 let state = {
  'discounts/d': {brandId:'b',isActive:true,usageLimit:1,perCustomerLimit:1,usedCount:0},
  'customers/c': {brandId:'b'}, 'customers/c2':{brandId:'b'},
  'orders/o1':{brandId:'b',customerDetails:{id:'c'},appliedDiscountId:'d'},
  'orders/o2':{brandId:'b',customerDetails:{id:'c2'},appliedDiscountId:'d'},
 };
 let queue=Promise.resolve();
 const api=load('src/lib/discount-reservations.ts',{
  'node:crypto':require('node:crypto'),
  '@/lib/firebase':{db:{}},
  'firebase/firestore':{
   doc:(_,c,id)=>c+'/'+id,
   runTransaction:(_,fn)=>{
    const task=queue.then(async()=>{
     const draft=structuredClone(state);
     const result=await fn({get:async ref=>({exists:()=>!!draft[ref],data:()=>draft[ref]}),set:(ref,data)=>{draft[ref]=data;},update:(ref,data)=>{draft[ref]={...draft[ref],...data};}});
     state=draft; return result;
    });
    queue=task.catch(()=>{}); return task;
   },
  },
 });
 const attempts=await Promise.allSettled([api.reserveDiscount('o1','d','c','b'),api.reserveDiscount('o2','d','c2','b')]);
 assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);
 await api.releaseDiscount('o1','b');
 await api.reserveDiscount('o2','d','c2','b');
 state['orders/o2'].paymentStatus='Paid';
 await api.releaseDiscount('o2','b');
 assert.equal(state['orders/o2'].discountReservation,'held');
 // Unlimited global campaign still enforces per-customer limit across sessions.
 state['discounts/d'].usageLimit=0;
 state['orders/o1']={brandId:'b',customerDetails:{id:'c2'},appliedDiscountId:'d'};
 await assert.rejects(api.reserveDiscount('o1','d','c2','b'),/already used or reserved/);
 // First-time restriction spans distinct first-order campaigns.
 state['discounts/e']={brandId:'b',isActive:true,firstTimeCustomerOnly:true};
 for (const [key,value] of Object.entries(state)) if(key.startsWith('checkout_customer_capacity/')) value.firstTimeHeld=true;
 state['orders/o1'].appliedDiscountId='e';
 await assert.rejects(api.reserveDiscount('o1','e','c2','b'),/First-order/);
 // #62: ordinary checkout can follow a held promotion without claiming it;
 // a new first-order claim still cannot follow an ordinary pending checkout.
 for (const first of [null,'e']) {
  for (const key of Object.keys(state)) if(key.startsWith('checkout_')) delete state[key];
  state['orders/o1']={brandId:'b',customerDetails:{id:'c'},appliedDiscountId:first};
  state['orders/o2']={brandId:'b',customerDetails:{id:'c'},appliedDiscountId:first ? null : 'e'};
  await api.reserveDiscount('o1',first,'c','b');
  if(first) {
   await api.reserveDiscount('o2',null,'c','b');
   const capacity=Object.entries(state).find(([key])=>key.startsWith('checkout_customer_capacity/'))[1];
   assert.equal(capacity.firstTimeHeld,true);
   await api.releaseDiscount('o2','b');
   assert.equal(Object.entries(state).find(([key])=>key.startsWith('checkout_customer_capacity/'))[1].firstTimeHeld,true);
  } else {
   await assert.rejects(api.reserveDiscount('o2','e','c','b'),/First-order/);
   await api.releaseDiscount('o1','b');
   await api.reserveDiscount('o2','e','c','b');
  }
 }
 for (const [key,value] of Object.entries(state)) if(key.startsWith('checkout_')) assert.ok(Object.keys(value).length <= 3);

});

test('cancel requires capability, confirms expiration before release and tolerates payment race', async () => {
 const crypto = require('node:crypto');
 const token='a'.repeat(64);
 let status='open', fail=false, race=false, releases=0;
 const session=()=>({status,payment_status:status==='complete'?'paid':'unpaid',metadata:{orderId:'ORD-1',brandId:'b',locationId:'l'}});
 class Stripe { checkout={sessions:{retrieve:async()=>session(),expire:async()=>{if(race){status='complete';throw Error('paid');} if(fail)throw Error('network');status='expired';return session();}}}; }
 const api=load('src/app/checkout/cancel-actions.ts',{
  'node:crypto':crypto, stripe:{default:Stripe}, '@/lib/firebase':{db:{}},
  'firebase/firestore':{doc:()=> 'order',getDoc:async()=>({exists:()=>true,data:()=>({brandId:'b',locationId:'l',psp:{checkoutSessionId:'s'},cancelTokenHash:crypto.createHash('sha256').update(token).digest('hex')})})},
  '@/app/superadmin/settings/actions':{getActiveStripeSecretKey:async()=> 'test'},
  '@/lib/discount-reservations':{releaseDiscount:async()=>{assert.equal(status,'expired');releases++;}},
 });
 assert.equal((await api.cancelCheckout('ORD-1','b'.repeat(64))).status,'error');
 assert.equal(releases,0);
 fail=true;
 assert.equal((await api.cancelCheckout('ORD-1',token)).status,'error');
 assert.equal(releases,0);
 fail=false;race=true;
 assert.equal((await api.cancelCheckout('ORD-1',token)).status,'paid');
 assert.equal(releases,0);
 race=false;status='open';
 assert.equal((await api.cancelCheckout('ORD-1',token)).status,'canceled');
 assert.equal(releases,1);
 assert.equal((await api.cancelCheckout('ORD-1',token)).status,'canceled');
});

test('upsell history retains A and B and accepts legacy stored ID', () => {
 const values = new Map([['orderfly_handled_upsell','A']]);
 global.sessionStorage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
 const api=load('src/lib/handled-upsells.ts');
 api.markUpsellHandled('B'); api.markUpsellHandled('A');
 assert.deepEqual(api.handledUpsells(),['A','B']);
 delete global.sessionStorage;
});

test('integration-created customer is resolved by normalized email within tenant', async () => {
 const rows=[{id:'integration-auto-id',brandId:'b',normalizedEmail:'a@example.com'},{id:'other-brand-id',brandId:'other',normalizedEmail:'a@example.com'}];
 const api=load('src/lib/checkout-customer-identity.ts',{
  '@/lib/firebase':{db:{}},'firebase/firestore':{
   collection:()=>null,where:(field,op,value)=>row=>row[field]===value,limit:()=>null,
   query:(_, ...filters)=>filters.filter(Boolean),
   getDocs:async filters=>{const docs=rows.filter(row=>filters.every(f=>f(row)));return {size:docs.length,empty:!docs.length,docs};},
  },
 });
 assert.equal((await api.findCheckoutCustomer('b',' A@EXAMPLE.COM ')).id,'integration-auto-id');
 assert.equal(await api.findCheckoutCustomer('missing','a@example.com'),null);
 rows.push({id:'duplicate',brandId:'b',normalizedEmail:'a@example.com'});
 await assert.rejects(api.findCheckoutCustomer('b','a@example.com'),/Multiple/);
});
