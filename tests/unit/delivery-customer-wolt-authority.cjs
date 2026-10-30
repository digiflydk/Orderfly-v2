const {test}=require('node:test');const assert=require('node:assert/strict');const {loadTs}=require('../helpers/load-ts.cjs');
function fixture(){
 const key='a'.repeat(64),scope={brandId:'A',locationId:'A1'},addr={country:'DK',postcode:'2300',city:'City',street:'Test',building:'1',unit:null,coordinates:{latitude:55.6,longitude:12.6,source:'fixture'}},fields=a=>[a.country,a.postcode,a.city,a.street,a.building,a.unit];
 const draft={checkoutKeyHash:key,requestDigest:'b'.repeat(64),draftRevision:1,addressRevision:1,itemSubtotalAfterDiscountMinor:10000,bagFeeMinor:0,adminFeeMinor:0,binding:{...scope,checkoutReference:key,providerId:'wolt',normalizedAddress:JSON.stringify([fields(addr),fields(addr)]),cartDigest:'c'.repeat(64),fulfillmentAt:'2026-10-26T12:00:00Z',brandRevision:1,locationRevision:0}};
 const request={version:1,scope,checkoutRef:key,providerId:'wolt',pickup:addr,dropoff:addr,pickupContact:{name:'Store',phone:'+4512345678'},dropoffContact:{name:'Customer',phone:'+4587654321'},instructions:'',readyAt:draft.binding.fulfillmentAt,desiredDelivery:{kind:'asap'},items:[{name:'Pizza',quantity:1}],bagCount:1,requirements:[]};
 const rows=new Map([['deliveryCheckoutDrafts/'+key,{...structuredClone(draft),expiresAt:new Date(Date.now()+600000)}],['brands/A',{name:'Brand'}],['locations/A1',{brandId:'A',isActive:true}]]);
 const settings={enabled:true,paused:false,providerId:'wolt'};let service,capability,network=0,factories=0,enabled=true;
 const tx={get:async ref=>({exists:rows.has(ref.path),data:()=>rows.get(ref.path)})};
 const db={collection:name=>({doc:id=>({path:name+'/'+id})}),runTransaction:async (fn,options)=>{assert.deepEqual(options,{readOnly:true});return fn(tx);}};
 const mocks={'../management-runtime':{deliveryScopeRuntimeAllowed:async()=>enabled},'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db},'../settings/server':{loadDeliverySettingsInTransaction:async()=>({result:{settings,brandRevision:1,revision:0}})},
 './wolt-binding':{createCustomerWoltStorage:async(cap,environment)=>{capability=cap;assert.deepEqual(service.inspectCustomerWoltQuoteCapability(cap),{...scope,environment});await service.authorizeCustomerWoltQuoteInTransaction(tx,cap,scope);return{authorizeScope:async candidate=>{await service.authorizeCustomerWoltQuoteInTransaction(tx,cap,candidate);return true;}};}},
 '../providers/wolt/provider':{createWoltProvider:deps=>{factories++;return{providerId:'wolt',capabilities:{quote:true,create:true},quote:async req=>{assert.equal(await deps.authorizeScope(req.scope),true);network++;return{kind:'unavailable',reason:'capacity'}},create:async()=>{throw Error('write called')},cancel:async()=>{throw Error('write called')},reconcile:async()=>{throw Error('read called')}}}}};
 service=loadTs('src/lib/delivery/integrations/wolt-customer-quote.ts',mocks);
 return{...service,draft,request,rows,settings,deactivate:()=>{enabled=false;},network:()=>network,factories:()=>factories,capability:()=>capability};
}
test('persisted native draft allows quote only; mutations are denied without provider I/O',async()=>{
 const f=fixture(),provider=await f.createCustomerWoltQuoteProvider(f.draft,'sandbox');assert.equal((await provider.quote(f.request)).kind,'unavailable');assert.equal(f.network(),1);
 assert.equal((await provider.create({})).kind,'rejected');assert.equal((await provider.cancel({})).kind,'unsupported');assert.equal((await provider.reconcile({})).kind,'unsupported');assert.equal(f.network(),1);
 assert.throws(()=>f.inspectCustomerWoltQuoteCapability({}),/authority/);
});
test('scope, digest/revision and active location are revalidated after factory creation',async()=>{
 for(const change of [f=>f.rows.get('deliveryCheckoutDrafts/'+f.draft.checkoutKeyHash).requestDigest='d'.repeat(64),f=>f.rows.get('deliveryCheckoutDrafts/'+f.draft.checkoutKeyHash).draftRevision++,f=>f.rows.get('locations/A1').brandId='B',f=>f.rows.get('locations/A1').isActive=false,f=>f.settings.paused=true]){
  const f=fixture(),provider=await f.createCustomerWoltQuoteProvider(f.draft,'sandbox');change(f);await assert.rejects(provider.quote(f.request));assert.equal(f.network(),0);
 }
});
test('expired/missing native drafts and forged scope fail before secret/provider construction',async()=>{
 const missing=fixture();missing.rows.delete('deliveryCheckoutDrafts/'+missing.draft.checkoutKeyHash);await assert.rejects(missing.createCustomerWoltQuoteProvider(missing.draft,'sandbox'));assert.equal(missing.factories(),0);
 const expired=fixture();expired.rows.get('deliveryCheckoutDrafts/'+expired.draft.checkoutKeyHash).expiresAt=new Date(0);await assert.rejects(expired.createCustomerWoltQuoteProvider(expired.draft,'sandbox'));assert.equal(expired.factories(),0);
 const changed=fixture();await assert.rejects(changed.createCustomerWoltQuoteProvider({...changed.draft,binding:{...changed.draft.binding,brandId:'B'}},'sandbox'));assert.equal(changed.factories(),0);
});
test('quote request cannot replace native checkout identity, timing or postal address',async()=>{
 const f=fixture(),provider=await f.createCustomerWoltQuoteProvider(f.draft,'sandbox');
 for(const patch of [{checkoutRef:'other'},{scope:{brandId:'B',locationId:'A1'}},{readyAt:'2026-10-26T13:00:00Z'},{dropoff:{...f.request.dropoff,street:'Different'}}])await assert.rejects(provider.quote({...f.request,...patch}),/request_changed/);
 assert.equal(f.network(),0);f.draft.binding.brandId='B';assert.equal((await provider.quote(f.request)).kind,'unavailable');assert.equal(f.network(),1);
});

test('deactivating scoped enrollment revokes an already minted quote capability before provider I/O',async()=>{
 const f=fixture(),provider=await f.createCustomerWoltQuoteProvider(f.draft,'sandbox');f.deactivate();
 await assert.rejects(provider.quote(f.request),/disabled/);assert.equal(f.network(),0);
});
