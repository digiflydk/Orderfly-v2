const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {optionExperience}=loadTs('src/lib/analytics/option-experience.ts');
const {metricPayload}=loadTs('src/lib/commerce-metrics.ts');
const base={brandId:'b',locationId:'l',sessionId:'s',productId:'p',interactionId:'i',interactionMode:'add'};
const event=(name,extra={})=>({...base,name,...extra});
test('dialog conversion is matched by opening, tenant, session and product, and deduplicated',()=>{
 const result=optionExperience([
  event('option_dialog_opened'),event('option_dialog_opened'),event('option_selection_changed'),event('option_product_added'),event('option_product_added'),
  event('option_dialog_opened',{interactionId:'second'}),
  event('option_product_added',{interactionId:'unmatched'}),event('option_product_added',{brandId:'foreign'}),event('option_product_added',{sessionId:'other'}),event('option_product_added',{productId:'other'}),
  event('option_dialog_opened',{interactionId:undefined}),
 ]);
 assert.deepEqual(result,{editedOpened:0,savedEdits:0,opened:2,changed:1,added:1,withoutAdd:1,offers:0,accepted:0,rejected:0});
});
test('upsell acceptance requires same measured impression; legacy events cannot inflate cohort',()=>{
 const offer=(name,extra={})=>event(name,{upsellId:'offer',...extra});
 const result=optionExperience([offer('upsell_offer_shown'),offer('upsell_accepted'),offer('upsell_accepted'),offer('upsell_accepted',{interactionId:'other'}),offer('upsell_offer_shown',{interactionId:'second'}),offer('upsell_rejected',{interactionId:'second'}),offer('upsell_offer_shown',{interactionId:undefined})]);
 assert.equal(result.offers,2);assert.equal(result.accepted,1);assert.equal(result.rejected,1);
});
test('new telemetry only permits bounded IDs, strips free-text and cannot claim payment',()=>{
 for(const name of ['option_dialog_opened','option_selection_changed','option_product_added']){
  const payload=metricPayload(name,{...base,email:'private@example.test',selectionText:'customer note',interactionId:'valid_123'});
  assert.equal(payload.interactionId,'valid_123');assert.equal(payload.email,undefined);assert.equal(payload.selectionText,undefined);
  assert.equal(metricPayload(name,{interactionId:'private@example.test'}).interactionId,undefined);
 }
 assert.equal(metricPayload('payment_succeeded',{value:100}),null);
 assert.deepEqual(optionExperience([]),{editedOpened:0,savedEdits:0,opened:0,changed:0,added:0,withoutAdd:0,offers:0,accepted:0,rejected:0});
});

test('edits never inflate new-product conversion',()=>{
 const rows=[event('option_dialog_opened',{interactionMode:'edit'}),event('option_product_added',{interactionMode:'edit'}),event('option_dialog_opened'),event('option_product_added',{interactionMode:undefined})];
 const result=optionExperience(rows);assert.equal(result.opened,1);assert.equal(result.added,0);assert.equal(result.editedOpened,1);assert.equal(result.savedEdits,1);
});

test('collection transport persists matching IDs and mode while dropping private free text',async()=>{
 const writes=[];
 const {recordCommerceMetric}=loadTs('src/lib/server/record-commerce-metric.ts',{
  'server-only':{},'@/lib/commerce-metrics':{metricPayload},
  '@/lib/optional-checkout':{optionalCheckoutValue:async fn=>fn()},
  '@/lib/firebase-admin':{getAdminDb:()=>({collection:name=>({doc:id=>({set:async value=>writes.push({name,id,value})})})})},
 });
 const {POST}=loadTs('src/app/api/analytics/collect/route.ts',{
  '@/lib/analytics-origin':{analyticsOriginAllowed:()=>true},'@/lib/commerce-metrics':{metricPayload},'@/lib/server/record-commerce-metric':{recordCommerceMetric},
 });
 const response=await POST(new Request('https://store.test/api/analytics/collect',{method:'POST',body:JSON.stringify({name:'option_dialog_opened',params:{...base,eventId:'event',interactionMode:'edit',customerName:'Private person',selectionText:'private note'}})}));
 assert.equal(response.status,204);assert.equal(writes.length,1);assert.equal(writes[0].name,'analytics_events');
 assert.equal(writes[0].value.interactionId,'i');assert.equal(writes[0].value.interactionMode,'edit');assert.equal(writes[0].value.productId,'p');assert.equal(writes[0].value.customerName,undefined);assert.equal(writes[0].value.selectionText,undefined);assert.equal(writes[0].value.verifiedPayment,false);
});
