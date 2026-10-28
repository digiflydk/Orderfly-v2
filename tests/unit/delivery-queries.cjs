const {test}=require('node:test');const assert=require('node:assert/strict');const {loadTs}=require('../helpers/load-ts.cjs');
const scope={brandId:'a',locationId:'a1'};
function fixture(options={}){
 const rows=new Map([['locations/a1',{brandId:'a'}]]),calls=[];let deny=false;
 const managed={version:1,providerId:'test',quoteRef:'q1',requestDigest:'a'.repeat(64)};
 for(let i=0;i<30;i++)rows.set(`orders/o${String(i).padStart(2,'0')}`,{...scope,deliveryType:'Delivery',status:'Pending',paymentStatus:'Paid',...(options.legacy?{}:{managedDelivery:managed})});
 rows.set('orders/foreign',{brandId:'b',locationId:'b1',deliveryType:'Delivery',managedDelivery:managed});
 const snap=(path)=>({id:path.split('/').at(-1),ref:ref(path),exists:rows.has(path),data:()=>rows.get(path)});
 function ref(path){return{path,collection:name=>collection(`${path}/${name}`),get:async()=>{calls.push(path);return snap(path)}};}
 function collection(path,filters=[],after=null,limit=Infinity){return{doc:id=>ref(`${path}/${id}`),where:(key,op,value)=>collection(path,[...filters,[key,value]],after,limit),orderBy:()=>collection(path,filters,after,limit),startAfter:value=>collection(path,filters,value,limit),limit:value=>collection(path,filters,after,value),get:async()=>{assert.ok(limit<=26,'bounded reads');calls.push(path);const docs=[...rows.keys()].filter(p=>p.startsWith(path+'/')&&p.split('/').length===path.split('/').length+1).sort().map(snap).filter(d=>(!after||d.id>after)&&filters.every(([key,value])=>d.data()[key]===value)).slice(0,limit);return{docs}}};}
 const mocks={'server-only':{},'../cancellation/server':{cancellationAvailability:async()=>({available:false})},'firebase-admin/firestore':{FieldPath:{documentId:()=> '__id__'}},'@/lib/firebase-admin':{getAdminDb:()=>({collection})},'@/lib/access/orderfly-session':{requireOrderflyAccess:async()=>{if(deny)throw Error('forbidden')}}};
 return{...loadTs('src/lib/delivery/queries/server.ts',mocks),rows,calls,revoke:()=>{deny=true}};
}
test('bounded scoped list paginates and never returns unrelated order',async()=>{
 const f=fixture(),a=await f.readDeliveryOrders(scope);assert.equal(a.orders.length,25);assert.equal(a.hasMore,true);assert.equal(a.orders.some(x=>x.id==='foreign'),false);
 const b=await f.readDeliveryOrders({...scope,cursor:a.nextCursor});assert.equal(b.orders.length,5);assert.equal(b.hasMore,false);assert.equal(a.orders[0].bookingState,null);
 assert.equal('totalAmount' in a.orders[0],false);
});
test('empty filtered page still retains continuation and foreign detail does not read nested data',async()=>{
 const f=fixture({legacy:true}),a=await f.readDeliveryOrders(scope);assert.deepEqual(a.orders,[]);assert.equal(a.hasMore,true);
 await assert.rejects(f.readDeliveryOrders({...scope,orderId:'foreign'}),/not_found/);assert.equal(f.calls.some(x=>x.startsWith('orders/foreign/')),false);
});
test('permission and cursor scope denial precede private order query',async()=>{
 const f=fixture();f.revoke();await assert.rejects(f.readDeliveryOrders(scope),/forbidden/);assert.equal(f.calls.length,0);
 const g=fixture(),first=await g.readDeliveryOrders(scope);await assert.rejects(g.readDeliveryOrders({...scope,orderId:'o00',eventCursor:first.nextCursor}),/invalid/);
 await assert.rejects(g.readDeliveryOrders({...scope,extra:'bad'}),/invalid/);
});
test('orders view projects only nonmonetary cost review flag in list and detail',async()=>{
 const f=fixture();f.rows.get('orders/o00').deliveryCostException={reason:'accepted_provider_cost_changed',requiresReview:true,quotedCost:{amountMinor:4500},acceptedCost:{amountMinor:9000},customerFee:{amountMinor:3500},subsidy:{amountMinor:5500}};
 const list=await f.readDeliveryOrders(scope),detail=await f.readDeliveryOrders({...scope,orderId:'o00'});
 assert.equal(list.orders.find(o=>o.id==='o00').costReviewRequired,true);assert.equal(detail.orders[0].costReviewRequired,true);assert.equal(list.orders.find(o=>o.id==='o01').costReviewRequired,false);
 for(const result of [list,detail]){const text=JSON.stringify(result);for(const secret of ['quotedCost','acceptedCost','customerFee','subsidy','4500','9000','3500','5500','accepted_provider_cost_changed'])assert.equal(text.includes(secret),false);}
});

test('manual reconciliation exposes strict boolean without native identifiers or invented status',async()=>{
 const f=fixture();Object.assign(f.rows.get('orders/o00'),{deliveryReconciliationRequired:true,providerDeliveryId:'private-courier-id',deliveryReconciliation:{nativeRequestId:'private-request-id',providerCost:7200}});f.rows.get('orders/o01').deliveryReconciliationRequired='true';
 const list=await f.readDeliveryOrders(scope),detail=await f.readDeliveryOrders({...scope,orderId:'o00'});
 assert.equal(list.orders.find(o=>o.id==='o00').deliveryReconciliationRequired,true);assert.equal(detail.orders[0].deliveryReconciliationRequired,true);assert.equal(list.orders.find(o=>o.id==='o01').deliveryReconciliationRequired,false);assert.equal(detail.orders[0].bookingState,null);assert.equal(detail.orders[0].deliveryStatus,null);
 for(const result of [list,detail])for(const secret of ['private-courier-id','private-request-id','providerCost','7200'])assert.equal(JSON.stringify(result).includes(secret),false);
});

