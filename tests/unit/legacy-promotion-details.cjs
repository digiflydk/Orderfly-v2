const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');

const dates = loadTs('src/lib/promotion-date.ts');
const forms = loadTs('src/lib/legacy-promotion-form.ts');
const timestamp = iso => ({ toDate: () => new Date(iso) });
// IDs/names are the QA targets. Stored field representations below exercise
// historical variants; they are not a production Firestore export.
const records = {
  raSE3kQxIEUSPPmM8RI2: { brandId:'esmeralda',locationIds:['amager'],code:'NEWSLETTER_SIGNUP',applicationType:'newsletter_signup',discountType:'percentage',discountValue:10,isActive:true,usageLimit:0,usedCount:2,perCustomerLimit:1,orderTypes:['pickup','delivery'],startDate:'2026-09-01T00:00:00.000Z',endDate:null,activeDays:['saturday'],activeTimeSlots:[{start:'11:00',end:'15:00'}],allowStacking:true },
  uP2DDd0J0zao4GSi5zmp: { brandId:'esmeralda',locationIds:['other-location'],code:'SUMMER20',discountType:'percentage',discountValue:20,isActive:true,usageLimit:10,usedCount:5,perCustomerLimit:1,orderTypes:['pickup'],startDate:timestamp('2026-07-01T00:00:00.000Z'),activeDays:[],activeTimeSlots:[] },
  Fk5pCg8dvTeA8jBC2jzQ: { brandId:'esmeralda',locationIds:['amager'],discountName:'Pizza Pizza',discountType:'product',referenceIds:['pizza'],discountMethod:'fixed_amount',discountValue:30,isActive:true,orderTypes:['pickup','delivery'],startDate:{_seconds:1782864000,_nanoseconds:0},activeDays:[],activeTimeSlots:[],allowStacking:false },
};
const mockActions = {
  'next/cache':{revalidatePath(){},revalidateTag(){}},
  'next/navigation':{redirect(){throw Error('REDIRECT')}},
  '@/lib/firebase-admin':{getAdminDb:()=>({collection:name=>({doc:id=>({id,path:`${name}/${id}`}),where:()=>({where:()=>({})})})})},
  '@/lib/access/orderfly-session':{requireOrderflyAccess:async()=>{},verifiedOrderflyIdentity:async()=>{}},
  '@/lib/access/scoped-data':{
    getScopedDocument:async (_,id)=>records[id] ? {id,data:()=>records[id]} : null,
    mutateScopedDocument:async (collection,id,permission,scope,fn)=>{
      const before=records[id];
      const after=await fn(before,{get:async ref=>({exists:ref.id==='pizza',data:()=>({brandId:'esmeralda'}),docs:[]})});
      records[id]=after;
    },
  },
  'firebase-admin/firestore':{Timestamp:{now:()=>timestamp('2026-09-28T10:00:00Z'),fromDate:date=>timestamp(date.toISOString())}},
};
const codes=loadTs('src/app/superadmin/discounts/actions.ts',mockActions);
const standard=loadTs('src/app/superadmin/standard-discounts/actions.ts',mockActions);
function data(values) {const form=new FormData(); for(const [key,value] of Object.entries(values)) {
  if(value == null)continue;
  if(key==='activeTimeSlots'||key==='quantityTiers')form.set(key,JSON.stringify(value));
  else if(Array.isArray(value))value.forEach(item=>form.append(key,String(item)));
  else form.set(key,String(value));
} return form;}

test('legacy Firestore, ISO, seconds and invalid dates are safe to render',()=>{
  assert.equal(dates.promotionDate(timestamp('2026-09-01T00:00:00Z')).toISOString(),'2026-09-01T00:00:00.000Z');
  assert.equal(dates.promotionDate({_seconds:1782864000,_nanoseconds:0}).toISOString(),'2026-07-01T00:00:00.000Z');
  assert.equal(dates.promotionDate('bad historical date'),undefined);
  assert.equal(dates.promotionDate({toDate(){throw Error('bad legacy timestamp')}}),undefined);
});

