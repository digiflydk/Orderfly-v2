const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(path, mocks = {}) {
 const mod = { exports: {} };
 const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
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
 const route=load('src/app/api/stripe/webhook/route.ts',{
  'next/server':{}, stripe:{default:Stripe},
  '@/app/superadmin/settings/actions':{getActiveStripeSecretKey:async()=> 'test',getActiveStripeWebhookSecret:async()=> 'test'},
  'next/headers':{headers:async()=>({get:()=> 'signature'})}, '@/lib/firebase':{db:{}},
  '@/lib/analytics-server':{trackServerEvent:async()=>{}},
  'firebase/firestore':{
   doc:(_,collection,id)=>collection+'/'+id, serverTimestamp:()=> 'now',
   runTransaction:async(_,fn)=>{
    const draft=structuredClone(state); let writes=0;
    const result=await fn({get:async ref=>({exists:()=>!!draft[ref], data:()=>draft[ref]}),update:(ref,data)=>{
     draft[ref]={...draft[ref],...data};
     if(fail && ++writes===2) throw Error('simulated mid-fulfillment failure');
    }});
    state=draft; return result;
   },
  },
 });
 assert.equal((await route.POST(new Request('https://test',{method:'POST',body:'event'}))).status,500);
 assert.equal(state['orders/o'].paymentStatus,'Pending');
 assert.equal(state['discounts/d'].usedCount,0);
 fail=false;
 for(let i=0;i<2;i++) assert.equal((await route.POST(new Request('https://test',{method:'POST',body:'event'}))).status,200);
 assert.equal(state['orders/o'].paymentStatus,'Paid');
 assert.equal(state['discounts/d'].usedCount,1);
 assert.equal(state['customers/c'].discountUsage.d,1);
 assert.equal(state['customers/c'].totalOrders,1);
});
