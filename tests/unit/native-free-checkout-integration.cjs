const {test}=require('node:test'),assert=require('node:assert/strict');
const {checkout}=require('../helpers/checkout-fixture.cjs');
const {moduleGraph}=require('../helpers/load-ts-graph.cjs');
const core=moduleGraph({'server-only':{}}),{discountCardAssignmentId}=core('src/lib/loyalty/discount-card/model.ts'),{hashKey}=core('src/lib/loyalty/stamp-card/model.ts');
const token='a'.repeat(64),now=Date.now(),aid=discountCardAssignmentId('b','c');
function seed(){return [
 ['platformAdminControl/access-v1',{principals:[],roles:[],memberships:[],companies:[{id:'co',active:true,locationIds:[],orderflyBrandIds:['b'],opsflyOrganizationId:null}]}],
 ['customers/c',{id:'c',brandId:'b',email:'test@example.test',normalizedEmail:'test@example.test',phone:'12345678',normalizedPhone:'12345678',locationIds:['l'],totalOrders:0,totalSpend:0}],
 ['loyaltyMembers/m',{brandId:'b',companyId:'co',customerId:'c',normalizedEmail:'test@example.test',status:'active',sessionEpoch:0}],
 ['loyaltySessions/'+hashKey('session',token),{brandId:'b',memberId:'m',epoch:0,expiresAt:now+3600000,revokedAt:null}],
 ['discountCardFeatures/b',{brandId:'b',companyId:'co',version:1,enabled:true,locationScope:{mode:'all',locationIds:[]},updatedAt:now}],
 ['discountCardGroups/g',{id:'g',brandId:'b',companyId:'co',version:1,name:'Gratis',percentage:100,active:true,updatedAt:now}],
 ['discountCardAssignments/'+aid,{id:aid,brandId:'b',companyId:'co',customerId:'c',memberId:'m',groupId:'g',version:1,status:'active',startsAt:null,expiresAt:null,updatedAt:now}],
 ];}
