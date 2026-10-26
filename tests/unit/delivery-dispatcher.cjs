const {test}=require('node:test');const assert=require('node:assert/strict');const {loadTs}=require('../helpers/load-ts.cjs');
const scope={brandId:'A',locationId:'A1',orderId:'O'};
function fixture(options={}){
 process.env.ORDERFLY_DELIVERY_ENVIRONMENT='sandbox';
 const now=Date.now()-(options.expired?400000:0),ready=new Date(now+600000).toISOString();
 const price={rules:{version:'1',currency:'DKK',taxBasis:'inclusive',maxDistanceMeters:10000,minimumMinor:0,maximumCustomerFeeMinor:5000,maximumSubsidyMinor:5000,tariff:{kind:'kilometer',baseMinor:1000,includedMeters:0,perKmMinor:100}},route:{meters:1000,method:'route',source:'fixture',profile:'car',calculatedAt:new Date(now).toISOString()},itemSubtotalAfterDiscountMinor:10000,providerCost:{amountMinor:2000,currency:'DKK',taxBasis:'inclusive'}};
 const caps={quote:true,create:true,readByProviderId:false,lookupByInternalReference:false,enforcedCreateIdempotency:false,cancellation:true,cancellationPricePreview:false,scheduledDeliveries:true,readyForPickup:false,trackingLinks:true,authenticatedWebhooks:true,sequenceNumbers:false};
 const addr={country:'DK',postcode:'2300',city:'Copenhagen',street:'Test',building:'1',unit:null,coordinates:{latitude:55.6,longitude:12.6,source:'fixture'}};
 const fulfillment={version:1,scope:{brandId:'A',locationId:'A1'},checkoutRef:'C',providerId:'wolt',pickup:addr,dropoff:addr,pickupContact:{name:'Restaurant',phone:'+4512345678'},dropoffContact:{name:'Customer',phone:'+4587654321'},instructions:'',readyAt:ready,desiredDelivery:{kind:'asap'},items:[{name:'Pizza',quantity:1}],bagCount:1,requirements:[]};
 const providerQuote={kind:'available',providerId:'wolt',quoteRef:'native',cost:{...price.providerCost,taxMinor:null},surcharges:[],expiresAt:null,pickupEstimateProvenance:null,pickupInterval:null,deliveryInterval:null,distance:null,capabilities:caps};
 const {quote}=loadTs('src/lib/delivery/quotes/binding.ts').buildQuote({binding:{brandId:'A',locationId:'A1',checkoutReference:'C',providerId:'wolt',normalizedAddress:'DK Test',cartDigest:'a'.repeat(64),fulfillmentAt:ready,brandRevision:1,locationRevision:0},quoteRef:'Q',providerQuoteRef:'native',nowMs:now,freshnessMs:options.quoteLifetime??300000,providerExpiresAtMs:null,price,fulfillment,providerQuote,...(options.campaign?{appliedCampaign:{kind:'native_free_delivery',campaignIds:['CAMPAIGN'],maxDistanceMeters:5000}}:{})});
 const rows=new Map([['orders/O',{brandId:'A',locationId:'A1',status:'Pending',deliveryType:'Delivery',paymentStatus:'Paid',managedDelivery:{version:1,providerId:'wolt',quoteRef:'Q',requestDigest:quote.contentDigest}}],['deliveryQuotes/Q',quote],['deliveryDispatchJobs/O',{version:1,...scope,providerId:'wolt',requestDigest:quote.contentDigest,state:'pending',createdAtMs:now,updatedAtMs:now}]]);
 let lock=Promise.resolve(),network=0,authorizations=0,transactions=0,replays=0;let service;
 const ref=path=>({path,collection:name=>({doc:id=>ref(`${path}/${name}/${id}`)})});
 function collection(name,filters=[]){return {doc:id=>ref(`${name}/${id}`),where:(field,op,value)=>collection(name,[...filters,[field,value]]),limit:count=>({get:async()=>({docs:[...rows].filter(([key,v])=>key.startsWith(name+'/')&&filters.every(([field,value])=>v[field]===value)).slice(0,count).map(([key,v])=>({id:key.split('/').at(-1),data:()=>structuredClone(v)}))})})};}

 const db={collection,runTransaction:run=>{const operation=lock.then(async()=>{transactions++;
  async function attempt(commit){const writes=[];let writing=false;const tx={get:async r=>{assert.equal(writing,false,'reads before writes');const value=rows.get(r.path);return{exists:!!value,data:()=>value&&structuredClone(value)}},create:(r,v)=>{writing=true;assert.equal(rows.has(r.path),false);writes.push(['set',r.path,v])},set:(r,v)=>{writing=true;writes.push(['set',r.path,v])},update:(r,v)=>{writing=true;writes.push(['update',r.path,v])}};
   const result=await run(tx);if(commit){if(options.failClaim&&writes.some(x=>x[1].includes('/deliveryDispatch/')))throw Error('commit failed');for(const[k,p,v]of writes)rows.set(p,k==='update'?{...rows.get(p),...structuredClone(v)}:structuredClone(v));}return result;}
  if(options.retry)await attempt(false);return attempt(true);
 });lock=operation.catch(()=>{});return operation;}};
 const mocks={'../payments/acceptance':{completeManagedDeliveryAcceptance:async()=>{if(options.acceptanceFails)throw Error('acceptance failed');const order=rows.get('orders/O');if(order.paymentStatus==='Paid'&&order.status==='Pending'){order.status='Received';rows.set('orderNotificationJobs/O',{state:'pending'});rows.get('deliveryDispatchJobs/O').acceptanceCompletedAtMs=Date.now();}}},'../payments/refund-worker':{processManagedDeliveryRefund:async()=>{rows.get('deliveryDispatchJobs/O').refundCompletedAtMs=Date.now();}},'../events/wolt-inbox':{replayWoltInboxForReference:async()=>{replays++;if(options.onReplay)options.onReplay(rows,replays);return{nextCursor:options.replayPages&&replays===1?'a'.repeat(64):null}}},'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db},'../settings/server':{deliveryDispatchEnabled:()=>!options.disabled,loadDeliverySettingsInTransaction:async()=>({result:{brandRevision:1,revision:0,settings:{enabled:true,paused:false,providerId:'wolt',pricingRules:price.rules}}})},'../integrations/wolt-binding':{
  loadWoltBindingInTransaction:async(tx,value)=>{assert.deepEqual(Object.keys(value).sort(),['brandId','locationId']);return{merchantId:'M',venueId:'V',revision:1}},createClaimedWoltStorage:async(capability,environment)=>{assert.equal(service.inspectWoltDispatchCapability(capability).environment,environment);await db.runTransaction(tx=>service.authorizeWoltDispatchInTransaction(tx,capability,scope));authorizations++;return{};}},
 '../providers/wolt/provider':{createWoltProvider:deps=>({create:async request=>{assert.equal(rows.get('orders/O/deliveryAttempts/original').state,'submitting');if(options.expireAtPreflight){const originalNow=Date.now;Date.now=()=>now+30001;try{assert.equal(await deps.validateClaimedAttempt(request),false);}finally{Date.now=originalNow;}return{kind:'unknown',attemptRef:request.attemptRef,error:{code:'preflight_failed',messageKey:'preflight_failed',retry:'after_reconciliation',nativeCode:null}};}assert.equal(await deps.validateClaimedAttempt(request),true);assert.equal(await deps.validateClaimedAttempt(request),false);network++;
  if(options.afterWrite)options.afterWrite(rows);if(options.throw)throw Error('lost response');
  if(options.reject)return{kind:'rejected',error:{code:'capacity',messageKey:'capacity',retry:'never',nativeCode:null}};
  return{kind:'accepted',providerDeliveryId:'DELIVERY',nativeReference:'NATIVE',trackingUrl:'https://track.example/1',pickupInterval:null,pickupEstimateProvenance:null,deliveryInterval:null,cost:options.acceptedCost??null};}})}};
 service=loadTs('src/lib/delivery/booking/dispatcher.ts',mocks);
 return{...service,rows,network:()=>network,authorizations:()=>authorizations,transactions:()=>transactions,replays:()=>replays};
}
test('one atomic claim survives transaction retries and concurrent heartbeats without two couriers',async()=>{
 const f=fixture({retry:true});const results=await Promise.allSettled([f.dispatchManagedDelivery(scope),f.dispatchManagedDelivery(scope)]);
 assert.equal(f.network(),1);assert.equal(f.authorizations(),1);assert.ok(results.some(x=>x.status==='fulfilled'&&x.value.state==='booked'));
 assert.equal(f.rows.get('orders/O/deliveryAttempts/original').state,'booked');assert.equal(f.rows.get('orders/O').status,'Received');
 assert.equal(f.rows.get('orderNotificationJobs/O').state,'pending');
 const mapping=[...f.rows].find(([key])=>key.startsWith('deliveryProviderReferences/'))[1];assert.equal(mapping.providerDeliveryId,'DELIVERY');assert.equal(mapping.nativeOrderReference,'NATIVE');assert.equal(mapping.bindingRevision,1);assert.equal(typeof mapping.bindingRevision,'number');
 assert.equal(f.rows.get('orders/O/deliveryDispatchResults/original').result.kind,'accepted');
 const claim=f.rows.get('orders/O/deliveryDispatch/original'),index=f.rows.get('deliveryAttemptReferences/'+claim.attemptRef);assert.equal(index.claimId,claim.claimId);assert.equal(index.orderId,'O');assert.equal(index.requestDigest,claim.requestDigest);
});
test('lost response remains unknown across worker reruns with no blind redispatch',async()=>{
 const f=fixture({throw:true});assert.equal((await f.dispatchManagedDelivery(scope)).state,'unknown');await f.runDeliveryDispatchWorker();
 assert.equal(f.network(),1);assert.equal(f.rows.get('orders/O/deliveryAttempts/original').state,'unknown');assert.equal(f.rows.get('orders/O').status,'Pending');assert.equal(f.rows.has('orderNotificationJobs/O'),false);
});
test('claim commit failure and malformed scope never call provider',async()=>{
 const f=fixture({failClaim:true});await assert.rejects(f.dispatchManagedDelivery(scope),/commit failed/);assert.equal(f.network(),0);assert.equal(f.rows.has('orders/O/deliveryAttempts/original'),false);
 const g=fixture();await assert.rejects(g.dispatchManagedDelivery({...scope,brandId:'B'}));assert.equal(g.network(),0);
 assert.throws(()=>g.inspectWoltDispatchCapability({}),/claim_invalid/);
});
test('late accepted post-refund records proof without reviving order or notifying',async()=>{
 const f=fixture({afterWrite:rows=>{rows.get('orders/O').paymentStatus='Refunded';}});assert.equal((await f.dispatchManagedDelivery(scope)).state,'booked');
 assert.equal(f.rows.get('orders/O').status,'Pending');assert.equal(f.rows.has('orderNotificationJobs/O'),false);assert.equal(f.rows.get('orders/O/deliveryDispatchResults/original').result.kind,'accepted');
 const claim=f.rows.get('orders/O/deliveryDispatch/original'),index=f.rows.get('deliveryAttemptReferences/'+claim.attemptRef);assert.equal(index.claimId,claim.claimId);assert.equal(index.orderId,'O');assert.equal(index.requestDigest,claim.requestDigest);
});
test('disabled feature is inert and definitive rejection persists refund evidence',async()=>{
 const off=fixture({disabled:true});assert.equal((await off.runDeliveryDispatchWorker()).state,'disabled');assert.equal(off.transactions(),0);
 const f=fixture({reject:true});assert.equal((await f.dispatchManagedDelivery(scope)).state,'rejected');assert.equal(f.rows.get('orders/O/deliveryDispatchResults/original').result.kind,'rejected');assert.equal(f.rows.has('orderNotificationJobs/O'),false);
});

