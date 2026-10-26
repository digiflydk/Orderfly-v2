const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { policy } = require('../helpers/printing-fixture.cjs');
const schema = loadTs('src/lib/delivery/settings/schema.ts');
const schedule = loadTs('src/lib/delivery/settings/schedule.ts');
const authority = loadTs('src/lib/access/authority.ts', { 'server-only': {} });
function fixture(options = {}) {
  const p = policy(['orderfly.orders:view', ...(options.readonly ? [] : ['orderfly.orders:edit'])]);
  if (!options.locationOnly) p.memberships[0].locationIds = null;
  const records = new Map([['platformAdminControl/access-v1',p],['brands/brand',{}],['locations/location',{brandId:'brand'}],['locations/foreign',{brandId:'other'}]]);
  const ref = path => ({path,id:path.split('/').at(-1),collection:name=>({doc:id=>ref(`${path}/${name}/${id}`)})});
  let chain=Promise.resolve(),retried=false; const commits=[];
  const db={collection:name=>({doc:id=>ref(`${name}/${id}`)}),runTransaction(run){const pending=chain.then(async()=>{for(;;){const staged=new Map(structuredClone([...records]));let writing=false;const writes=[];
    const tx={async get(r){assert.equal(writing,false);return {id:r.id,exists:staged.has(r.path),data:()=>structuredClone(staged.get(r.path))};},create(r,v){writing=true;if(options.failAudit&&r.path.includes('/audit/'))throw Error('PRIVATE');assert.equal(staged.has(r.path),false);staged.set(r.path,v);writes.push(r.path);},set(r,v){writing=true;staged.set(r.path,v);writes.push(r.path);},update(r,v){writing=true;staged.set(r.path,{...staged.get(r.path),...v});writes.push(r.path);}};
    const result=await run(tx);if(options.retry&&!retried){retried=true;options.retry(records);continue;}records.clear();for(const row of staged)records.set(...row);commits.push(writes);return result;}});chain=pending.catch(()=>{});return pending;}};
  const mocks={'server-only':{},'@/lib/access/authority':authority,'./authority':authority,'@/lib/firebase-admin':{getAdminDb:()=>db,getAdminFieldValue:()=>({serverTimestamp:()=>({serverTimestamp:true})})},'@/lib/access/orderfly-session':{verifiedOrderflyIdentity:async()=>{if(options.anonymous)throw new authority.AuthorityError('unauthorized',401);return {provider:'firebase',subject:'writer'};}},'../booking/dispatcher':{inspectWoltDispatchCapability:()=>{throw new authority.AuthorityError('forbidden');},authorizeWoltDispatchInTransaction:async()=>{throw new authority.AuthorityError('forbidden');}},'@google-cloud/secret-manager':{SecretManagerServiceClient:class {async accessSecretVersion(){if(options.secretHook)options.secretHook(records);if(options.secretError)throw Error('PRIVATE_SECRET');return [{payload:{data:Buffer.from('sandbox_test_key_not_real_123')}}];}}},'@/lib/url':{getOrigin:async()=> 'https://orderfly.dk'}};
  mocks['../integrations/wolt-binding']={loadWoltBindingInTransaction:async()=>({merchantId:'merchant',venueId:'venue',revision:1}),createOrderOperatorWoltStorage:async()=>({})};
  const effects=[];mocks['../providers/wolt/provider']={createWoltProvider:deps=>({cancel:async req=>{const saved=await deps.loadCancellation(req.scope,req.attemptRef);effects.push(req);if(options.networkError)throw Error('SECRET');if(options.afterNetwork)options.afterNetwork(records);return options.result??{kind:'cancelled',fee:null};}})};
  return {records,commits,effects,settings:loadTs('src/lib/delivery/settings/server.ts',mocks),service:loadTs('src/lib/delivery/cancellation/server.ts',mocks)};
}
const {randomUUID}=require('node:crypto');
const scope={brandId:'brand',locationId:'location',orderId:'order'},digest='a'.repeat(64);
const command=(extra={})=>({...scope,requestId:randomUUID(),operatorReason:'Customer requested courier cancellation',...extra});
function prepared(options={}){const f=fixture(options),now=Date.now();
 f.records.set('orders/order',{...scope,deliveryType:'Delivery',status:'Ready',paymentStatus:'Paid',managedDelivery:{version:1,providerId:'wolt',quoteRef:'quote',requestDigest:digest}});
 f.records.set('orders/order/deliveryAttempts/original',{schemaVersion:1,scope,provider:'wolt',intentId:'attempt',reference:'attempt',requestDigest:digest,revision:1,state:'booked',providerDeliveryId:'native',createdAt:now,updatedAt:now});
 f.records.set('orders/order/deliveryDispatchResults/original',{scope,attemptRef:'attempt',providerId:'wolt',requestDigest:digest,result:{kind:'accepted',providerDeliveryId:'native',nativeReference:'wolt-native',trackingUrl:null,pickupInterval:null,deliveryInterval:null,pickupEstimateProvenance:null,cost:null}});
 f.records.set('orders/order/deliveryDispatch/original',{scope,attemptRef:'attempt',requestDigest:digest,environment:'sandbox',binding:{merchantId:'merchant',venueId:'venue',bindingRevision:'1'}});
 return f;
}
process.env.ORDERFLY_DELIVERY_CANCELLATION_ENABLED='true';
test('single native cancellation is audited once; repeat and concurrent requests never redispatch',async()=>{
 const f=prepared(),c=command();assert.deepEqual(await f.service.cancellationAvailability(scope),{available:true,reason:null});
 const results=await Promise.all([f.service.cancelManagedDelivery(c),f.service.cancelManagedDelivery(c)]);assert.ok(results.some(r=>r.state==='cancelled'));assert.equal(f.effects.length,1);
 assert.equal((await f.service.cancelManagedDelivery(command())).state,'cancelled');assert.equal(f.effects.length,1);
 assert.equal(f.records.get('orders/order').paymentStatus,'Paid');assert.equal(f.records.get('orders/order').status,'Ready');
 assert.ok(f.records.has('orders/order/deliveryCancellation/original/audit/requested'));assert.ok(f.records.has('orders/order/deliveryCancellation/original/audit/result'));
 assert.equal((await f.service.cancellationAvailability(scope)).available,false);
 await assert.rejects(f.service.cancelManagedDelivery({...c,operatorReason:'Changed payload'}),/cancellation_conflict/);
});
test('unknown cancellation is never blindly retried or treated as refund',async()=>{
 const f=prepared({networkError:true}),c=command();assert.equal((await f.service.cancelManagedDelivery(c)).state,'unknown');assert.equal((await f.service.cancelManagedDelivery(c)).state,'unknown');assert.equal(f.effects.length,1);
 assert.equal(f.records.get('orders/order').paymentStatus,'Paid');assert.equal([...f.records.keys()].some(p=>p.includes('Refund')),false);
});
test('scope, permission, environment gate and pickup status fail before network',async()=>{
 const denied=prepared({readonly:true});await assert.rejects(denied.service.cancelManagedDelivery(command()),/forbidden/);
 const f=prepared();await assert.rejects(f.service.cancelManagedDelivery(command({locationId:'foreign'})),/forbidden/);
 f.records.set('orders/order/deliveryState/current',{...scope,provider:'wolt',providerDeliveryId:'native',status:'picked_up'});await assert.rejects(f.service.cancelManagedDelivery(command()),/not_cancellable/);assert.equal(f.effects.length,0);
 f.records.delete('orders/order/deliveryState/current');f.records.get('orders/order/deliveryDispatch/original').environment='production';await assert.rejects(f.service.cancelManagedDelivery(command()),/cancellation_disabled/);
});
test('observed outcome survives operator revocation after network without reauthorizing a new operation',async()=>{
 const f=prepared({afterNetwork:rows=>rows.get('platformAdminControl/access-v1').principals[0].active=false});assert.equal((await f.service.cancelManagedDelivery(command())).state,'cancelled');assert.equal(f.effects.length,1);
 await assert.rejects(f.service.cancelManagedDelivery(command()),/forbidden/);
});
test('malformed command and wrong accepted provider identity never dispatch',async()=>{
 const f=prepared();await assert.rejects(f.service.cancelManagedDelivery(command({operatorReason:''})),/invalid_request/);
 f.records.get('orders/order/deliveryDispatchResults/original').result.providerDeliveryId='other';await assert.rejects(f.service.cancelManagedDelivery(command()),/not_cancellable/);assert.equal(f.effects.length,0);
});
test('conflicting pickup-started or delivered evidence after remote cancellation stays unknown for reconciliation',async()=>{
 for(const status of ['courier_to_pickup','delivered']){
 const f=prepared({afterNetwork:rows=>rows.set('orders/order/deliveryState/current',{...scope,provider:'wolt',providerDeliveryId:'native',status})});
 const result=await f.service.cancelManagedDelivery(command());assert.equal(result.state,'unknown');assert.equal(f.records.get('orders/order/deliveryCancellation/original').reconcileRequired,true);assert.equal(f.effects.length,1);
 }
});
test('HTTP requires native session, same origin and bounded JSON before cancellation',async()=>{
 let calls=0;class AuthorityError extends Error{constructor(){super('no');this.status=401;}}
 const service=fixture().service;
 const {POST}=loadTs('src/app/api/delivery/cancel/route.ts',{'server-only':{},'@/lib/access/authority':{AuthorityError},'@/lib/access/orderfly-session':{verifiedOrderflyIdentity:async()=>({})},'@/lib/url':{getOrigin:async()=> 'https://orderfly.dk'},'@/lib/delivery/cancellation/server':{DeliveryCancellationError:service.DeliveryCancellationError,cancelManagedDelivery:async()=>{calls++;return {state:'cancelled',changed:true,feeKnown:false};}}});
 const request=(origin,body)=>new Request('https://orderfly.dk/api/delivery/cancel',{method:'POST',headers:{origin,'content-type':'application/json'},body});
 assert.equal((await POST(request('https://evil.example','{}'))).status,403);
 assert.equal((await POST(request('https://orderfly.dk','x'.repeat(8193)))).status,400);assert.equal(calls,0);
 const response=await POST(request('https://orderfly.dk',JSON.stringify(command())));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(calls,1);
});

