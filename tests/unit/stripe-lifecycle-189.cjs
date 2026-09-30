const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { isPaidSale } = loadTs('src/lib/paid-order.ts');

function fixture() {
  const rows = new Map([['orders/ORD-NEW',{brandId:'esmeralda',locationId:'amager',status:'Pending',paymentStatus:'Pending',discountReservation:'none',totalAmount:79,psp:{checkoutSessionId:'cs_test_new'}}]]);
  const doc=(_,collection,id)=>`${collection}/${id}`;
  const db={};
  const firestore={db,doc,runTransaction:async(_,callback)=>{
    const draft=new Map([...rows].map(([key,value])=>[key,structuredClone(value)]));
    const tx={get:async ref=>({exists:()=>draft.has(ref),data:()=>draft.get(ref)}),set:(ref,value)=>draft.set(ref,value),update:(ref,value)=>draft.set(ref,{...draft.get(ref),...value})};
    const result=await callback(tx); rows.clear();for(const [key,value] of draft)rows.set(key,value);return result;
  }};
  const release=loadTs('src/lib/discount-reservations.ts',{'@/lib/server/firestore-compat':firestore}).releaseDiscount;
  let event, settlements=0;
  class Stripe {webhooks={constructEventAsync:async()=>event};}
  const route=loadTs('src/app/api/stripe/webhook/route.ts',{
    'stripe':{default:Stripe},'next/headers':{headers:async()=>({get:()=> 'signed'})},
    '@/lib/server/payment-settings':{getActiveStripeSecretKey:async()=> 'test',getActiveStripeWebhookSecret:async()=> 'test'},
    '@/lib/discount-reservations':{releaseDiscount:release},
    '@/lib/server/settle-checkout':{settlePaidCheckoutSession:async session=>{
      const order=rows.get('orders/ORD-NEW');
      if(session.payment_status!=='paid'||order.status==='Canceled')return false;
      if(order.paymentStatus==='Paid')return false;
      order.paymentStatus='Paid';order.status='Received';settlements++;return true;
    }},
  });
  const session={id:'cs_test_new',payment_status:'unpaid',metadata:{orderId:'ORD-NEW',brandId:'esmeralda',locationId:'amager'}};
  return {rows,session,route,setEvent:(type,patch={})=>{event={type,data:{object:{...session,...patch,metadata:{...session.metadata,...patch.metadata}}}};},send:()=>route.POST(new Request('https://example.test',{method:'POST',body:'signed event'})),settlements:()=>settlements};
}

test('#189 pending completion, failed asynchronous payment and replay never create a sale',async()=>{
  const f=fixture();f.setEvent('checkout.session.completed');
  assert.equal((await f.send()).status,200);assert.equal(f.rows.get('orders/ORD-NEW').status,'Pending');
  f.setEvent('checkout.session.async_payment_failed');
  assert.equal((await f.send()).status,200);assert.equal((await f.send()).status,200);
  assert.equal(f.rows.get('orders/ORD-NEW').paymentStatus,'Failed');
  assert.equal(f.rows.get('orders/ORD-NEW').status,'Canceled');
  assert.equal(isPaidSale(f.rows.get('orders/ORD-NEW')),false);
  assert.equal(f.settlements(),0);
});

test('#189 expired session respects location/session scope and leaves paid order untouched',async()=>{
  const f=fixture();f.setEvent('checkout.session.expired',{metadata:{locationId:'other'}});
  assert.equal((await f.send()).status,500);
  assert.equal(f.rows.get('orders/ORD-NEW').paymentStatus,'Pending');
  f.setEvent('checkout.session.completed',{payment_status:'paid'});
  assert.equal((await f.send()).status,200);assert.equal((await f.send()).status,200);
  assert.equal(f.settlements(),1);assert.equal(isPaidSale(f.rows.get('orders/ORD-NEW')),true);
  f.setEvent('checkout.session.expired');assert.equal((await f.send()).status,200);
  assert.equal(f.rows.get('orders/ORD-NEW').paymentStatus,'Paid');
  assert.equal(f.settlements(),1);
});

test('#189 superadmin cannot cancel or prepare an unpaid Stripe session by changing status',async()=>{
  const f=fixture(),db={collection:()=>({doc:()=>({get:async()=>({exists:true,data:()=>f.rows.get('orders/ORD-NEW')})})}),runTransaction:async callback=>callback({get:async()=>({data:()=>f.rows.get('orders/ORD-NEW')}),update:()=>{throw Error('must not update')}})};
  const api=loadTs('src/app/superadmin/sales/orders/actions.ts',{
    '@/lib/access/scoped-data':{authorizeTransaction:async()=>{throw Error('Unpaid Stripe cannot enter merchant authorization');}},
    '@/lib/firebase-admin':{getAdminDb:()=>db},
    '@/lib/access/orderfly-session':{requireOrderflyAccess:async()=>{}},
    '@/lib/feedback/mail-queue':{queueOrderFeedback:async()=>{}},
    'next/cache':{revalidatePath:()=>{}},
  });
  for(const status of ['Received','In Progress','Canceled','Error']) {
    const result=await api.updateOrderStatus('ORD-NEW',status);
    assert.equal(result.success,false);
    assert.match(result.message,/verified payment or Stripe cancellation/);
  }
});
