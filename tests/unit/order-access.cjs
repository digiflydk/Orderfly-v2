const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
function fixture({allowed=true,changed=false,paid=true}={}){
 const calls=[],writes=[];const order={brandId:'brand-a',locationId:'location-a',paymentStatus:paid?'Paid':'Unpaid'};
 const ref={get:async()=>({exists:true,data:()=>order})};
 const action=loadTs('src/app/superadmin/sales/orders/actions.ts',{'next/cache':{revalidatePath:()=>{}},'@/lib/firebase-admin':{getAdminDb:()=>({collection:()=>({doc:()=>ref}),runTransaction:async run=>run({get:async()=>({data:()=>changed?{...order,brandId:'brand-b'}:order}),update:(ref,value)=>writes.push(value)})})},'@/lib/access/orderfly-session':{requireOrderflyAccess:async(...args)=>{calls.push(args);if(!allowed)throw Error('forbidden');}},'@/lib/feedback/mail-queue':{queueOrderFeedback:async()=>{throw Error('Optional mail failure');}}});
 return {action,calls,writes};
}
test('order mutations require edit access to the stored brand and location',async()=>{
 const f=fixture({allowed:false});assert.equal((await f.action.updateOrderStatus('order-a','Ready')).success,false);assert.deepEqual(f.calls,[['brand-a',['location-a'],'orderfly.orders:edit']]);assert.deepEqual(f.writes,[]);
});
test('tenant reassignment during a status change prevents writing the foreign record',async()=>{
 const f=fixture({changed:true});assert.equal((await f.action.updateOrderStatus('order-a','Ready')).success,false);assert.deepEqual(f.writes,[]);
});
test('payment requirement is preserved and mail failure does not undo an authorized delivery',async()=>{
 const unpaid=fixture({paid:false});assert.equal((await unpaid.action.updateOrderStatus('order-a','Delivered')).success,false);assert.deepEqual(unpaid.writes,[]);
 const paid=fixture();assert.equal((await paid.action.updateOrderStatus('order-a','Delivered')).success,true);assert.deepEqual(paid.writes,[{status:'Delivered'}]);
});
test('invalid browser-supplied statuses and document paths never request authority or write',async()=>{
 const f=fixture();for(const [id,status] of [['order/foreign','Ready'],['order-a','Paid'],['order-a','grant-all']])assert.equal((await f.action.updateOrderStatus(id,status)).success,false);assert.deepEqual(f.calls,[]);assert.deepEqual(f.writes,[]);
});
test('order list queries contain the granted brand and locations instead of fetching the platform',async()=>{
 const reads=[];const q=predicates=>({orderBy:()=>q(predicates),where:(...p)=>q([...predicates,p]),get:async()=>{reads.push(predicates);return {docs:[]};}});
 const {getOrders}=loadTs('src/lib/superadmin/getOrders.ts',{'@/lib/firebase-admin':{getAdminDb:()=>({collection:()=>q([])})},'@/lib/access/orderfly-session':{orderflyReadGrants:async()=>[{brandId:'brand-a',locationIds:['a1']},{brandId:'brand-b',locationIds:null}]}});
 assert.deepEqual(await getOrders(),[]);assert.deepEqual(reads,[[['brandId','==','brand-a'],['locationId','in',['a1']]],[['brandId','==','brand-b']]]);
});
