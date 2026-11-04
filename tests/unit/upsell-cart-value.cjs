const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {upsellCartValue}=loadTs('src/lib/upsell-cart-value.ts');
const {validateCheckoutPrices}=loadTs('src/lib/checkout-price-validation.ts');

const scope={brandId:'b',locationId:'l',deliveryType:'pickup',now:new Date('2026-11-04T12:00:00Z')};
const upsell={id:'u',brandId:'b',locationIds:['l'],isActive:true,orderTypes:['pickup'],offerType:'product',offerProductIds:['cola'],offerCategoryIds:[],
  discountType:'fixed_amount',discountValue:10,triggerConditions:[{id:'t',type:'cart_value_over',referenceId:'200'}]};
const pizzaOffer={id:'d',brandId:'b',locationIds:['l'],isActive:true,orderTypes:['pickup'],discountType:'product',referenceIds:['pizza'],discountMethod:'percentage',discountValue:20};
const topping=price=>({id:'x',name:'Ekstra',price});

// Shows the offer exactly when checkout accepts the discounted cola, using the same lines.
function scenario(lines,discounts=[]){
  const shown=upsellCartValue(lines.map(l=>l.cart))>200;
  const items=[...lines.map(l=>({name:l.cart.id,quantity:l.cart.quantity,unitPrice:l.cart.price,totalPrice:(l.cart.price+l.cart.toppings.reduce((n,t)=>n+t.price,0))*l.cart.quantity})),
    {name:'Cola',quantity:1,unitPrice:20,totalPrice:20,upsellId:'u'}];
  const catalog=[...lines.map(l=>({id:l.cart.id,tags:[],isCombo:l.cart.itemType==='combo',price:l.catalogPrice})),{id:'cola',tags:[],isCombo:false,price:30}];
  let accepted=true;
  try{validateCheckoutPrices(items,catalog,discounts,[upsell],scope);}catch{accepted=false;}
  return {shown,accepted};
}
const product=(id,price,basePrice,toppings=[],quantity=1,itemType='product')=>({id,itemType,price,basePrice,quantity,toppings});

test('options do not lift the cart over the threshold (offer would be rejected at checkout)',()=>{
  assert.deepEqual(scenario([{cart:product('pizza',180,180,[topping(30)]),catalogPrice:180}]),{shown:false,accepted:false});
});
test('standard offers count at their discounted price, as checkout does',()=>{
  assert.deepEqual(scenario([{cart:product('pizza',200,250),catalogPrice:250}],[pizzaOffer]),{shown:false,accepted:false});
  assert.deepEqual(scenario([{cart:product('pizza',200,250,[],2),catalogPrice:250}],[pizzaOffer]),{shown:true,accepted:true});
});
test('combos and quantities count toward the threshold and are accepted',()=>{
  assert.deepEqual(scenario([{cart:product('menu',105,105,[],1,'combo'),catalogPrice:105},{cart:product('pizza',100,100),catalogPrice:100}]),{shown:true,accepted:true});
});
test('exactly the threshold does not trigger on either side',()=>{
  assert.deepEqual(scenario([{cart:product('pizza',100,100,[],2),catalogPrice:100}]),{shown:false,accepted:false});
});
test('value is computed in whole øre',()=>{
  assert.equal(upsellCartValue([product('a',0.1,0.1,[],3),product('b',0.2,0.2)]),0.5);
});
test('the storefront sends this shared value to the recommendation endpoint',()=>{
  const source=require('node:fs').readFileSync('src/context/storefront-catalog.tsx','utf8');
  assert.match(source,/cartTotal: upsellCartValue\(cartItems\)/);
});