test('QA target details load and preserve legacy campaign meaning',async()=>{
  const newsletter=forms.discountFormRecord(await codes.getDiscountById('raSE3kQxIEUSPPmM8RI2'));
  const summer=forms.discountFormRecord(await codes.getDiscountById('uP2DDd0J0zao4GSi5zmp'));
  const pizza=forms.standardDiscountFormRecord(await standard.getStandardDiscountById('Fk5pCg8dvTeA8jBC2jzQ'));
  assert.equal(newsletter.startDate.toISOString(),'2026-09-01T00:00:00.000Z');
  assert.equal(newsletter.applicationType,'newsletter_signup');
  assert.deepEqual(newsletter.activeTimeSlots,[{start:'11:00',end:'15:00'}]);
  assert.equal(summer.usedCount,5);
  assert.deepEqual(summer.locationIds,['other-location']);
  assert.equal(pizza.startDate,'2026-07-01T00:00:00.000Z');
  assert.equal(pizza.discountMethod,'fixed_amount');
  assert.equal(pizza.discountValue,30);
  assert.equal(pizza.timeSlotValidationType,'orderTime');
});

test('editing existing code and standard discount does not reset usage or legacy extras',async()=>{
  const newsletter=forms.discountFormRecord(await codes.getDiscountById('raSE3kQxIEUSPPmM8RI2'));
  await assert.rejects(codes.createOrUpdateDiscount(null,data({...newsletter,startDate:'2026-09-01',isActive:'true',allowStacking:'true'})),/REDIRECT/);
  assert.equal(records.raSE3kQxIEUSPPmM8RI2.usedCount,2);
  assert.equal(records.raSE3kQxIEUSPPmM8RI2.applicationType,'newsletter_signup');
  assert.deepEqual(records.raSE3kQxIEUSPPmM8RI2.activeDays,['saturday']);
  assert.deepEqual(records.raSE3kQxIEUSPPmM8RI2.activeTimeSlots,[{start:'11:00',end:'15:00'}]);
  const summer=forms.discountFormRecord(await codes.getDiscountById('uP2DDd0J0zao4GSi5zmp'));
  records.uP2DDd0J0zao4GSi5zmp.legacyField='retain';
  records.uP2DDd0J0zao4GSi5zmp.endDate={legacyUnknown:'keep for review'};
  await assert.rejects(codes.createOrUpdateDiscount(null,data({...summer,startDate:'2026-07-01',endDate:'',isActive:'true'})),/REDIRECT/);
  assert.equal(records.uP2DDd0J0zao4GSi5zmp.usedCount,5);
  assert.equal(records.uP2DDd0J0zao4GSi5zmp.legacyField,'retain');
  assert.deepEqual(records.uP2DDd0J0zao4GSi5zmp.endDate,{legacyUnknown:'keep for review'});
  assert.deepEqual(records.uP2DDd0J0zao4GSi5zmp.locationIds,['other-location']);
  const pizza=forms.standardDiscountFormRecord(await standard.getStandardDiscountById('Fk5pCg8dvTeA8jBC2jzQ'));
  records.Fk5pCg8dvTeA8jBC2jzQ.endDate={legacyUnknown:'keep for review'};
  const saved=data({...pizza,startDate:pizza.startDate,isActive:'on',activeTimeSlots:[]});
  await assert.rejects(standard.createOrUpdateStandardDiscount(null,saved),/REDIRECT/);
  assert.equal(records.Fk5pCg8dvTeA8jBC2jzQ.discountValue,30);
  assert.deepEqual(records.Fk5pCg8dvTeA8jBC2jzQ.referenceIds,['pizza']);
  assert.deepEqual(records.Fk5pCg8dvTeA8jBC2jzQ.endDate,{legacyUnknown:'keep for review'});
  const clear=data({...pizza,startDate:null,isActive:'on',clearStartDate:'true'});
  await assert.rejects(standard.createOrUpdateStandardDiscount(null,clear),/REDIRECT/);
  assert.equal(records.Fk5pCg8dvTeA8jBC2jzQ.startDate,null);
});
