const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {loadTs}=require('../helpers/load-ts.cjs');

function fixture() {
 let state={
  'customers/c':{brandId:'b',totalOrders:0},
  'discounts/first':{brandId:'b',isActive:true,firstTimeCustomerOnly:true},
  'discounts/another-first':{brandId:'b',isActive:true,firstTimeCustomerOnly:true},
  'discounts/regular':{brandId:'b',isActive:true,firstTimeCustomerOnly:false,usageLimit:1,perCustomerLimit:1},
 };
 let queue=Promise.resolve();
 const runTransaction=(_,fn)=>{
  const task=queue.then(async()=>{
   const draft=structuredClone(state);
   const result=await fn({
    get:async ref=>({exists:()=>ref in draft,data:()=>draft[ref]}),
    set:(ref,value)=>{draft[ref]=value;},update:(ref,value)=>{draft[ref]={...draft[ref],...value};},
   });state=draft;return result;
  });queue=task.catch(()=>{});return task;
 };
 const api=loadTs('src/lib/discount-reservations.ts',{'@/lib/firebase':{db:{}},'firebase/firestore':{doc:(_,collection,id)=>collection+'/'+id,runTransaction}});
 const key=createHash('sha256').update(JSON.stringify(['b','c'])).digest('hex');
 return {
  api,capacity:()=>state['checkout_customer_capacity/'+key],order:id=>state['orders/'+id],
  setCapacity:value=>{state['checkout_customer_capacity/'+key]=value;},
  setCustomer:value=>{state['customers/c']={...state['customers/c'],...value};},
  reserve:async(id,discountId=null)=>{
   state['orders/'+id]={id,brandId:'b',locationId:'l',customerDetails:{id:'c'},appliedDiscountId:discountId,paymentStatus:'Pending'};
   return api.reserveDiscount(id,discountId,'c','b');
  },
  pay:id=>runTransaction(null,async tx=>{
   const order=(await tx.get('orders/'+id)).data();
   if(order.paymentStatus==='Paid')return;
   const settle=await api.prepareCapacitySettlement(tx,order,true);settle();
   tx.update('orders/'+id,{paymentStatus:'Paid',discountReservation:'consumed'});
  }),
 };
}

test('ordinary checkout succeeds with a prior first-order hold, preserving that hold',async()=>{
 const f=fixture();await f.reserve('OLD','first');await f.reserve('NEW');
 assert.deepEqual(f.capacity(),{paid:0,held:2,firstTimeHeld:true});
 assert.equal(f.order('OLD').discountReservation,'held');assert.equal(f.order('NEW').firstTimeReservation,false);
 await assert.rejects(f.reserve('THIRD','another-first'),/First-order/);
});
test('a non-first-order code remains available, while its own usage limits still apply',async()=>{
 const f=fixture();await f.reserve('OLD','first');await f.reserve('NEW','regular');
 assert.equal(f.capacity().firstTimeHeld,true);
 await assert.rejects(f.reserve('SECOND-REGULAR','regular'),/limit reached|already used/);
 assert.equal(f.order('OLD').discountReservation,'held');
});
test('stale first-order flag does not block an ordinary customer with paid history',async()=>{
 const f=fixture();f.setCapacity({paid:3,held:0,firstTimeHeld:true});f.setCustomer({totalOrders:3});
 await f.reserve('ORDINARY');assert.equal(f.capacity().firstTimeHeld,true);
 await assert.rejects(f.reserve('FIRST','first'),/First-order/);
});
test('canceling a later ordinary order never frees the earlier first-order reservation',async()=>{
 const f=fixture();await f.reserve('FIRST','first');await f.reserve('ORDINARY');
 await f.api.releaseDiscount('ORDINARY','b');await f.api.releaseDiscount('ORDINARY','b');
 assert.deepEqual(f.capacity(),{paid:0,held:1,firstTimeHeld:true});
 await assert.rejects(f.reserve('ANOTHER','another-first'),/First-order/);
 await f.api.releaseDiscount('FIRST','b');
 assert.deepEqual(f.capacity(),{paid:0,held:0,firstTimeHeld:false});
 await f.reserve('FRESH','another-first');
});
test('paying an ordinary order preserves a pre-existing hold and blocks future first-order use',async()=>{
 const f=fixture();await f.reserve('FIRST','first');await f.reserve('ORDINARY');await f.pay('ORDINARY');await f.pay('ORDINARY');
 assert.deepEqual(f.capacity(),{paid:1,held:1,firstTimeHeld:true});
 await assert.rejects(f.reserve('ANOTHER','another-first'),/First-order/);
 await f.pay('FIRST');
 assert.deepEqual(f.capacity(),{paid:2,held:0,firstTimeHeld:false});
 await assert.rejects(f.reserve('REUSE','first'),/First-order/);
 await f.reserve('NEXT-ORDINARY');
});
test('ordinary checkout reserved first still blocks a later first-order promotion until canceled',async()=>{
 const f=fixture();await f.reserve('ORDINARY');await assert.rejects(f.reserve('FIRST','first'),/First-order/);
 await f.api.releaseDiscount('ORDINARY','b');await f.reserve('FIRST-RETRY','first');
 assert.deepEqual(f.capacity(),{paid:0,held:1,firstTimeHeld:true});
});
test('concurrent distinct first-order promotions still reserve only once',async()=>{
 const f=fixture();const results=await Promise.allSettled([f.reserve('FIRST-A','first'),f.reserve('FIRST-B','another-first')]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.deepEqual(f.capacity(),{paid:0,held:1,firstTimeHeld:true});
});
