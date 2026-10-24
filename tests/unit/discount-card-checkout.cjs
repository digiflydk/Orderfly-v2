const {test}=require('node:test');
const assert=require('node:assert/strict');
const {moduleGraph}=require('../helpers/load-ts-graph.cjs');
const {memoryDb}=require('../helpers/marketing-db.cjs');
const {checkout}=require('../helpers/checkout-fixture.cjs');
const load=moduleGraph({'server-only':{}});
const api=load('src/lib/loyalty/discount-card/checkout.ts');
const {discountCardAssignmentId}=load('src/lib/loyalty/discount-card/model.ts');
const {hashKey}=load('src/lib/loyalty/stamp-card/model.ts');
const token='a'.repeat(64),now=Date.now(),aid=discountCardAssignmentId('b','c');
function seed(){return [
 ['platformAdminControl/access-v1',{principals:[],roles:[],memberships:[],companies:[{id:'co',active:true,locationIds:[],orderflyBrandIds:['b'],opsflyOrganizationId:null}]}],
 ['brands/b',{slug:'brand',status:'active'}],['locations/l',{brandId:'b',isActive:true}],
 ['customers/c',{id:'c',brandId:'b',email:'test@example.test',normalizedEmail:'test@example.test',phone:'12345678',normalizedPhone:'12345678',locationIds:['l']}],
 ['loyaltyMembers/m',{brandId:'b',companyId:'co',customerId:'c',normalizedEmail:'test@example.test',status:'active',sessionEpoch:0}],
 ['loyaltySessions/'+hashKey('session',token),{brandId:'b',memberId:'m',epoch:0,expiresAt:now+3600000,revokedAt:null}],
 ['discountCardFeatures/b',{brandId:'b',companyId:'co',version:1,enabled:true,locationScope:{mode:'all',locationIds:[]},updatedAt:now}],
 ['discountCardGroups/g',{id:'g',brandId:'b',companyId:'co',version:1,name:'Familie',percentage:25,active:true,updatedAt:now}],
 ['discountCardAssignments/'+aid,{id:aid,brandId:'b',companyId:'co',customerId:'c',memberId:'m',groupId:'g',version:1,status:'active',startsAt:null,expiresAt:null,updatedAt:now}],
 ];}
const input={brandId:'b',brandSlug:'brand',locationId:'l',token,email:'test@example.test',customerId:'c',now};
test('real verified session authorizes repeated card and integer-ore best-price snapshot',async()=>{
 const db=memoryDb(new Map(seed())),card=await api.readDiscountCardCheckout(db,input);
 assert.equal(card.percentage,25);
 assert.equal(api.discountCardCheckoutSnapshot(card,101,24).amountOre,25);
 assert.equal(api.discountCardCheckoutSnapshot(card,10000,2500),null);
 assert.equal(api.discountCardCheckoutSnapshot(card,10000,3000),null);
 assert.equal(api.discountCardCheckoutSnapshot(card,10000,0).purchaseStampsEligible,false);
 assert.deepEqual(await api.readDiscountCardCheckout(db,input),card);
});
test('public email/customer ID is not an authentication credential',async()=>{
 const db=memoryDb(new Map(seed()));
 for(const patch of [{token:undefined},{token:'bad'},{token:'b'.repeat(64)},{email:'other@example.test'},{customerId:'other'},{brandSlug:'other'},{locationId:'other'}])
  assert.equal(await api.readDiscountCardCheckout(db,{...input,...patch}),null);
});
for(const [path,patch] of [
 ['discountCardFeatures/b',{enabled:false}],['discountCardFeatures/b',{locationScope:{mode:'selected',locationIds:['elsewhere']}}],
 ['discountCardGroups/g',{active:false}],['discountCardGroups/g',{brandId:'other'}],
 ['discountCardAssignments/'+aid,{status:'pending'}],['discountCardAssignments/'+aid,{status:'blocked'}],['discountCardAssignments/'+aid,{expiresAt:now}],
 ['discountCardAssignments/'+aid,{memberId:'other'}],['locations/l',{brandId:'other'}],['locations/l',{isActive:false}],
 ['customers/c',{status:'inactive'}],['customers/c',{status:'deleted'}],['loyaltyMembers/m',{sessionEpoch:1}],['loyaltyMembers/m',{status:'deleted'}],
 ['loyaltySessions/'+hashKey('session',token),{revokedAt:now}],['loyaltySessions/'+hashKey('session',token),{expiresAt:now}],
])test('fails closed on changed '+path+' '+JSON.stringify(patch),async()=>{
 const rows=new Map(seed());rows.set(path,{...rows.get(path),...patch});
 assert.equal(await api.readDiscountCardCheckout(memoryDb(rows),input),null);
});
test('transactional recheck rejects changed entitlement without new order writes',async()=>{
 const db=memoryDb(new Map(seed())),card=await api.readDiscountCardCheckout(db,input),snapshot=api.discountCardCheckoutSnapshot(card,10000,0);
 db.rows.get('discountCardGroups/g').version++;
 await assert.rejects(db.runTransaction(tx=>api.assertDiscountCardCheckoutCurrent(db,input,snapshot,tx)),/ændret/);
});
test('checkout applies card to goods, preserves fees, snapshots benefit and never consumes one-time voucher',async()=>{
 const f=await checkout({seed:seed(),loyaltyToken:token,expectedCartDiscount:25,paymentOverrides:{cartDiscountTotal:25,discountTotal:25}});
 assert.equal(f.result.success,true,f.result.error);
 const order=f.records.get('orders/ORD-TEST');
 assert.equal(order.totalAmount,79); assert.equal(order.discountCard.amountOre,2500);
 assert.equal(order.discountCard.purchaseStampsEligible,false);assert.equal(order.appliedDiscountId,null);
 assert.equal(f.coupon.amount_off,2500);assert.equal(f.records.get('discounts/d').usedCount,0);
 assert.equal(f.records.get('discountCardAssignments/'+aid).status,'active');
});
test('forged browser card total without session is rejected before customer/order/payment writes',async()=>{
 const f=await checkout({seed:seed(),paymentOverrides:{cartDiscountTotal:25,discountTotal:25}});
 assert.equal(f.result.success,false);assert.deepEqual(f.writes,[]);assert.equal(f.events.includes('stripe'),false);
});
test('concurrent revocation before order transaction prevents order and payment',async()=>{
 let count=0;const f=await checkout({seed:seed(),loyaltyToken:token,expectedCartDiscount:25,paymentOverrides:{cartDiscountTotal:25,discountTotal:25},beforeCustomerTransaction:rows=>{
  if(++count===2) rows.get('discountCardAssignments/'+aid).status='blocked';
 }});
 assert.equal(f.result.success,false);assert.equal(f.records.has('orders/ORD-TEST'),false);assert.equal(f.events.includes('stripe'),false);
});

