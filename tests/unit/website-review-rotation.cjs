const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),zlib=require('node:zlib');
const {nextBatch}=require('../../preview/esmeralda/adapters/website-reviews.js');
const {loadTs}=require('../helpers/load-ts.cjs');
const {insertWebsiteReviews}=loadTs('src/lib/website-reviews-section.ts');
test('ten reviews appear 3/3/3/1 with no repetition before a fresh cycle',()=>{
 const ids=Array.from({length:10},(_,i)=>String(i));let state,shown=[];
 for(const size of [3,3,3,1]){const r=nextBatch(ids,state,3,()=>0.4);assert.equal(r.batch.length,size);shown.push(...r.batch);state=JSON.parse(JSON.stringify(r.state));}
 assert.equal(new Set(shown).size,10);const next=nextBatch(ids,state,3,()=>0.4);assert.equal(next.batch.length,3);assert.ok(!next.batch.includes(shown[9]));
});
test('mobile, refresh, deleted and newly added reviews retain no-repeat order',()=>{
 let r=nextBatch(['a','b','c'],null,1,()=>0.2);const first=r.batch[0];
 r=nextBatch(['a','b','c','d'],JSON.parse(JSON.stringify(r.state)),1,()=>0.2);assert.notEqual(r.batch[0],first);
 const all=[first,...r.batch];for(let i=0;i<2;i++){r=nextBatch(['a','b','c','d'],r.state,1,()=>0.2);all.push(...r.batch);}assert.equal(new Set(all).size,4);
 r=nextBatch(['new'],r.state,3,()=>0.2);assert.deepEqual(r.batch,['new']);
});
test('zero and small datasets never duplicate cards in a batch; random seed changes ordering',()=>{
 assert.deepEqual(nextBatch([],null,3).batch,[]);assert.deepEqual(nextBatch(['a','a'],null,3).batch,['a']);
 assert.equal(nextBatch(['a','b'],null,3).batch.length,2);
 assert.notDeepEqual(nextBatch(['a','b','c','d'],null,3,()=>0).batch,nextBatch(['a','b','c','d'],null,3,()=>0.99).batch);
});
test('real homepage insertion follows recommendations and preserves original page bytes',()=>{
 const packed=Buffer.concat([0,1,2].map(i=>fs.readFileSync(`preview/esmeralda/payload.json.gz.part-00${i}`)));
 const original=Buffer.from(JSON.parse(zlib.gunzipSync(packed))['/'].data,'base64').toString();const output=insertWebsiteReviews(original);
 const start=original.indexOf('class="homepage-recommendation-header"'),boundary=original.indexOf('</section>',start)+10;
 assert.equal(output.slice(0,boundary),original.slice(0,boundary));assert.ok(output.slice(boundary).startsWith('<section id="es-customer-reviews"'));
 assert.ok(output.endsWith(original.slice(boundary)));assert.equal(insertWebsiteReviews(output),output);
 assert.throws(()=>insertWebsiteReviews('<html></html>'));
});
