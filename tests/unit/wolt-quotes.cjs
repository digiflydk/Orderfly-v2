const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const schedule=loadTs('src/lib/delivery/providers/wolt/schedule.ts',{'server-only':{}});
const {createWoltHttpClient}=loadTs('src/lib/delivery/providers/wolt/http.ts',{'server-only':{}});
const {requestWoltQuote}=loadTs('src/lib/delivery/providers/wolt/quote.ts',{'server-only':{},'./schedule':schedule});
const ctx={baseUrl:'https://daas-public-api.development.dev.woltapi.com',merchantKey:'synthetic-test-only'};
const now=Date.parse('2026-10-25T10:00:00Z');
const input={venueId:'venue-test',address:{street:'Testgade',building:'1',postCode:'1300',city:'Copenhagen'},preparationMinutes:15,parcels:[{count:1}]};
const promise=()=>({id:'promise',created_at:new Date(now).toISOString(),valid_until:new Date(now+60000).toISOString(),is_binding:true,price:{amount:4999,currency:'DKK'},pickup:{venue_id:'venue-test',eta_minutes:20},dropoff:{eta_minutes:40,location:{coordinates:{lat:55.68,lon:12.58},formatted_address:'Testgade 1'}},new_optional_field:'allowed'});
const client=data=>({request:async()=>({ok:true,data,status:201})});
test('fixed host, path and redirects protect credential boundary',async()=>{
 assert.throws(()=>createWoltHttpClient({...ctx,baseUrl:'https://attacker.example'}));
 let calls=0;const c=createWoltHttpClient(ctx,{fetchImpl:async(url,opts)=>{calls++;assert.equal(opts.redirect,'error');return new Response('{}',{status:200})}});
 for(const path of ['//attacker.example','https://attacker.example','/../foo','/v1/foo?x=secret']) assert.equal((await c.request({method:'GET',path,operation:'read'})).ok,false);
 assert.equal(calls,0);
});
test('safe quote retries bounded and auth never retried; reasons redacted',async()=>{
 let n=0;const c=createWoltHttpClient(ctx,{maxReadRetries:2,sleep:async()=>{},fetchImpl:async()=>{n++;return new Response(JSON.stringify({reason:'secret pii',error_code:'GENERIC_INTERNAL_ERROR'}),{status:500})}});
 const result=await c.request({method:'POST',operation:'quote',path:'/v1/venues/venue-test/shipment-promises',body:{}});assert.equal(n,3);assert.equal(result.error.retryClass,'read_only');assert.ok(!JSON.stringify(result).includes('secret pii'));
 n=0;const auth=createWoltHttpClient(ctx,{maxReadRetries:2,fetchImpl:async()=>{n++;return new Response('{}',{status:401})}});assert.equal((await auth.request({method:'GET',operation:'read',path:'/v1/foo'})).error.code,'authentication');assert.equal(n,1);
});
test('write ambiguity never retries, even with dishonest read label',async()=>{
 let n=0;const c=createWoltHttpClient(ctx,{maxReadRetries:2,fetchImpl:async()=>{n++;throw new Error('secret token')}});
 const r=await c.request({method:'POST',operation:'read',path:'/v1/venues/a/deliveries'});assert.equal(n,1);assert.equal(r.error.outcome,'unknown');assert.equal(r.error.retryClass,'after_reconciliation');assert.ok(!JSON.stringify(r).includes('secret token'));
});
test('duplicate delivery and malformed write success are unknown',async()=>{
 for(const [raw,status] of [[JSON.stringify({error_code:'DUPLICATE_ORDER'}),400],['not json',201]]){
 const c=createWoltHttpClient(ctx,{fetchImpl:async()=>new Response(raw,{status})});const r=await c.request({method:'POST',operation:'create',path:'/v1/venues/a/deliveries'});assert.equal(r.error.outcome,'unknown');}
});
test('network timeout aborts and cannot become rejected create',async()=>{
 const c=createWoltHttpClient(ctx,{timeoutMs:5,fetchImpl:async(_,o)=>new Promise((res,rej)=>o.signal.addEventListener('abort',()=>rej(new Error('aborted'))))});
 assert.equal((await c.request({method:'POST',operation:'create',path:'/v1/venues/a/deliveries'})).error.outcome,'unknown');
});
test('binding quote maps authoritative cost, nullable distance and preliminary ETA',async()=>{
 let body;const c={request:async req=>{body=req.body;return {ok:true,data:promise(),status:201}}};const r=await requestWoltQuote(c,input,now);
 assert.equal(r.status,'available');assert.equal(r.cost.amount,4999);assert.equal(r.cost.taxBasis,'inclusive');assert.equal(r.distance,null);assert.equal(r.pickupEtaReliable,false);assert.equal(r.native.dropoff.coordinates.lat,55.68);assert.equal(body.street,'Testgade 1');assert.equal(body.min_preparation_time_minutes,15);assert.equal(body.parcels.length,1);assert.ok(!('scheduled_dropoff_time' in body));
});
test('unbound expired wrong venue malformed currency or fractional cost never available',async()=>{
 const cases=[{is_binding:false},{valid_until:new Date(now).toISOString()},{pickup:{venue_id:'foreign'}},{price:{amount:1.2,currency:'DKK'}},{price:{amount:100,currency:'dkk'}}];
 for(const patch of cases)assert.notEqual((await requestWoltQuote(client({...promise(),...patch}),input,now)).status,'available');
});
test('missing full address prevents HTTP and missing expiry remains null with bounded freshness',async()=>{
 let calls=0;const c={request:async()=>{calls++;return {ok:true,data:promise(),status:201}}};assert.equal((await requestWoltQuote(c,{...input,address:{...input.address,building:''}},now)).status,'error');assert.equal(calls,0);
 const p=promise();delete p.valid_until;const r=await requestWoltQuote(client(p),input,now);assert.equal(r.expiresAt,null);assert.equal(schedule.isWoltQuoteFresh(r.native,now+300001,300000),false);
});
test('scheduled bounds and explicit DST offsets converted without wall-time guessing',()=>{
 for(const delta of [3600000,168*3600000])assert.ok(schedule.woltTiming({...input,scheduledDropoffTime:new Date(now+delta).toISOString()},now).scheduled_dropoff_time);
 for(const delta of [3599999,168*3600000+1])assert.throws(()=>schedule.woltTiming({...input,scheduledDropoffTime:new Date(now+delta).toISOString()},now));
 assert.throws(()=>schedule.woltTiming({...input,scheduledDropoffTime:'2026-10-25T02:30:00'},now));
 assert.equal(schedule.woltInstant('2026-10-25T02:30:00+01:00')-schedule.woltInstant('2026-10-25T02:30:00+02:00'),3600000);
});
test('scheduled response must preserve requested instant and carry preparation',async()=>{
 const at=new Date(now+7200000).toISOString(),p=promise();p.dropoff.options={scheduled_time:at};
 const r=await requestWoltQuote(client(p),{...input,scheduledDropoffTime:at},now);assert.equal(r.status,'available');assert.equal(r.deliveryEstimate.earliest,at);assert.equal(r.native.preparationMinutes,15);
 assert.equal((await requestWoltQuote(client(promise()),{...input,scheduledDropoffTime:at},now)).status,'error');
});
test('transport snapshots credentials and host before external mutation including retries',async()=>{
 const mutable={...ctx};let calls=0;const c=createWoltHttpClient(mutable,{maxReadRetries:1,sleep:async()=>{},fetchImpl:async(url,opts)=>{calls++;assert.equal(new URL(url).origin,ctx.baseUrl);assert.equal(opts.headers.Authorization,'Bearer synthetic-test-only');mutable.baseUrl='https://attacker.example';mutable.merchantKey='changed';return new Response('{}',{status:500})}});mutable.baseUrl='https://attacker.example';mutable.merchantKey='changed';
 await c.request({method:'GET',operation:'read',path:'/v1/test'});assert.equal(calls,2);
});
test('strict calendar and bounded instants reject silent normalization',()=>{
 for(const v of ['2026-02-30T12:00:00Z','2026-02-29T12:00:00Z','2026-01-01T24:00:00Z','2026-01-01T12:00:00+14:30','9999-01-01T12:00:00Z'])assert.throws(()=>schedule.woltInstant(v));
 assert.equal(schedule.woltInstant('2028-02-29T12:00:00Z'),Date.parse('2028-02-29T12:00:00Z'));
});
test('request method path and operation cannot change during retries',async()=>{
 const request={method:'POST',operation:'quote',path:'/v1/venues/a/shipment-promises',body:{}};let calls=0;
 const c=createWoltHttpClient(ctx,{maxReadRetries:1,sleep:async()=>{request.method='DELETE';request.operation='cancel';request.path='/v1/venues/a/deliveries'},fetchImpl:async(url,opts)=>{calls++;assert.equal(new URL(url).pathname,'/v1/venues/a/shipment-promises');assert.equal(opts.method,'POST');return new Response('{}',{status:500})}});
 await c.request(request);assert.equal(calls,2);
});
test('Wolt native microsecond timestamps parse without dropping calendar validation',async()=>{
 assert.equal(schedule.woltInstant('2026-10-25T10:00:00.874850+00:00'),Date.parse('2026-10-25T10:00:00.874Z'));
 const p=promise();p.created_at='2026-10-25T10:00:00.874850+00:00';p.valid_until='2026-10-25T10:01:00.874850+00:00';p.delivery_distance_meters=1200;
 const r=await requestWoltQuote(client(p),input,now);assert.equal(r.status,'available');assert.equal(r.distance,null);assert.throws(()=>schedule.woltInstant('2026-02-30T12:00:00.874850+00:00'));
});
