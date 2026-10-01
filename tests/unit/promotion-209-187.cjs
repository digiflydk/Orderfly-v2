const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {Timestamp}=require('firebase-admin/firestore');
const {PassThrough}=require('node:stream');
// Use Next's actual Flight serializer, so a nested Timestamp cannot pass as a plain fixture.
const Module=require('node:module'),originalLoad=Module._load;
Module._load=function(name,...rest){if((name==='react'||name==='next/dist/compiled/react'))return require('next/dist/compiled/react/react.react-server');if(name==='react-dom')return require('next/dist/compiled/react-dom/react-dom.react-server');return originalLoad.call(this,name,...rest);};
const {renderToPipeableStream}=require('next/dist/compiled/react-server-dom-webpack/server.node');
Module._load=originalLoad;
async function flight(value){const errors=[];const output=new PassThrough();let text='';output.on('data',chunk=>text+=chunk);await new Promise((resolve,reject)=>{output.on('end',resolve);output.on('error',reject);renderToPipeableStream(value,{}, {onError:e=>{errors.push(e.message);return 'QA209';}}).pipe(output);});return {errors,text};}
const base={id:'qa',brandId:'b',locationIds:['l'],code:'QA20261002',applicationType:'code',discountType:'percentage',discountValue:10,isActive:true,orderTypes:['pickup'],activeDays:[],activeTimeSlots:[],usageLimit:0,perCustomerLimit:0,usedCount:7,orderReference:'ORD-preserve',applicationHistory:[{applicationType:'newsletter_signup',code:'NEWSLETTER_SIGNUP',changedAt:Timestamp.fromMillis(1790880595044)}],audit:{nested:[{at:Timestamp.fromMillis(1790880595044)}]}};
function dbFor(data){const record={id:'qa',exists:true,data:()=>data};return {collection:()=>({doc:()=>({get:async()=>record}),where(){return this;},limit(){return this;},get:async()=>({size:1,docs:[record]})})};}
test('before-fix shape reproduces Flight rejection for nested history Timestamp',async()=>{assert.ok((await flight(base)).errors.some(e=>/plain objects/.test(e)));});
test('admin list/detail preserve complete history and serialize with actual Flight',async()=>{
 const api=loadTs('src/app/superadmin/discounts/actions.ts',{'server-only':{},'next/cache':{},'next/navigation':{},'@/lib/access/scoped-data':{listScopedDocuments:async()=>[{id:'qa',data:()=>base}],getScopedDocument:async()=>({id:'qa',data:()=>base})}});
 for(const result of [(await api.getDiscounts())[0],await api.getDiscountById('qa')]){assert.deepEqual((await flight(result)).errors,[]);assert.equal(result.applicationHistory[0].changedAt.getTime(),1790880595044);assert.equal(result.usedCount,7);assert.equal(result.orderReference,'ORD-preserve');assert.equal(result.audit.nested[0].at.getTime(),1790880595044);}
 assert.ok(base.applicationHistory[0].changedAt instanceof Timestamp);
});
test('checkout converted code read serializes successfully; manual newsletter is rejected',async()=>{
 const data={...base};const api=loadTs('src/lib/server/checkout-discounts.ts',{'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>dbFor(data)}});
 const result=await api.getDiscountByCode(base.code,'b');assert.equal(result.id,'qa');assert.deepEqual((await flight({success:true,discount:result})).errors,[]);assert.equal(result.applicationHistory.length,1);
 data.applicationType='newsletter_signup';data.code='NEWSLETTER_SIGNUP';assert.equal(await api.getDiscountByCode(data.code,'b'),null);
 delete data.applicationType;assert.equal(await api.getDiscountByCode(data.code,'b'),null);
});
test('code/newsletter/code transaction preserves dates, history, usage and references; rejects reserved/empty code',async()=>{
 let saved={...base,startDate:Timestamp.fromDate(new Date('2026-10-02T10:22:33.044Z')),endDate:Timestamp.fromDate(new Date('2026-10-04T13:44:55.123Z'))};const api=loadTs('src/app/superadmin/discounts/actions.ts',{'server-only':{},'next/cache':{revalidatePath(){}},'next/navigation':{redirect(){throw Error('REDIRECT')}},'@/lib/firebase-admin':{getAdminDb:()=>dbFor(saved)},'@/lib/access/scoped-data':{mutateScopedDocument:async(c,id,p,scope,update)=>{saved=await update(saved,{get:async()=>({docs:saved.applicationType==='code'?[{id:'other-newsletter'}]:[]})});}}});
 const form=type=>{const f=new FormData();for(const [k,v]of Object.entries({...base,applicationType:type,startDate:'2026-10-02',endDate:'2026-10-04'})){if(['applicationHistory','audit'].includes(k))continue;if(k==='activeTimeSlots')f.set(k,'[]');else if(Array.isArray(v))v.forEach(x=>f.append(k,x));else f.set(k,String(v));}return f;};
 await assert.rejects(api.createOrUpdateDiscount(null,form('newsletter_signup')),/REDIRECT/);
 const before=saved;for(const code of ['','NEWSLETTER_SIGNUP']){const f=form('code');f.set('code',code);const result=await api.createOrUpdateDiscount(null,f);assert.equal(result.error,true);assert.ok(result.errors.some(e=>e.path.includes('code')));assert.equal(saved,before);}
 await assert.rejects(api.createOrUpdateDiscount(null,form('code')),/REDIRECT/);
 assert.equal(saved.id,'qa');assert.equal(saved.usedCount,7);assert.equal(saved.orderReference,'ORD-preserve');assert.equal(saved.applicationHistory.length,3);assert.deepEqual(saved.applicationHistory[0],base.applicationHistory[0]);assert.equal(saved.startDate.toDate().toISOString(),'2026-10-02T10:22:33.044Z');assert.equal(saved.endDate.toDate().toISOString(),'2026-10-04T13:44:55.123Z');
});
const cal=loadTs('src/lib/promotion-calendar.ts');
for(const day of ['2026-10-02','2026-10-04','2026-10-24','2026-10-26'])test(`date ${day} remains selected, has inclusive Copenhagen end and no unchanged-instant migration`,()=>{assert.equal(cal.calendarDay(cal.calendarDate(day)),day);const end=cal.promotionBoundary(day,true);assert.equal(cal.promotionDay(end),day);assert.notEqual(cal.promotionDay(new Date(+end+1)),day);const legacy=new Date(day+'T12:34:56.123Z');assert.equal(+cal.savedPromotionDate(day,legacy,true),+legacy);});
test('actual checkout validation returns Flight-safe converted code and correct 140 - 14 + 4 price without writes',async()=>{
 const readers=loadTs('src/lib/server/checkout-discounts.ts',{'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>dbFor(base)}});
 const f=await require('../helpers/checkout-fixture.cjs').checkout({createOnly:true,discountReaders:readers});
 const result=await f.actions.validateDiscountAction(base.code,'b','l',140,'pickup');assert.equal(result.success,true,result.message);assert.deepEqual((await flight(result)).errors,[]);
 const {basketTotals}=loadTs('src/lib/basket-totals.ts');const total=basketTotals({cartItems:[{id:'pepsi',itemType:'product',productName:'Pepsi',basePrice:20,price:20,quantity:7,toppings:[]}],appliedDiscount:result.discount,standardDiscounts:[],deliveryType:'pickup',location:{},brand:{bagFee:4},includeBagFee:true});assert.equal(total.voucherDiscount.amount,14);assert.equal(total.checkoutTotal,130);assert.deepEqual(f.writes,[]);assert.deepEqual(f.events,[]);
});
for(const day of ['2026-10-02','2026-10-04','2026-10-24','2026-10-25','2026-10-26'])test(`controlled clock: actual checkout accepts inclusive last millisecond of ${day} and rejects next day`,async t=>{
 const data={...base,startDate:cal.promotionBoundary(day),endDate:cal.promotionBoundary(day,true)};
 const readers=loadTs('src/lib/server/checkout-discounts.ts',{'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>dbFor(data)}});
 const f=await require('../helpers/checkout-fixture.cjs').checkout({createOnly:true,discountReaders:readers});t.mock.timers.enable({apis:['Date'],now:+data.endDate});
 assert.equal((await f.actions.validateDiscountAction(base.code,'b','l',140,'pickup')).success,true);
 t.mock.timers.setTime(+data.endDate+1);assert.match((await f.actions.validateDiscountAction(base.code,'b','l',140,'pickup')).message,/udløbet/);
 t.mock.timers.setTime(+data.startDate-1);assert.match((await f.actions.validateDiscountAction(base.code,'b','l',140,'pickup')).message,/endnu ikke aktiv/);
 assert.deepEqual(f.writes,[]);
});
