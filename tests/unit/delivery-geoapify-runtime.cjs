const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {moduleGraph}=require('../helpers/load-ts-graph.cjs');

const scope={brandId:'brand',locationId:'location'};
const draft={binding:{...scope,providerId:'wolt'}};
const defaults={ORDERFLY_DELIVERY_CHECKOUT_ENABLED:'true',ORDERFLY_DELIVERY_ROUTING_ENABLED:'true',
 ORDERFLY_DELIVERY_ENVIRONMENT:'sandbox',ORDERFLY_DELIVERY_GEOAPIFY_ENABLED:'true',
 ORDERFLY_DELIVERY_GEOAPIFY_RETENTION_APPROVED:'true',ORDERFLY_DELIVERY_GEOAPIFY_API_KEY:'synthetic-server-key',
 ORDERFLY_DELIVERY_GEOAPIFY_QUOTA_NAMESPACE:'sandbox-project-global',
 ORDERFLY_DELIVERY_PRODUCTION_ENABLED:undefined,ORDERFLY_DELIVERY_GOOGLE_RETENTION_APPROVED:undefined,
 ORDERFLY_DELIVERY_GOOGLE_MAPS_API_KEY:undefined};
async function withEnvironment(patch,run){
 const values={...defaults,...patch},before=Object.fromEntries(Object.keys(values).map(key=>[key,process.env[key]]));
 try{for(const [key,value]of Object.entries(values)){if(value===undefined)delete process.env[key];else process.env[key]=value;}return await run();}
 finally{for(const[key,value]of Object.entries(before)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
}
function fixture({realRouting=false}={}){
 const calls=[];
 const config={scope:{...scope},environment:'sandbox',routingSource:'geoapify',routingApprovalRef:'sandbox-approval',retentionApprovalRef:'sandbox-retention',
  pickupContact:{name:'Test pickup',phone:'+4512345678',verifiedAt:'2026-10-26T00:00:00Z'}};
 let adopted=true,enabled=true,options,platform=null,enrollment=null,platformError=false;
 const budget={reserveQuote:async()=>{calls.push('quote-budget');return false;},reserveRequest:async()=>{calls.push('request-budget');return null;}};
 const mocks={
  'server-only':{},
  './adoption':{readManagedDeliveryAdoption:async()=>adopted?'managed':'legacy'},
  '../settings/server':{deliveryDispatchEnabled:()=>enabled},
  './settings/server':{deliveryDispatchEnabled:()=>enabled},
  '../management/platform':{getPlatformGeoapifyReadiness:async()=>{if(platformError)throw Error('platform_unavailable');return platform;},getPlatformGeoapifyRuntime:async()=>platform?{...platform,apiKey:defaults.ORDERFLY_DELIVERY_GEOAPIFY_API_KEY}:null},
  '@/lib/firebase-admin':{getAdminDb:()=>({collection:name=>({doc:key=>({path:`${name}/${key}`,get:async()=>{
   assert.equal(name,'deliveryRuntimeConfigs');assert.equal(key,createHash('sha256').update(JSON.stringify([scope.brandId,scope.locationId])).digest('hex'));
   return {exists:true,data:()=>structuredClone(config)};
  }})}),runTransaction:async fn=>fn({get:async ref=>{
   assert.match(ref.path,/^deliveryMerchantEnrollments\//);return {exists:!!enrollment,data:()=>structuredClone(enrollment)};
  }})})},
  '../routing/geoapify/budget':{
   isGeoapifyQuotaNamespace:value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value),
   createGeoapifyBudget:value=>{calls.push('budget-construction');assert.deepEqual(value,{quotaNamespace:defaults.ORDERFLY_DELIVERY_GEOAPIFY_QUOTA_NAMESPACE});return budget;},
  },
  '../routing/geoapify/adapter':{createGeoapifyRoutingAdapter:value=>{calls.push('geoapify-construction');options=value;return {source:'geoapify'};}},
  '../routing/google/adapter':{createGoogleRoutingAdapter:value=>{calls.push('google-construction');options=value;return {source:'google_maps'};}},
  '../integrations/wolt-customer-quote':{createCustomerWoltQuoteProvider:async(value,environment)=>{
   calls.push('provider-construction');assert.equal(value,draft);assert.equal(environment,config.environment);return {providerId:'wolt'};
  }},
 };
 if(realRouting){delete mocks['../routing/geoapify/budget'];delete mocks['../routing/geoapify/adapter'];}
 const runtime=moduleGraph(mocks)('src/lib/delivery/quotes/runtime.ts');
 return {runtime,config,calls,budget,setPlatform:value=>{platform=value;},setEnrollment:value=>{enrollment=value;},failPlatform:()=>{platformError=true;},options:()=>options,disable:()=>{enabled=false;},unadopt:()=>{adopted=false;}};
}

test('Geoapify availability performs configuration reads only; construction forwards durable quotas without consuming them',async()=>{
 await withEnvironment({},async()=>{
  const f=fixture();
  assert.equal(await f.runtime.managedDeliveryRuntimeAvailable(scope),true);assert.deepEqual(f.calls,[]);
  const result=await f.runtime.resolveManagedDeliveryRuntime(scope,draft);
  assert.equal(result.routing.source,'geoapify');assert.equal(result.provider.providerId,'wolt');
  assert.deepEqual(f.calls,['budget-construction','geoapify-construction','provider-construction']);
  assert.equal(f.options().apiKey,defaults.ORDERFLY_DELIVERY_GEOAPIFY_API_KEY);
  assert.equal(f.options().fetch,fetch);
  assert.equal(f.options().reserveQuote,f.budget.reserveQuote);assert.equal(f.options().reserveRequest,f.budget.reserveRequest);
  assert.equal(await f.options().reserveQuote(),false);assert.equal(await f.options().reserveRequest(),null);
 });
});

test('Geoapify requires explicit sandbox opt-in, retention approval, server key and stable quota namespace',async()=>{
 for(const patch of [
  {ORDERFLY_DELIVERY_GEOAPIFY_ENABLED:undefined},{ORDERFLY_DELIVERY_GEOAPIFY_ENABLED:'false'},
  {ORDERFLY_DELIVERY_GEOAPIFY_RETENTION_APPROVED:undefined},{ORDERFLY_DELIVERY_GEOAPIFY_API_KEY:undefined},
  {ORDERFLY_DELIVERY_GEOAPIFY_API_KEY:' '},{ORDERFLY_DELIVERY_GEOAPIFY_API_KEY:'x'.repeat(301)},
  {ORDERFLY_DELIVERY_GEOAPIFY_API_KEY:'bad\u200bkey'},
  {ORDERFLY_DELIVERY_GEOAPIFY_QUOTA_NAMESPACE:undefined},{ORDERFLY_DELIVERY_GEOAPIFY_QUOTA_NAMESPACE:'bad namespace'},
  {ORDERFLY_DELIVERY_GEOAPIFY_QUOTA_NAMESPACE:'../location'},
  {ORDERFLY_DELIVERY_ENVIRONMENT:undefined},
 ])await withEnvironment(patch,async()=>{
  const f=fixture();assert.equal(await f.runtime.managedDeliveryRuntimeAvailable(scope),false);
  assert.equal(await f.runtime.resolveManagedDeliveryRuntime(scope,draft),null);assert.deepEqual(f.calls,[]);
 });
});

test('Geoapify cannot enter production even when every generic production activation gate is enabled',async()=>{
 await withEnvironment({ORDERFLY_DELIVERY_ENVIRONMENT:'production',ORDERFLY_DELIVERY_PRODUCTION_ENABLED:'true'},async()=>{
  const f=fixture();f.config.environment='production';
  assert.equal(await f.runtime.managedDeliveryRuntimeAvailable(scope),false);
  assert.equal(await f.runtime.resolveManagedDeliveryRuntime(scope,draft),null);assert.deepEqual(f.calls,[]);
 });
});

test('Geoapify retains scoped approval, adoption and dispatch requirements',async()=>{
 for(const change of [f=>f.config.scope.brandId='foreign',f=>f.config.routingApprovalRef='',f=>f.config.retentionApprovalRef='',
  f=>f.config.routingSource='unapproved',f=>f.disable(),f=>f.unadopt()])await withEnvironment({},async()=>{
   const f=fixture();change(f);assert.equal(await f.runtime.managedDeliveryRuntimeAvailable(scope),false);
   assert.equal(await f.runtime.resolveManagedDeliveryRuntime(scope,draft),null);assert.deepEqual(f.calls,[]);
  });
 await withEnvironment({},async()=>{const f=fixture();assert.equal(await f.runtime.resolveManagedDeliveryRuntime(scope,{binding:{...draft.binding,locationId:'foreign'}}),null);assert.deepEqual(f.calls,[]);});
});

test('Google keeps its existing independent approval gate and never constructs Geoapify budgets',async()=>{
 await withEnvironment({ORDERFLY_DELIVERY_GEOAPIFY_ENABLED:undefined,ORDERFLY_DELIVERY_GOOGLE_RETENTION_APPROVED:'true',ORDERFLY_DELIVERY_GOOGLE_MAPS_API_KEY:'synthetic-google-key'},async()=>{
  const f=fixture();f.config.routingSource='google_maps';
  assert.equal(await f.runtime.managedDeliveryRuntimeAvailable(scope),true);assert.deepEqual(f.calls,[]);
  assert.equal((await f.runtime.resolveManagedDeliveryRuntime(scope,draft)).routing.source,'google_maps');
  assert.equal(f.options().apiKey,'synthetic-google-key');assert.deepEqual(f.calls,['google-construction','provider-construction']);
  delete process.env.ORDERFLY_DELIVERY_GOOGLE_RETENTION_APPROVED;
  assert.equal(await f.runtime.managedDeliveryRuntimeAvailable(scope),false);
 });
});


test('actual Geoapify adapter and durable budget construct without quota reads or outbound requests',async()=>{
 await withEnvironment({},async()=>{
  const f=fixture({realRouting:true});
  assert.equal(await f.runtime.managedDeliveryRuntimeAvailable(scope),true);assert.deepEqual(f.calls,[]);
  const result=await f.runtime.resolveManagedDeliveryRuntime(scope,draft);
  assert.equal(result.routing.source,'geoapify');assert.deepEqual(f.calls,['provider-construction']);
  // This fixture permits only configuration reads. The actual durable quota refuses
  // the missing store, so even a valid address never reaches an outbound fetch.
  const originalFetch=globalThis.fetch;let requests=0;
  globalThis.fetch=async()=>{requests++;throw Error('unexpected external request');};
  try{
   const guarded=await f.runtime.resolveManagedDeliveryRuntime(scope,draft);
   assert.deepEqual(await guarded.routing.resolve({street:'Testvej 1',postalCode:'1000',city:'København',countryCode:'DK'}),{kind:'unavailable'});
   assert.equal(requests,0);
  }finally{globalThis.fetch=originalFetch;}
 });
});


test('portal production requires provisioned approved enrollment while sharing platform routing quota',async()=>{
 await withEnvironment({ORDERFLY_DELIVERY_ENVIRONMENT:undefined,ORDERFLY_DELIVERY_GEOAPIFY_ENABLED:undefined},async()=>{
  const f=fixture();f.config.environment='production';
  f.setPlatform({enabled:true,retentionApproved:true,keyConfigured:true,routingApprovalRef:'approved',retentionApprovalRef:'approved',quotaNamespace:defaults.ORDERFLY_DELIVERY_GEOAPIFY_QUOTA_NAMESPACE});
  const enrollment={version:1,id:createHash('sha256').update(JSON.stringify([scope.brandId,scope.locationId,'production'])).digest('hex'),...scope,environment:'production',displayName:'Test',merchantId:'merchant',venueId:'venue',pickupContact:f.config.pickupContact,status:'active',revision:1,
   secretRefs:{api:'private-reference',webhook:'private-signing-reference'},callbackKey:'a'.repeat(40),callbackStatus:'registered',providerWebhookId:'webhook',connectionStatus:'verified',connectionCheckedAtMs:1,productionApproved:false,operation:null,provisioned:true,createdAtMs:1,updatedAtMs:1};
  f.setEnrollment(enrollment);assert.equal(await f.runtime.managedDeliveryRuntimeAvailable(scope),false);assert.deepEqual(f.calls,[]);
  enrollment.productionApproved=true;f.setEnrollment(enrollment);
  assert.equal(await f.runtime.managedDeliveryRuntimeAvailable(scope),true);assert.deepEqual(f.calls,[]);
  assert.equal((await f.runtime.resolveManagedDeliveryRuntime(scope,draft)).routing.source,'geoapify');
  assert.equal(f.options().reserveQuote,f.budget.reserveQuote);
 });
});

test('malformed platform configuration cannot fall back to otherwise valid legacy environment credentials',async()=>{
 await withEnvironment({},async()=>{const f=fixture();f.failPlatform();assert.equal(await f.runtime.managedDeliveryRuntimeAvailable(scope),false);assert.equal(await f.runtime.resolveManagedDeliveryRuntime(scope,draft),null);assert.deepEqual(f.calls,[]);});
});

test('managed order transaction pins the canonical runtime environment before quote consumption',async()=>{
 await withEnvironment({},async()=>{
  const f=fixture(),reads=[];
  const tx={get:async ref=>{reads.push(ref.path);return ref.path.startsWith('deliveryRuntimeConfigs/')?{exists:true,data:()=>structuredClone(f.config)}:{exists:false,data:()=>undefined};}};
  await f.runtime.assertManagedCheckoutRuntime(tx,scope,'sandbox');
  assert.equal(reads.length,2);assert.deepEqual(f.calls,[]);
  f.config.environment='production';
  await assert.rejects(f.runtime.assertManagedCheckoutRuntime(tx,scope,'sandbox'),/environment_changed/);
  assert.deepEqual(f.calls,[]);
 });
});
