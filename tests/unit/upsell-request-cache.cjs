const {test}=require('node:test');const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {withUpsellReads,upsellRead}=loadTs('src/lib/server/upsell-request-cache.ts');
test('parallel branches deduplicate reads without caching across requests or tenants',async()=>{
 let calls=0;const read=async()=>++calls;
 await withUpsellReads(async()=>{
  assert.deepEqual(await Promise.all([upsellRead('brand-a',read),upsellRead('brand-a',read)]),[1,1]);
  assert.equal(await upsellRead('brand-b',read),2);
 });
 await withUpsellReads(async()=>assert.equal(await upsellRead('brand-a',read),3));
 assert.equal(await upsellRead('brand-a',read),4);
});
