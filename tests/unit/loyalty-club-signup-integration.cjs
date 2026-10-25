const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs'),{memoryDb}=require('../helpers/marketing-db.cjs');
const NOW=Date.parse('2026-10-22T10:00:00Z'),BRAND='brand';
const mocks={'server-only':{},'next/headers':{headers:async()=>new Headers({'x-forwarded-for':'203.0.113.11'})},
 '@/lib/feedback/mail-config':{notificationPlatformConfig:()=>null}};
const m=loadTs('src/lib/loyalty/stamp-card/membership.ts',mocks);
const checkout=loadTs('src/lib/loyalty/stamp-card/club-signup.ts',mocks);
const discount=loadTs('src/lib/loyalty/stamp-card/club-discount.ts',mocks);
const {defaultProgramSettings}=loadTs('src/lib/loyalty/stamp-card/rules.ts',mocks);
const {defaultCampaignSettings}=loadTs('src/lib/loyalty/stamp-card/campaign-rules.ts',mocks);
const {customerIdentityKey}=loadTs('src/lib/customer-identity.ts',mocks);
function fixture({campaign=true,promotion={},program={}}={}){
 const db=memoryDb(),baseTransaction=db.runTransaction;
 // Firestore disallows transaction reads after any staged write. Enforce that
 // independently of the permissive in-memory fixture's storage implementation.
 db.runTransaction=fn=>baseTransaction(tx=>{
  let wrote=false;const strict={...tx,get:async ref=>{assert.equal(wrote,false,'transaction read after write');return tx.get(ref)}};
  for(const name of ['create','set','update','delete'])strict[name]=(...args)=>{wrote=true;return tx[name](...args)};
  return fn(strict);
 });
 db.rows.set('platformAdminControl/access-v1',{principals:[],companies:[
  {id:'esmeralda',active:true,locationIds:['l1'],orderflyBrandIds:[BRAND],opsflyOrganizationId:null},
  {id:'other',active:true,locationIds:['l2'],orderflyBrandIds:['other'],opsflyOrganizationId:null},
 ],roles:[],memberships:[]});
 db.rows.set('brands/'+BRAND,{name:'Esmeralda',slug:'esmeralda'});db.rows.set('brands/other',{name:'Other',slug:'other'});
 db.rows.set('locations/l1',{brandId:BRAND});db.rows.set('locations/l2',{brandId:'other'});
 db.rows.set('loyaltyPrograms/'+BRAND,{brandId:BRAND,version:1,settings:{...defaultProgramSettings('Esmeralda'),active:true,
  reward:{type:'free_product',productIds:['pizza'],categoryIds:[]},rewardDescription:'Gratis pizza',terms:'Vilkår for Esmeralda Club',
  consentText:'Ja tak til Esmeraldas nyhedsbrev på e-mail. Du kan altid afmelde dig.',...program}});
 if(campaign)db.rows.set('loyaltyCampaigns/'+BRAND,{brandId:BRAND,version:1,updatedAt:NOW,settings:{...defaultCampaignSettings(),checkoutMode:'club',
  welcome:{enabled:true,stamps:1,startsAt:null,endsAt:null}}});
 db.rows.set('discounts/d1',{brandId:BRAND,applicationType:'club_signup',discountType:'percentage',discountValue:20,isActive:true,
  locationIds:['l1'],orderTypes:['pickup'],activeDays:[],activeTimeSlots:[],usageLimit:0,usedCount:0,perCustomerLimit:1,firstTimeCustomerOnly:false,
  allowStacking:false,minOrderValue:100,...promotion});
 return db;
}
const rows=(db,name)=>[...db.rows].filter(([key])=>key.startsWith(name+'/')).map(([key,value])=>({id:key.split('/')[1],...value}));
const snapshot=db=>structuredClone([...db.rows]);
const rejects=(promise,code)=>assert.rejects(promise,error=>error.code===code);
async function input(db,changes={}){const brand=await m.resolveBrand(db,'esmeralda'),p=await m.programForPortal(db,brand,NOW);return{db,brandId:BRAND,brandSlug:'esmeralda',name:'Anna',email:'anna@example.com',newsletterConsent:true,termsAccepted:true,consentVersion:p.consentVersion,termsVersion:p.termsVersion,discountId:'d1',now:NOW,...changes};}
async function signup(db,email='anna@example.com',now=NOW){const i=await input(db,{email,now}),brand=await m.resolveBrand(db,'esmeralda');return m.signup(db,brand,{name:i.name,email,newsletterConsent:true,termsAccepted:true,consentVersion:i.consentVersion,termsVersion:i.termsVersion},{now,ip:'203.0.113.12'});}
async function memberSession(db,member){
 const sessionId='synthetic-session-'+member.id;
 db.rows.set('loyaltySessions/'+sessionId,{brandId:BRAND,memberId:member.id,epoch:member.sessionEpoch,expiresAt:NOW+60000,revokedAt:null});
 return{sessionId,memberId:member.id,member};
}