async function fixture(options={}){
 let settlement,records,settlementError,providerCalls=0,resolverCalls=0;
 const flag=process.env.ORDERFLY_PRINT_INTENTS_ENABLED;process.env.ORDERFLY_PRINT_INTENTS_ENABLED='true';
 try{
  const f=await checkout({seed:seed(),loyaltyToken:token,realReservations:true,expectedCartDiscount:100,brandOverrides:{bagFee:0,adminFee:0,status:'active',companyRegNo:'12345678',companyName:'Fixture ApS',street:'Testvej 1',zipCode:'2300',city:'København',country:'DK',currency:'DKK'},paymentOverrides:{bagFee:0,cartDiscountTotal:100,discountTotal:100},configureMocks:ctx=>{
   records=ctx.records;records.set('categories/pizza',{isActive:true,locationIds:['l']});
   const printerId='pizza';records.set('locations/l/printers/'+printerId,{schemaVersion:1,configuration:{id:printerId,brandId:'b',locationId:'l',name:'Kitchen',manufacturer:'star',model:'mc-print3',transport:'cloudprnt-http',paperWidthMm:80,state:'paused'},revision:1,deletedAt:null});
   records.set('locations/l/printIntentPolicies/original',{schemaVersion:1,id:'original',brandId:'b',locationId:'l',revision:1,enabled:true,deletedAt:null,targets:[{printerId,printerRevision:1,kinds:['kitchen']}]});
   records.set('locations/l/printerRouting/original',{schemaVersion:1,id:'original',brandId:'b',locationId:'l',revision:1,deletedAt:null,rules:[{id:'pizza',brandId:'b',locationId:'l',printerId,match:{type:'category',id:'pizza'},effect:'include'}]});
   const provider=()=>{providerCalls++;throw Error('Free checkout must never contact a payment provider');};
   ctx.mocks['@/lib/payments/merchant-agreement']={resolveMerchantAgreement:async()=>{resolverCalls++;throw Error('Free checkout must not require merchant keys');},resolveLegacyStripeAgreement:async()=>{resolverCalls++;throw Error('Free checkout must not resolve a legacy gateway');}};
   ctx.mocks['@/lib/payments/worldline-client']={createWorldlineCheckoutSession:provider};ctx.mocks.stripe={default:class{constructor(){provider();}}};
   const native=ctx.marketingDb,run=native.runTransaction;native.runTransaction=cb=>run(async tx=>{let wrote=false;const write=name=>(ref,...args)=>{if(options.failPrint&&ref.path.includes('/jobs/'))throw Error('fixture print write failed');wrote=true;return tx[name](ref,...args);};return cb({...tx,get:ref=>{assert.equal(wrote,false,'all reads precede financial/print writes');return tx.get(ref);},set:write('set'),update:write('update'),create:write('create')});});
   const graph=moduleGraph({react:require('next/dist/compiled/react'),'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>native,getAdminFieldValue:()=>({serverTimestamp:()=>new Date('2026-09-07T00:00:00Z')})},'@/lib/analytics-server':{trackServerEvent:async()=>{}},'@/lib/marketing/config':{paidOrderMarketingEnabled:()=>false},'next/server':{after:()=>{}},stripe:{default:class{constructor(){provider();}}},'@/lib/payments/worldline-client':{createWorldlineCheckoutSession:provider,readWorldlineTransaction:provider},'firebase-admin/firestore':{FieldValue:{serverTimestamp:()=>new Date('2026-09-07T00:00:00Z')}}});
   settlement=graph('src/lib/server/settle-checkout.ts');ctx.mocks['@/lib/server/settle-checkout']={...settlement,settleFreeCheckoutOrder:async id=>{try{return await settlement.settleFreeCheckoutOrder(id);}catch(error){settlementError=error;throw error;}}};
  }});
  return {...f,settlement,settlementError,providerCalls:()=>providerCalls,resolverCalls:()=>resolverCalls,jobs:()=>[...records].filter(([path])=>path.includes('/jobs/'))};
 }finally{if(flag===undefined)delete process.env.ORDERFLY_PRINT_INTENTS_ENABLED;else process.env.ORDERFLY_PRINT_INTENTS_ENABLED=flag;}
}
test('100% discount-card checkout is Paid with native invoice and kitchen print, without provider credentials or sessions',async()=>{
 const f=await fixture();assert.equal(f.result.success,true,f.result.error);const order=f.records.get('orders/ORD-TEST');assert.equal(order.totalAmount,0);assert.equal(order.paymentMethod,'Free');assert.deepEqual(order.freeCheckout,{version:1,kind:'discount_card'});assert.equal(order.paymentStatus,'Paid');assert.equal(order.status,'Received');assert.equal(order.psp,undefined);assert.equal(order.paymentAgreement,undefined);assert.equal(order.invoice.paymentMethod,'Free');assert.equal(order.invoice.totalAmount,0);assert.equal(f.jobs().length,1);assert.equal(f.providerCalls(),0);assert.equal(f.resolverCalls(),0);
 const before=structuredClone([...f.records]),flag=process.env.ORDERFLY_PRINT_INTENTS_ENABLED;process.env.ORDERFLY_PRINT_INTENTS_ENABLED='true';try{assert.equal(await f.settlement.settleFreeCheckoutOrder('ORD-TEST'),false);}finally{if(flag===undefined)delete process.env.ORDERFLY_PRINT_INTENTS_ENABLED;else process.env.ORDERFLY_PRINT_INTENTS_ENABLED=flag;}assert.deepEqual([...f.records],before);assert.equal(f.records.get('customers/c').totalOrders,1);
});
test('late print failure never leaves a partial free invoice, customer purchase or kitchen job',async()=>{const f=await fixture({failPrint:true});assert.equal(f.result.success,false);assert.equal(f.settlementError?.message,'fixture print write failed');const order=f.records.get('orders/ORD-TEST');assert.notEqual(order.paymentStatus,'Paid');assert.equal(order.invoice,undefined);assert.equal(f.jobs().length,0);assert.equal(f.records.get('customers/c').totalOrders,0);assert.equal(f.providerCalls()+f.resolverCalls(),0);});
