const {test}=require('node:test'),assert=require('node:assert/strict');
const {moduleGraph}=require('../helpers/load-ts-graph.cjs');
test('native draft preparation reads settings through a read-only transaction without persistence',async()=>{
 const scope={brandId:'b',locationId:'l'},transactions=[];
 const settings={enabled:true,paused:false,providerId:'wolt',preparationMinutes:20};
 const db={runTransaction:async(run,options)=>{transactions.push(options);assert.deepEqual(options,{readOnly:true});return run({});}};
 const load=moduleGraph({'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db},
  '@/lib/fulfillment-time':{deliveryPreparationMinutes:()=>20,deliveryKitchenOpenAt:()=>true,resolveDeliveryKitchenReadyTime:()=>new Date(Date.now()+1200000).toISOString()},
  '../settings/server':{loadDeliverySettingsInTransaction:async(_tx,brandId,locationId)=>{assert.deepEqual({brandId,locationId},scope);return {result:{settings,brandRevision:1,revision:0}};}},
  './runtime':{managedDeliveryRuntimeEnvironment:async candidate=>{assert.deepEqual(candidate,scope);return 'sandbox';}},
 });
 const {prepareNativeManagedDraft}=load('src/lib/delivery/quotes/customer-controller.ts');
 const result=await prepareNativeManagedDraft({brand:{id:'b',currency:'DKK'},location:{id:'l',brandId:'b',isActive:true,deliveryTypes:['delivery'],street:'Test 1',zipCode:'2300',city:'Copenhagen',country:'DK',openingHours:{}},customer:{name:'Test',email:'test@example.test',phone:'+4512345678',street:'Test 2',zipCode:'2300',city:'Copenhagen'},cartItems:[],payment:{},subtotalAfterDiscount:100,checkoutKey:'a'.repeat(64),deliverySelection:new Date(Date.now()+3600000).toISOString(),freeDeliveryCampaignIds:[]});
 assert.equal(result.draft.binding.brandId,'b');assert.equal(transactions.length,1);
});
