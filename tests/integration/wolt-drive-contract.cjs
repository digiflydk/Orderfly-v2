const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHmac}=require('node:crypto');
const {loadTs}=require('../helpers/load-ts.cjs');
const mocks={'server-only':{}};
const {handleWoltWebhook}=loadTs('src/lib/delivery/providers/wolt/webhook-handler.ts',mocks);
const {woltPickupEtaReliability,woltDiagnostic}=loadTs('src/lib/delivery/providers/wolt/diagnostics.ts',mocks);
const {createWoltProvider}=loadTs('src/lib/delivery/providers/wolt/provider.ts',mocks);
const {deliveryQuoteResultSchema}=loadTs('src/lib/delivery/provider-contract.ts',mocks);
const now=Date.parse('2026-10-25T10:00:00Z');
const scope={brandId:'brand-A',locationId:'location-A'};
const address={country:'DK',postcode:'1300',city:'Copenhagen',street:'Synthetic',building:'1',unit:null,coordinates:{latitude:55.68,longitude:12.58,source:'fixture'}};
const request=()=>({version:1,scope,checkoutRef:'checkout-A',providerId:'wolt',pickup:address,dropoff:address,pickupContact:{name:'Test shop',phone:'+4511111111'},dropoffContact:{name:'Test recipient',phone:'+4522222222'},instructions:'',readyAt:'2026-10-25T10:20:00Z',desiredDelivery:{kind:'asap'},items:[{name:'Meal',quantity:1}],bagCount:1,requirements:[]});
function providerFixture(){
 const counts={network:0,secret:0,store:0};
 const deps={environment:'sandbox',now:()=>now,authorizeScope:async()=>true,resolveBinding:async()=>({...scope,provider:'wolt',active:true,revision:'1',environment:'sandbox',merchantId:'merchant-A',venueId:'venue-A',secretRef:'sandbox/merchant-A'}),resolveSecret:async()=>{counts.secret++;return 'synthetic-secret-not-for-logs'},saveQuote:async()=>{counts.store++},loadQuote:async()=>null,validateClaimedAttempt:async()=>false,loadCancellation:async()=>null,
 fetchImpl:async()=>{counts.network++;return Response.json({id:'promise-A',created_at:'2026-10-25T10:00:00.123456+00:00',valid_until:'2026-10-25T10:05:00.123456+00:00',is_binding:true,price:{amount:8625,currency:'DKK'},pickup:{venue_id:'venue-A',eta_minutes:20},dropoff:{eta_minutes:30,location:{coordinates:{lat:55.68,lon:12.58},formatted_address:'Synthetic1'}},delivery_distance_meters:80},{status:201})}};
 return {deps,counts};
}
test('native microsecond quote survives HTTP adapter and shared contract without exposing private fields',async()=>{
 const f=providerFixture(),result=await createWoltProvider(f.deps).quote(request());
 assert.equal(result.kind,'available');assert.equal(deliveryQuoteResultSchema.safeParse(result).success,true);
 assert.equal(result.cost.amountMinor,8625);assert.equal(result.distance,null);
 assert.equal(f.counts.network,1);assert.equal(f.counts.store,1);
 assert.doesNotMatch(JSON.stringify(result),/synthetic-secret|merchant-A|venue-A|secretRef|native/);
});
test('quote refuses create-incompatible boundaries before secrets, network or storage',async()=>{
 for(const change of [r=>r.items[0].quantity=101,r=>r.instructions='x'.repeat(501),r=>{r.instructions='x'.repeat(499);r.dropoff={...r.dropoff,unit:'A'}},r=>r.dropoffContact.phone='invalid']){
  const f=providerFixture(),raw=request();change(raw);
  const result=await createWoltProvider(f.deps).quote(raw);
  assert.equal(result.kind,'error');assert.deepEqual(f.counts,{network:0,secret:0,store:0});
 }
});
test('verified native ETA dispatch passes durable ingestion into operations without invented occurrence or PII',async()=>{
 const secret='synthetic-webhook-only-key';
 const payload={type:'order.pickup_eta_updated',dispatched_at:'2026-10-25T09:59:00.123456+00:00',details:{id:'event-A',venue_id:'venue-A',wolt_order_reference_id:'native-A',pickup:{eta:'2026-10-25T10:20:00.123456+00:00'},phone:'private-number',pin_code:'private-pin'}};
 const parts=[{alg:'HS256',typ:'JWT'},payload].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url'));
 const token=[...parts,createHmac('sha256',secret).update(parts.join('.')).digest('base64url')].join('.');
 const receipts=new Set();let accepted,appends=0;
 const deps={now:()=>now,resolveCallbackBinding:async()=>({merchantId:'merchant-A',active:true,secret}),resolveAttempt:async()=>({...scope,merchantId:'merchant-A',venueId:'venue-A',nativeOrderReference:'native-A',providerDeliveryId:'delivery-A',attemptRef:'attempt-A'}),appendVerifiedEvent:async(_,event)=>{if(receipts.has(event.dedupeIdentity))return 'duplicate';receipts.add(event.dedupeIdentity);accepted=event;appends++;return 'accepted'}};
 const makeRequest=()=>new Request('https://example.test/callback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});
 assert.equal((await handleWoltWebhook(makeRequest(),'callback-key-synthetic',deps)).status,200);
 assert.equal((await handleWoltWebhook(makeRequest(),'callback-key-synthetic',deps)).status,200);assert.equal(appends,1);
 assert.equal(accepted.occurredAt,null);
 const operational=woltPickupEtaReliability({source:'verified_pickup_eta_update',eta:accepted.pickupEstimate.earliest,eventDispatchedAt:accepted.dispatchedAt});
 assert.equal(operational.reliableForKitchenTiming,true);
 assert.doesNotMatch(JSON.stringify({accepted,operational,diagnostic:woltDiagnostic({code:'NONE',providerDeliveryId:'delivery-A'})}),/private-number|private-pin|synthetic-webhook/);
});
