const {test}=require('node:test'),assert=require('node:assert/strict');const {moduleGraph}=require('../helpers/load-ts-graph.cjs');
const {createConfiguredManagedDeliveryRuntimeResolver:create}=moduleGraph({'server-only':{}})('src/lib/delivery/quotes/runtime-configured.ts');
function fixture(){const calls=[];const scope={brandId:'b',locationId:'l'},draft={binding:{...scope,providerId:'wolt'}};const config={scope,environment:'sandbox',routingSource:'approved_fixture',routingApprovalRef:'review-1',retentionApprovalRef:'review-2',pickupContact:{name:'Store',phone:'+4512345678',verifiedAt:'2026-10-26T00:00:00Z'}};const env={ORDERFLY_DELIVERY_CHECKOUT_ENABLED:'true',ORDERFLY_DELIVERY_ROUTING_ENABLED:'true',ORDERFLY_DELIVERY_ENVIRONMENT:'sandbox'};const deps={dispatchEnabled:()=>true,environment:()=>env,loadConfig:async()=>config,hasApprovedRoutingSource:s=>s==='approved_fixture',createRouting:async()=>{calls.push('routing');return {source:'approved_fixture'};},createQuoteProvider:async(c,d)=>{calls.push('provider');assert.equal(d,draft);return {providerId:'wolt'};}};return {scope,draft,config,env,deps,calls};}
test('configuration availability is read only; scoped authority reaches provider only after resolution',async()=>{const f=fixture(),r=create(f.deps);assert.equal(await r.available(f.scope),true);assert.deepEqual(f.calls,[]);const runtime=await r.resolve(f.scope,f.draft);assert.equal(runtime.provider.providerId,'wolt');assert.deepEqual(f.calls,['routing','provider']);});
test('disabled dispatch, scope, environment, approvals and pickup identity fail closed without adapter construction',async()=>{for(const mutate of [f=>f.deps.dispatchEnabled=()=>false,f=>delete f.env.ORDERFLY_DELIVERY_CHECKOUT_ENABLED,f=>f.config.scope={brandId:'other',locationId:'l'},f=>f.config.environment='production',f=>f.config.routingApprovalRef='',f=>f.config.retentionApprovalRef='',f=>f.config.pickupContact.phone='1234',f=>f.config.routingSource='unapproved']){const f=fixture();mutate(f);const r=create(f.deps);assert.equal(await r.available(f.scope),false);assert.equal(await r.resolve(f.scope,f.draft),null);assert.deepEqual(f.calls,[]);}});
test('production requires separate activation and no cross-scope draft reaches provider',async()=>{const f=fixture();f.config.environment=f.env.ORDERFLY_DELIVERY_ENVIRONMENT='production';let r=create(f.deps);assert.equal(await r.available(f.scope),false);f.env.ORDERFLY_DELIVERY_PRODUCTION_ENABLED='true';assert.equal(await r.available(f.scope),true);assert.equal(await r.resolve(f.scope,{binding:{brandId:'other',locationId:'l'}}),null);assert.deepEqual(f.calls,[]);});

test('provider construction rejects a runtime environment changed after authoritative draft preparation',async()=>{const f=fixture(),r=create(f.deps);assert.equal(await r.resolve(f.scope,f.draft,'production'),null);assert.deepEqual(f.calls,[]);assert.ok(await r.resolve(f.scope,f.draft,'sandbox'));});

test('independent adapter initialization overlaps and waits for both before exposing runtime',{timeout:2000},async()=>{
 const f=fixture();let releaseRouting,providerStarted=false,finished=false;
 const routingGate=new Promise(resolve=>{releaseRouting=resolve;});
 f.deps.createRouting=async()=>{await routingGate;return {source:'approved_fixture'};};
 f.deps.createQuoteProvider=async()=>{providerStarted=true;return {providerId:'wolt'};};
 const pending=create(f.deps).resolve(f.scope,f.draft).then(value=>{finished=true;return value;});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(providerStarted,true);assert.equal(finished,false);
 releaseRouting();assert.equal((await pending).provider.providerId,'wolt');
});
test('parallel initialization fails closed when either adapter rejects or has mismatched identity',async()=>{
 for(const change of [f=>f.deps.createRouting=async()=>{throw Error('private');},f=>f.deps.createQuoteProvider=async()=>{throw Error('private');},f=>f.deps.createRouting=async()=>({source:'foreign'}),f=>f.deps.createQuoteProvider=async()=>({providerId:'foreign'})]){
  const f=fixture();change(f);assert.equal(await create(f.deps).resolve(f.scope,f.draft),null);
 }
});

test('routing approval and enrollment reads overlap but both gate adapter construction',{timeout:2000},async()=>{
 const f=fixture();let releaseApproval,enrollmentRead=false;
 const gate=new Promise(resolve=>{releaseApproval=resolve;});
 f.deps.hasApprovedRoutingSource=async()=>{await gate;return true;};
 f.deps.authorizeConfig=async()=>{enrollmentRead=true;return true;};
 const pending=create(f.deps).resolve(f.scope,f.draft);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(enrollmentRead,true);assert.deepEqual(f.calls,[]);
 releaseApproval();assert.ok(await pending);
 for(const denied of ['routing','scope']){
  const g=fixture();g.deps.hasApprovedRoutingSource=async()=>denied!=='routing';g.deps.authorizeConfig=async()=>denied!=='scope';
  assert.equal(await create(g.deps).resolve(g.scope,g.draft),null);assert.deepEqual(g.calls,[]);
 }
});
