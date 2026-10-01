const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {checkout}=require('../helpers/checkout-fixture.cjs');
const calendar=loadTs('src/lib/promotion-calendar.ts');
const {basketTotals}=loadTs('src/lib/basket-totals.ts');

for(const [day,start,end] of [
 ['2026-10-02','2026-10-01T22:00:00.000Z','2026-10-02T21:59:59.999Z'],
 ['2026-10-04','2026-10-03T22:00:00.000Z','2026-10-04T21:59:59.999Z'],
 ['2026-09-19','2026-09-18T22:00:00.000Z','2026-09-19T21:59:59.999Z'],
 ['2026-03-29','2026-03-28T23:00:00.000Z','2026-03-29T21:59:59.999Z'],
 ['2026-10-25','2026-10-24T22:00:00.000Z','2026-10-25T22:59:59.999Z'],
])test(`calendar ${day}: roundtrip, Copenhagen start and inclusive end including DST`,()=>{
 assert.equal(calendar.calendarDay(calendar.calendarDate(day)),day);
 assert.equal(calendar.promotionBoundary(day).toISOString(),start);
 assert.equal(calendar.promotionBoundary(day,true).toISOString(),end);
 for(const value of [start,end])assert.equal(calendar.promotionDay(value),day);
});
test('legacy dates retain exact instants until a calendar day is changed; invalid dates rejected',()=>{
 assert.equal(calendar.savedPromotionDate('2026-10-02','2026-10-02T00:00:00Z',true).toISOString(),'2026-10-02T00:00:00.000Z');
 assert.equal(calendar.savedPromotionDate('2026-10-04','2026-10-02T00:00:00Z',true).toISOString(),'2026-10-04T21:59:59.999Z');
 for(const day of ['2026-02-30','bad','2026-13-01'])assert.throws(()=>calendar.promotionBoundary(day),/kalenderdato/);
});
const offer={id:'n',brandId:'b',code:'NEWSLETTER_SIGNUP',isActive:true,locationIds:['l'],orderTypes:['pickup'],activeDays:[],activeTimeSlots:[],discountType:'percentage',discountValue:10,usageLimit:0,usedCount:0,perCustomerLimit:0,allowStacking:true};
test('legacy newsletter lookup selects the best eligible campaign and performs no writes or provider calls',async()=>{
 const f=await checkout({createOnly:true,seed:[['discounts/n',offer],['discounts/stronger',{...offer,applicationType:'newsletter_signup',discountValue:20}],['discounts/wrong-location',{...offer,discountValue:90,locationIds:['other']}]]});
 const result=await f.actions.getNewsletterSignupDiscountAction('b','l',115,'pickup','okh2071@gmail.com',{undiscounted:0,charged:115});
 assert.equal(result.id,'stronger');assert.equal(result.applicationType,'newsletter_signup');
 assert.deepEqual(f.writes,[]);assert.deepEqual(f.events,[]);
});
test('newsletter config and customer/location/date eligibility fail closed without side effects',async()=>{
 const variants=[{marketingConfigured:false},{campaign:{locationIds:['foreign']}},{campaign:{isActive:false}},{campaign:{startDate:new Date('2099-10-02')}},{campaign:{endDate:new Date('2001-10-02')}},{campaign:{allowStacking:false}},{campaign:{minOrderValue:116}}];
 for(const variant of variants){
  const f=await checkout({createOnly:true,marketingConfigured:variant.marketingConfigured??true,seed:[['discounts/n',{...offer,...variant.campaign}]]});
  assert.equal(await f.actions.getNewsletterSignupDiscountAction('b','l',115,'pickup','okh@digifly.dk',{undiscounted:0,charged:115}),null);
  assert.deepEqual(f.writes,[]);assert.deepEqual(f.events,[]);
 }
});
test('115 kr combo including upgrades/toppings gives 11.50 off and 107.50 with bag; opt-out restores 119',()=>{
 const item={id:'combo',itemType:'combo',productName:'Combo',basePrice:105,price:105,quantity:1,toppings:[{id:'dressing',price:10}]};
 const calculate=appliedDiscount=>basketTotals({cartItems:[item],appliedDiscount,standardDiscounts:[],deliveryType:'pickup',location:{},brand:{bagFee:4},includeBagFee:true});
 const active=calculate({...offer,applicationType:'newsletter_signup'});
 assert.equal(active.voucherDiscount.amount,11.5);assert.equal(active.checkoutTotal,107.5);
 assert.equal(calculate({...offer,applicationType:'newsletter_signup',allowStacking:false}).voucherDiscount,null);
 assert.equal(calculate(null).checkoutTotal,119);
});
test('stale cart discount fails before customer, consent, reservation, order or payment writes',async()=>{
 for(const cartDiscountTotal of [0,999]){
  const f=await checkout({kind:'newsletter',paymentOverrides:{cartDiscountTotal,discountTotal:cartDiscountTotal}});
  assert.equal(f.result.success,false);assert.match(f.result.error,/Priser eller tilbud er ændret/);
  assert.deepEqual(f.writes,[]);assert.deepEqual(f.events,[]);
 }
 const accepted=await checkout({kind:'code',paymentOverrides:{cartDiscountTotal:10,discountTotal:10}});
 assert.equal(accepted.result.success,true,accepted.result.error);
});
test('brand and locations return complete RSC-safe records, including unnamed legacy locations',async()=>{
 class Timestamp{toDate(){return new Date('2026-10-01T10:00:00Z');}}
 const {brandRecord}=loadTs('src/lib/brand-record.ts');
 assert.ok(brandRecord('b',{name:'Brand',nested:{createdAt:new Timestamp()}}).nested.createdAt instanceof Date);
 const api=loadTs('src/app/superadmin/locations/actions.ts',{'server-only':{},
  '@/lib/access/native-catalog':{selectorCatalog:async()=>({superuser:true})},
  '@/lib/firebase-admin':{getAdminDb:()=>({collection:()=>({get:async()=>({docs:[{id:'l',data:()=>({brandId:'missing-brand',deliveryTypes:['pickup'],nested:{createdAt:new Timestamp()},setting:'preserve'})}]})})})},
 });
 const rows=await api.getAllLocations();
 assert.equal(rows.length,1);assert.equal(rows[0].name,'Restaurant (l)');assert.equal(rows[0].setting,'preserve');
 assert.ok(rows[0].nested.createdAt instanceof Date);assert.equal(rows[0].supportsPickup,true);
 const check=value=>{if(value && typeof value==='object' && !(value instanceof Date)){assert.ok(Array.isArray(value)||Object.getPrototypeOf(value)===Object.prototype);Object.values(value).forEach(check);}};check(rows);
});
test('code to newsletter saves despite existing reserved marker; retains document, used count and prior code history',async()=>{
 let saved={...offer,applicationType:'code',code:'QA2809PICKUP10E2E4',usedCount:7,orderReference:'keep'};
 const api=loadTs('src/app/superadmin/discounts/actions.ts',{'server-only':{},
  'next/cache':{revalidatePath(){}},'next/navigation':{redirect(){throw Error('REDIRECT')}},
  '@/lib/firebase-admin':{getAdminDb:()=>({collection:()=>({where(){return this;}})})},
  '@/lib/access/scoped-data':{
   mutateScopedDocument:async(c,id,p,scope,update)=>{assert.equal(c,'discounts');assert.equal(id,'n');assert.equal(p,'orderfly.discounts:edit');saved=await update(saved,{get:async()=>({docs:[{id:'other-newsletter'}]})});},
   getScopedDocument:async()=>({id:'n',data:()=>saved}),
  },
 });
 const form=new FormData();for(const [key,value]of Object.entries({...offer,applicationType:'newsletter_signup'})){
  if(key==='activeTimeSlots')form.set(key,JSON.stringify(value));else if(Array.isArray(value))value.forEach(v=>form.append(key,v));else form.set(key,String(value));
 }
 await assert.rejects(api.createOrUpdateDiscount(null,form),/REDIRECT/);
 const reopened=await api.getDiscountById('n');assert.equal(reopened.applicationType,'newsletter_signup');assert.equal(reopened.usedCount,7);assert.equal(reopened.orderReference,'keep');assert.equal(reopened.applicationHistory[0].code,'QA2809PICKUP10E2E4');
});

test('a newly active item promotion rejects the stale higher price before any checkout write',async()=>{
 const standardDiscounts=[{id:'auto',brandId:'b',locationIds:['l'],isActive:true,orderTypes:['pickup'],activeDays:[],activeTimeSlots:[],discountType:'product',referenceIds:['p'],discountMethod:'percentage',discountValue:20}];
 const f=await checkout({standardDiscounts,paymentOverrides:{cartDiscountTotal:0,discountTotal:0}});
 assert.equal(f.result.success,false);assert.match(f.result.error,/Priser eller tilbud er ændret/);assert.deepEqual(f.writes,[]);assert.deepEqual(f.events,[]);
});