test('signed Wolt pickup_started advances native state and blocks cancellation before any provider I/O', async () => {
 const { createHmac } = require('node:crypto');
 const { verifyWoltWebhook } = loadTs('src/lib/delivery/providers/wolt/webhook-verify.ts', { 'server-only': {} });
 const { normalizeWoltEvent } = loadTs('src/lib/delivery/providers/wolt/events.ts', { 'server-only': {} });
 const { planVerifiedDeliveryEvent } = loadTs('src/lib/delivery/events/state.ts');
 const now = Date.parse('2026-10-26T12:00:00Z'), secret = 'synthetic-cancellation-event-test-key';
 const payload = { type: 'order.pickup_started', dispatched_at: '2026-10-26T11:59:00Z', details: { id: 'pickup-event', venue_id: 'venue', wolt_order_reference_id: 'wolt-native' } };
 const parts = [{ alg: 'HS256', typ: 'JWT' }, payload].map(v => Buffer.from(JSON.stringify(v)).toString('base64url'));
 const signature = createHmac('sha256', secret).update(parts.join('.')).digest('base64url');
 const body = Buffer.from(JSON.stringify({ token: [...parts, signature].join('.') }));
 assert.throws(() => verifyWoltWebhook(body, 'foreign-key', now));
 const event = normalizeWoltEvent(verifyWoltWebhook(body, secret, now), 'merchant', new Date(now).toISOString());
 assert.equal(event.status, 'courier_to_pickup');
 const f = prepared();
 const previous = { ...scope, provider: 'wolt', providerDeliveryId: 'native', status: 'booked', occurredAt: null, sequence: null, nativeStatus: 'order.received' };
 assert.equal((await f.service.cancellationAvailability(scope)).available, true);
 const decision = planVerifiedDeliveryEvent(previous, { ...previous, status: event.status, nativeStatus: event.rawStatus, eventId: event.dedupeIdentity, receivedAt: now });
 assert.equal(decision.action, 'apply');
 f.records.set('orders/order/deliveryState/current', decision.snapshot);
 assert.deepEqual(await f.service.cancellationAvailability(scope), { available: false, reason: 'not_cancellable' });
 await assert.rejects(f.service.cancelManagedDelivery(command()), /not_cancellable/);
 assert.equal(f.effects.length, 0);
 assert.equal(f.records.has('orders/order/deliveryCancellation/original'), false);
 assert.equal(f.records.get('orders/order').paymentStatus, 'Paid');
});
