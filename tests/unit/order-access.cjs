const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
function fixture({allowed=true,changed=false,paid=true,status='Received'}={}){
 const calls=[],writes=[],audits=[];const order={brandId:'brand-a',locationId:'location-a',paymentStatus:paid?'Paid':'Unpaid',status};
 const ref={get:async()=>({exists:true,data:()=>order})};
 const identity={provider:'firebase',subject:'actor-a'};
 const action=loadTs('src/app/superadmin/sales/orders/actions.ts',{'next/cache':{revalidatePath:()=>{}},'node:crypto':require('node:crypto'),'@/lib/access/scoped-data':{authorizeTransaction:async()=>{}},'@/lib/firebase-admin':{getAdminFieldValue:()=>({serverTimestamp:()=> 'SERVER_TIME'}),getAdminDb:()=>({collection:()=>({doc:()=>ref}),runTransaction:async run=>run({get:async()=>({data:()=>changed?{...order,brandId:'brand-b'}:order}),update:(ref,value)=>writes.push(value),create:(ref,value)=>audits.push(value)})})},'@/lib/access/orderfly-session':{requireOrderflyAccess:async(...args)=>{calls.push(args);if(!allowed)throw Error('forbidden');return {identity};}},'@/lib/feedback/mail-queue':{queueOrderFeedback:async()=>{throw Error('Optional mail failure');}}});
 return {action,calls,writes,audits};
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
test('canceling a paid order requires a comment and removes the order from sales with an audit record',async()=>{
 const f=fixture();assert.equal((await f.action.updateOrderStatus('order-a','Canceled')).success,false);assert.deepEqual(f.writes,[]);
 const result=await f.action.updateOrderStatus('order-a','Canceled',' Customer requested cancellation ');
 assert.equal(result.success,true);assert.deepEqual(f.writes,[{status:'Canceled',cancellationComment:'Customer requested cancellation',canceledAt:'SERVER_TIME',canceledBy:'actor-a',updatedAt:'SERVER_TIME'}]);
 assert.equal(f.audits[0].action,'order_canceled');assert.equal(f.audits[0].cancellationComment,'Customer requested cancellation');
});
test('invalid browser-supplied statuses and document paths never request authority or write',async()=>{
 const f=fixture();for(const [id,status] of [['order/foreign','Ready'],['order-a','Paid'],['order-a','grant-all']])assert.equal((await f.action.updateOrderStatus(id,status)).success,false);assert.deepEqual(f.calls,[]);assert.deepEqual(f.writes,[]);
});
test('order list queries contain the granted brand and locations instead of fetching the platform',async()=>{
 const reads=[];const q=predicates=>({orderBy:()=>q(predicates),where:(...p)=>q([...predicates,p]),get:async()=>{reads.push(predicates);return {docs:[]};}});
 const {getOrders}=loadTs('src/lib/superadmin/getOrders.ts',{'@/lib/firebase-admin':{getAdminDb:()=>({collection:()=>q([])})},'@/lib/access/orderfly-session':{orderflyReadGrants:async()=>[{brandId:'brand-a',locationIds:['a1']},{brandId:'brand-b',locationIds:null}]}});
 assert.deepEqual(await getOrders(),[]);assert.deepEqual(reads,[[['brandId','==','brand-a'],['locationId','in',['a1']]],[['brandId','==','brand-b']]]);
});
test('sales order date filtering queries paidAt and sorts by payment date',async()=>{
 const reads=[];const docs=[{id:'older',data:()=>({createdAt:new Date('2026-09-08'),paidAt:new Date('2026-09-02'),status:'Completed'})},{id:'newer',data:()=>({createdAt:new Date('2026-09-01'),paidAt:new Date('2026-09-04'),status:'Completed'})}];
 const q=predicates=>({where:(...p)=>q([...predicates,p]),get:async()=>{reads.push(predicates);return {docs}}});
 const {getOrders}=loadTs('src/lib/superadmin/getOrders.ts',{'@/lib/firebase-admin':{getAdminDb:()=>({collection:()=>q([])})},'@/lib/access/orderfly-session':{orderflyReadGrants:async()=>[{brandId:'brand-a',locationIds:null}]},'@/lib/analytics/date-range':{analyticsDateRange:()=>({start:new Date('2026-09-01'),endExclusive:new Date('2026-09-06')})},'firebase-admin':{firestore:{Timestamp:{fromDate:value=>value}}}});
 const orders=await getOrders({dateFrom:'2026-09-01',dateTo:'2026-09-05'});
 assert.deepEqual(reads[0].map(([field])=>field),['paidAt','paidAt','brandId']);assert.deepEqual(orders.map(order=>order.id),['newer','older']);
});
