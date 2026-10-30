const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {relevantUpsellProducts}=loadTs('src/lib/relevant-upsell-products.ts');
const catalog=[{id:'drink',price:30,isActive:true},{id:'dip',price:10,isActive:true},{id:'dessert',price:45,isActive:true},{id:'off',isActive:false}];
test('offers retain configured order using native catalog price, removing duplicates and unavailable IDs',()=>{
 assert.deepEqual(relevantUpsellProducts([{id:'dessert',price:0},{id:'unknown'},{id:'dip'},{id:'dessert'},{id:'off'}],catalog,[]),[catalog[2],catalog[1]]);
});
test('standalone and combo selections already in cart are not recommended again',()=>{
 const cart=[{id:'drink',itemType:'product'},{id:'combo',itemType:'combo',comboSelections:[{products:[{id:'dessert'}]}]}];
 assert.deepEqual(relevantUpsellProducts(catalog,catalog,cart),[catalog[1]]);
});
test('at most three distinct configured recommendations are displayed',()=>{
 const many=Array.from({length:10},(_,i)=>({id:String(i),isActive:true}));
 assert.equal(relevantUpsellProducts(many,many,[]).length,3);
});
const {productPriceData}=loadTs('src/lib/product-price.ts');
test('offer and standard discount compete on channel base price and never stack',()=>{
 const product={id:'p',categoryId:'pizza',price:70,priceDelivery:100,basePrice:100};
 const discount={discountMethod:'percentage',discountValue:20,discountType:'product',referenceIds:['p']};
 const offerWins=productPriceData(product,[discount],'delivery');
 assert.equal(offerWins.basePrice,100);assert.equal(offerWins.finalPrice,70);assert.equal(offerWins.applicableDiscount,null);
 const standardWins=productPriceData(product,[{...discount,discountValue:40}],'delivery');
 assert.equal(standardWins.finalPrice,60);assert.equal(standardWins.applicableDiscount.discountValue,40);
});
test('combo-only components never become standalone upsell recommendations',()=>{
 const products=[...catalog,{id:'chili',price:0,isActive:true,comboOnly:true}];
 assert.deepEqual(relevantUpsellProducts([{id:'chili'}],products,[]),[]);
});
