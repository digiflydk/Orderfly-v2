// Independent acceptance for the actual capacity release transaction. Provider
// cancellation is already verified here; no provider transport is involved.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {loadTs}=require('../helpers/load-ts.cjs');

function fixture(){
 const id='ORD-IDENTITY',identity={version:1,orderId:id,brandId:'brand',locationId:'location',customerId:'customer',discountId:'discount',firstTimeReservation:true};
 const key=parts=>createHash('sha256').update(JSON.stringify(parts)).digest('hex');
 const paths=['checkout_customer_capacity/'+key(['brand','customer']),'checkout_discount_capacity/'+key(['brand','discount']),'checkout_customer_discount_capacity/'+key(['brand','customer','discount'])];
 const order={id,brandId:'brand',locationId:'location',customerDetails:{id:'customer'},appliedDiscountId:'discount',firstTimeReservation:true,paymentMethod:'Worldline',paymentStatus:'Pending',status:'Canceled',discountReservation:'held',psp:{provider:'worldline',sessionExpired:true,cancellationCapacity:structuredClone(identity)}};
 const rows=new Map([['orders/'+id,order],...paths.map((path,index)=>[path,{held:2,paid:1,...(index===0?{firstTimeHeld:true}:{})}])]);
 const compat={db:{},doc:(_db,...parts)=>({path:parts.join('/')}),serverTimestamp:()=> 'synthetic-time',runTransaction:async(_db,run)=>{
  const changes=[],get=async ref=>({exists:()=>rows.has(ref.path),data:()=>structuredClone(rows.get(ref.path))});
  const result=await run({get,set:(ref,value)=>changes.push(()=>rows.set(ref.path,structuredClone(value))),update:(ref,value)=>changes.push(()=>rows.set(ref.path,{...rows.get(ref.path),...structuredClone(value)}))});
  changes.forEach(apply=>apply());return result;
 }};
 const module=loadTs('src/lib/discount-reservations.ts',{'./promotion-rules':{},'@/lib/server/firestore-compat':compat});
 return {order,rows,identity,paths,release:expected=>module.releaseDiscount(id,'brand',undefined,'location',expected)};
}

test('an optional release identity cannot select a different customer or discount reservation',async()=>{
 for(const patch of [{orderId:'OTHER'},{brandId:'other'},{customerId:'other'},{discountId:'other'},{firstTimeReservation:false},{locationId:'other'},{version:2}]){
  const f=fixture(),before=structuredClone([...f.rows]);
  await assert.rejects(f.release({...f.identity,...patch}),/reconciliation/);
  assert.deepEqual([...f.rows],before);
 }
});
test('missing or corrupt private identity cannot be replaced by an otherwise valid optional argument',async()=>{
 for(const value of [undefined,null,{},false,{version:2},'invalid']){
  const f=fixture();f.order.psp.cancellationCapacity=value;const before=structuredClone([...f.rows]);
  await assert.rejects(f.release(f.identity),/reconciliation/);assert.deepEqual([...f.rows],before);
 }
});
test('a verified Worldline expiry cannot bypass missing private reservation identity via the generic calling contract',async()=>{
 for(const value of [undefined,null,false]){
  const f=fixture();f.order.psp.cancellationCapacity=value;const before=structuredClone([...f.rows]);
  await assert.rejects(f.release(),/reconciliation/);assert.deepEqual([...f.rows],before);
 }
});
test('matching original identities release exactly one hold and duplicate release leaves counters unchanged',async()=>{
 const f=fixture();await f.release(f.identity);
 assert.equal(f.rows.get(f.paths[0]).held,1);assert.equal(f.rows.get(f.paths[0]).firstTimeHeld,false);
 assert.equal(f.rows.get(f.paths[1]).held,1);assert.equal(f.rows.get(f.paths[2]).held,1);
 const after=structuredClone([...f.rows]);await f.release(f.identity);assert.deepEqual([...f.rows],after);
});
