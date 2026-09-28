const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {checkout}=require('../helpers/checkout-fixture.cjs');

const {discountMinimumError}=loadTs('src/lib/promotion-rules.ts');
const code={id:'d',brandId:'b',locationIds:['l'],orderTypes:['pickup'],isActive:true,
 applicationType:'code',code:'SAVE10',discountType:'percentage',discountValue:10,
 minOrderValue:100,usageLimit:0,usedCount:0,perCustomerLimit:1,activeDays:[],activeTimeSlots:[]};
const item=(id,price,quantity=1)=>({id,itemType:'product',name:id,quantity,unitPrice:price,totalPrice:price*quantity,toppings:[]});
const seed=[
 ['products/p',{brandId:'b',locationIds:['l'],categoryId:'pizza',price:79,isActive:true,productName:'Margherita'}],
 ['products/q',{brandId:'b',locationIds:['l'],categoryId:'extras',price:10,isActive:true,productName:'Dressing'}],
 ['products/r',{brandId:'b',locationIds:['l'],categoryId:'drinks',price:20,isActive:true,productName:'Pepsi'}],
 ['discounts/d',code],
];
const productOffer={id:'auto-p',brandId:'b',locationIds:['l'],orderTypes:['pickup'],isActive:true,
 discountName:'QA2809-PRODUCT-5',discountType:'product',discountMethod:'percentage',
 discountValue:5,referenceIds:['p'],allowStacking:false,activeDays:[],activeTimeSlots:[]};

test('a nonstackable item offer explains the actual conflict before payment (#192)',async()=>{
 const f=await checkout({kind:'code',items:[item('p',75.05),item('q',10),item('r',20,2)],seed,
  standardDiscounts:[productOffer],brandOverrides:{bagFee:0}});
 assert.equal(f.result.success,false);
 assert.match(f.result.error,/kan ikke kombineres/);
 assert.match(f.result.error,/50\.00 kr\./);
 assert.doesNotMatch(f.result.error,/^Minimumsbeløbet/);
 assert.equal(f.events.includes('stripe'),false);
 assert.equal(f.records.has('orders/ORD-TEST'),false);
 const validation=await f.actions.validateDiscountAction('SAVE10','b','l',50,'pickup','test@example.test',['p','q','r'],125.05);
 assert.equal(validation.success,false);
 assert.equal(validation.message,f.result.error);
});

test('deactivated item offer lets the same 129 kr basket use the code once',async()=>{
 const f=await checkout({kind:'code',items:[item('p',79),item('q',10),item('r',20,2)],seed,
  standardDiscounts:[],brandOverrides:{bagFee:0},expectedCartDiscount:12.9});
 assert.equal(f.result.success,true,f.result.error);
 assert.equal(f.records.get('orders/ORD-TEST').totalAmount,116.1);
 assert.equal(f.coupon.amount_off,1290);
 const validation=await f.actions.validateDiscountAction('SAVE10','b','l',129,'pickup','test@example.test',['p','q','r'],129);
 assert.equal(validation.success,true,validation.message);
});

test('a genuinely small basket still gets the minimum error',()=>{
 assert.match(discountMinimumError(100,99,99),/^Minimumsbeløbet/);
 assert.match(discountMinimumError(100,50,125.05),/kan ikke kombineres/);
 assert.equal(discountMinimumError(100,100,125.05),null);
 assert.equal(discountMinimumError(undefined,50,125.05),null);
});