test('expired paid quote produces durable no-dispatch rejection for compensation',async()=>{
 const f=fixture({expired:true});assert.equal((await f.dispatchManagedDelivery(scope)).state,'rejected');assert.equal(f.network(),0);
 assert.equal(f.rows.get('deliveryDispatchJobs/O').state,'rejected');const evidence=f.rows.get('orders/O/deliveryDispatchResults/original');
 assert.equal(evidence.result.kind,'rejected');assert.equal(evidence.evidence,'definitive_local_no_dispatch');assert.equal(evidence.claimId,null);assert.equal(f.rows.has('orders/O/deliveryDispatch/original'),false);
});
test('accepted changed cost records explicit exception without changing customer price or booking again',async()=>{
 const f=fixture({acceptedCost:{amountMinor:9900,currency:'DKK',taxBasis:'inclusive',taxMinor:null}});
 assert.equal((await f.dispatchManagedDelivery(scope)).state,'booked');assert.equal(f.network(),1);
 const exception=f.rows.get('orders/O').deliveryCostException;assert.equal(exception.requiresReview,true);assert.equal(exception.acceptedCost.amountMinor,9900);assert.equal(exception.quotedCost.amountMinor,2000);
});

test('stale submitting lease becomes unknown without replaying create',async()=>{
 const f=fixture({throw:true});await f.dispatchManagedDelivery(scope);
 const attempt=f.rows.get('orders/O/deliveryAttempts/original'),job=f.rows.get('deliveryDispatchJobs/O'),claim=f.rows.get('orders/O/deliveryDispatch/original');
 attempt.state='submitting';attempt.revision=1;job.state='submitting';claim.expiresAtMs=0;f.rows.delete('orders/O/deliveryDispatchResults/original');
 const result=await f.runDeliveryDispatchWorker();assert.equal(result.recovered,1);assert.equal(f.network(),1);assert.equal(attempt.state,'submitting');assert.equal(f.rows.get('orders/O/deliveryAttempts/original').state,'unknown');
});

