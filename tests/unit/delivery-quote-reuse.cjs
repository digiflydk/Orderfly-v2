const {test}=require('node:test'),assert=require('node:assert/strict');
const {moduleGraph}=require('../helpers/load-ts-graph.cjs');
function fixture(){
 const scope={brandId:'A',locationId:'A1'},key='a'.repeat(64),reads=[],transactions=[];let hook=()=>{},network=0,invalidations=0,enabled=true;
 const ref=path=>({path,id:path.split('/').at(-1),collection:name=>({doc:id=>ref(path+'/'+name+'/'+id)})});
 const rows=new Map([['brands/A',{name:'Brand',currency:'DKK'}],['locations/A1',{brandId:'A',isActive:true,street:'Test 1',zipCode:'2300',city:'City',country:'DK',deliveryTypes:['delivery']}]]);
 const db={collection:name=>({doc:id=>ref(name+'/'+id)}),runTransaction:async(fn,options)=>{transactions.push(options);const writes=[];const tx={get:async r=>{reads.push(r.path);return {exists:rows.has(r.path),data:()=>structuredClone(rows.get(r.path))};},create:(r,v)=>writes.push(()=>rows.set(r.path,structuredClone(v)))};const result=await fn(tx);writes.forEach(f=>f());return result;}};
 const settings={...require('../helpers/load-ts.cjs').loadTs('src/lib/delivery/settings/schema.ts').defaultDeliverySettings(),enabled:true,paused:false,providerId:'wolt',scheduleMode:'manual',weeklyHours:Array.from({length:7},(_,day)=>({day,intervals:[{startMinute:0,endMinute:1440}]})),exceptions:[],timezone:'Europe/Copenhagen'};
 let load;const mocks={react:require('next/dist/compiled/react'),'server-only':{},'next/cache':{unstable_cache:fn=>fn,revalidateTag:()=>invalidations++},'@/lib/firebase-admin':{getAdminDb:()=>db},'../management-runtime':{deliveryScopeRuntimeAllowed:async()=>enabled},'../settings/server':{loadDeliverySettingsInTransaction:async()=>({result:{settings,brandRevision:1,revision:0}})},'@google-cloud/secret-manager':{SecretManagerServiceClient:class{async accessSecretVersion(){return [{payload:{data:Buffer.from('test-only-key')}}];}}},'../providers/wolt/provider':{woltCapabilities:{quote:true},createWoltProvider:deps=>({quote:async request=>{
  assert.equal(await deps.authorizeScope(request.scope),true);const binding=await deps.resolveBinding(request.scope,'wolt');await deps.resolveSecret(binding.secretRef,{environment:'sandbox',merchantId:binding.merchantId});network++;await hook();
  const at=new Date().toISOString();await deps.saveQuote({scope,quoteRef:'promise',fingerprint:'b'.repeat(64),bindingRevision:binding.revision,merchantId:binding.merchantId,venueId:binding.venueId,environment:'sandbox',cost:{amountMinor:3900,currency:'DKK',taxBasis:'inclusive',taxMinor:null},native:{promiseId:'promise',venueId:binding.venueId,validUntil:new Date(Date.now()+120000).toISOString(),fetchedAt:at,dropoff:{coordinates:{lat:55,lon:12},formattedAddress:'Test 1'},scheduledDropoffTime:null,preparationMinutes:20}});
  return {kind:'available',cost:{amountMinor:3900}};
 }})}};
 load=moduleGraph(mocks);const binding=load('src/lib/delivery/integrations/wolt-binding.ts');
 const bindingKey='deliveryProviderBindings/'+binding.woltBindingDocumentId(scope,'sandbox'),merchantKey='deliveryWoltMerchants/'+binding.woltMerchantDocumentId('sandbox','merchant');
 rows.set(bindingKey,{schemaVersion:1,...scope,provider:'wolt',environment:'sandbox',active:true,revision:1,merchantId:'merchant',venueId:'venue',secretRef:'projects/test-project/secrets/orderfly-wolt-sandbox-merchant/versions/1'});
 rows.set(merchantKey,{version:1,...scope,environment:'sandbox',merchantId:'merchant',venueId:'venue',callbackId:'a'.repeat(64),active:true});
 const address={country:'DK',postcode:'2300',city:'City',street:'Test',building:'1',unit:null,coordinates:{latitude:55,longitude:12,source:'fixture'}},fields=a=>[a.country,a.postcode,a.city,a.street,a.building,a.unit];
 const draft={restaurantFingerprint:load('src/lib/delivery/quotes/restaurant-snapshot.ts').restaurantFingerprint({...rows.get('brands/A'),id:'A'},{...rows.get('locations/A1'),id:'A1'}),checkoutKeyHash:key,requestDigest:'b'.repeat(64),draftRevision:1,addressRevision:1,itemSubtotalAfterDiscountMinor:10000,bagFeeMinor:0,adminFeeMinor:0,binding:{...scope,checkoutReference:key,providerId:'wolt',normalizedAddress:JSON.stringify([fields(address),fields(address)]),cartDigest:'c'.repeat(64),fulfillmentAt:new Date(Date.now()+1200000).toISOString(),brandRevision:1,locationRevision:0}};
 const runtimeConfig={scope,environment:'sandbox',routingSource:'fixture',routingApprovalRef:'approved',retentionApprovalRef:'approved',pickupContact:{name:'Store',phone:'+4512345678',verifiedAt:new Date().toISOString()}};
 const configKey='deliveryRuntimeConfigs/'+require('node:crypto').createHash('sha256').update(JSON.stringify(['A','A1'])).digest('hex');rows.set(configKey,runtimeConfig);rows.set(configKey.replace('deliveryRuntimeConfigs','deliveryAdoptions'),{version:1,...scope,mode:'managed'});
 const draftKey='deliveryCheckoutDrafts/'+key;rows.set(draftKey,{...structuredClone(draft),expiresAt:new Date(Date.now()+600000)});
 const request={version:1,scope,checkoutRef:key,providerId:'wolt',pickup:address,dropoff:address,pickupContact:{name:'Store',phone:'+4512345678'},dropoffContact:{name:'Customer',phone:'+4587654321'},instructions:'',readyAt:draft.binding.fulfillmentAt,desiredDelivery:{kind:'asap'},items:[{name:'Pizza',quantity:1}],bagCount:1,requirements:[]};
 return {load,rows,reads,transactions,settings,draft,request,bindingKey,merchantKey,draftKey,configKey,network:()=>network,invalidations:()=>invalidations,hook:fn=>hook=fn,disable:()=>enabled=false,provider:()=>load('src/lib/delivery/integrations/wolt-customer-quote.ts').createCustomerWoltQuoteProvider(draft,'sandbox',runtimeConfig)};
}
test('one native preflight plus final transaction replaces seven reads; quote facade is single-use',async()=>{
 const f=fixture(),p=await f.provider();const {result,timings}=await f.load('src/lib/delivery/quotes/performance.ts').withQuoteTimings(()=>p.quote(f.request));
 assert.equal(result.cost.amountMinor,3900);assert.equal(f.transactions.length,2);assert.deepEqual(f.transactions[0],{readOnly:true});assert.equal(f.transactions[1],undefined);assert.equal(timings.stages.wolt_authority.count,1);assert.equal(timings.stages.wolt_store.count,1);
 assert.equal(f.reads.filter(p=>p===f.draftKey).length,2);assert.equal(f.network(),1);await assert.rejects(p.quote(f.request),/used/);assert.equal(f.network(),1);
});
test('final fresh validation rejects changes while Wolt is awaited, atomically saving no quote',async()=>{
 const changes=[f=>f.rows.get(f.configKey).pickupContact.name='Changed',f=>f.rows.delete(f.configKey.replace('deliveryRuntimeConfigs','deliveryAdoptions')),f=>f.rows.get(f.draftKey).draftRevision++,f=>f.rows.get(f.draftKey).binding.cartDigest='e'.repeat(64),f=>f.rows.get(f.draftKey).binding.normalizedAddress='other',f=>f.rows.get(f.draftKey).binding.fulfillmentAt=new Date().toISOString(),f=>f.rows.get(f.draftKey).expiresAt=new Date(0),f=>f.rows.get('locations/A1').brandId='B',f=>f.rows.get('locations/A1').isActive=false,f=>f.rows.get('locations/A1').street='New 2',f=>f.rows.get('brands/A').bagFee=99,f=>f.settings.paused=true,f=>f.settings.enabled=false,f=>f.disable(),f=>f.rows.get(f.bindingKey).active=false,f=>f.rows.get(f.bindingKey).revision++,f=>f.rows.get(f.bindingKey).secretRef=f.rows.get(f.bindingKey).secretRef.replace('/1','/2'),f=>f.rows.get(f.merchantKey).locationId='other'];
 for(const change of changes){const f=fixture(),p=await f.provider();f.hook(()=>change(f));await assert.rejects(p.quote(f.request));assert.equal(f.network(),1);assert.equal([...f.rows.keys()].some(k=>k.startsWith('deliveryPrivateWoltQuotes/')),false);}
});
test('stale cached restaurant, expired draft and foreign checkout fail before Wolt; changes invalidate cache',async()=>{
 for(const change of [f=>f.rows.get('locations/A1').street='Other 7',f=>f.rows.get(f.draftKey).expiresAt=new Date(0),f=>f.request.checkoutRef='other',f=>f.request.scope={brandId:'B',locationId:'A1'}]){
  const f=fixture(),p=await f.provider();change(f);await assert.rejects(p.quote(f.request));assert.equal(f.network(),0);
 }
 const f=fixture();f.rows.get('brands/A').bagFee=90;await assert.rejects((await f.provider()).quote(f.request));assert.equal(f.invalidations(),1);
});
test('Wolt failure and timeout release capability and cannot produce a quote or permit replay',async()=>{
 for(const name of ['provider_error','TimeoutError']){const f=fixture(),p=await f.provider();f.hook(()=>{throw Error(name);});await assert.rejects(p.quote(f.request));assert.equal([...f.rows.keys()].some(k=>k.startsWith('deliveryPrivateWoltQuotes/')),false);await assert.rejects(p.quote(f.request));assert.equal(f.network(),1);}
});
