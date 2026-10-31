const {test}=require('node:test'),assert=require('node:assert/strict');
const {moduleGraph}=require('../helpers/load-ts-graph.cjs');
const input={pickup:{street:'First 1',postalCode:'1300',city:'Copenhagen',countryCode:'DK'},dropoff:{street:'Second 2',postalCode:'1466',city:'Copenhagen',countryCode:'DK'},profile:'car'};
const scope={brandId:'a',locationId:'l'};
function instance(){const load=moduleGraph({'server-only':{}});let calls=0;const adapter=load('src/lib/delivery/routing/receipt.ts').withRouteReceipts({source:'geoapify',resolve:async()=>({kind:'verified',address:{reference:'address',latitude:55,longitude:12}}),route:async()=>{calls++;return {kind:'route',meters:1000,durationSeconds:300};}},'test-only-routing-key');return {resolve:load('src/lib/delivery/routing/service.ts').resolveDeliveryRoute,adapter,calls:()=>calls,load};}
test('isolated route modules reproduce the old cache miss; receipt crosses the boundary without I/O',async()=>{
 const a=instance(),b=instance(),c=instance(),now=Date.now(),deps={scope,now:()=>new Date(now)};
 const preview=await a.resolve(input,{...deps,adapter:a.adapter});assert.ok(preview.receipt);
 await b.resolve(input,{...deps,adapter:b.adapter});assert.equal(b.calls(),1,'process-local map cannot reuse another instance');
 const {result,timings}=await c.load('src/lib/delivery/quotes/performance.ts').withQuoteTimings(()=>c.resolve(input,{...deps,adapter:c.adapter,receipt:preview.receipt}));
 assert.equal(result.route.meters,1000);assert.equal(c.calls(),0);assert.equal(timings.stages.route_receipt_hit.count,1);
});
test('forged, expired, future, foreign scope/address/profile/source/key receipts fall back to trusted routing',async()=>{
 const a=instance(),now=Date.now(),preview=await a.resolve(input,{scope,adapter:a.adapter,now:()=>new Date(now)});
 for(const change of [d=>d.receipt+='x',d=>d.now=()=>new Date(now+30000),d=>d.now=()=>new Date(now-1),d=>d.scope={...scope,brandId:'b'},d=>d.scope={...scope,locationId:'other'},d=>d.input={...input,profile:'bike'},d=>d.input={...input,dropoff:{...input.dropoff,street:'Third 3'}},d=>d.input={...input,pickup:{...input.pickup,street:'Third 3'}},d=>d.adapter={...d.adapter,source:'other'},d=>d.adapter=instance().load('src/lib/delivery/routing/receipt.ts').withRouteReceipts(d.adapter,'rotated-key')]){
  const b=instance(),d={adapter:b.adapter,scope,now:()=>new Date(now),receipt:preview.receipt,input};change(d);const result=await b.resolve(d.input,d);assert.ok(result.ok);assert.equal(b.calls(),1);
 }
});
test('receipt does not slide expiry and route objects cannot poison the cache',async()=>{
 const a=instance(),now=Date.now(),deps={scope,adapter:a.adapter,now:()=>new Date(now)};const p=await a.resolve(input,deps);p.route.meters=1;
 const b=instance();const q=await b.resolve(input,{...deps,adapter:b.adapter,receipt:p.receipt,now:()=>new Date(now+29999)});assert.equal(q.route.meters,1000);
 const c=instance();await c.resolve(input,{...deps,adapter:c.adapter,receipt:p.receipt,now:()=>new Date(now+30000)});assert.equal(c.calls(),1);
});
test('request read reuse is isolated and never persists a rejection into another request',async()=>{
 const {withDeliveryRequest,reuseDeliveryRead}=instance().load('src/lib/delivery/quotes/request-context.ts');let reads=0;
 const read=()=>reuseDeliveryRead('scope-a',async()=>++reads);
 await withDeliveryRequest(async()=>assert.deepEqual(await Promise.all([read(),read()]),[1,1]));
 await withDeliveryRequest(async()=>assert.equal(await read(),2));assert.equal(await read(),3);
});