test('early inbox replay persists page cursor and resumes on heartbeat',async()=>{
 const f=fixture({replayPages:true});await f.dispatchManagedDelivery(scope);assert.equal(f.replays(),1);assert.equal(f.rows.get('deliveryDispatchJobs/O').inboxReplayCursor,'a'.repeat(64));assert.equal(f.rows.get('deliveryDispatchJobs/O').inboxReplayCompletedAtMs,null);
 await f.runDeliveryDispatchWorker();assert.equal(f.replays(),2);assert.equal(typeof f.rows.get('deliveryDispatchJobs/O').inboxReplayCompletedAtMs,'number');
 await f.runDeliveryDispatchWorker();assert.equal(f.replays(),2);assert.equal(f.network(),1);
});

test('callback revision change prevents stale replay page from hiding newly arrived events',async()=>{
 const f=fixture({replayPages:true,onReplay:(rows,count)=>{if(count===1){const job=rows.get('deliveryDispatchJobs/O');job.inboxReplayRevision++;job.inboxReplayCursor=null;job.inboxReplayCompletedAtMs=null;}}});
 await f.dispatchManagedDelivery(scope);const job=f.rows.get('deliveryDispatchJobs/O');assert.equal(job.inboxReplayRevision,1);assert.equal(job.inboxReplayCursor,null);assert.equal(job.inboxReplayCompletedAtMs,null);
 await f.runDeliveryDispatchWorker();assert.equal(f.replays(),2);assert.equal(typeof f.rows.get('deliveryDispatchJobs/O').inboxReplayCompletedAtMs,'number');assert.equal(f.network(),1);
});

