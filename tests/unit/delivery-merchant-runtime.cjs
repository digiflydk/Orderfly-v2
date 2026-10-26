const {test}=require('node:test'),assert=require('node:assert/strict');
const {moduleGraph}=require('../helpers/load-ts-graph.cjs');
const {createHash}=require('node:crypto');
const scope={brandId:'b',locationId:'l'},id=env=>createHash('sha256').update(JSON.stringify(['b','l',env])).digest('hex');
function fixture(){
 const rows=new Map(),reads=[];
 const db={collection:name=>({doc:key=>({path:`${name}/${key}`})}),runTransaction:async fn=>fn({get:async ref=>{reads.push(ref.path);return {exists:rows.has(ref.path),data:()=>structuredClone(rows.get(ref.path))};}})};
 const api=moduleGraph({'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db},'./settings/server':{deliveryDispatchEnabled:()=>false}})('src/lib/delivery/management-runtime.ts');
 const put=(environment,patch={})=>{
  const row={version:1,id:id(environment),...scope,environment,displayName:'Test',merchantId:'merchant',venueId:'venue',pickupContact:{name:'Test',phone:'+4512345678',verifiedAt:'2026-10-26T00:00:00Z'},
   status:'active',revision:1,secretRefs:{api:'private-api-reference',webhook:'private-webhook-reference'},callbackKey:'a'.repeat(40),callbackStatus:'registered',providerWebhookId:'webhook-test',connectionStatus:'verified',connectionCheckedAtMs:1,
   productionApproved:false,operation:null,provisioned:true,createdAtMs:1,updatedAtMs:1,...patch};
  rows.set(`deliveryMerchantEnrollments/${id(environment)}`,row);return row;
 };
 return {api,rows,reads,put};
}
test('native sandbox activation works without global deployment environment flags and remains scope bound',async()=>{
 const f=fixture();f.put('sandbox');assert.equal(await f.api.deliveryScopeRuntimeAllowed(scope,'sandbox','new'),true);
 assert.equal(await f.api.deliveryScopeRuntimeAllowed({...scope,locationId:'foreign'},'sandbox','new'),false);
});
test('stopping or archiving new orders preserves pinned callback, cancellation and recovery',async()=>{
 for(const status of ['inactive','archived']){
  const f=fixture();f.put('sandbox',{status,connectionStatus:'failed',callbackStatus:'unknown'});
  assert.equal(await f.api.deliveryScopeRuntimeAllowed(scope,'sandbox','new'),false);
  for(const purpose of ['recovery','callback','cancel'])assert.equal(await f.api.deliveryScopeRuntimeAllowed(scope,'sandbox',purpose),true);
 }
});
test('production enrollment needs explicit persisted approval and can coexist with sandbox scope',async()=>{
 const f=fixture();f.put('sandbox');const prod=f.put('production');
 assert.equal(await f.api.deliveryScopeRuntimeAllowed(scope,'production','new'),false);
 prod.productionApproved=true;f.rows.set(`deliveryMerchantEnrollments/${id('production')}`,prod);
 assert.equal(await f.api.deliveryScopeRuntimeAllowed(scope,'production','new'),true);
 assert.equal(await f.api.deliveryScopeRuntimeAllowed(scope,'sandbox','recovery'),true);
});
test('malformed, unprovisioned and draft enrollment never grants recovery or new-order authority',async()=>{
 for(const patch of [{revision:0},{provisioned:false},{status:'draft'},{brandId:'foreign'},{secretRefs:{api:null,webhook:null}}]){
  const f=fixture();f.put('sandbox',patch);
  for(const purpose of ['new','recovery','callback','cancel'])assert.equal(await f.api.deliveryScopeRuntimeAllowed(scope,'sandbox',purpose),false);
 }
});
test('new-order environment uses native canonical runtime and inactive records cannot silently fall back',async()=>{
 const f=fixture(),row=f.put('sandbox'),key=createHash('sha256').update(JSON.stringify(['b','l'])).digest('hex');
 f.rows.set(`deliveryRuntimeConfigs/${key}`,{scope,environment:'sandbox'});
 assert.equal(await f.api.enrolledDeliveryEnvironment(scope),'sandbox');
 row.status='inactive';f.rows.set(`deliveryMerchantEnrollments/${id('sandbox')}`,row);
 assert.equal(await f.api.enrolledDeliveryEnvironment(scope),null);
});
