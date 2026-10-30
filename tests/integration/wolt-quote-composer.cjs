const {test}=require('node:test');const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const mocks={'server-only':{}};
const {quoteDelivery,quoteAddressBinding}=loadTs('src/lib/delivery/quotes/service.ts',mocks);
const {defaultDeliverySettings}=loadTs('src/lib/delivery/settings/schema.ts',mocks);
const {createWoltProvider}=loadTs('src/lib/delivery/providers/wolt/provider.ts',mocks);
const now=Date.parse('2026-10-26T10:00:00Z');
function fixture(){
 const address={country:'DK',postcode:'1300',city:'Copenhagen',street:'Synthetic',building:'1',unit:null};
 const fulfillment={version:1,scope:{brandId:'brand-A',locationId:'location-A'},checkoutRef:'checkout-A',providerId:'wolt',pickup:address,dropoff:address,pickupContact:{name:'Shop',phone:'+4511111111'},dropoffContact:{name:'Recipient',phone:'+4522222222'},instructions:'',readyAt:new Date(now+20*60000).toISOString(),desiredDelivery:{kind:'asap'},items:[{name:'Meal',quantity:1}],bagCount:1,requirements:[]};
 const settings=defaultDeliverySettings();Object.assign(settings,{enabled:true,providerId:'wolt',weeklyHours:settings.weeklyHours.map(d=>({...d,intervals:[{startMinute:0,endMinute:1440}]})),pricingRules:{version:'1',currency:'DKK',taxBasis:'inclusive',maxDistanceMeters:10000,minimumMinor:10000,maximumCustomerFeeMinor:5000,maximumSubsidyMinor:5000,tariff:{kind:'kilometer',baseMinor:2500,includedMeters:2000,perKmMinor:100}}});
 const state={currency:'DKK',network:0,stored:null,body:null};
 const provider=createWoltProvider({environment:'sandbox',now:()=>now,authorizeScope:async()=>true,resolveBinding:async()=>({...fulfillment.scope,provider:'wolt',active:true,revision:'1',environment:'sandbox',merchantId:'merchant-A',venueId:'venue-A',secretRef:'sandbox/merchant-A'}),resolveSecret:async()=> 'synthetic-fixture-secret',saveQuote:async value=>{state.stored=value},loadQuote:async()=>null,validateClaimedAttempt:async()=>false,loadCancellation:async()=>null,fetchImpl:async(_url,opts)=>{state.network++;state.body=JSON.parse(opts.body);return Response.json({id:'promise-A',created_at:'2026-10-26T10:00:00.123456+00:00',valid_until:'2026-10-26T10:05:00.123456+00:00',is_binding:true,price:{amount:4000,currency:state.currency},pickup:{venue_id:'venue-A',eta_minutes:20},dropoff:{eta_minutes:30,options:state.body.scheduled_dropoff_time?{scheduled_time:state.body.scheduled_dropoff_time}:{},location:{coordinates:{lat:55.68,lon:12.58},formatted_address:'Synthetic1'}}},{status:201})}});
 const input={settings,binding:{brandId:'brand-A',locationId:'location-A',checkoutReference:'checkout-A',providerId:'wolt',normalizedAddress:quoteAddressBinding(address,address),cartDigest:'a'.repeat(64),fulfillmentAt:fulfillment.readyAt,brandRevision:1,locationRevision:1},fulfillment,quoteRef:'quote-A',itemSubtotalAfterDiscountMinor:15000,freshnessMs:60000,maxRouteAgeMs:60000,routeProfile:'car'};
 const deps={routing:{source:'verified-route-fixture',resolve:async()=>({kind:'verified',address:{reference:'route-address',latitude:55.68,longitude:12.58}}),route:async()=>({kind:'route',meters:1000,durationSeconds:300})},provider,now:()=>new Date(now),areaAllows:()=>true};
 return {input,deps,state};
}
test('real composer and Wolt facade preserve route provenance, prep, provider cost and distinct customer fee',async()=>{
 const f=fixture(),r=await quoteDelivery(f.input,f.deps);assert.equal(r.ok,true,JSON.stringify(r));assert.equal(f.state.body.min_preparation_time_minutes,20);assert.equal(f.state.body.lat,55.68);assert.equal(f.state.body.street,'Synthetic 1');
 assert.equal(r.quote.fulfillment.dropoff.coordinates.source,'verified-route-fixture');assert.equal(r.quote.economics.route.meters,1000);assert.equal(r.quote.providerQuote.distance,null);assert.equal(r.quote.providerQuote.cost.amountMinor,4000);assert.equal(r.quote.economics.customerFee.amountMinor,2500);assert.equal(r.quote.providerQuote.cost.taxBasis,'inclusive');assert.equal(r.quote.expiresAtMs,now+60000);
});
test('explicit scheduled instant reaches Wolt unchanged and broad windows fail before I/O',async()=>{
 const f=fixture(),at=new Date(now+12*3600000).toISOString();f.input.fulfillment.desiredDelivery={kind:'scheduled',interval:{earliest:at,latest:at}};
 const r=await quoteDelivery(f.input,f.deps);assert.equal(r.ok,true,JSON.stringify(r));assert.equal(f.state.body.scheduled_dropoff_time,at);assert.equal(r.quote.providerQuote.deliveryInterval.earliest,at);
 const other=fixture();other.input.fulfillment.desiredDelivery={kind:'scheduled',interval:{earliest:at,latest:new Date(now+13*3600000).toISOString()}};assert.equal((await quoteDelivery(other.input,other.deps)).reason,'provider_unsupported_schedule');assert.equal(other.state.network,0);
});
test('native phone, preparation and unsupported requirements reject before provider I/O',async()=>{
 for(const mutate of [f=>f.input.fulfillment.dropoffContact.phone='22222222',f=>{f.input.fulfillment.readyAt=new Date(now+61*60000).toISOString();f.input.binding.fulfillmentAt=f.input.fulfillment.readyAt},f=>f.input.fulfillment.requirements=['alcohol']]){
 const f=fixture();mutate(f);assert.equal((await quoteDelivery(f.input,f.deps)).ok,false);assert.equal(f.state.network,0);}
});
test('provider currency cannot silently become customer pricing currency',async()=>{
 const f=fixture();f.state.currency='EUR';const result=await quoteDelivery(f.input,f.deps);assert.equal(result.ok,false);assert.equal(f.state.network,1,JSON.stringify(result));assert.equal(f.state.stored.cost.currency,'EUR');
});