test('a real Club checkout quote is read-only and does not create customer, consent, member, stamp or mail',async()=>{
 const db=fixture(),i=await input(db),before=snapshot(db);
 assert.equal((await checkout.validateClubCheckoutSignup(i)).eligible,true);
 assert.equal(await discount.getClubSignupDiscountEligibility(i),true);
 assert.deepEqual(snapshot(db),before);
 for(const collection of ['customers','loyaltyMembers','loyaltyCards','loyaltyBonusGrants','loyaltySignupDiscountClaims','marketingConsents','loyaltyMailOutbox'])assert.equal(rows(db,collection).length,0);
});

test('actual checkout signup creates one membership, explicit consent, welcome stamp and pending personal discount',async()=>{
 const db=fixture(),result=await checkout.prepareClubCheckoutSignup(await input(db));
 const [member]=rows(db,'loyaltyMembers'),customer=db.rows.get('customers/'+result.customerId);
 assert.equal(member.customerId,result.customerId);assert.equal(member.consent.status,'given');assert.ok(member.termsVersion);
 assert.equal(rows(db,'marketingConsents').length,1);assert.equal(customer.marketingConsent,true);assert.equal(customer.pendingClubDiscountId,'d1');
 assert.equal(rows(db,'loyaltyCards').length,1);assert.equal(rows(db,'loyaltyCards')[0].stamps,1);
 assert.equal(rows(db,'loyaltyBonusGrants').length,2);assert.equal(rows(db,'loyaltySignupDiscountClaims').length,2);
 assert.equal(rows(db,'loyaltyEvents').filter(e=>e.channel==='bonus_welcome'&&e.type==='stamp_added').length,1);
 assert.equal(rows(db,'loyaltyMailOutbox').length,0);
 assert.equal(rows(db,'loyaltyLoginTokens').length,0);
 assert.equal(await discount.getClubSignupDiscountEligibility(await input(db)),true,'pending unused entitlement remains redeemable');
 db.rows.get('customers/'+result.customerId).discountUsage={d1:1};
 assert.equal(await discount.getClubSignupDiscountEligibility(await input(db)),false,'consumed entitlement cannot be quoted again');
});

test('all checkout entry points require both consents, the current texts and the resolved brand before writes',async()=>{
 for(const changes of [{newsletterConsent:false},{termsAccepted:false},{consentVersion:'stale'},{termsVersion:'stale'},{brandId:'other'}]){
  const db=fixture(),i=await input(db,changes),before=snapshot(db);
  const code=changes.brandId?'forbidden':changes.newsletterConsent===false||changes.termsAccepted===false?'invalid_request':'program_changed';
  await rejects(checkout.validateClubCheckoutSignup(i),code);await rejects(checkout.prepareClubCheckoutSignup(i),code);assert.deepEqual(snapshot(db),before);
 }
});

