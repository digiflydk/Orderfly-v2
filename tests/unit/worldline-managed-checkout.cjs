const {test}=require('node:test'),assert=require('node:assert/strict');
const {checkout}=require('../helpers/checkout-fixture.cjs'),{moduleGraph}=require('../helpers/load-ts-graph.cjs');
const graph=moduleGraph({'server-only':{}}),{discountCardAssignmentId}=graph('src/lib/loyalty/discount-card/model.ts'),{hashKey}=graph('src/lib/loyalty/stamp-card/model.ts');
const binding={provider:'worldline',mode:'test',owner:{brandId:'b'},merchantNumber:'T123',revision:1,reference:`projects/orderfly-39325/secrets/orderfly-worldline-${'a'.repeat(64)}-test/versions/1`};
const agreement={...binding,credentials:{merchantNumber:'T123',accessToken:'synthetic',secretToken:'synthetic',md5Key:'synthetic'}};
const acceptance={checkoutKey:'a'.repeat(64),quoteId:'quote',quoteToken:'b'.repeat(64),checkoutFingerprint:'c'.repeat(64),customerFeeMinor:1000,checkoutTotalMinor:11400,currency:'DKK'};
function mocks(state,{zero=false,environment='sandbox'}={}){return ({mocks})=>{
 mocks['@/lib/delivery/quotes/runtime']={managedDeliveryRuntimeAvailable:async()=>true,managedDeliveryRuntimeEnvironment:async()=>environment,assertManagedCheckoutRuntime:async()=>{}};
 mocks['@/lib/delivery/quotes/adoption']={managedDeliveryRequired:async()=>true};
 mocks['@/lib/delivery/quotes/customer-controller']={currentNativeManagedDraft:async input=>{state.draftSubtotal=input.subtotalAfterDiscount;return {binding:{fulfillmentAt:new Date(Date.now()+600000).toISOString()}};}};
 mocks['@/lib/delivery/quotes/customer-store']={prepareCustomerQuoteConsumption:async()=>({quote:{quoteRef:'quote',contentDigest:'d'.repeat(64),binding:{providerId:'wolt'},economics:{customerFee:{amountMinor:zero?0:1000,currency:'DKK'}},expiresAtMs:Date.now()+300000,fulfillment:{readyAt:new Date(Date.now()+600000).toISOString(),desiredDelivery:{kind:'asap'}}},apply:()=>state.consumed++})};
 mocks['@/lib/payments/merchant-agreement']={resolveMerchantAgreement:async()=>{state.resolved++;if(zero)throw Error('zero order must not resolve PSP credentials');return agreement;},resolveLegacyStripeAgreement:async()=>{throw Error('Worldline must not fall back to Stripe');}};
 mocks['@/lib/delivery/payments/stripe-authority']={resolveManagedStripeGateway:async()=>{throw Error('Worldline must not load Stripe account');}};
 const original=mocks['@/lib/payments/worldline-client'];mocks['@/lib/payments/worldline-client']={...original,createWorldlineCheckoutSession:async(keys,mode,input)=>{state.sessions++;state.input=input;return {token:'worldline-session',url:'https://v1.checkout.bambora.com/worldline-session'};}};
};}
test('managed Worldline checkout binds the original merchant and Wolt quote without any Stripe account',async()=>{
 const state={consumed:0,resolved:0,sessions:0};const f=await checkout({deliveryType:'delivery',customerOverrides:{street:'Testvej 1',zipCode:'2300',city:'København'},managedDeliveryAcceptance:acceptance,paymentOverrides:{deliveryFee:10},configureMocks:mocks(state)});
 assert.equal(f.result.success,true,f.result.error);assert.equal(state.input.amountMinor,11400);assert.equal(state.consumed,1);assert.equal(state.sessions,1);const order=f.records.get('orders/ORD-TEST');assert.equal(order.psp.provider,'worldline');assert.equal(order.managedDelivery.providerId,'wolt');assert.equal(order.managedStripeAccount,undefined);assert.equal(order.paymentAgreement.reference,binding.reference);assert.equal(order.paymentStatus,'Pending');assert.ok(f.records.has('worldlineCheckoutExpiryJobs/ORD-TEST'));
});
test('Worldline environment mismatch rejects before order or quote consumption',async()=>{
 const state={consumed:0,resolved:0,sessions:0};const f=await checkout({deliveryType:'delivery',customerOverrides:{street:'Testvej 1',zipCode:'2300',city:'København'},managedDeliveryAcceptance:acceptance,paymentOverrides:{deliveryFee:10},configureMocks:mocks(state,{environment:'production'})});assert.equal(f.result.success,false);assert.equal(state.consumed,0);assert.equal(state.sessions,0);assert.equal(f.records.has('orders/ORD-TEST'),false);
});
test('zero-total managed delivery is rejected clearly before PSP keys, order or quote consumption',async()=>{
 const now=Date.now(),token='a'.repeat(64),aid=discountCardAssignmentId('b','c');const seed=[
 ['platformAdminControl/access-v1',{principals:[],roles:[],memberships:[],companies:[{id:'co',active:true,locationIds:[],orderflyBrandIds:['b'],opsflyOrganizationId:null}]}],
 ['customers/c',{id:'c',brandId:'b',email:'test@example.test',normalizedEmail:'test@example.test',phone:'12345678',normalizedPhone:'12345678',locationIds:['l']}],
 ['loyaltyMembers/m',{brandId:'b',companyId:'co',customerId:'c',normalizedEmail:'test@example.test',status:'active',sessionEpoch:0}],
 ['loyaltySessions/'+hashKey('session',token),{brandId:'b',memberId:'m',epoch:0,expiresAt:now+3600000,revokedAt:null}],
 ['discountCardFeatures/b',{brandId:'b',companyId:'co',version:1,enabled:true,locationScope:{mode:'all',locationIds:[]},updatedAt:now}],
 ['discountCardGroups/g',{id:'g',brandId:'b',companyId:'co',version:1,name:'Free card',percentage:100,active:true,updatedAt:now}],
 ['discountCardAssignments/'+aid,{id:aid,brandId:'b',companyId:'co',customerId:'c',memberId:'m',groupId:'g',version:1,status:'active',startsAt:null,expiresAt:null,updatedAt:now}]];
 const state={consumed:0,resolved:0,sessions:0};const f=await checkout({seed,loyaltyToken:token,deliveryType:'delivery',customerOverrides:{street:'Testvej 1',zipCode:'2300',city:'København'},brandOverrides:{bagFee:0,adminFee:0},paymentOverrides:{deliveryFee:0,cartDiscountTotal:100,discountTotal:100,bagFee:0},managedDeliveryAcceptance:{...acceptance,customerFeeMinor:0,checkoutTotalMinor:1},configureMocks:mocks(state,{zero:true})});
 assert.equal(f.result.success,false);assert.match(f.result.error,/positiv online betaling/);assert.equal(state.draftSubtotal,0);assert.equal(state.resolved,0);assert.equal(state.consumed,0);assert.equal(state.sessions,0);assert.equal(f.records.has('orders/ORD-TEST'),false);
});
