const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const c=loadTs('src/lib/delivery/provider-contract.ts');
const money={amountMinor:2500,currency:'DKK',taxBasis:'inclusive',taxMinor:500};
const scope={brandId:'brand-a',locationId:'location-a'};
test('money rejects unsafe fractions, negative and inconsistent inclusive tax',()=>{
 assert.ok(c.deliveryMoneySchema.safeParse(money).success);
 for(const patch of [{amountMinor:1.1},{amountMinor:-1},{amountMinor:Number.MAX_SAFE_INTEGER+1},{taxMinor:2501},{currency:'dkk'},{secret:'x'}])assert.equal(c.deliveryMoneySchema.safeParse({...money,...patch}).success,false);
});
test('scope IDs cannot create arbitrary paths; coordinate and intervals bounded',()=>{
 assert.ok(c.deliveryScopeSchema.safeParse(scope).success);
 assert.equal(c.deliveryScopeSchema.safeParse({...scope,brandId:'a/b'}).success,false);
 assert.equal(c.deliveryIntervalSchema.safeParse({earliest:'2026-10-25T12:00:00Z',latest:'2026-10-25T11:00:00Z'}).success,false);
 assert.equal(c.routeDistanceSchema.safeParse({meters:0,method:'route',source:'fixture',profile:'car',calculatedAt:'yesterday'}).success,false);
});
test('create outcomes preserve unknown and reject malformed acceptance and tracking URLs',()=>{
 const error={code:'timeout',messageKey:'delivery.pending',retry:'after_reconciliation',nativeCode:null};
 assert.ok(c.deliveryCreateResultSchema.safeParse({kind:'unknown',attemptRef:'attempt-1',error}).success);
 const accepted={kind:'accepted',providerDeliveryId:'native:123',nativeReference:'123',trackingUrl:'https://tracking.example/a',pickupEstimateProvenance:null,pickupInterval:null,deliveryInterval:null,cost:money};
 assert.ok(c.deliveryCreateResultSchema.safeParse(accepted).success);
 for(const url of ['http://tracking.example','javascript:alert(1)','https://user:pass@tracking.example'])assert.equal(c.deliveryCreateResultSchema.safeParse({...accepted,trackingUrl:url}).success,false);
 assert.equal(c.deliveryCreateResultSchema.safeParse({...accepted,kind:'rejected'}).success,false);
});
test('absence requires evidence and instants; events strict and sequence bounded',()=>{
 assert.equal(c.deliveryReconcileResultSchema.safeParse({kind:'confirmed_absent'}).success,false);
 const e={version:1,scope,providerId:'wolt',eventRef:'evt:1',providerDeliveryId:'native:1',occurredAt:'2026-10-25T12:00:00Z',dispatchedAt:null,receivedAt:'2026-10-25T12:01:00Z',sequence:null,status:'delivered',nativeStatus:'delivered',pickupEstimateProvenance:null,pickupInterval:null,deliveryInterval:null,nativeErrorCode:null};
 assert.ok(c.verifiedDeliveryEventSchema.safeParse(e).success);
 for(const patch of [{sequence:-1},{status:'Paid'},{version:2},{secret:'x'}])assert.equal(c.verifiedDeliveryEventSchema.safeParse({...e,...patch}).success,false);
});
test('create requires durable fulfillment payload with matching scope; cancellation binds fee revision',()=>{
 const addr={country:'DK',postcode:'2300',city:'Copenhagen',street:'Test Street',building:'1',unit:null,coordinates:{latitude:55.6,longitude:12.5,source:'fixture'}};
 const fulfillment={version:1,scope,checkoutRef:'checkout-1',providerId:'wolt',pickup:addr,dropoff:addr,pickupContact:{name:'Store',phone:'123'},dropoffContact:{name:'Customer',phone:'456'},instructions:'',readyAt:'2026-10-25T12:00:00Z',desiredDelivery:{kind:'asap'},items:[{name:'Pizza',quantity:1}],bagCount:1,requirements:[]};
 const req={version:1,scope,providerId:'wolt',orderRef:'order-1',attemptRef:'attempt-1',quoteRef:'quote:1',requestDigest:'a'.repeat(64),readyAt:fulfillment.readyAt,deliveryInterval:null,quotedCost:money,fulfillment};
 assert.ok(c.deliveryCreateRequestSchema.safeParse(req).success);
 assert.equal(c.deliveryCreateRequestSchema.safeParse({...req,readyAt:'2026-10-25T13:00:00Z'}).success,false);
 assert.equal(c.deliveryCreateRequestSchema.safeParse({...req,fulfillment:undefined}).success,false);
 assert.equal(c.deliveryCreateRequestSchema.safeParse({...req,fulfillment:{...fulfillment,scope:{...scope,brandId:'other'}}}).success,false);
 const cancel={scope,providerDeliveryId:'native:1',attemptRef:'attempt-1',operatorReason:'Customer requested cancellation',acceptedFee:money,feeQuoteRef:'fee:1',feeQuoteRevision:1};
 assert.ok(c.deliveryCancelRequestSchema.safeParse(cancel).success);
 assert.equal(c.deliveryCancelRequestSchema.safeParse({...cancel,feeQuoteRevision:null}).success,false);
});
test('provider registry rejects test providers in production and never falls back',()=>{
 const {createDeliveryProviderRegistry}=loadTs('src/lib/delivery/provider-registry.ts',{'server-only':{},'./provider-contract':c});
 const caps={quote:true,create:true,readByProviderId:true,lookupByInternalReference:true,enforcedCreateIdempotency:false,cancellation:false,cancellationPricePreview:false,scheduledDeliveries:false,readyForPickup:false,trackingLinks:false,authenticatedWebhooks:false,sequenceNumbers:false};
 const adapter={providerId:'fixture',capabilities:caps,quote:async()=>{},create:async()=>{},reconcile:async()=>{},cancel:async()=>{}};
 const registry=createDeliveryProviderRegistry([{adapter,mode:'test'}]);
 const evidence={bindingVerified:true,routingVerified:true,pricingApproved:true,compensationVerified:true,providerAcceptanceVerified:true,reconciliation:'provider_lookup'};
 assert.equal(registry.requireReady('fixture','test',evidence).providerId,'fixture');
 assert.throws(()=>registry.requireReady('fixture','production',evidence));
 assert.throws(()=>registry.requireReady('unknown','test',evidence));
 assert.throws(()=>registry.requireReady('fixture','test',{...evidence,routingVerified:false}));
 assert.throws(()=>createDeliveryProviderRegistry([{adapter,mode:'test'},{adapter,mode:'test'}]));
 const byIdOnly=createDeliveryProviderRegistry([{adapter:{...adapter,capabilities:{...caps,lookupByInternalReference:false}},mode:'test'}]);
 assert.throws(()=>byIdOnly.requireReady('fixture','test',evidence));
 assert.equal(byIdOnly.requireReady('fixture','test',{...evidence,reconciliation:'manual'}).providerId,'fixture');
});
test('stored quotes reject changed economics, foreign payload and excessive expiry',()=>{
 const calc=loadTs('src/lib/delivery/pricing/calculate.ts');
 const rulesSchema=loadTs('src/lib/delivery/settings/pricing-schema.ts',{'../pricing/calculate':calc});
 const {storedDeliveryQuoteSchema:s}=loadTs('src/lib/delivery/quotes/schema.ts',{'../provider-contract':c,'../pricing/calculate':calc,'../settings/pricing-schema':rulesSchema,'./digest':loadTs('src/lib/delivery/quotes/digest.ts')});
 const rules={version:'1',currency:'DKK',taxBasis:'inclusive',maxDistanceMeters:5000,minimumMinor:0,maximumCustomerFeeMinor:5000,maximumSubsidyMinor:0,tariff:{kind:'kilometer',baseMinor:2500,includedMeters:5000,perKmMinor:100}};
 const route={meters:1000,method:'route',source:'fixture',profile:'car',calculatedAt:'2026-10-25T12:00:00Z'};
 const cost={amountMinor:2500,currency:'DKK',taxBasis:'inclusive'};
 const addr={country:'DK',postcode:'2300',city:'Copenhagen',street:'Test Street',building:'1',unit:null,coordinates:{latitude:55.6,longitude:12.5,source:'fixture'}};
 const fulfillment={version:1,scope,checkoutRef:'checkout-1',providerId:'wolt',pickup:addr,dropoff:addr,pickupContact:{name:'Store',phone:'123'},dropoffContact:{name:'Customer',phone:'456'},instructions:'',readyAt:route.calculatedAt,desiredDelivery:{kind:'asap'},items:[{name:'Pizza',quantity:1}],bagCount:1,requirements:[]};
 const capabilities={quote:true,create:true,readByProviderId:true,lookupByInternalReference:true,enforcedCreateIdempotency:false,cancellation:false,cancellationPricePreview:false,scheduledDeliveries:false,readyForPickup:false,trackingLinks:false,authenticatedWebhooks:false,sequenceNumbers:false};
 const q={version:1,quoteRef:'q1',providerQuoteRef:'native:1',binding:{...scope,checkoutReference:'checkout-1',providerId:'wolt',normalizedAddress:'test',cartDigest:'a'.repeat(64),fulfillmentAt:route.calculatedAt,brandRevision:1,locationRevision:1},fingerprint:'b'.repeat(64),createdAtMs:Date.parse(route.calculatedAt),expiresAtMs:Date.parse(route.calculatedAt)+60000,fulfillment,providerQuote:{kind:'available',providerId:'wolt',quoteRef:'native:1',cost:money,surcharges:[],expiresAt:null,pickupEstimateProvenance:null,pickupInterval:null,deliveryInterval:null,distance:route,capabilities},economics:calc.calculateDeliveryPrice({rules,route,itemSubtotalAfterDiscountMinor:10000,providerCost:cost}).snapshot};
 q.contentDigest=loadTs('src/lib/delivery/quotes/digest.ts').quoteContentDigest(q);
 assert.ok(s.safeParse(q).success);
 assert.equal(s.safeParse({...q,expiresAtMs:q.createdAtMs+300001}).success,false);
 assert.equal(s.safeParse({...q,fulfillment:{...fulfillment,providerId:'other'}}).success,false);
 assert.equal(s.safeParse({...q,economics:{...q.economics,customerFee:{...cost,amountMinor:1}}}).success,false);
});
test('content digest ignores key order but binds nested fulfillment and rejects non-JSON',()=>{
 const {quoteContentDigest:d}=loadTs('src/lib/delivery/quotes/digest.ts');
 assert.equal(d({a:1,b:{x:2,y:3}}),d({b:{y:3,x:2},a:1}));
 assert.notEqual(d({fulfillment:{instructions:'door'}}),d({fulfillment:{instructions:'reception'}}));
 assert.throws(()=>d({x:undefined}));
 assert.throws(()=>d({x:NaN}));
});
test('ETA-only event can lack occurrence without fabricated fulfillment state',()=>{
 const e={version:1,scope,providerId:'wolt',eventRef:'evt:1',providerDeliveryId:'native:1',occurredAt:null,dispatchedAt:'2026-10-25T12:00:00Z',receivedAt:'2026-10-25T12:01:00Z',sequence:null,status:null,nativeStatus:'eta_updated',pickupEstimateProvenance:{source:'wolt',reliability:'verified_update',observedAt:'2026-10-25T12:01:00Z'},pickupInterval:null,deliveryInterval:null,nativeErrorCode:null};
 assert.ok(c.verifiedDeliveryEventSchema.safeParse(e).success);
});
