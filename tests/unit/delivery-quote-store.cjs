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
  return {records,commits,settings:loadTs('src/lib/delivery/settings/server.ts',mocks),service:loadTs('src/lib/delivery/quotes/server.ts',mocks)};
}
const calc=loadTs('src/lib/delivery/pricing/calculate.ts');
const binding=loadTs('src/lib/delivery/quotes/binding.ts');
const {quoteContentDigest}=loadTs('src/lib/delivery/quotes/digest.ts');
const rules={version:'1',currency:'DKK',taxBasis:'inclusive',maxDistanceMeters:5000,minimumMinor:0,maximumCustomerFeeMinor:5000,maximumSubsidyMinor:0,tariff:{kind:'kilometer',baseMinor:2500,includedMeters:5000,perKmMinor:100}};
function quote(){
 const now=Date.now(),at=new Date(now).toISOString(),scope={brandId:'brand',locationId:'location'};
 const route={meters:1000,method:'route',source:'fixture',profile:'car',calculatedAt:at};
 const cost={amountMinor:2500,currency:'DKK',taxBasis:'inclusive'};
 const addr={country:'DK',postcode:'2300',city:'Copenhagen',street:'Test Street',building:'1',unit:null,coordinates:{latitude:55.6,longitude:12.5,source:'fixture'}};
 const fulfillment={version:1,scope,checkoutRef:'checkout-1',providerId:'wolt',pickup:addr,dropoff:addr,pickupContact:{name:'Store',phone:'123'},dropoffContact:{name:'Customer',phone:'456'},instructions:'',readyAt:at,desiredDelivery:{kind:'asap'},items:[{name:'Pizza',quantity:1}],bagCount:1,requirements:[]};
 const capabilities={quote:true,create:true,readByProviderId:true,lookupByInternalReference:false,enforcedCreateIdempotency:false,cancellation:false,cancellationPricePreview:false,scheduledDeliveries:false,readyForPickup:false,trackingLinks:false,authenticatedWebhooks:false,sequenceNumbers:false};
 const q={version:1,quoteRef:'q1',providerQuoteRef:'native:1',binding:{...scope,checkoutReference:'checkout-1',providerId:'wolt',normalizedAddress:'test',cartDigest:'a'.repeat(64),fulfillmentAt:at,brandRevision:1,locationRevision:0},fingerprint:'',createdAtMs:now,expiresAtMs:now+60000,fulfillment,providerQuote:{kind:'available',providerId:'wolt',quoteRef:'native:1',cost:{...cost,taxMinor:null},surcharges:[],expiresAt:null,pickupInterval:null,pickupEstimateProvenance:null,deliveryInterval:null,distance:route,capabilities},economics:calc.calculateDeliveryPrice({rules,route,itemSubtotalAfterDiscountMinor:10000,providerCost:cost}).snapshot};
 q.fingerprint=binding.quoteFingerprint(q.binding);q.contentDigest=quoteContentDigest(q);return q;
}
async function prepared(options={}){const f=fixture(options);f.records.set('deliverySettings/brand',{schemaVersion:1,brandId:'brand',locationId:null,revision:1,settings:{...schema.defaultDeliverySettings(),enabled:true,providerId:'wolt',pricingRules:rules}});return f;}
const read={brandId:'brand',locationId:'location',quoteRef:'q1'};
test('immutable trusted create and scoped read; duplicate cannot overwrite',async()=>{
 const f=await prepared();const q=quote();await f.service.createTrustedDeliveryQuote(q);assert.deepEqual(await f.service.readDeliveryQuote(read),q);
 await assert.rejects(f.service.createTrustedDeliveryQuote(q),/quote_conflict/);assert.equal(f.commits.flat().filter(p=>p==='deliveryQuotes/q1').length,1);
});
test('tampered fingerprint, prices and rules never persist',async()=>{
 for(const alter of [q=>q.fingerprint='b'.repeat(64),q=>q.economics.customerFee.amountMinor++,q=>q.economics.rules.version='other']){
 const f=await prepared(),q=quote();alter(q);await assert.rejects(f.service.createTrustedDeliveryQuote(q),/invalid_quote|quote_changed/);assert.equal(f.records.has('deliveryQuotes/q1'),false);}
});
test('current revisions and policy rechecked on transaction retry',async()=>{
 const f=await prepared({retry:rows=>rows.get('deliverySettings/brand').revision++});await assert.rejects(f.service.createTrustedDeliveryQuote(quote()),/quote_changed/);assert.equal(f.records.has('deliveryQuotes/q1'),false);
 const r=await prepared({retry:rows=>rows.get('platformAdminControl/access-v1').principals[0].active=false});await assert.rejects(r.service.createTrustedDeliveryQuote(quote()),/forbidden/);
});
test('expired, future-created and foreign-scoped quotes fail read/create',async()=>{
 const f=await prepared();const q=quote();q.createdAtMs-=120000;q.expiresAtMs-=120000;q.contentDigest=quoteContentDigest(q);await assert.rejects(f.service.createTrustedDeliveryQuote(q),/quote_expired/);
 f.records.set('deliveryQuotes/q1',q);await assert.rejects(f.service.readDeliveryQuote(read),/quote_expired/);
 const future=quote();future.createdAtMs+=100000;future.expiresAtMs+=100000;future.contentDigest=quoteContentDigest(future);await assert.rejects(f.service.createTrustedDeliveryQuote(future),/quote_expired/);
 await assert.rejects(f.service.readDeliveryQuote({...read,locationId:'foreign'}),/forbidden/);
 const anonymous=await prepared({anonymous:true});await assert.rejects(anonymous.service.createTrustedDeliveryQuote(null),/unauthorized/);
});
test('changing active settings invalidates existing quote without rewriting it',async()=>{
 const f=await prepared();await f.service.createTrustedDeliveryQuote(quote());f.records.get('deliverySettings/brand').revision++;
 await assert.rejects(f.service.readDeliveryQuote(read),/quote_changed/);assert.equal(f.records.get('deliveryQuotes/q1').binding.brandRevision,1);
});
test('self-consistent envelope cannot replace current configured tariff',async()=>{
 const f=await prepared(),q=quote();q.economics.rules.version='unapproved';q.contentDigest=quoteContentDigest(q);
 await assert.rejects(f.service.createTrustedDeliveryQuote(q),/quote_changed/);assert.equal(f.records.has('deliveryQuotes/q1'),false);
});