test('ambiguous company mapping fails public capability and authenticated entitlement',async()=>{
 const db=memoryDb(new Map(seed()));db.rows.get('platformAdminControl/access-v1').companies.push({id:'other',active:true,locationIds:[],orderflyBrandIds:['b'],opsflyOrganizationId:null});
 assert.equal(await api.discountCardCheckoutEnabled(db,'b','l'),false);
 assert.equal(await api.readDiscountCardCheckout(db,input),null);
});
test('member email removed from canonical customer revokes entitlement even without email input',async()=>{
 const db=memoryDb(new Map(seed()));db.rows.get('customers/c').email='new@example.test';db.rows.get('customers/c').normalizedEmail='new@example.test';
 assert.equal(await api.readDiscountCardCheckout(db,{...input,email:undefined}),null);
});
for(const paymentMethod of ['pay_at_pickup','online'])test('revocation after hold releases rejected '+paymentMethod+' order and allows fresh checkout',async()=>{
 let rows;
 const options={loyaltyToken:token,realReservations:true,expectedCartDiscount:25,paymentOverrides:{cartDiscountTotal:25,discountTotal:25},locationOverrides:{paymentMethods:{online:true,payAtPickup:true}},customerOverrides:{paymentMethod}};
 const f=await checkout({...options,seed:seed(),beforeCustomerTransaction:value=>{rows=value;},beforeStripe:()=>{rows.get('discountCardAssignments/'+aid).status='blocked';}});
 assert.equal(f.result.success,false);assert.equal(f.result.retryable,true);
 const order=f.records.get('orders/ORD-TEST');assert.equal(order.status,'Canceled');assert.equal(order.paymentStatus,'Failed');assert.equal(order.discountReservation,'released');
 assert.equal(f.events.includes('release'),true);assert.equal(f.events.includes('stripe'),false);
 const capacity=[...f.records].filter(([path])=>path.startsWith('checkout_customer_capacity/'));assert.equal(capacity.length,1);assert.equal(capacity[0][1].held,0);
 f.records.get('discountCardAssignments/'+aid).status='active';
 const next=await checkout({...options,seed:[...f.records],orderId:'ORD-RETRY'});
 assert.equal(next.result.success,true,next.result.error);assert.equal(next.records.get('orders/ORD-RETRY').discountReservation,'held');
});
test('lost pickup acceptance response retains card order and hold until reconciliation',async()=>{
 const f=await checkout({seed:seed(),loyaltyToken:token,realReservations:true,fault:'pickup-response',expectedCartDiscount:25,paymentOverrides:{cartDiscountTotal:25,discountTotal:25},locationOverrides:{paymentMethods:{online:true,payAtPickup:true}},customerOverrides:{paymentMethod:'pay_at_pickup'}});
 assert.equal(f.result.success,false);assert.equal(f.result.retryable,false);assert.equal(f.events.includes('release'),false);
 assert.equal(f.records.get('orders/ORD-TEST').status,'Received');assert.equal(f.records.get('orders/ORD-TEST').discountReservation,'held');
});
test('uncertain Stripe session creation retains card reservation and forbids blind retry',async()=>{
 const f=await checkout({seed:seed(),loyaltyToken:token,realReservations:true,stripeError:Object.assign(new Error('response lost'),{type:'StripeConnectionError'}),expectedCartDiscount:25,paymentOverrides:{cartDiscountTotal:25,discountTotal:25}});
 assert.equal(f.result.success,false);assert.equal(f.result.retryable,false);assert.equal(f.events.includes('release'),false);
 assert.equal(f.records.get('orders/ORD-TEST').status,'Pending');assert.equal(f.records.get('orders/ORD-TEST').discountReservation,'held');
});
test('native entitlement read errors retain identity and are never classified as proven revocation',async()=>{
 const db=memoryDb(new Map(seed())),card=await api.readDiscountCardCheckout(db,input),snapshot=api.discountCardCheckoutSnapshot(card,10000,0);
 const unavailable=new Error('native read unavailable');
 await assert.rejects(api.assertDiscountCardCheckoutCurrent(db,input,snapshot,{get:async()=>{throw unavailable;}}),error=>error===unavailable&&error.code===undefined);
 db.rows.get('discountCardGroups/g').version++;
 await assert.rejects(api.assertDiscountCardCheckoutCurrent(db,input,snapshot),error=>error.code==='discount_card_changed');
});
