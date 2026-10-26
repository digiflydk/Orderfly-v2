const {test}=require('node:test'),assert=require('node:assert/strict');
const {moduleGraph}=require('../helpers/load-ts-graph.cjs');
function fixture(){
 const scope={orderId:'order',brandId:'brand',locationId:'location'},calls=[];
 const session={id:'cs_test_fixture',mode:'payment',status:'complete',payment_status:'paid',payment_intent:'pi_fixture',livemode:false,currency:'dkk',amount_total:10000,metadata:scope};
 const order={...scope,paymentStatus:'Paid',deliveryType:'Delivery',totalAmount:100,managedDelivery:{providerId:'wolt'},managedStripeAccount:{accountId:'acct_test',livemode:false},psp:{provider:'stripe',paymentIntentId:'pi_fixture',checkoutSessionId:session.id}};
 const settings={activeMode:'live',test:{secretKey:'sk_test_fixture',webhookSecret:'test_signing'},live:{secretKey:'sk_live_fixture',webhookSecret:'live_signing'}};
 const records=new Map([['platform_settings/payment_gateway',settings],['orders/order',order]]);
 let event={type:'checkout.session.completed',livemode:false,data:{object:session}},accountOverride;
 class Stripe{
  constructor(key){this.key=key;calls.push(key.startsWith('sk_test_')?'test-client':'live-client');}
  accounts={retrieve:async()=>({id:accountOverride??(this.key.startsWith('sk_test_')?'acct_test':'acct_live')})};
  checkout={sessions:{retrieve:async()=>session}};
  paymentIntents={retrieve:async()=>({id:'pi_fixture',status:'succeeded',livemode:false,currency:'dkk',amount:10000,amount_received:10000,metadata:scope,latest_charge:{id:'ch_fixture',payment_intent:'pi_fixture',paid:true,disputed:false,livemode:false,currency:'dkk',amount:10000,amount_refunded:0}})};
  webhooks={constructEventAsync:async(body,signature,secret)=>{if(signature!==secret)throw Error('bad signature');return event;}};
 }
 const api=moduleGraph({'server-only':{},stripe:{default:Stripe},'@/lib/firebase-admin':{getAdminDb:()=>({collection:name=>({doc:id=>({get:async()=>({data:()=>records.get(`${name}/${id}`)})})})})},
  '@/lib/server/payment-settings':{getActiveStripeSecretKey:async()=>settings.live.secretKey}})('src/lib/delivery/payments/stripe-authority.ts');
 return {api,calls,order,session,settings,event,setAccount:value=>{accountOverride=value;},setEvent:value=>{event=value;}};
}
test('sandbox payment verification and production gateway coexist without changing global activeMode',async()=>{
 const f=fixture();const proof=await f.api.verifyManagedPaidOrder('order',f.order);
 assert.equal(f.api.managedPaymentProjection(proof).binding.livemode,false);
 assert.equal((await f.api.resolveManagedStripeGateway('production')).binding.livemode,true);
 assert.equal(f.settings.activeMode,'live');assert.deepEqual(f.calls,['test-client','live-client']);
});
test('pinned mode rejects wrong stored key prefix and account changes before trusting payment',async()=>{
 const wrongKey=fixture();wrongKey.settings.test.secretKey='sk_live_wrong';
 await assert.rejects(wrongKey.api.verifyManagedPaidOrder('order',wrongKey.order),/unavailable/);assert.deepEqual(wrongKey.calls,[]);
 const wrongAccount=fixture();wrongAccount.setAccount('acct_foreign');
 await assert.rejects(wrongAccount.api.verifyManagedPaidOrder('order',wrongAccount.order),/account_changed/);
});
test('inactive-mode webhook accepts only authenticated native managed scope and original account',async()=>{
 const f=fixture();assert.equal(await f.api.verifyManagedStripeWebhook('fixture','test_signing'),f.event);
 for(const mutate of [f=>{delete f.order.managedDelivery;},f=>{f.session.metadata={...f.session.metadata,brandId:'foreign'};},f=>{f.order.psp.checkoutSessionId='cs_other';},f=>{f.event.livemode=true;},f=>{f.setAccount('acct_foreign');}]){
  const bad=fixture();mutate(bad);await assert.rejects(bad.api.verifyManagedStripeWebhook('fixture','test_signing'));
 }
 const badSignature=fixture();await assert.rejects(badSignature.api.verifyManagedStripeWebhook('fixture','forged'));
});
