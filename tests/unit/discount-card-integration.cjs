// Cross-module business-flow tests. Only external storage/I/O is synthetic.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {memoryDb}=require('../helpers/marketing-db.cjs');
const mocks={'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>{throw Error('unexpected global database')}},'@/lib/feedback/mail-config':{notificationPlatformConfig:()=>({endpoint:'https://example.com/unused',secret:'synthetic-config'})}};
const admin=loadTs('src/lib/loyalty/discount-card/admin.ts',mocks);
const checkout=loadTs('src/lib/loyalty/discount-card/checkout.ts',mocks);
const invites=loadTs('src/lib/loyalty/discount-card/invitations.ts',mocks);
const {principalKey}=loadTs('src/lib/access/authority.ts',mocks);
const {hashKey}=loadTs('src/lib/loyalty/stamp-card/model.ts',mocks);
const {discountCardAssignmentId}=loadTs('src/lib/loyalty/discount-card/model.ts',mocks);
const NOW=Date.parse('2026-10-24T12:00:00Z'),TOKEN='a'.repeat(64);
const actor=name=>({identity:{provider:'firebase',subject:name},name});
const owner=actor('owner');
const query=(overrides={})=>({brandId:'brand',brandSlug:'club',locationId:'loc',token:TOKEN,customerId:'customer',email:'member@example.com',now:NOW,...overrides});
const assignment=(overrides={})=>({brandId:'brand',customerId:'customer',memberId:'member',groupId:'friends',version:0,status:'active',startsAt:null,expiresAt:null,...overrides});
const feature=(overrides={})=>({brandId:'brand',version:0,enabled:true,locationScope:{mode:'selected',locationIds:['loc']},...overrides});
const group=(overrides={})=>({brandId:'brand',id:'friends',version:0,name:'Friends',percentage:20,active:true,...overrides});
const state=db=>structuredClone([...db.rows]);
const brand={brandId:'brand',companyId:'company',slug:'club',name:'Club'};
const ctx={now:NOW,ip:'203.0.113.77'};
process.env.ORDERFLY_LOYALTY_NOTIFICATION_BRANDS=JSON.stringify({brand:{organizationId:'11111111-1111-4111-8111-111111111111',senderProfile:'orderfly'}});
function fixture(){
 const db=memoryDb(),original=db.runTransaction;
 db.runTransaction=fn=>original(tx=>{let wrote=false;const strict={...tx,get:ref=>{assert.equal(wrote,false,'Firestore transaction read after write');return tx.get(ref)}};
  for(const op of ['create','set','update','delete'])strict[op]=(...args)=>{wrote=true;return tx[op](...args)};return fn(strict);});
 db.rows.set('platformAdminControl/access-v1',{
  principals:['owner','staff'].map(n=>({id:principalKey(actor(n).identity),active:true})),
  companies:[{id:'company',active:true,locationIds:['loc','loc2'],orderflyBrandIds:['brand'],opsflyOrganizationId:null},{id:'other-company',active:true,locationIds:['foreign'],orderflyBrandIds:['other'],opsflyOrganizationId:null}],
  roles:[{id:'root',name:'Root',kind:'superuser',companyId:null,permissions:[],active:true},{id:'staff',name:'Staff',kind:'company_admin',companyId:'company',permissions:['orderfly.stamp_cards:settings'],active:true}],
  memberships:[{id:'owner',principalId:principalKey(owner.identity),companyId:null,locationIds:null,roleIds:['root'],active:true},{id:'staff',principalId:principalKey(actor('staff').identity),companyId:'company',locationIds:null,roleIds:['staff'],active:true}],
 });
 db.rows.set('brands/brand',{name:'Club',slug:'club',status:'active'});db.rows.set('brands/other',{name:'Other',slug:'other',status:'active'});
 for(const id of ['loc','loc2'])db.rows.set('locations/'+id,{name:id,brandId:'brand',isActive:true});
 db.rows.set('locations/foreign',{name:'Foreign',brandId:'other',isActive:true});
 db.rows.set('customers/customer',{brandId:'brand',status:'active',fullName:'Member',email:'member@example.com',normalizedEmail:'member@example.com'});
 db.rows.set('loyaltyMembers/member',{brandId:'brand',companyId:'company',customerId:'customer',status:'active',sessionEpoch:0});
 db.rows.set('loyaltySessions/'+hashKey('session',TOKEN),{brandId:'brand',memberId:'member',epoch:0,expiresAt:NOW+60000,revokedAt:null});
 db.rows.set('loyaltyCards/old',{brandId:'brand',memberId:'member',stamps:5,status:'active'});
 db.rows.set('loyaltyRewards/old',{brandId:'brand',memberId:'member',status:'available'});
 return db;
}
async function setup(overrides={}){const db=fixture();await admin.saveDiscountCardFeature(db,owner,feature(overrides.feature),NOW);await admin.saveDiscountCardGroup(db,owner,group(overrides.group),NOW);await admin.saveDiscountCardAssignment(db,owner,assignment(overrides.assignment),NOW);return db;}

test('admin assignment becomes a repeatable verified entitlement and preserves historical loyalty data',async()=>{
 const db=fixture(),oldCard=structuredClone(db.rows.get('loyaltyCards/old')),oldReward=structuredClone(db.rows.get('loyaltyRewards/old'));
 assert.equal((await admin.readDiscountCardAdmin(db,owner,'brand')).feature.enabled,false);
 assert.equal(await checkout.readDiscountCardCheckout(db,query()),null);
 await admin.saveDiscountCardFeature(db,owner,feature(),NOW);await admin.saveDiscountCardGroup(db,owner,group(),NOW);await admin.saveDiscountCardAssignment(db,owner,assignment(),NOW);
 const before=state(db),one=await checkout.readDiscountCardCheckout(db,query()),two=await checkout.readDiscountCardCheckout(db,query());
 assert.ok(one);assert.equal(one.percentage,20);assert.deepEqual(two,one);assert.deepEqual(state(db),before,'quoting never consumes a reusable card or writes stamps');
 const applied=checkout.discountCardCheckoutSnapshot(one,10005,0);
 assert.equal(applied.amountOre,2001);assert.equal(applied.purchaseStampsEligible,false);
 assert.deepEqual(db.rows.get('loyaltyCards/old'),oldCard);assert.deepEqual(db.rows.get('loyaltyRewards/old'),oldReward);
});

test('feature scope changed by superadmin is enforced by checkout immediately',async()=>{
 const db=await setup();assert.equal(await checkout.readDiscountCardCheckout(db,query({locationId:'loc2'})),null);
 await admin.saveDiscountCardFeature(db,owner,feature({version:1,locationScope:{mode:'all',locationIds:[]}}),NOW+1);
 db.rows.set('locations/new',{name:'New',brandId:'brand',isActive:true});
 assert.ok(await checkout.readDiscountCardCheckout(db,query({locationId:'new'})));
 assert.equal(await checkout.readDiscountCardCheckout(db,query({locationId:'foreign'})),null);
 db.rows.get('locations/new').isActive=false;assert.equal(await checkout.readDiscountCardCheckout(db,query({locationId:'new'})),null);
});

test('typed email or different customer cannot replace verified session identity',async()=>{
 const db=await setup();for(const overrides of [{token:undefined},{token:'not-a-session'},{token:'b'.repeat(64)},{customerId:'someone-else'},{email:'someone@example.com'},{brandSlug:'other'},{brandId:'other'}]){
  assert.equal(await checkout.readDiscountCardCheckout(db,query(overrides)),null,JSON.stringify(overrides));
 }
});

test('all persisted session revocations invalidate quotes without changing historical orders',async()=>{
 for(const mutate of [db=>db.rows.get('loyaltySessions/'+hashKey('session',TOKEN)).revokedAt=NOW,db=>db.rows.get('loyaltySessions/'+hashKey('session',TOKEN)).expiresAt=NOW,db=>db.rows.get('loyaltyMembers/member').sessionEpoch++,db=>db.rows.get('loyaltyMembers/member').status='deleted']){
  const db=await setup(),quoted=checkout.discountCardCheckoutSnapshot(await checkout.readDiscountCardCheckout(db,query()),10000,0),saved=structuredClone(quoted);
  mutate(db);assert.equal(await checkout.readDiscountCardCheckout(db,query()),null);assert.deepEqual(quoted,saved);
  await assert.rejects(checkout.assertDiscountCardCheckoutCurrent(db,query(),quoted));
 }
});

test('saved blocked, pending, future and expired assignments never become checkout discounts',async()=>{
 for(const values of [{status:'blocked'},{status:'pending'},{startsAt:NOW+1},{expiresAt:NOW}]){
  const db=await setup({assignment:values});assert.equal(await checkout.readDiscountCardCheckout(db,query()),null,JSON.stringify(values));
 }
});

test('feature, group and assignment edits invalidate prior checkout snapshots',async()=>{
 for(const edit of [db=>admin.saveDiscountCardFeature(db,owner,feature({version:1,enabled:false}),NOW+1),db=>admin.saveDiscountCardGroup(db,owner,group({version:1,percentage:15}),NOW+1),db=>admin.saveDiscountCardAssignment(db,owner,assignment({version:1,status:'blocked'}),NOW+1)]){
  const db=await setup(),quote=checkout.discountCardCheckoutSnapshot(await checkout.readDiscountCardCheckout(db,query()),10000,0);await edit(db);
  await assert.rejects(checkout.assertDiscountCardCheckoutCurrent(db,query(),quote));assert.equal(quote.amountOre,2000,'old captured amount is immutable');
 }
});

test('best-price comparison never stacks card discount onto another cart discount',async()=>{
 const db=await setup(),entitlement=await checkout.readDiscountCardCheckout(db,query());
 assert.equal(checkout.discountCardCheckoutSnapshot(entitlement,10000,2500),null);
 assert.equal(checkout.discountCardCheckoutSnapshot(entitlement,10000,2000),null);
 assert.equal(checkout.discountCardCheckoutSnapshot(entitlement,10000,1500).amountOre,2000);
 assert.equal(checkout.discountCardCheckoutSnapshot(entitlement,0,0),null);
});

test('company-admin rights do not authorize any discount-card reads or writes',async()=>{
 const db=await setup();for(const who of [actor('staff'),actor('unknown')]){
  const before=state(db);
  for(const operation of [()=>admin.readDiscountCardAdmin(db,who,'brand'),()=>admin.saveDiscountCardFeature(db,who,feature({version:1,enabled:false}),NOW),()=>admin.saveDiscountCardGroup(db,who,group({version:1,percentage:99}),NOW),()=>admin.saveDiscountCardAssignment(db,who,assignment({version:1,status:'blocked'}),NOW)])await assert.rejects(operation(),e=>e.code==='forbidden');
  assert.deepEqual(state(db),before);
 }
});

test('stale writes and foreign location changes roll back, preserving the valid entitlement',async()=>{
 const db=await setup(),before=state(db);
 await assert.rejects(admin.saveDiscountCardFeature(db,owner,feature({version:1,locationScope:{mode:'selected',locationIds:['foreign']}}),NOW),e=>e.code==='invalid_location');
 await assert.rejects(admin.saveDiscountCardAssignment(db,owner,assignment({status:'blocked'}),NOW),e=>e.code==='record_changed');
 assert.deepEqual(state(db),before);assert.ok(await checkout.readDiscountCardCheckout(db,query()));
});

test('current authority is reread at mutation time and tenant remapping invalidates entitlement',async()=>{
 const db=await setup(),policy=db.rows.get('platformAdminControl/access-v1');policy.memberships[0].active=false;
 await assert.rejects(admin.saveDiscountCardFeature(db,owner,feature({version:1,enabled:false}),NOW),e=>e.code==='forbidden');
 policy.companies[0].orderflyBrandIds=[];policy.companies[1].orderflyBrandIds.push('brand');
 assert.equal(await checkout.readDiscountCardCheckout(db,query()),null);
});

test('a foreign assignment record cannot be repaired into authority by a valid token',async()=>{
 const db=await setup(),id=discountCardAssignmentId('brand','customer');
 for(const field of ['brandId','companyId','customerId','memberId']){
  const row=db.rows.get('discountCardAssignments/'+id),previous=row[field];row[field]='other';
  assert.equal(await checkout.readDiscountCardCheckout(db,query()),null,field);row[field]=previous;
 }
});

async function invitationFixture(){
 const db=fixture();await admin.saveDiscountCardFeature(db,owner,feature(),NOW);await admin.saveDiscountCardGroup(db,owner,group(),NOW);
 const input={brandId:'brand',name:'Invited Member',email:'invited@example.com',groupId:'friends',startsAt:null,expiresAt:null};
 const result=await invites.inviteDiscountCard(db,owner,input,NOW);
 const outbox=db.rows.get(invites.INVITATIONS.outbox+'/'+result.invitationId);
 const token=new URLSearchParams(new URL(outbox.invitationUrl).hash.slice(1)).get('token');
 assert.match(token,/^[a-f0-9]{64}$/);
 return {db,input,result,token};
}
test('actual invitation acceptance issues a session that unlocks checkout without marketing consent',async()=>{
 const {db,input,result,token}=await invitationFixture();
 const again=await invites.inviteDiscountCard(db,owner,input,NOW+1);assert.equal(again.invitationId,result.invitationId);
 assert.equal([...db.rows.values()].filter(r=>r.email==='invited@example.com'&&r.fullName).length,0,'no new customer before acceptance');
 const viewed=await invites.inspectDiscountInvitation(db,brand,{token},ctx);assert.equal(viewed.percentage,20);
 const accepted=await invites.acceptDiscountInvitation(db,brand,{token,termsAccepted:true,termsVersion:invites.DISCOUNT_CARD_TERMS_VERSION},ctx);
 const entitlement=await checkout.readDiscountCardCheckout(db,query({token:accepted.session,customerId:undefined,email:'invited@example.com'}));
 assert.ok(entitlement);assert.equal(entitlement.percentage,20);
 assert.equal(db.rows.get('customers/'+entitlement.customerId).marketingConsent,false);
 assert.equal(db.rows.get('loyaltyMembers/'+entitlement.memberId).consent.status,'withdrawn');
 assert.equal(db.rows.get(invites.INVITATIONS.outbox+'/'+result.invitationId).invitationUrl,null);
 const before=state(db);await assert.rejects(invites.acceptDiscountInvitation(db,brand,{token,termsAccepted:true,termsVersion:invites.DISCOUNT_CARD_TERMS_VERSION},ctx));
 assert.deepEqual(state(db),before,'replay does not create a second session or customer');
});

test('invite terms, brand, expiry and configuration binding fail closed before customer creation',async()=>{
 for(const scenario of ['terms','brand','expired','changed-group','feature-disabled']){
  const {db,token}=await invitationFixture();let request={token,termsAccepted:true,termsVersion:invites.DISCOUNT_CARD_TERMS_VERSION},target=brand,context=ctx;
  if(scenario==='terms')request.termsAccepted=false;
  if(scenario==='brand')target={...brand,brandId:'other'};
  if(scenario==='expired')context={...ctx,now:NOW+invites.INVITATION_LIFETIME};
  if(scenario==='changed-group')await admin.saveDiscountCardGroup(db,owner,group({version:1,percentage:25}),NOW+1);
  if(scenario==='feature-disabled')await admin.saveDiscountCardFeature(db,owner,feature({version:1,enabled:false}),NOW+1);
  const before=state(db);await assert.rejects(invites.acceptDiscountInvitation(db,target,request,context));assert.deepEqual(state(db),before,scenario);
 }
});