test('concurrent checkout retries and a second standalone entry never double the welcome or personal discount',async()=>{
 const db=fixture(),i=await input(db);
 const results=await Promise.all([checkout.prepareClubCheckoutSignup(i),checkout.prepareClubCheckoutSignup(i),checkout.prepareClubCheckoutSignup(i)]);
 assert.equal(new Set(results.map(r=>r.customerId)).size,1);assert.equal(rows(db,'loyaltyMembers').length,1);
 assert.equal(rows(db,'loyaltyMailOutbox').length,0);assert.equal(rows(db,'loyaltyLoginTokens').length,0);
 const portalSignup=await signup(db);assert.ok(portalSignup.mailJob);
 assert.equal(rows(db,'loyaltyMailOutbox').length,1);
 assert.equal(rows(db,'loyaltyBonusGrants').length,2);assert.equal(rows(db,'loyaltySignupDiscountClaims').length,2);
 assert.equal(rows(db,'loyaltyCards').reduce((sum,row)=>sum+row.stamps,0),1);assert.equal(rows(db,'marketingConsents').length,1);
});

test('standalone Club signup and alias registration share customer-level one-time guards',async()=>{
 const db=fixture();db.rows.set('customers/c1',{id:'c1',brandId:BRAND,email:'anna@example.com',normalizedEmail:'anna@example.com',emailAliases:['anna@home.dk'],phone:'',totalOrders:0,marketingConsent:false});
 await signup(db);await signup(db,'anna@home.dk');
 assert.equal(rows(db,'customers').length,1);assert.equal(rows(db,'loyaltyMembers').length,2);
 assert.equal(rows(db,'loyaltyBonusGrants').length,2);assert.equal(rows(db,'loyaltySignupDiscountClaims').length,2);
 assert.equal(rows(db,'loyaltyCards').reduce((sum,row)=>sum+row.stamps,0),1);
 assert.equal(await discount.getClubSignupDiscountEligibility(await input(db,{email:'anna@home.dk'})),true,'same central pending entitlement can be redeemed once, not issued twice');
});

test('delete and recreate keeps bonus and discount issue ledgers, without a second welcome',async()=>{
 const db=fixture();await signup(db);const [first]=rows(db,'loyaltyMembers'),session=await memberSession(db,first);
 await m.deleteMembership(db,await m.resolveBrand(db,'esmeralda'),session,NOW+1);
 assert.equal(db.rows.get('loyaltyMembers/'+first.id).status,'deleted');
 assert.equal(await discount.getClubSignupDiscountEligibility(await input(db)),false);
 await signup(db,'anna@example.com',NOW+2);
 assert.equal(rows(db,'loyaltyMembers').filter(r=>r.status==='active').length,1);
 assert.equal(rows(db,'loyaltyBonusGrants').length,2);assert.equal(rows(db,'loyaltySignupDiscountClaims').length,2);
 assert.equal(rows(db,'loyaltyEvents').filter(e=>e.channel==='bonus_welcome'&&e.type==='stamp_added').length,1);
});

test('absent, disabled or expired welcome settings preserve signup and never retroactively grant an existing member',async()=>{
 for(const mode of ['absent','disabled','expired','foreign','corrupt']){
  const db=fixture({campaign:mode!=='absent'});const config=db.rows.get('loyaltyCampaigns/'+BRAND);
  if(mode==='disabled')config.settings.welcome.enabled=false;
  if(mode==='expired')config.settings.welcome.endsAt=NOW;
  if(mode==='foreign')config.brandId='other';
  if(mode==='corrupt')config.settings.welcome.stamps=99;
  await signup(db);
  assert.equal(rows(db,'loyaltyMembers').length,1);assert.equal(rows(db,'loyaltyBonusGrants').length,0);assert.equal(rows(db,'loyaltyCards').length,0);
  db.rows.set('loyaltyCampaigns/'+BRAND,{brandId:BRAND,version:2,updatedAt:NOW+1,settings:{...defaultCampaignSettings(),welcome:{enabled:true,stamps:1,startsAt:null,endsAt:null}}});
  await signup(db);assert.equal(rows(db,'loyaltyBonusGrants').length,0,'existing member never gains welcome through a config toggle');
 }
});

test('inactive loyalty program rejects registration without side effects even if a promotion is active',async()=>{
 const db=fixture({program:{active:false}}),i=await input(db),before=snapshot(db);
 await rejects(checkout.prepareClubCheckoutSignup(i),'program_inactive');assert.deepEqual(snapshot(db),before);
});

