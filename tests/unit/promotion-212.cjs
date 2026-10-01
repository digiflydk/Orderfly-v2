const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {basketTotals}=loadTs('src/lib/basket-totals.ts');
const base={id:'qa',brandId:'b',locationIds:['l'],isActive:false,orderTypes:['pickup'],activeDays:['monday'],activeTimeSlots:[],minOrderValue:100,usageLimit:20,perCustomerLimit:2,code:'QA212',applicationType:'code',discountType:'percentage',discountValue:10};
function form(values){const f=new FormData();for(const[k,v]of Object.entries(values)){if(v===undefined||v===null)continue;if(['activeTimeSlots','quantityTiers','triggerConditions'].includes(k))f.set(k,JSON.stringify(v));else if(Array.isArray(v))v.forEach(x=>f.append(k,x));else if(typeof v==='boolean'){if(v)f.set(k,'true');}else f.set(k,String(v));}return f;}
function fixture(kind,initial){let saved=structuredClone(initial),writes=0;const ref={where(){return this;},doc(){return this;}};
 const api=loadTs(`src/app/superadmin/${kind}/actions.ts`,{'server-only':{},'next/cache':{revalidatePath(){},revalidateTag(){}},'next/navigation':{redirect(){throw Error('REDIRECT');}},'@/lib/access/orderfly-session':{verifiedOrderflyIdentity:async()=>({}),requireOrderflyAccess:async()=>({})},'@/lib/access/location-catalog':{},'../products/actions':{},'@/lib/firebase-admin':{getAdminDb:()=>({collection:()=>ref}),admin:{firestore:{Timestamp:{now:()=>0}}}},'@/lib/access/scoped-data':{getScopedDocument:async()=>({id:'qa',data:()=>saved}),mutateScopedDocument:async(c,id,p,s,update)=>{assert.equal(s,'locations');assert.equal(p,kind==='upsells'?'orderfly.catalog:edit':'orderfly.discounts:edit');const next=await update(saved,{get:async()=>({exists:true,data:()=>({brandId:'b'}),docs:[]})});saved=next;writes++;}}});
 return {api,get saved(){return saved;},get writes(){return writes;}};
}
for(const applicationType of ['code','newsletter_signup'])test(`${applicationType}: invalid percentage cannot overwrite stored value; 10 and 100 accepted`,async()=>{
 const f=fixture('discounts',base);
 for(const discountValue of [0,-1,101,'NaN','Infinity','10oops','']){const result=await f.api.createOrUpdateDiscount(null,form({...base,applicationType,discountValue}));assert.equal(result.error,true);assert.ok(result.errors.some(e=>e.path[0]==='discountValue'));assert.equal(f.writes,0);assert.equal(f.saved.discountValue,10);}
 for(const discountValue of [10,100]){await assert.rejects(f.api.createOrUpdateDiscount(null,form({...base,applicationType,discountValue})),/REDIRECT/);assert.equal(f.saved.discountValue,discountValue);}
 await assert.rejects(f.api.createOrUpdateDiscount(null,form({...base,discountType:'fixed_amount',discountValue:101})),/REDIRECT/);assert.equal(f.saved.discountValue,101);
});
test('clearing customer binding persists null and preserves usage, history, activation and eligibility',async()=>{
 const initial={...base,assignedToCustomerId:'customer',usedCount:7,orderReference:'existing',applicationHistory:[{code:'previous'}]};const f=fixture('discounts',initial);
 await assert.rejects(f.api.createOrUpdateDiscount(null,form({...base,assignedToCustomerId:''})),/REDIRECT/);
 const reopened=await f.api.getDiscountById('qa');assert.equal(reopened.assignedToCustomerId,null);
 for(const key of ['usedCount','orderReference','applicationHistory','isActive','minOrderValue','orderTypes','activeDays','usageLimit','perCustomerLimit'])assert.deepEqual(reopened[key],initial[key],key);
 await assert.rejects(f.api.createOrUpdateDiscount(null,form({...base,assignedToCustomerId:'customer'})),/REDIRECT/);assert.equal(f.saved.assignedToCustomerId,'customer');
});
test('upsell percentages reject non-finite, malformed, zero, negative and >100 before writes',async()=>{
 const initial={...base,upsellName:'QA upsell',offerType:'product',offerProductIds:['p'],triggerConditions:[{id:'t',type:'cart_value_over',referenceId:'100'}]};const f=fixture('upsells',initial);
 for(const discountValue of [0,-1,101,'NaN','Infinity','10oops','']){const result=await f.api.createOrUpdateUpsell(null,form({...initial,discountValue}));assert.equal(result.error,true);assert.ok(result.errors.some(e=>e.path[0]==='discountValue'));assert.equal(f.writes,0);assert.equal(f.saved.discountValue,10);}
 for(const discountValue of [10,100]){await assert.rejects(f.api.createOrUpdateUpsell(null,form({...initial,discountValue})),/REDIRECT/);assert.equal(f.saved.discountValue,discountValue);}
});
const standard={...base,discountName:'QA tiers',discountType:'product',referenceIds:['p'],discountMethod:'quantity_tiers',discountValue:undefined,timeSlotValidationType:'orderTime',quantityTiers:[{minQuantity:2,method:'percentage',value:10}]};
test('standard server rejects empty, duplicate, decimal, invalid-percent tiers and X <= Y without modifying prior data',async()=>{
 const f=fixture('standard-discounts',standard),tier=standard.quantityTiers[0];
 for(const patch of [{quantityTiers:[]},{quantityTiers:[tier,tier]},{quantityTiers:[{...tier,minQuantity:2.5}]},...[0,-1,101,'NaN','Infinity'].map(value=>({quantityTiers:[{...tier,value}]})),{discountMethod:'buy_x_pay_y',buyQuantity:2,payQuantity:2}]){const result=await f.api.createOrUpdateStandardDiscount(null,form({...standard,...patch}));assert.equal(result.error,true);assert.ok(result.errors.length);assert.equal(f.writes,0);assert.deepEqual(f.saved,standard);if(patch.quantityTiers?.length===0)assert.ok(result.errors.some(e=>e.path[0]==='quantityTiers'&&e.message==='Tilføj mindst ét gyldigt rabattrin.'));}
 for(const value of [10,100]){await assert.rejects(f.api.createOrUpdateStandardDiscount(null,form({...standard,quantityTiers:[{...tier,value}]})),/REDIRECT/);assert.equal(f.saved.quantityTiers[0].value,value);}
});
test('direct standard percentages reject 0/101/non-finite and accept 100, including cart',()=>{const {standardDiscountSchema:schema}=loadTs('src/lib/standard-discount-schema.ts');for(const discountType of ['product','cart'])for(const value of [0,-1,10,100,101,Infinity,NaN])assert.equal(schema.safeParse({...standard,discountType,discountMethod:'percentage',quantityTiers:undefined,discountValue:value}).success,value>0&&value<=100);});
test('tier 2 / 10%, ordinary 10%, and buy 3 pay 2 retain exact Pepsi pricing',()=>{
 const price=(quantity,standardDiscounts=[],appliedDiscount=null)=>basketTotals({cartItems:[{id:'p',productId:'p',itemType:'product',productName:'Pepsi',basePrice:20,price:20,quantity,toppings:[]}],standardDiscounts,appliedDiscount,deliveryType:'pickup',location:{},brand:{bagFee:4},includeBagFee:true});
 const eligible={...standard,isActive:true,activeDays:[],minOrderValue:0};
 assert.equal(price(2,[eligible]).checkoutTotal,40-4+4);
 assert.equal(price(2,[],{...base,isActive:true,activeDays:[],minOrderValue:0}).checkoutTotal,40-4+4);
 for(const quantity of [6,7])assert.equal(price(quantity,[{...eligible,discountMethod:'buy_x_pay_y',buyQuantity:3,payQuantity:2,quantityTiers:undefined}]).checkoutTotal,quantity*20-40+4);
});