test('quote diagnostics are authorized, scope checked and contain only the fixed projection',async()=>{
 const f=fixture(),key=require('node:crypto').createHash('sha256').update(JSON.stringify(['a','a1'])).digest('hex');
 f.rows.set('deliveryQuoteDiagnostics/'+key,{...scope,stage:'runtime',code:'schema_invalid',atMs:1000,secret:'never expose'});
 assert.deepEqual((await f.readDeliveryOrders(scope)).quoteDiagnostic,{stage:'runtime',code:'schema_invalid',atMs:1000});
 f.rows.get('deliveryQuoteDiagnostics/'+key).brandId='b';assert.equal((await f.readDeliveryOrders(scope)).quoteDiagnostic,null);
 const g=fixture();g.revoke();await assert.rejects(g.readDeliveryOrders(scope));assert.equal(g.calls.length,0);
});

test('booking rejection detail exposes only bound allowlisted code',async()=>{
 const f=fixture(),order=f.rows.get('orders/o00'),attempt={schemaVersion:1,scope:{...scope,orderId:'o00'},provider:'test',intentId:'ref',reference:'ref',requestDigest:order.managedDelivery.requestDigest,revision:1,state:'rejected',providerDeliveryId:null,createdAt:1000,updatedAt:2000};
 f.rows.set('orders/o00/deliveryAttempts/original',attempt);
 const record={scope:attempt.scope,providerId:'test',requestDigest:attempt.requestDigest,attemptRef:'ref',result:{kind:'rejected',error:{code:'quote_expired',messageKey:'private',retry:'never',nativeCode:'secret'}}};
 f.rows.set('orders/o00/deliveryDispatchResults/original',record);
 const detail=()=>f.readDeliveryOrders({...scope,orderId:'o00'});
 assert.equal((await detail()).orders[0].bookingFailureCode,'quote_expired');
 assert.equal(JSON.stringify(await detail()).includes('secret'),false);
 assert.equal((await f.readDeliveryOrders(scope)).orders[0].bookingFailureCode,null);
 record.result.error.code='PRIVATE_UNKNOWN';assert.equal((await detail()).orders[0].bookingFailureCode,'booking_rejected');
 record.scope={...attempt.scope,brandId:'foreign'};assert.equal((await detail()).orders[0].bookingFailureCode,null);
});


test('full refund is reflected in operator payment status without leaking money',async()=>{
 const f=fixture(),order=f.rows.get('orders/o00');Object.assign(order,{totalAmount:201,refundedAmountOre:20100});
 assert.equal((await f.readDeliveryOrders({...scope,orderId:'o00'})).orders[0].paymentStatus,'Refunded');
 order.refundedAmountOre=20099;assert.equal((await f.readDeliveryOrders({...scope,orderId:'o00'})).orders[0].paymentStatus,'Paid');
 order.refundedAmountOre='20100';assert.equal((await f.readDeliveryOrders({...scope,orderId:'o00'})).orders[0].paymentStatus,'Paid');
});
test('operator list and read-only detail expose bound cancellation without private result data',async()=>{
 const f=fixture(),order=f.rows.get('orders/o00'),digest=order.managedDelivery.requestDigest;
 const attempt={schemaVersion:1,scope:{...scope,orderId:'o00'},provider:'test',intentId:'attempt',reference:'attempt',requestDigest:digest,revision:1,state:'booked',providerDeliveryId:'native',createdAt:1,updatedAt:1};
 f.rows.set('orders/o00/deliveryAttempts/original',attempt);f.rows.set('orders/o00/deliveryDispatchResults/original',{scope:attempt.scope,providerId:'test',requestDigest:digest,attemptRef:'attempt',result:{kind:'accepted',providerDeliveryId:'native',nativeReference:'reference',trackingUrl:null,pickupInterval:null,deliveryInterval:null,pickupEstimateProvenance:null,cost:null}});
 const saved={version:1,...scope,orderId:'o00',attemptRef:'attempt',providerDeliveryId:'native',environment:'sandbox',state:'cancelled',reconcileRequired:false,result:{kind:'cancelled',fee:null},operatorReason:'private reason',actorId:'private actor'};f.rows.set('orders/o00/deliveryCancellation/original',saved);
 for(const query of [scope,{...scope,orderId:'o00'}]){const data=await f.readDeliveryOrders(query),row=data.orders.find(o=>o.id==='o00');assert.equal(row.cancellationState,'cancelled');assert.equal(row.deliveryStatus,'cancelled');assert.equal(row.paymentStatus,'Paid');for(const secret of ['private reason','private actor','providerDeliveryId','attemptRef'])assert.equal(JSON.stringify(data).includes(secret),false);}
 f.rows.set('orders/o00/deliveryCancellation/original',{...saved,brandId:'foreign'});assert.equal((await f.readDeliveryOrders({...scope,orderId:'o00'})).orders[0].cancellationState,null);
 f.rows.set('orders/o00/deliveryCancellation/original',{...saved,state:'submitting',result:null});assert.equal((await f.readDeliveryOrders({...scope,orderId:'o00'})).orders[0].cancellationState,'submitting');
});
