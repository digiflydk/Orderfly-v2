const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const f=require('../helpers/cart-fixture.cjs');

test('menu-valid products survive restoration when unrelated topping groups are unavailable',()=>{
 const catalog=f.catalog();
 catalog.products[0].toppingGroupIds.push('other-location-group','empty-group');
 catalog.groups.push({id:'empty-group',locationIds:['l'],minSelection:1,maxSelection:1});
 const restored=f.restoreCartItems([{...f.choice,toppings:['Cheese']}],catalog,f.scope);
 assert.equal(restored.removed,0);
 assert.equal(restored.items[0].itemTotal,85);
 // Requirements on groups actually offered by the menu are still enforced.
 catalog.groups[0].minSelection=2;
 assert.equal(f.restoreCartItems([{...f.choice,toppings:['Cheese']}],catalog,f.scope).removed,1);
});

test('stable topping IDs preserve identical names in different groups and catalog renaming',()=>{
 const catalog=f.catalog();
 catalog.products[0].toppingGroupIds.push('g2');
 catalog.groups.push({id:'g2',locationIds:['l'],minSelection:1,maxSelection:1});
 catalog.toppings.push({id:'t2',toppingName:'Cheese',price:5,isActive:true,groupId:'g2',locationIds:['l']});
 const choice={...f.choice,toppings:['Cheese','Cheese'],toppingIds:['t','t2']};
 let result=f.restoreCartItems([choice],catalog,f.scope);
 assert.equal(result.removed,0);assert.equal(result.items[0].itemTotal,90);
 const saved=f.cartChoices(result.items);
 assert.deepEqual(saved[0].toppingIds,['t','t2']);
 catalog.toppings[0].toppingName='Mozzarella';catalog.toppings[0].price=12;
 result=f.restoreCartItems(saved,catalog,f.scope);
 assert.equal(result.removed,0);assert.equal(result.items[0].itemTotal,92);
 assert.equal(result.items[0].toppings[0].name,'Mozzarella');
 catalog.toppings[0].isActive=false;
 assert.equal(f.restoreCartItems(saved,catalog,f.scope).removed,1);
});

function reservations(){
 const records=new Map([
  ['customers/c',{brandId:'b',totalOrders:0}],
  ['discounts/first',{brandId:'b',isActive:true,firstTimeCustomerOnly:true,perCustomerLimit:1}],
 ]);
 const transaction=async fn=>{
  const draft=structuredClone(records);
  const tx={get:async ref=>({exists:()=>draft.has(ref),data:()=>draft.get(ref)}),set:(ref,data)=>draft.set(ref,data),update:(ref,data)=>draft.set(ref,{...draft.get(ref),...data})};
  const result=await fn(tx);records.clear();for(const row of draft)records.set(...row);return result;
 };
 const api=loadTs('src/lib/discount-reservations.ts',{
  '@/lib/firebase':{db:{}},'firebase/firestore':{doc:(_,table,id)=>table+'/'+id,runTransaction:(_,fn)=>transaction(fn)},
 });
 const add=(id,discount)=>records.set('orders/'+id,{brandId:'b',customerDetails:{id:'c'},appliedDiscountId:discount});
 const capacity=()=>[...records].find(([key])=>key.startsWith('checkout_customer_capacity/'))[1];
 return{records,api,transaction,add,capacity};
}

test('ordinary payment is not blocked by another first-order reservation; hold cannot be reused or erased',async()=>{
 const f=reservations();f.add('promo','first');f.add('ordinary',null);f.add('duplicate','first');
 await f.api.reserveDiscount('promo','first','c','b');
 await f.api.reserveDiscount('ordinary',null,'c','b');
 assert.equal(f.capacity().held,2);assert.equal(f.capacity().firstTimeHeld,true);
 await assert.rejects(f.api.reserveDiscount('duplicate','first','c','b'),/First-order/);
 await f.api.releaseDiscount('ordinary','b');
 assert.equal(f.capacity().held,1);assert.equal(f.capacity().firstTimeHeld,true);
 await f.api.releaseDiscount('promo','b');
 assert.equal(f.capacity().held,0);assert.equal(f.capacity().firstTimeHeld,false);
 await f.api.reserveDiscount('duplicate','first','c','b');
});

test('ordinary paid settlement preserves an existing promotion hold; new first-order use stays rejected',async()=>{
 const f=reservations();f.add('promo','first');f.add('ordinary',null);f.add('later','first');
 await f.api.reserveDiscount('promo','first','c','b');
 await f.api.reserveDiscount('ordinary',null,'c','b');
 await f.transaction(async tx=>{const settle=await f.api.prepareCapacitySettlement(tx,f.records.get('orders/ordinary'),true);settle();});
 assert.equal(f.capacity().paid,1);assert.equal(f.capacity().held,1);assert.equal(f.capacity().firstTimeHeld,true);
 await f.api.releaseDiscount('promo','b');
 await assert.rejects(f.api.reserveDiscount('later','first','c','b'),/First-order/);
 f.add('repeat-ordinary',null);await f.api.reserveDiscount('repeat-ordinary',null,'c','b');
});
