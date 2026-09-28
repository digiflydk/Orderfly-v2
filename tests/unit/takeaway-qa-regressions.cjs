const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {isPaidSale}=loadTs('src/lib/paid-order.ts');
const {isSyntheticProduct}=loadTs('src/lib/synthetic-product.ts');
const {upsellClientData}=loadTs('src/lib/upsell-serialization.ts');

test('#189 unpaid, canceled and failed attempts remain history but never count as sales',()=>{
 const rows=[
  {status:'Pending',paymentStatus:'Pending',totalAmount:89},
  {status:'Received',paymentStatus:'Pending',totalAmount:89}, // ORD-671268 legacy state
  {status:'Canceled',paymentStatus:'Failed',totalAmount:89},
  {status:'Received',paymentStatus:'Paid',totalAmount:89},
 ];
 assert.deepEqual(rows.map(isPaidSale),[false,false,false,true]);
 assert.equal(rows.filter(isPaidSale).length,1);
 assert.equal(rows.filter(isPaidSale).reduce((sum,row)=>sum+row.totalAmount,0),89);
});
test('#188 legacy QA product cannot be exposed even without isTestData flag',()=>{
 assert.equal(isSyntheticProduct({productName:'QA-62-20260908090721822 Product TEST',description:'QA-62 synthetic test. DO NOT PREPARE. Temporary verification data.'}),true);
 assert.equal(isSyntheticProduct({productName:'Pizza',description:'Freshly prepared'}),false);
});
test('#186 existing promotion data with nested Firestore timestamps crosses client boundary without mutation',()=>{
 const timestamp={toDate:()=>new Date('2026-09-27T12:00:00Z')};
 const existing={id:'code',isActive:true,usedCount:5,usageLimit:10,eligibility:{rules:[{since:timestamp}]},startDate:timestamp};
 const result=upsellClientData(existing);
 assert.ok(result.startDate instanceof Date);
 assert.ok(result.eligibility.rules[0].since instanceof Date);
 assert.equal(result.isActive,true);
 assert.equal(result.usedCount,5);
 assert.equal(existing.startDate,timestamp);
});
test('#187 fulfillment time uses Danish date labels',()=>{
 const {displayFulfillmentTime}=loadTs('src/lib/fulfillment-time.ts',{
  './time-slots':{},
 });
 assert.match(displayFulfillmentTime('2026-09-28T09:30:00.000Z'),/man\.|sep\./i);
 assert.doesNotMatch(displayFulfillmentTime('2026-09-28T09:30:00.000Z'),/Mon, 28 Sep/);
});
