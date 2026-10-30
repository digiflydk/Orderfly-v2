const {test}=require('node:test'),assert=require('node:assert/strict');
const {moduleGraph}=require('../helpers/load-ts-graph.cjs');
const load=moduleGraph({'server-only':{}});
const {withQuoteTimings,measureQuoteStep}=load('src/lib/delivery/quotes/performance.ts');
const {quoteTimingsSchema}=load('src/lib/delivery/quotes/performance-schema.ts');

test('timings retain only fixed stage counts/durations without changing result or error',async()=>{
 const result={private:'not in timings'},privateError=Error('private@example.test');
 const measured=await withQuoteTimings(async()=>{
  assert.equal(await measureQuoteStep('configuration',async()=>result),result);
  await assert.rejects(measureQuoteStep('configuration',async()=>{throw privateError;}),e=>e===privateError);
  await measureQuoteStep('private@example.test',async()=>result);
  return result;
 });
 assert.equal(measured.result,result);assert.equal(measured.timings.stages.configuration.count,2);
 assert.ok(quoteTimingsSchema.safeParse(measured.timings).success);
 assert.equal(JSON.stringify(measured.timings).includes('private'),false);
 assert.deepEqual(Object.keys(measured.timings.stages),['configuration']);
});
test('concurrent request contexts cannot mix stages and failed contexts do not leak',{timeout:2000},async()=>{
 let release;const gate=new Promise(resolve=>{release=resolve;});
 const first=withQuoteTimings(()=>measureQuoteStep('routing',async()=>{await gate;return 'first';}));
 const second=await withQuoteTimings(()=>measureQuoteStep('provider',async()=>'second'));
 release();const completed=await first;
 assert.deepEqual(Object.keys(completed.timings.stages),['routing']);
 assert.deepEqual(Object.keys(second.timings.stages),['provider']);
 const error=Error('synthetic');await assert.rejects(withQuoteTimings(()=>measureQuoteStep('claim',async()=>{throw error;})),e=>e===error);
 assert.deepEqual((await withQuoteTimings(async()=>null)).timings.stages,{});
});
test('real routing pipeline contributes only geocode aggregate to request-local timings',async()=>{
 const {resolveDeliveryRoute}=load('src/lib/delivery/routing/service.ts');
 const address={street:'Synthetic 1',postalCode:'2300',city:'Test',countryCode:'DK'};
 const adapter={source:'fixture',resolve:async()=>({kind:'verified',address:{reference:'not-public',latitude:55,longitude:12}}),route:async()=>({kind:'route',meters:100,durationSeconds:60})};
 const measured=await withQuoteTimings(()=>resolveDeliveryRoute({pickup:address,dropoff:address,profile:'car'},{adapter,now:()=>new Date()}));
 assert.equal(measured.result.ok,true);assert.equal(measured.timings.stages.routing_geocode.count,1);
 assert.equal(JSON.stringify(measured.timings).includes('not-public'),false);
});
test('timings schema rejects arbitrary fields, stage names and invalid numeric data',()=>{
 for(const invalid of [
  {serverMs:1,stages:{},customer:'private'},
  {serverMs:1,stages:{unknown:{ms:1,count:1}}},
  {serverMs:1,stages:{routing:{ms:1,count:1,address:'private'}}},
  {serverMs:-1,stages:{}},{serverMs:1.5,stages:{}},
  {serverMs:1,stages:{routing:{ms:NaN,count:1}}},
  {serverMs:1,stages:{routing:{ms:1,count:0}}},
 ])assert.equal(quoteTimingsSchema.safeParse(invalid).success,false);
});
