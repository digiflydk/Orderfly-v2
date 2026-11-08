const {test}=require('node:test');const assert=require('node:assert/strict');const {loadTs}=require('../helpers/load-ts.cjs');
test('bundle prepares native-priced product branches, keeps child badges, and never chains a second lookup',async()=>{
 const inputs=[];
 const lookup=async input=>{
  inputs.push(input);
  return input.previousUpsellId?{upsell:{id:'child',upsellName:'Dessert',discountType:'percentage',discountValue:20,badgeOverrides:{dessert:'recommended'}},products:[{id:'dessert'}]}:{upsell:{id:'first',upsellName:'Drink',discountType:'percentage',discountValue:10},products:[{id:'soda',price:20,priceDelivery:30},{id:'options',price:40,toppingGroupIds:['g']}]};
 };
 const {POST}=loadTs('src/app/api/public/upsell/route.ts',{
  '@/app/superadmin/upsells/actions':{getActiveUpsellForCart:lookup},
  '@/lib/url':{getOrigin:async()=> 'https://test.local'},
  '@/lib/firebase-admin':{getAdminDb:()=>({collection:()=>({doc:()=>({get:async()=>({exists:true,data:()=>({brandId:'b',isActive:true,deliveryTypes:['delivery']})})})})})},
  '@/lib/server/upsell-sales':{upsellSales:async()=>({soda:10})},
 });
 const body={brandId:'b',locationId:'l',deliveryType:'delivery',cartTotal:100,cartItems:[{id:'pizza',quantity:1,totalPrice:100}]};
 const request=x=>new Request('https://test.local/api/public/upsell',{method:'POST',headers:{origin:'https://test.local'},body:JSON.stringify(x)});
 const response=await POST(request(body));assert.equal(response.status,200);const data=await response.json();
 assert.equal(inputs.length,2);assert.equal(inputs[1].cartItems.at(-1).totalPrice,27);assert.equal(inputs[1].cartItems.at(-1).upsellId,'first');
 assert.equal(data.followups.soda.upsell.id,'child');assert.equal(data.followups.soda.badges.dessert,'recommended');assert.equal(data.followups.options,undefined);
 inputs.length=0;const second=await(await POST(request({...body,previousUpsellId:'first'}))).json();
 assert.equal(inputs.length,1);assert.equal(second.followups,undefined);
});