test('first-time-only promotions reject customers with prior orders without creating a membership',async()=>{
 const db=fixture({promotion:{firstTimeCustomerOnly:true}});db.rows.set('customers/c1',{id:'c1',brandId:BRAND,email:'anna@example.com',normalizedEmail:'anna@example.com',totalOrders:1});
 const i=await input(db),before=snapshot(db);assert.equal((await checkout.validateClubCheckoutSignup(i)).eligible,false);
 await rejects(checkout.prepareClubCheckoutSignup(i),'discount_unavailable');assert.deepEqual(snapshot(db),before);
 await signup(db);assert.equal(db.rows.get('customers/c1').pendingClubDiscountId,undefined,'standalone registration cannot bypass first-time rule');
});

for(const [name,change] of [
 ['assigned',{assignedToCustomerId:'someone'}],['foreign',{brandId:'other'}],['inactive',{isActive:false}],['expired',{endDate:new Date(NOW-1)}],
 ['invalid date',{startDate:'not-a-date'}],['percentage over100',{discountValue:101}],['negative',{discountValue:-1}],['global limit',{usageLimit:1,usedCount:1}],
 ['string amount',{discountValue:'20'}],['malformed location',{locationIds:[{}]}],['unsupported order type',{orderTypes:['walk_in']}],
])test(`malformed or inapplicable ${name} promotion cannot create a pending entitlement`,async()=>{
 const db=fixture({promotion:change}),i=await input(db),before=snapshot(db);
 assert.equal(await discount.selectClubDiscount(db,BRAND,NOW,'d1'),null);
 assert.equal((await checkout.validateClubCheckoutSignup(i)).eligible,false);
 await rejects(checkout.prepareClubCheckoutSignup(i),'discount_unavailable');assert.deepEqual(snapshot(db),before);
});

test('ambiguous or crossbrand customer identity reservations cannot claim a Club discount',async()=>{
 for(const mode of ['ambiguous','foreign']){
  const db=fixture();
  db.rows.set('customers/c1',{brandId:BRAND,email:'anna@example.com',normalizedEmail:'anna@example.com'});
  if(mode==='ambiguous')db.rows.set('customers/c2',{brandId:BRAND,email:'other@x.dk',emailAliases:['anna@example.com']});
  else db.rows.set('integrationConsumerCustomerIdentities/'+customerIdentityKey(BRAND,'anna@example.com'),{brandId:'other',customerId:'c1'});
  const i=await input(db),before=snapshot(db);await rejects(checkout.prepareClubCheckoutSignup(i),'customer_conflict');assert.deepEqual(snapshot(db),before);
 }
});

test('checkout mode is enforced read-only and again atomically if it changes after preflight',async()=>{
 for(const mode of ['none','newsletter','absent','foreign','corrupt']){
  const db=fixture(),config=db.rows.get('loyaltyCampaigns/'+BRAND);
  if(mode==='absent')db.rows.delete('loyaltyCampaigns/'+BRAND);
  else if(mode==='foreign')config.brandId='other';
  else if(mode==='corrupt')config.settings.checkoutMode='both';
  else config.settings.checkoutMode=mode;
  const i=await input(db),before=snapshot(db);await rejects(checkout.validateClubCheckoutSignup(i),'campaign_changed');
  await rejects(checkout.prepareClubCheckoutSignup(i),'campaign_changed');assert.deepEqual(snapshot(db),before);
 }
 const db=fixture(),i=await input(db),original=db.runTransaction;let changed=false;
 db.runTransaction=fn=>{if(!changed){changed=true;db.rows.get('loyaltyCampaigns/'+BRAND).settings.checkoutMode='newsletter';}return original(fn)};
 await rejects(checkout.prepareClubCheckoutSignup(i),'campaign_changed');
 assert.equal(rows(db,'loyaltyMembers').length,0);assert.equal(rows(db,'customers').length,0);assert.equal(rows(db,'loyaltyBonusGrants').length,0);
 assert.equal(rows(db,'marketingConsents').length,0);assert.equal(rows(db,'loyaltyMailOutbox').length,0);
});

