const {test}=require('node:test'),assert=require('node:assert/strict');
const {moduleGraph}=require('../helpers/load-ts-graph.cjs'),{memoryDb}=require('../helpers/marketing-db.cjs');
function fixture(count=1,options={}){
 const rows=new Map();for(let i=1;i<=count;i++){rows.set('orders/o'+i,{brandId:'b',locationId:'l',paymentMethod:'Free',paymentStatus:'Pending',status:'Pending'});rows.set('freeCheckoutSettlementJobs/o'+i,{orderId:'o'+i,brandId:'b',locationId:'l',state:'pending',nextAttemptAt:1,attempts:0});}
 const db=memoryDb(rows);let attempts=0,financial=0;
 const load=moduleGraph({'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db},'@/lib/server/settle-checkout':{settleFreeCheckoutOrder:async orderId=>{
  attempts++;if(options.poison&&orderId!=='o11')throw Error('temporary native failure');const order=rows.get('orders/'+orderId);if(order.paymentStatus!=='Paid'){financial++;order.paymentStatus='Paid';order.status='Received';}if(options.lost&&attempts===1)throw Error('lost commit response');
 }}});
 return {rows,db,api:load('src/lib/payments/native-free-recovery.ts'),get attempts(){return attempts;},get financial(){return financial;}};
}
test('native Free recovery finalizes only a scoped verified financial commit and leaves no due job',async()=>{const f=fixture();assert.equal((await f.api.processDueNativeFreeCheckouts()).settled,1);assert.equal(f.financial,1);assert.equal(f.rows.get('freeCheckoutSettlementJobs/o1').state,'settled');await f.api.processDueNativeFreeCheckouts();assert.equal(f.attempts,1);});
test('lost financial commit reply retries the same native order and never repeats its financial effects',async()=>{
 const f=fixture(1,{lost:true});assert.equal((await f.api.processDueNativeFreeCheckouts()).settled,0);assert.equal(f.rows.get('orders/o1').paymentStatus,'Paid');assert.equal(f.rows.get('freeCheckoutSettlementJobs/o1').state,'pending');assert.equal(f.financial,1);f.rows.get('freeCheckoutSettlementJobs/o1').nextAttemptAt=1;assert.equal((await f.api.processDueNativeFreeCheckouts()).settled,1);assert.equal(f.financial,1);assert.equal(f.attempts,2);
});
test('later Free jobs are not starved by ten failing earlier jobs',async()=>{const f=fixture(11,{poison:true});for(let i=0;i<11;i++)await f.api.processDueNativeFreeCheckouts();assert.equal(f.rows.get('orders/o11').paymentStatus,'Paid');assert.equal(f.financial,1);assert.equal(f.rows.get('freeCheckoutSettlementJobs/o11').state,'settled');});
test('mismatched tenant, provider and credentials cannot use the no-PSP recovery path',async()=>{
 for(const patch of [{brandId:'other'},{paymentMethod:'Stripe'},{psp:{provider:'stripe'}},{paymentAgreement:{provider:'worldline'}}]){const f=fixture();Object.assign(f.rows.get('orders/o1'),patch);await f.api.processDueNativeFreeCheckouts();assert.equal(f.attempts,0);assert.equal(f.financial,0);assert.equal(f.rows.get('freeCheckoutSettlementJobs/o1').attempts,1);}
});
test('canceled free orders are terminal and never start financial settlement',async()=>{const f=fixture();f.rows.get('orders/o1').status='Canceled';await f.api.processDueNativeFreeCheckouts();assert.equal(f.attempts,0);assert.equal(f.rows.get('freeCheckoutSettlementJobs/o1').state,'canceled');});
