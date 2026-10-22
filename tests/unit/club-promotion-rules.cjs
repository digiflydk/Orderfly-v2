const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const rules=loadTs('src/lib/promotion-rules.ts');
test('signup modes preserve legacy newsletter but reject malformed/cross-brand configuration',()=>{
 assert.equal(rules.checkoutSignupMode(undefined,'b'),'newsletter');
 for(const mode of ['none','newsletter','club']) assert.equal(rules.checkoutSignupMode({brandId:'b',settings:{checkoutMode:mode}},'b'),mode);
 for(const config of [{brandId:'other',settings:{checkoutMode:'club'}},{brandId:'b',settings:{checkoutMode:'bad'}},{brandId:'b'},[],false]) assert.equal(rules.checkoutSignupMode(config,'b'),'none');
 assert.equal(rules.signupModeAllows('club_signup','newsletter'),false);
 assert.equal(rules.signupModeAllows('newsletter_signup','club'),false);
 assert.equal(rules.signupModeAllows('code','none'),true);
});
test('Club entitlement is personal, unused, and normal codes retain non-stacking behavior',()=>{
 assert.equal(rules.clubDiscountEligible('club1','club1',0),true);
 assert.equal(rules.clubDiscountEligible(undefined,'club1',0),false);
 assert.equal(rules.clubDiscountEligible('club2','club1',0),false);
 assert.equal(rules.clubDiscountEligible('club1','club1',1),false);
 assert.equal(rules.discountApplicationType({code:'CLUB_SIGNUP'}),'club_signup');
 assert.equal(rules.newsletterAllowsStacking({applicationType:'club_signup',allowStacking:true}),true);
 assert.equal(rules.newsletterAllowsStacking({applicationType:'code',allowStacking:true}),false);
});
function reservationFixture(mode='club') {
 let records={
  'discounts/d':{brandId:'b',applicationType:'club_signup',isActive:true,usageLimit:0,usedCount:0,perCustomerLimit:0},
  'customers/c':{brandId:'b',pendingClubDiscountId:'d'},
  'orders/o1':{brandId:'b',customerDetails:{id:'c'},appliedDiscountId:'d'},
  'orders/o2':{brandId:'b',customerDetails:{id:'c'},appliedDiscountId:'d'},
  'loyaltyCampaigns/b':{brandId:'b',settings:{checkoutMode:mode}},
 };
 let queue=Promise.resolve();
 const api=loadTs('src/lib/discount-reservations.ts',{'@/lib/server/firestore-compat':{
  db:{},doc:(_,collection,id)=>collection+'/'+id,serverTimestamp:()=>0,
  runTransaction:(_,fn)=>{
   const next=queue.then(async()=>{const draft=structuredClone(records);let wrote=false;const result=await fn({
    get:async ref=>{assert.equal(wrote,false,'all reads precede writes');return{exists:()=>Object.hasOwn(draft,ref),data:()=>draft[ref]};},
    set:(ref,data)=>{wrote=true;draft[ref]=data;},update:(ref,data)=>{wrote=true;draft[ref]={...draft[ref],...data};},
   });records=draft;return result;});queue=next.catch(()=>{});return next;
  },
 }});
 return{api,records:()=>records};
}
test('concurrent Club checkouts share one personal reservation even with no configured personal limit',async()=>{
 const f=reservationFixture();
 const result=await Promise.allSettled([f.api.reserveDiscount('o1','d','c','b'),f.api.reserveDiscount('o2','d','c','b')]);
 assert.equal(result.filter(x=>x.status==='fulfilled').length,1);
 assert.match(result.find(x=>x.status==='rejected').reason.message,/already used or reserved/);
 await f.api.reserveDiscount('o1','d','c','b'); // idempotent original hold
 assert.equal(f.records()['orders/o1'].discountReservation,'held');
});
test('an earned personal Club entitlement survives a change of checkout signup campaign',async()=>{
 const f=reservationFixture('newsletter');
 await f.api.reserveDiscount('o1','d','c','b');
 assert.equal(f.records()['orders/o1'].discountReservation,'held');
});
test('ordinary-code lookup never exposes Club signup promotions, including legacy reserved markers',async()=>{
 for(const data of [{applicationType:'club_signup',code:'x'},{applicationType:'code',code:'CLUB_SIGNUP'}]){
  const query={where(){return this;},limit(){return this;},async get(){return{size:1,docs:[{id:'d',data:()=>data}]};}};
  const api=loadTs('src/lib/server/checkout-discounts.ts',{'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>({collection:()=>query})}});
  assert.equal(await api.getDiscountByCode(data.code,'b'),null);
 }
});

test('a Club discount with no personal entitlement is rejected even in Club checkout mode',async()=>{
 const f=reservationFixture();delete f.records()['customers/c'].pendingClubDiscountId;
 await assert.rejects(f.api.reserveDiscount('o1','d','c','b'),/not available for this customer/);
 assert.equal(f.records()['orders/o1'].discountReservation,undefined);
});