test('authenticated profile completion adds one separate bonus and exposes only the owned pending discount',async()=>{
 const {updateMemberProfile}=loadTs('src/lib/loyalty/stamp-card/profile.ts',mocks);
 const db=fixture();db.rows.get('loyaltyCampaigns/'+BRAND).settings.profile.enabled=true;
 await signup(db);let member=rows(db,'loyaltyMembers')[0];const session=await memberSession(db,member),brand=await m.resolveBrand(db,'esmeralda');
 const details={phone:'+4555556666',birthDate:'1990-05-01',gender:'prefer_not_to_say'};
 const one=await updateMemberProfile(db,brand,session,details,{now:NOW+1,ip:'synthetic'});assert.equal(one.bonusGranted,true);
 assert.deepEqual(one.profile,details);assert.equal(rows(db,'loyaltyBonusGrants').length,4);
 assert.equal(rows(db,'loyaltyCards').reduce((sum,row)=>sum+row.stamps,0),2);
 assert.equal(rows(db,'loyaltyEvents').filter(e=>e.type==='stamp_added'&&e.channel==='bonus_profile').length,1);
 const repeat=await updateMemberProfile(db,brand,session,details,{now:NOW+2,ip:'synthetic'});assert.equal(repeat.bonusGranted,false);
 await updateMemberProfile(db,brand,session,{gender:null},{now:NOW+3,ip:'synthetic'});
 const refill=await updateMemberProfile(db,brand,session,{gender:'female'},{now:NOW+4,ip:'synthetic'});assert.equal(refill.bonusGranted,false);
 assert.equal(rows(db,'loyaltyBonusGrants').length,4);assert.equal(rows(db,'loyaltyCards').reduce((sum,row)=>sum+row.stamps,0),2);
 member=rows(db,'loyaltyMembers')[0];const view=await m.memberView(db,brand,{...session,member},NOW+5);
 assert.equal(view.campaigns.profileBonusGranted,true);assert.equal(view.campaigns.discount.id,'d1');assert.equal(view.profile.gender,'female');
 const serialized=JSON.stringify(view.campaigns);assert.equal(serialized.includes('anna@example.com'),false);assert.equal(serialized.includes('identityHash'),false);
 db.rows.get('customers/'+member.customerId).discountUsage={d1:1};
 assert.equal((await m.memberView(db,brand,{...session,member},NOW+6)).campaigns.discount,null);
});

test('welcome plus profile completion obey current card snapshot and issue one earned reward',async()=>{
 const {updateMemberProfile}=loadTs('src/lib/loyalty/stamp-card/profile.ts',mocks);
 const db=fixture({program:{stampsRequired:2}});db.rows.get('loyaltyCampaigns/'+BRAND).settings.profile.enabled=true;
 await signup(db);const member=rows(db,'loyaltyMembers')[0],session=await memberSession(db,member),brand=await m.resolveBrand(db,'esmeralda');
 // The existing card freezes two stamps, even after the program changes to eight.
 db.rows.get('loyaltyPrograms/'+BRAND).settings.stampsRequired=8;db.rows.get('loyaltyPrograms/'+BRAND).version=2;
 await updateMemberProfile(db,brand,session,{phone:'+4555556666',birthDate:'1990-05-01',gender:'male'},{now:NOW+1,ip:'synthetic'});
 assert.equal(rows(db,'loyaltyRewards').length,1);assert.equal(rows(db,'loyaltyRewards')[0].status,'available');
 assert.equal(rows(db,'loyaltyCards').filter(row=>row.status==='completed'&&row.stampsRequired===2).length,1);
 assert.equal(rows(db,'loyaltyBonusGrants').length,4);
});

