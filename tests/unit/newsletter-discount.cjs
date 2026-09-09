const {test}=require('node:test');
const assert=require('node:assert/strict');
const {checkout}=require('../helpers/checkout-fixture.cjs');
const {loadTs}=require('../helpers/load-ts.cjs');
const {basketTotals}=loadTs('src/lib/basket-totals.ts');
const {checkoutItems}=loadTs('src/lib/checkout-items.ts');

const newsletter={id:'d',brandId:'b',applicationType:'newsletter_signup',isActive:true,
 locationIds:['l'],orderTypes:['pickup'],activeDays:[],activeTimeSlots:[],discountType:'percentage',
 discountValue:10,minOrderValue:0,code:'Nyhedsbrev',usageLimit:0,usedCount:0,perCustomerLimit:1};
const line=(id,basePrice,price)=>({id,cartItemId:id,itemType:'product',productName:id,
 basePrice,price,quantity:1,toppings:[],itemTotal:price});
const product=(id,price)=>['products/'+id,{brandId:'b',locationIds:['l'],categoryId:'pizza',price,isActive:true,productName:id}];
const itemOffer={id:'item-offer',brandId:'b',isActive:true,discountName:'Varetilbud',discountType:'product',
 locationIds:['l'],orderTypes:['pickup'],
 discountMethod:'fixed_amount',discountValue:30,referenceIds:['q','r']};

for(const [name,items,applied,expected] of [
 ['ordinary item',[line('p',100,100)],true,94],
 ['mixed ordinary and discounted items',[line('p',100,100),line('q',75,45)],true,139],
 ['all items already discounted',[line('q',110,80),line('r',75,45)],false,129],
])test(`newsletter totals agree across basket, persisted order and Stripe: ${name}`,async()=>{
 const seed=items.map(item=>product(item.id,item.basePrice));seed.push(['discounts/d',newsletter]);
 const standardDiscounts=[itemOffer];
 const totals=basketTotals({cartItems:items,appliedDiscount:applied?newsletter:null,standardDiscounts,
  deliveryType:'pickup',location:null,brand:{bagFee:4},includeBagFee:true});
 const f=await checkout({kind:applied?'newsletter':'none',items:checkoutItems(items),seed,standardDiscounts,
  customerOverrides:{subscribeToNewsletter:true},expectedCartDiscount:totals.voucherDiscount?.amount||0});
 assert.equal(f.result.success,true,f.result.error);
 const order=f.records.get('orders/ORD-TEST');
 const stripeTotal=(f.sessionParams.line_items.reduce((sum,item)=>sum+item.price_data.unit_amount*item.quantity,0)-(f.coupon?.amount_off||0))/100;
 assert.equal(totals.checkoutTotal,expected);assert.equal(order.totalAmount,expected);assert.equal(stripeTotal,expected);
 assert.equal(order.paymentDetails.cartDiscountTotal,applied?10:0);
 assert.equal(order.appliedDiscountId||null,applied?'d':null);
 if(!applied){
  const customer=f.records.get('customers/'+order.customerDetails.id);
  assert.ok(customer);assert.equal(customer.pendingNewsletterDiscountId,undefined);
 }
});

test('server rejects a newsletter minimum reached only by counting already discounted items',async()=>{
 const f=await checkout({kind:'newsletter',items:checkoutItems([line('p',100,100),line('q',75,45)]),
  seed:[product('q',75),['discounts/d',{...newsletter,minOrderValue:150}]],standardDiscounts:[itemOffer]});
 assert.equal(f.result.success,false);assert.match(f.result.error,/Minimum order value/);
 assert.equal(f.events.includes('stripe'),false);assert.equal(f.records.has('orders/ORD-TEST'),false);
});

// Exact screenshot: pizza 59 + 25 options, fries 45, soda 33.25.
const screenshotItems=[{...line('p',89,59),toppings:[{id:'chicken',name:'Kylling',price:15},{id:'base',name:'Napolitansk',price:10}]},line('q',45,45),line('r',35,33.25)];
const screenshotSeed=[
 ['products/p',{...product('p',89)[1],toppingGroupIds:['extras']}],product('q',45),product('r',35),
 ['topping_groups/extras',{id:'extras',locationIds:['l'],groupName:'Tilvalg',minSelection:0,maxSelection:2}],
 ...screenshotItems[0].toppings.map(t=>['toppings/'+t.id,{id:t.id,groupId:'extras',locationIds:['l'],isActive:true,toppingName:t.name,price:t.price}]),
];
const screenshotOffers=[{...itemOffer,referenceIds:['p']},{...itemOffer,id:'soda-offer',referenceIds:['r'],discountMethod:'percentage',discountValue:5}];
async function screenshotCheckout(discount,extra={}) {
 return checkout({kind:'newsletter',items:checkoutItems(screenshotItems),seed:[...screenshotSeed,['discounts/d',discount]],
  standardDiscounts:screenshotOffers,expectedCartDiscount:discount.allowStacking===true?16.23:4.5,...extra});
}

for(const allowStacking of [undefined,false,true])test(`persisted stacking=${allowStacking}: screenshot totals match basket, order and Stripe to the øre`,async()=>{
 const discount={...newsletter,allowStacking},expected=allowStacking?150.02:161.75;
 const totals=basketTotals({cartItems:screenshotItems,appliedDiscount:discount,standardDiscounts:screenshotOffers,
  deliveryType:'pickup',location:null,brand:{bagFee:4},includeBagFee:true});
 const f=await screenshotCheckout(discount,{paymentOverrides:{discountTotal:999,cartDiscountTotal:999}});
 assert.equal(f.result.success,true,f.result.error);
 const order=f.records.get('orders/ORD-TEST');
 const stripeTotal=(f.sessionParams.line_items.reduce((n,item)=>n+item.price_data.unit_amount*item.quantity,0)-f.coupon.amount_off)/100;
 assert.equal(totals.subtotal,194);assert.equal(totals.itemDiscount,31.75);
 assert.equal(totals.checkoutTotal,expected);assert.equal(order.totalAmount,expected);assert.equal(stripeTotal,expected);
 assert.equal(f.coupon.amount_off,allowStacking?1623:450);
});

