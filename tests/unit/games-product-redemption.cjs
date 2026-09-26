const {test}=require('node:test');
const assert=require('node:assert/strict');
const {checkout}=require('../helpers/checkout-fixture.cjs');
const {loadTs}=require('../helpers/load-ts.cjs');
const {basketTotals}=loadTs('src/lib/basket-totals.ts');
const {checkoutItems}=loadTs('src/lib/checkout-items.ts');

const discount={id:'d',brandId:'b',applicationType:'code',isActive:true,locationIds:['l'],orderTypes:['pickup'],
  activeDays:[],activeTimeSlots:[],discountType:'fixed_amount',discountValue:100,code:'GAMEPIZZA',
  usedCount:0,usageLimit:1,perCustomerLimit:1,gameProductId:'p'};
const line=(id,price,quantity=1)=>({id,cartItemId:id,itemType:'product',productName:id,
  basePrice:price,price,quantity,toppings:[],itemTotal:price*quantity});
const product=(id,price)=>['products/'+id,{brandId:'b',locationIds:['l'],categoryId:'pizza',price,isActive:true,productName:id}];

test('game item code discounts one pizza in a mixed basket on preview, order and Stripe',async()=>{
  const items=[line('p',100,2),line('q',80)];
  const totals=basketTotals({cartItems:items,appliedDiscount:discount,standardDiscounts:[],
    deliveryType:'pickup',location:null,brand:{bagFee:4},includeBagFee:true});
  assert.equal(totals.voucherDiscount.amount,100);
  assert.equal(totals.checkoutTotal,184);
  const result=await checkout({kind:'code',items:checkoutItems(items),
    seed:[product('q',80),['discounts/d',discount]],expectedCartDiscount:100});
  assert.equal(result.result.success,true,result.result.error);
  assert.equal(result.records.get('orders/ORD-TEST').totalAmount,184);
  assert.equal(result.coupon.amount_off,10000);
});

test('game item code cannot discount an unrelated basket',async()=>{
  const items=[line('q',80)];
  const totals=basketTotals({cartItems:items,appliedDiscount:discount,standardDiscounts:[],
    deliveryType:'pickup',location:null,brand:{bagFee:4},includeBagFee:true});
  assert.equal(totals.voucherDiscount,null);
  const result=await checkout({kind:'code',items:checkoutItems(items),
    seed:[product('q',80),['discounts/d',discount]]});
  assert.equal(result.result.success,false);
  assert.match(result.result.error,/prize product/i);
  assert.equal(result.events.includes('stripe'),false);
});