test('incomplete profile and disabled profile campaign save details without awarding an extra stamp',async()=>{
 const {updateMemberProfile}=loadTs('src/lib/loyalty/stamp-card/profile.ts',mocks);
 const db=fixture();db.rows.get('loyaltyCampaigns/'+BRAND).settings.profile.enabled=true;
 await signup(db);const member=rows(db,'loyaltyMembers')[0],session=await memberSession(db,member),brand=await m.resolveBrand(db,'esmeralda');
 assert.equal((await updateMemberProfile(db,brand,session,{phone:'+4555556666'},{now:NOW+1,ip:'synthetic'})).bonusGranted,false);
 db.rows.get('loyaltyCampaigns/'+BRAND).settings.profile.enabled=false;
 assert.equal((await updateMemberProfile(db,brand,session,{birthDate:'1990-05-01',gender:'female'},{now:NOW+2,ip:'synthetic'})).bonusGranted,false);
 assert.equal(rows(db,'loyaltyBonusGrants').length,2);assert.equal(rows(db,'loyaltyCards')[0].stamps,1);
});

test('turning a campaign on cannot give a preexisting member a new welcome or discount entitlement',async()=>{
 const db=fixture({campaign:false,promotion:{isActive:false}});await signup(db);
 const [member]=rows(db,'loyaltyMembers');assert.equal(rows(db,'loyaltyBonusGrants').length,0);assert.equal(db.rows.get('customers/'+member.customerId).pendingClubDiscountId,undefined);
 db.rows.get('discounts/d1').isActive=true;db.rows.set('loyaltyCampaigns/'+BRAND,{brandId:BRAND,version:1,updatedAt:NOW,settings:{...defaultCampaignSettings(),checkoutMode:'club',welcome:{enabled:true,stamps:1,startsAt:null,endsAt:null}}});
 const i=await input(db),before=snapshot(db);assert.equal((await checkout.validateClubCheckoutSignup(i)).eligible,false);await rejects(checkout.prepareClubCheckoutSignup(i),'discount_unavailable');assert.deepEqual(snapshot(db),before);
 await signup(db);assert.equal(rows(db,'loyaltyBonusGrants').length,0);assert.equal(db.rows.get('customers/'+member.customerId).pendingClubDiscountId,undefined);
});

test('advertised campaign fingerprint rejects changed offers in preflight and commit without writes',async()=>{
 for(const phase of ['preflight','commit']){
  const db=fixture(),base=await input(db),p=await m.programForPortal(db,await m.resolveBrand(db,'esmeralda'),NOW);
  const i={...base,campaignVersion:p.campaigns.version};
  if(phase==='preflight')db.rows.get('discounts/d1').discountValue=30;
  else{const original=db.runTransaction;let changed=false;db.runTransaction=fn=>{if(!changed){changed=true;db.rows.get('discounts/d1').discountValue=30;}return original(fn)}}
  await rejects(checkout.prepareClubCheckoutSignup(i),'program_changed');
  assert.equal(rows(db,'loyaltyMembers').length,0);assert.equal(rows(db,'customers').length,0);assert.equal(rows(db,'marketingConsents').length,0);
  assert.equal(rows(db,'loyaltyBonusGrants').length,0);assert.equal(rows(db,'loyaltyMailOutbox').length,0);
 }
 const db=fixture(),brand=await m.resolveBrand(db,'esmeralda'),p=await m.programForPortal(db,brand,NOW);
 db.rows.get('loyaltyCampaigns/'+BRAND).settings.welcome.stamps=2;
 const before=snapshot(db);
 await rejects(m.signup(db,brand,{name:'Anna',email:'anna@example.com',newsletterConsent:true,termsAccepted:true,
  consentVersion:p.consentVersion,termsVersion:p.termsVersion,campaignVersion:p.campaigns.version},{now:NOW,ip:'synthetic'}),'program_changed');
 assert.deepEqual(snapshot(db),before);
});

