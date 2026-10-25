const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {getWoltConnectionHealth,planWoltWebhookConfiguration,WOLT_REQUIRED_EVENTS}=loadTs('src/lib/delivery/providers/wolt/health.ts',{'server-only':{}});
const {woltDiagnostic,woltPickupEtaReliability}=loadTs('src/lib/delivery/providers/wolt/diagnostics.ts',{'server-only':{}});
const scope={brandId:'brand-a',locationId:'location-a'};
const evidence={...scope,environment:'sandbox',active:true,credentialConfigured:true,webhookSecretConfigured:true,checkedAt:1000,authentication:'verified',webhookConfiguration:'matched',merchantKey:'DO-NOT-EXPOSE',callback_url:'https://example.com/private'};
test('health authorizes before read and rejects foreign evidence without leaking config',async()=>{
 let reads=0;
 await assert.rejects(getWoltConnectionHealth(scope,{authorize:async()=>false,readEvidence:async()=>{reads++;return evidence},now:()=>1001}),/FORBIDDEN/);
 assert.equal(reads,0);
 const deps={authorize:async()=>true,readEvidence:async()=>evidence,now:()=>1001};
 const result=await getWoltConnectionHealth(scope,deps);
 assert.equal(result.state,'configured');assert.equal(result.liveDeliveryVerified,false);
 assert.doesNotMatch(JSON.stringify(result),/DO-NOT|callback|merchant/);
 await assert.rejects(getWoltConnectionHealth(scope,{...deps,readEvidence:async()=>({...evidence,brandId:'foreign'})}),/SCOPE_MISMATCH/);
 for(const [changes,state] of [[{checkedAt:1002},'stale'],[{checkedAt:-1},'stale'],[{credentialConfigured:false},'not_configured'],[{authentication:'rejected'},'authentication_failed'],[{webhookConfiguration:'drift'},'needs_attention']]){
   assert.equal((await getWoltConnectionHealth(scope,{...deps,readEvidence:async()=>({...evidence,...changes})})).state,state);
 }
});
const desired={callbackUrl:'https://hooks.example.com/wolt',exponentBase:5,maxRetryCount:3};
const hook={id:'hook-one',callback_url:desired.callbackUrl,disabled:false,subscribed_events:[...WOLT_REQUIRED_EVENTS],callback_config:{exponential_retry_backoff:{exponent_base:5,max_retry_count:3}}};
test('webhook reconciliation never creates duplicates and preserves unknown merchant ownership',()=>{
 assert.deepEqual(planWoltWebhookConfiguration([],desired),{action:'create_required'});
 assert.equal(planWoltWebhookConfiguration([hook],desired).action,'none');
 assert.equal(planWoltWebhookConfiguration([{...hook,disabled:true}],desired).action,'update_required');
 assert.equal(planWoltWebhookConfiguration([{...hook,subscribed_events:[]}],desired).action,'update_required');
 assert.deepEqual(planWoltWebhookConfiguration([hook,{...hook,id:'second'}],desired),{action:'manual_review',reason:'duplicate'});
 assert.deepEqual(planWoltWebhookConfiguration([{...hook,callback_url:'https://other.example.com'}],desired),{action:'manual_review',reason:'ownership'});
 assert.deepEqual(planWoltWebhookConfiguration([],{...desired,ownedWebhookId:'missing'}),{action:'manual_review',reason:'ownership'});
 for(const callbackUrl of ['http://example.com','https://user:password@example.com','https://example.com/?key=secret'])assert.throws(()=>planWoltWebhookConfiguration([],{...desired,callbackUrl}));
});
test('diagnostics correlate without raw personal data and ignore arbitrary native errors',()=>{
 const input={code:'BOOKING_UNKNOWN',quoteRef:'customer@example.com',attemptRef:'attempt',providerDeliveryId:'provider-id',nativeCode:'secret body'};
 const result=woltDiagnostic(input);
 assert.equal(result.requiresReconciliation,true);assert.equal(result.nativeCode,null);
 assert.equal(result.attemptFingerprint,woltDiagnostic({...input,code:'NONE'}).attemptFingerprint);
 assert.doesNotMatch(JSON.stringify(result),/customer@|provider-id|secret body/);
});
test('elapsed time alone never makes pickup ETA reliable',()=>{
 const base={source:'initial_response',eta:'2026-10-26T12:00:00Z',eventOccurredAt:'2026-10-26T11:00:00Z'};
 assert.equal(woltPickupEtaReliability(base).reliableForKitchenTiming,false);
 assert.equal(woltPickupEtaReliability({...base,source:'verified_pickup_eta_update'}).reliableForKitchenTiming,true);
 assert.equal(woltPickupEtaReliability({...base,source:'verified_pickup_eta_update',eventOccurredAt:null}).reliableForKitchenTiming,false);
});
