const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { policy } = require('../helpers/printing-fixture.cjs');
const schema = loadTs('src/lib/delivery/settings/schema.ts');
const schedule = loadTs('src/lib/delivery/settings/schedule.ts');
const authority = loadTs('src/lib/access/authority.ts', { 'server-only': {} });
function fixture(options = {}) {
  const p = policy(['orderfly.catalog:view', ...(options.readonly ? [] : ['orderfly.catalog:edit'])]);
  if (!options.locationOnly) p.memberships[0].locationIds = null;
  const records = new Map([['platformAdminControl/access-v1',p],['brands/brand',{}],['locations/location',{brandId:'brand'}],['locations/foreign',{brandId:'other'}]]);
  const ref = path => ({path,id:path.split('/').at(-1),collection:name=>({doc:id=>ref(`${path}/${name}/${id}`)})});
  let chain=Promise.resolve(),retried=false; const commits=[];
  const db={collection:name=>({doc:id=>ref(`${name}/${id}`)}),runTransaction(run){const pending=chain.then(async()=>{for(;;){const staged=new Map(structuredClone([...records]));let writing=false;const writes=[];
    const tx={async get(r){assert.equal(writing,false);return {id:r.id,exists:staged.has(r.path),data:()=>structuredClone(staged.get(r.path))};},create(r,v){writing=true;if(options.failAudit&&r.path.includes('/audit/'))throw Error('PRIVATE');assert.equal(staged.has(r.path),false);staged.set(r.path,v);writes.push(r.path);},set(r,v){writing=true;staged.set(r.path,v);writes.push(r.path);}};
    const result=await run(tx);if(options.retry&&!retried){retried=true;options.retry(records);continue;}records.clear();for(const row of staged)records.set(...row);commits.push(writes);return result;}});chain=pending.catch(()=>{});return pending;}};
  const mocks={'server-only':{},'@/lib/access/authority':authority,'./authority':authority,'@/lib/firebase-admin':{getAdminDb:()=>db,getAdminFieldValue:()=>({serverTimestamp:()=>({serverTimestamp:true})})},'@/lib/access/orderfly-session':{verifiedOrderflyIdentity:async()=>{if(options.anonymous)throw new authority.AuthorityError('unauthorized',401);return {provider:'firebase',subject:'writer'};}},'@/lib/url':{getOrigin:async()=> 'https://orderfly.dk'}};
  return {records,commits,service:loadTs('src/lib/delivery/settings/server.ts',mocks),http:loadTs('src/lib/delivery/settings/http.ts',mocks)};
}
const brand = (extra={})=>({scope:'brand',brandId:'brand',locationId:null,expectedRevision:0,settings:schema.defaultDeliverySettings(),...extra});
const local = (extra={})=>({scope:'location',brandId:'brand',locationId:'location',expectedRevision:0,expectedBrandRevision:0,overrides:{paused:true},...extra});
test('brand and local settings read concurrently within the supplied transaction',{timeout:2000},async()=>{
 const f=fixture();let releaseBrand,localRead=false;
 const gate=new Promise(resolve=>{releaseBrand=resolve;});
 const tx={get:async ref=>{
  if(ref.path==='deliverySettings/brand')await gate;
  else {assert.equal(ref.path,'deliverySettings/brand/locations/location');localRead=true;}
  return {exists:false,data:()=>undefined};
 }};
 const pending=f.service.loadDeliverySettingsInTransaction(tx,'brand','location');
 await new Promise(resolve=>setImmediate(resolve));assert.equal(localRead,true);
 releaseBrand();const {result}=await pending;
 assert.equal(result.settings.enabled,false);assert.equal(result.brandRevision,0);assert.equal(result.revision,0);
});
test('settings reject bad dates, overlaps, duplicates, unknown keys and noninteger distances',()=>{
 assert.equal(schema.deliverySettingsSchema.safeParse({...schema.defaultDeliverySettings(),providerId:'future_courier'}).success,true);
 for(const patch of [{maxDistanceMeters:0.5},{providerId:'../test'},{foo:1},{exceptions:[{date:'2026-02-30',intervals:[]}]},{weeklyHours:Array.from({length:7},()=>({day:0,intervals:[]}))}]) assert.equal(schema.deliverySettingsSchema.safeParse({...schema.defaultDeliverySettings(),...patch}).success,false);
 const s=schema.defaultDeliverySettings();s.weeklyHours[0].intervals=[{startMinute:10,endMinute:30},{startMinute:20,endMinute:40}];assert.equal(schema.deliverySettingsSchema.safeParse(s).success,false);
});
test('schedule respects Copenhagen DST, exact closing, exception closed and pause',()=>{
 const s={...schema.defaultDeliverySettings(),enabled:true};s.weeklyHours[0].intervals=[{startMinute:120,endMinute:180}];
 for(const date of ['2026-10-25T00:30:00Z','2026-10-25T01:30:00Z'])assert.equal(schedule.deliveryScheduleAt(s,new Date(date)).open,true);
 assert.equal(schedule.deliveryScheduleAt(s,new Date('2026-10-25T02:00:00Z')).open,false);
 assert.equal(schedule.deliveryScheduleAt(s,new Date('2026-03-29T01:30:00Z')).open,false);
 s.exceptions=[{date:'2026-10-25',intervals:[]}];assert.equal(schedule.deliveryScheduleAt(s,new Date('2026-10-25T00:30:00Z')).open,false);
 s.paused=true;assert.equal(schedule.deliveryScheduleAt(s,new Date()).reason,'paused');
});
test('default read no writes; atomic audited CAS and inheritance reset',async()=>{
 const f=fixture();assert.equal((await f.service.readDeliverySettings({brandId:'brand',locationId:'location'})).revision,0);assert.equal(f.commits.flat().length,0);
 await f.service.writeDeliverySettings(brand());await f.service.writeDeliverySettings(local({expectedBrandRevision:1}));
 assert.equal((await f.service.readDeliverySettings({brandId:'brand',locationId:'location'})).settings.paused,true);
 const reset=await f.service.writeDeliverySettings(local({expectedRevision:1,expectedBrandRevision:1,overrides:{}}));assert.equal(reset.settings.paused,false);assert.ok(reset.inheritedKeys.includes('paused'));
 await assert.rejects(f.service.writeDeliverySettings(local({expectedRevision:2})),/record_conflict/);
 assert.ok(f.records.has('deliverySettings/brand/locations/location/audit/2'));assert.equal(f.service.deliveryDispatchEnabled(),false);
});
test('location-scoped grants cannot change brand or foreign location, readonly cannot write',async()=>{
 const f=fixture({locationOnly:true});await assert.rejects(f.service.writeDeliverySettings(brand()),/forbidden/);await assert.rejects(f.service.writeDeliverySettings(local({locationId:'foreign'})),/forbidden/);await f.service.writeDeliverySettings(local());
 const r=fixture({readonly:true});assert.equal((await r.service.readDeliverySettings({brandId:'brand',locationId:null})).editable,false);await assert.rejects(r.service.writeDeliverySettings(brand()),/forbidden/);
});
test('parallel CAS, revocation retry and audit failure cannot lose updates',async()=>{
 const f=fixture();const results=await Promise.allSettled([f.service.writeDeliverySettings(brand()),f.service.writeDeliverySettings(brand())]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const r=fixture({retry:rows=>rows.get('platformAdminControl/access-v1').principals[0].active=false});await assert.rejects(r.service.writeDeliverySettings(brand()),/forbidden/);assert.equal(r.records.has('deliverySettings/brand'),false);
 const a=fixture({failAudit:true});await assert.rejects(a.service.writeDeliverySettings(brand()),/settings_unavailable/);assert.equal(a.records.has('deliverySettings/brand'),false);
});
test('corrupt stored scope denied and anonymous precedes validation',async()=>{
 const f=fixture();f.records.set('deliverySettings/brand',{schemaVersion:1,brandId:'other',locationId:null,revision:1,settings:schema.defaultDeliverySettings()});await assert.rejects(f.service.readDeliverySettings({brandId:'brand',locationId:null}),/settings_unavailable/);
 await assert.rejects(fixture({anonymous:true}).service.writeDeliverySettings(null),/unauthorized/);
});
test('HTTP origin, bounded input and duplicate queries rejected; valid update no-store',async()=>{
 const f=fixture();const request=(body,origin='https://orderfly.dk')=>new Request('https://orderfly.dk/api/delivery/settings',{method:'PUT',headers:{origin,'content-type':'application/json'},body});
 assert.equal((await f.http.putDeliverySettings(request(JSON.stringify(brand()),'https://evil.test'))).status,403);
 assert.equal((await f.http.putDeliverySettings(request(' '.repeat(65537)))).status,400);
 assert.equal((await f.http.getDeliverySettings(new Request('https://orderfly.dk/api/delivery/settings?brandId=brand&brandId=other'))).status,400);
 const result=await f.http.putDeliverySettings(request(JSON.stringify(brand())));assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store');
});
test('pricing persistence rejects invalid ranges and unknown economic fields; inherits nullable config',async()=>{
 const pricingRules={version:'v1',currency:'DKK',taxBasis:'inclusive',maxDistanceMeters:5000,minimumMinor:10000,maximumCustomerFeeMinor:10000,maximumSubsidyMinor:5000,tariff:{kind:'bands',bands:[{fromMeters:0,toMeters:5000,feeMinor:3500,minimumMinor:10000}]}};
 const f=fixture();await f.service.writeDeliverySettings(brand({settings:{...schema.defaultDeliverySettings(),pricingRules}}));
 const inherited=await f.service.readDeliverySettings({brandId:'brand',locationId:'location'});assert.deepEqual(inherited.settings.pricingRules,pricingRules);assert.ok(inherited.inheritedKeys.includes('pricingRules'));
 await f.service.writeDeliverySettings(local({expectedBrandRevision:1,overrides:{pricingRules:null}}));assert.equal((await f.service.readDeliverySettings({brandId:'brand',locationId:'location'})).settings.pricingRules,null);
 for(const changed of [{...pricingRules,extra:1},{...pricingRules,tariff:{kind:'bands',bands:[{fromMeters:1,toMeters:5000,feeMinor:3500,minimumMinor:10000}]}}])await assert.rejects(f.service.writeDeliverySettings(brand({expectedRevision:1,settings:{...schema.defaultDeliverySettings(),pricingRules:changed}})),/invalid_request/);
});
test('dispatch launch requires explicit flag and valid environment with additional production approval',()=>{
 const keys=['ORDERFLY_DELIVERY_DISPATCH_ENABLED','ORDERFLY_DELIVERY_ENVIRONMENT','ORDERFLY_DELIVERY_PRODUCTION_ENABLED'];const saved=keys.map(k=>process.env[k]);
 try{for(const k of keys)delete process.env[k];const gate=fixture().service.deliveryDispatchEnabled;assert.equal(gate(),false);
 process.env.ORDERFLY_DELIVERY_DISPATCH_ENABLED='true';assert.equal(gate(),false);
 process.env.ORDERFLY_DELIVERY_ENVIRONMENT='sandbox';assert.equal(gate(),true);
 process.env.ORDERFLY_DELIVERY_ENVIRONMENT='production';assert.equal(gate(),false);
 process.env.ORDERFLY_DELIVERY_PRODUCTION_ENABLED='true';assert.equal(gate(),true);
 process.env.ORDERFLY_DELIVERY_DISPATCH_ENABLED='false';assert.equal(gate(),false);
 }finally{keys.forEach((k,i)=>{if(saved[i]===undefined)delete process.env[k];else process.env[k]=saved[i];});}
});