test('expiry of an advertised welcome offer changes its fingerprint before signup can lose the promised stamp',async()=>{
 const db=fixture(),brand=await m.resolveBrand(db,'esmeralda');db.rows.get('loyaltyCampaigns/'+BRAND).settings.welcome.endsAt=NOW+50;
 const shown=await m.programForPortal(db,brand,NOW),later=await m.programForPortal(db,brand,NOW+100);
 assert.equal(shown.campaigns.welcomeStamps,1);assert.equal(later.campaigns.welcomeStamps,0);
 assert.notEqual(shown.campaigns.version,later.campaigns.version);
 const before=snapshot(db);await rejects(m.signup(db,brand,{name:'Anna',email:'anna@example.com',newsletterConsent:true,termsAccepted:true,
  consentVersion:shown.consentVersion,termsVersion:shown.termsVersion,campaignVersion:shown.campaigns.version},{now:NOW+100,ip:'synthetic'}),'program_changed');
 assert.deepEqual(snapshot(db),before);
});

test('checkout fingerprints every eligible Club offer when the best offer is not the standalone choice',async()=>{
 for(const phase of ['preflight','commit']){
  const db=fixture();
  db.rows.set('discounts/d2',{...db.rows.get('discounts/d1'),discountValue:40});
  const brand=await m.resolveBrand(db,'esmeralda'),shown=await m.programForPortal(db,brand,NOW);
  assert.equal(shown.campaigns.discount.id,'d1','standalone projection retains its stable first offer');
  const i=await input(db,{discountId:'d2',campaignVersion:shown.campaigns.version});
  assert.equal((await checkout.validateClubCheckoutSignup(i)).eligible,true);
  const change=()=>{db.rows.get('discounts/d2').discountValue=5};
  if(phase==='preflight')change();
  else{
   const original=db.runTransaction;let changed=false;
   db.runTransaction=fn=>{if(!changed){changed=true;change()}return original(fn)};
  }
  await rejects(checkout.prepareClubCheckoutSignup(i),'program_changed');
  for(const collection of ['customers','loyaltyMembers','loyaltyCards','loyaltyBonusGrants','loyaltySignupDiscountClaims','marketingConsents','loyaltyMailOutbox'])
   assert.equal(rows(db,collection).length,0,`${phase}: stale secondary offer cannot write ${collection}`);
 }
});

test('a dotted valid phone uses the shared normalizer and qualifies for the configured profile bonus',async()=>{
 const {updateMemberProfile}=loadTs('src/lib/loyalty/stamp-card/profile.ts',mocks);
 const db=fixture();db.rows.get('loyaltyCampaigns/'+BRAND).settings.profile.enabled=true;await signup(db);
 const member=rows(db,'loyaltyMembers')[0],session=await memberSession(db,member),brand=await m.resolveBrand(db,'esmeralda');
 const result=await updateMemberProfile(db,brand,session,{phone:'+45 55.55.66.66',birthDate:'1990-05-01',gender:'prefer_not_to_say'},{now:NOW+1,ip:'synthetic'});
 assert.equal(result.bonusGranted,true);assert.equal(db.rows.get('customers/'+member.customerId).normalizedPhone,'+4555556666');
 assert.equal(rows(db,'loyaltyBonusGrants').length,4);
});

async function withdrawnMemberCheckout(){
 const db=fixture();await signup(db);
 // This existing member no longer has a pending signup offer (for example after redemption).
 const existing=rows(db,'loyaltyMembers')[0];
 const customer=db.rows.get('customers/'+existing.customerId);
 delete customer.pendingClubDiscountId;customer.discountUsage={d1:1};
 const member=rows(db,'loyaltyMembers')[0],session=await memberSession(db,member),brand=await m.resolveBrand(db,'esmeralda');
 await m.setNewsletterConsent(db,brand,session,{subscribed:false},NOW+1);
 assert.equal(db.rows.get('loyaltyMembers/'+member.id).consent.status,'withdrawn');
 assert.equal(db.rows.get('customers/'+member.customerId).marketingConsent,false);
 return {db,member,request:await input(db,{discountId:undefined,now:NOW+2})};
}