test('stacking minimum uses the charged merchandise amount, not original prices or fees',async()=>{
 const accepted=await screenshotCheckout({...newsletter,allowStacking:true,minOrderValue:160});
 assert.equal(accepted.result.success,true,accepted.result.error);
 const rejected=await screenshotCheckout({...newsletter,allowStacking:true,minOrderValue:165});
 assert.equal(rejected.result.success,false);assert.match(rejected.result.error,/Minimum order value/);
 assert.equal(rejected.events.includes('stripe'),false);
});

test('stacking preserves validated option prices and requires explicit signup',async()=>{
 for(const extra of [
  {customerOverrides:{subscribeToNewsletter:false}},
  {items:checkoutItems(screenshotItems).map((item,i)=>i?item:{...item,totalPrice:60})},
 ]){
  const f=await screenshotCheckout({...newsletter,allowStacking:true},extra);
  assert.equal(f.result.success,false);assert.equal(f.events.includes('stripe'),false);
 }
});

test('stacking excludes delivery, bag and admin fees from its base',async()=>{
 const f=await screenshotCheckout({...newsletter,allowStacking:true,orderTypes:['delivery']},{
  deliveryType:'delivery',locationOverrides:{deliveryFee:20},brandOverrides:{bagFee:4,adminFee:3,adminFeeType:'fixed'},
  customerOverrides:{street:'Testvej 1',zipCode:'2900',city:'Hellerup'},
  standardDiscounts:screenshotOffers.map(d=>({...d,orderTypes:['delivery']})),
 });
 assert.equal(f.result.success,true,f.result.error);assert.equal(f.coupon.amount_off,1623);
 assert.equal(f.records.get('orders/ORD-TEST').totalAmount,173.02);
});

test('stacking does not activate for manual codes or combine competing cart offers',()=>{
 const items=[line('p',100,100),line('q',75,45)];
 const calc=(discount,standardDiscounts=[])=>basketTotals({cartItems:items,appliedDiscount:discount,standardDiscounts,
  deliveryType:'pickup',location:null,brand:{bagFee:4},includeBagFee:true});
 assert.equal(calc({...newsletter,applicationType:'code',allowStacking:true}).voucherDiscount.amount,10);
 const automatic={...itemOffer,discountType:'cart',discountMethod:'percentage',discountValue:20};
 const totals=calc({...newsletter,allowStacking:true},[automatic]);
 assert.equal(totals.voucherDiscount,null);assert.equal(totals.automaticCartDiscount.amount,20);assert.equal(totals.checkoutTotal,129);
 const capped=calc({...newsletter,allowStacking:true,discountType:'fixed_amount',discountValue:999});
 assert.equal(capped.checkoutTotal,4);assert.equal(capped.voucherDiscount.amount,145);
});

test('stacking includes a menu at its charged price',async()=>{
 const combo={id:'combo',brandId:'b',locationIds:['l'],isActive:true,comboName:'Menu',pickupPrice:90,deliveryPrice:90,
  orderTypes:['pickup'],activeDays:[],activeTimeSlots:[],productGroups:[{id:'group',groupName:'Pizza',productIds:['p'],minSelection:1,maxSelection:1}]};
 const items=[{...line('combo',90,90),itemType:'combo',comboSelections:[{groupId:'group',groupName:'Pizza',products:[{id:'p',name:'Pizza'}]}]}];
 const f=await checkout({kind:'newsletter',items:checkoutItems(items),seed:[['comboMenus/combo',combo],['discounts/d',{...newsletter,allowStacking:true}]],expectedCartDiscount:9});
 assert.equal(f.result.success,true,f.result.error);assert.equal(f.records.get('orders/ORD-TEST').totalAmount,85);assert.equal(f.coupon.amount_off,900);
});

test('newsletter stacking setting saves and reopens both on and off',async()=>{
 let saved;
 const api=loadTs('src/app/superadmin/discounts/actions.ts',{
  '@/lib/firebase':{db:{}},'next/cache':{revalidatePath:()=>{}},'next/navigation':{redirect:()=>{throw Error('REDIRECT');}},
  'firebase/firestore':{collection:(_,p)=>p,doc:(_,p,id)=>({id:id||'d'}),where:()=>null,query:()=>null,
   getDocs:async()=>({empty:true,docs:[]}),getDoc:async()=>({id:'d',exists:()=>!!saved,data:()=>saved}),
   setDoc:async(_,data)=>{saved={...saved,...data};},Timestamp:{now:()=>({toDate:()=>new Date('2026-09-09T00:00:00Z')}),fromDate:d=>({toDate:()=>d})}},
 });
 for(const enabled of [true,false]){
  const form=new FormData();
  const data={...newsletter,description:'Test',allowStacking:enabled,firstTimeCustomerOnly:false};
  if(!saved)delete data.id;
  for(const [key,value]of Object.entries(data)){
   if(key==='activeTimeSlots')form.set(key,JSON.stringify(value));
   else if(Array.isArray(value))value.forEach(entry=>form.append(key,String(entry)));
   else form.set(key,String(value));
  }
  await assert.rejects(api.createOrUpdateDiscount(null,form),/REDIRECT/);
  const reopened=await api.getDiscountById('d');assert.equal(reopened.allowStacking,enabled);assert.equal(reopened.applicationType,'newsletter_signup');
 }
});
