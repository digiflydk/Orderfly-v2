const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { cartChoices, cartChoiceSchema, readCartSnapshot, CART_STORAGE_KEY } = loadTs('src/lib/cart-snapshot.ts');
const { putCartItem } = loadTs('src/lib/cart-edit.ts');
const { cartPriceSignature } = loadTs('src/lib/cart-utils.ts');
const line = (quantity = 1) => ({id:'pizza',cartItemId:'line',itemType:'product',quantity:1,productName:'Pizza',brandId:'b',basePrice:75,price:75,itemTotal:75,toppings:[{id:'cheese',name:quantity > 1 ? `${quantity} × Cheese` : 'Cheese',price:0,unitPrice:0,quantity}]});
test('quantity identities survive snapshot JSON without trusting option prices', () => {
 const choices=cartChoices([line(2)]);
 assert.deepEqual(choices[0].toppingIds,['cheese']);
 assert.deepEqual(choices[0].toppingQuantities,[2]);
 assert.equal('price' in choices[0],false);
 const saved={version:1,brandId:'b',locationId:'l',deliveryType:'pickup',includeBagFee:true,choices,savedAt:1000};
 const snapshot=readCartSnapshot({getItem:key=>key===CART_STORAGE_KEY?JSON.stringify(saved):null},1001);
 assert.deepEqual(snapshot.choices[0].toppingQuantities,[2]);
});
test('legacy quantities default to one and malformed or mismatched quantity arrays are rejected', () => {
 const legacy={id:'pizza',cartItemId:'line',itemType:'product',quantity:1,toppings:['Cheese'],toppingIds:['cheese']};
 assert.equal(cartChoiceSchema.safeParse(legacy).success,true);
 for(const toppingQuantities of [[],[0],[-1],[1.5],[51],[1,2],[Infinity]]) {
  assert.equal(cartChoiceSchema.safeParse({...legacy,toppingQuantities}).success,false,JSON.stringify(toppingQuantities));
 }
 assert.equal(cartChoiceSchema.safeParse({...legacy,toppingIds:undefined,toppingQuantities:[2]}).success,false);
 assert.equal(cartChoiceSchema.safeParse({...legacy,toppingIds:['cheese','dip'],toppings:['Cheese','Dip'],toppingQuantities:[30,21]}).success,false);
});
test('different quantities of a free option never merge into one cart row', () => {
 const one=line(1),two={...line(2),cartItemId:'second'};
 assert.equal(putCartItem([one],two).length,2);
 assert.notEqual(cartPriceSignature([one]),cartPriceSignature([{...two,cartItemId:'line'}]));
 const identical={...line(1),cartItemId:'second'};
 assert.equal(putCartItem([one],identical)[0].quantity,2);
});
test('a stale editor cannot overwrite an intervening option quantity change', () => {
 const expected=line(1),changed=line(2);
 assert.equal(putCartItem([changed],{...line(1),quantity:2},expected),null);
});
test('explicit removal retains native identity and printable label', () => {
 const item={...line(),toppings:[{id:'without-onion',name:'Uden løg',price:0,unitPrice:0,quantity:1}]};
 const choice=cartChoices([item])[0];
 assert.deepEqual(choice.toppings,['Uden løg']);
 assert.deepEqual(choice.toppingIds,['without-onion']);
 assert.deepEqual(choice.toppingQuantities,[1]);
});