test('existing withdrawn Club member explicitly resubscribes in checkout without a new discount or bonus',async()=>{
 const {db,member,request}=await withdrawnMemberCheckout();
 const grants=snapshotCollection(db,'loyaltyBonusGrants'),claims=snapshotCollection(db,'loyaltySignupDiscountClaims'),cards=snapshotCollection(db,'loyaltyCards');
 const priorConsentCount=rows(db,'marketingConsents').length;
 const result=await checkout.prepareClubCheckoutSignup(request);
 assert.equal(result.customerId,member.customerId);assert.equal(rows(db,'loyaltyMembers').length,1);
 const current=db.rows.get('loyaltyMembers/'+member.id),customer=db.rows.get('customers/'+member.customerId);
 assert.equal(current.consent.status,'given');assert.equal(current.consent.version,request.consentVersion);
 assert.equal(customer.marketingConsent,true);assert.equal(customer.pendingClubDiscountId,undefined);
 assert.equal(rows(db,'marketingConsents').length,priorConsentCount+1);
 const event=rows(db,'marketingConsents').find(event=>event.id===current.consent.eventId);
 assert.ok(event);assert.equal(event.customerId,member.customerId);assert.equal(event.brandId,BRAND);
 assert.equal(event.email,'anna@example.com');assert.equal(event.version,request.consentVersion);assert.equal(event.capturedAt,NOW+2);
 assert.ok(event.wording.includes('Esmeralda'));assert.notEqual(event.action,'unsubscribe');
 const job=db.rows.get('marketingOutbox/'+event.id);assert.equal(job.state,'pending');assert.equal(job.customerId,member.customerId);
 const contact=rows(db,'marketingContacts').find(contact=>contact.latestEventId===event.id);assert.ok(contact);assert.equal(contact.customerId,member.customerId);
 assert.deepEqual(snapshotCollection(db,'loyaltyBonusGrants'),grants);assert.deepEqual(snapshotCollection(db,'loyaltySignupDiscountClaims'),claims);
 assert.deepEqual(snapshotCollection(db,'loyaltyCards'),cards);assert.equal(rows(db,'loyaltyEvents').filter(e=>e.channel==='bonus_profile').length,0);
});
function snapshotCollection(db,name){return structuredClone([...db.rows].filter(([key])=>key.startsWith(name+'/')));}

test('existing withdrawn checkout member cannot resubscribe with false or stale consent',async()=>{
 for(const changes of [{newsletterConsent:false},{termsAccepted:false},{consentVersion:'stale'},{termsVersion:'stale'}]){
  const {db,request}=await withdrawnMemberCheckout(),before=snapshot(db);
  await rejects(checkout.prepareClubCheckoutSignup({...request,...changes}),changes.newsletterConsent===false||changes.termsAccepted===false?'invalid_request':'program_changed');
  assert.deepEqual(snapshot(db),before);
 }
});


// #597: login mail is explicit portal intent, never a checkout side effect.
test('checkout opt-in/retries stage no login tokens or mail; explicit portal login and signup still do',async()=>{
 const db=fixture(),i=await input(db);
 await checkout.prepareClubCheckoutSignup(i);
 await checkout.prepareClubCheckoutSignup({...i,now:NOW+1});
 assert.equal(rows(db,'loyaltyMailOutbox').length,0);assert.equal(rows(db,'loyaltyLoginTokens').length,0);
 const mail=loadTs('src/lib/loyalty/stamp-card/mail.ts',mocks);
 assert.deepEqual(await mail.runLoyaltyMailOutbox(db,NOW+2),{});
 const brand=await m.resolveBrand(db,'esmeralda');
 const login=await m.requestLoginLink(db,brand,{email:i.email},{ip:'203.0.113.13',now:NOW+3});
 assert.ok(login.mailJob);assert.equal(rows(db,'loyaltyMailOutbox').length,1);assert.equal(rows(db,'loyaltyLoginTokens').length,1);
 const before=snapshotCollection(db,'loyaltyMailOutbox');
 await checkout.prepareClubCheckoutSignup({...i,now:NOW+4});
 assert.deepEqual(snapshotCollection(db,'loyaltyMailOutbox'),before,'checkout must not cancel explicitly requested mail');
 const fresh=fixture(),joined=await signup(fresh);assert.ok(joined.mailJob);
 assert.equal(rows(fresh,'loyaltyMailOutbox').length,1);assert.equal(rows(fresh,'loyaltyLoginTokens').length,1);
});