test('unknown accepted supplier cost is explicit operational review, never inferred from quote',async()=>{
 const f=fixture();await f.dispatchManagedDelivery(scope);const exception=f.rows.get('orders/O').deliveryCostException;assert.equal(exception.reason,'accepted_provider_cost_unknown');assert.equal(exception.acceptedCost,null);assert.equal(exception.requiresReview,true);assert.equal(exception.quotedCost.amountMinor,2000);assert.equal(f.network(),1);
});

test('shared quote expiry during facade setup fails final native permission before network',async()=>{
 const f=fixture({quoteLifetime:30000,expireAtPreflight:true});assert.equal((await f.dispatchManagedDelivery(scope)).state,'unknown');assert.equal(f.network(),0);assert.equal(f.rows.get('orders/O/deliveryDispatch/original').networkStartedAtMs,null);
});

test('transient preparation failure backs off then blocks poison job without courier retry',async()=>{
 const f=fixture({failClaim:true});let result=await f.runDeliveryDispatchWorker();assert.equal(result.failed,1);let job=f.rows.get('deliveryDispatchJobs/O');assert.equal(job.state,'pending');assert.equal(job.preparationFailures,1);assert.ok(job.nextAttemptAtMs>Date.now());assert.equal(f.network(),0);
 result=await f.runDeliveryDispatchWorker();assert.equal(result.failed,0);assert.equal(f.rows.get('deliveryDispatchJobs/O').preparationFailures,1);
 f.rows.get('deliveryDispatchJobs/O').nextAttemptAtMs=0;await f.runDeliveryDispatchWorker();assert.equal(f.rows.get('deliveryDispatchJobs/O').preparationFailures,2);
 f.rows.get('deliveryDispatchJobs/O').nextAttemptAtMs=0;await f.runDeliveryDispatchWorker();job=f.rows.get('deliveryDispatchJobs/O');assert.equal(job.state,'blocked');assert.equal(job.preparationFailures,3);assert.equal(f.network(),0);
 await f.runDeliveryDispatchWorker();assert.equal(f.rows.get('deliveryDispatchJobs/O').preparationFailures,3);
});

test('native campaign effective price retains base settings authority at claim and final network gate',async()=>{const f=fixture({campaign:true});assert.equal(f.rows.get('deliveryQuotes/Q').economics.customerFee.amountMinor,0);assert.equal((await f.dispatchManagedDelivery(scope)).state,'booked');assert.equal(f.network(),1);});
