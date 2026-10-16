const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {memoryDb}=require('../helpers/marketing-db.cjs');

let db;
const mocks={'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db}};
const counter=loadTs('src/lib/loyalty/stamp-card/counter.ts',mocks);
const {runLoyaltyExpiry}=loadTs('src/lib/loyalty/stamp-card/expiry.ts',mocks);
const model=loadTs('src/lib/loyalty/stamp-card/model.ts',mocks);
const {defaultProgramSettings}=loadTs('src/lib/loyalty/stamp-card/rules.ts');
const {principalKey}=loadTs('src/lib/access/authority.ts',mocks);

const NOW=Date.parse('2026-10-20T10:00:00Z'),DAY=86_400_000;
const people={cashier:'cashier',manager:'manager',none:'none',inactive:'inactive',other:'other'};
const actor=name=>({identity:{provider:'firebase',subject:people[name]},name:name[0].toUpperCase()+name.slice(1)});
const key=n=>String(n).padStart(64,'0');
const S='orderfly.stamp_cards:';

function settings(changes={}){
  return {...defaultProgramSettings('Esmeralda'),active:true,reward:{type:'free_product',productIds:['pizza'],categoryIds:[]},rewardDescription:'Gratis pizza',
    terms:'Vilkår',consentText:'Ja tak til nyhedsbrev på e-mail. Du kan altid afmelde dig.',...changes};
}
function setup({program=settings(),version=1}={}){
  db=memoryDb();
  const id=name=>principalKey(actor(name).identity);
  db.rows.set('platformAdminControl/access-v1',{
    principals:Object.keys(people).map(name=>({id:id(name),active:name!=='inactive'})),
    companies:[{id:'esmeralda',active:true,locationIds:['l1','l2'],orderflyBrandIds:['brand'],opsflyOrganizationId:null},
      {id:'foreign',active:true,locationIds:['x1'],orderflyBrandIds:['brand2'],opsflyOrganizationId:null}],
    roles:[
      {id:'kasse',name:'Medarbejder',companyId:'esmeralda',kind:'company_user',active:true,permissions:[S+'counter',S+'redeem']},
      {id:'leder',name:'Leder',companyId:'esmeralda',kind:'company_user',active:true,permissions:[S+'counter',S+'redeem',S+'correct',S+'overview']},
      {id:'ordrer',name:'Ordrer',companyId:'esmeralda',kind:'company_user',active:true,permissions:['orderfly.orders:view']},
      {id:'fremmed',name:'Fremmed',companyId:'foreign',kind:'company_user',active:true,permissions:[S+'counter',S+'redeem',S+'correct']},
    ],
    memberships:[
      {id:'m1',principalId:id('cashier'),companyId:'esmeralda',locationIds:['l1'],roleIds:['kasse'],active:true},
      {id:'m2',principalId:id('manager'),companyId:'esmeralda',locationIds:null,roleIds:['leder'],active:true},
      {id:'m3',principalId:id('none'),companyId:'esmeralda',locationIds:null,roleIds:['ordrer'],active:true},
      {id:'m4',principalId:id('inactive'),companyId:'esmeralda',locationIds:null,roleIds:['leder'],active:true},
      {id:'m5',principalId:id('other'),companyId:'foreign',locationIds:null,roleIds:['fremmed'],active:true},
    ],
  });
  for(const brand of ['brand','brand2'])db.rows.set('brands/'+brand,{name:brand});
  for(const [loc,brand] of [['l1','brand'],['l2','brand'],['x1','brand2']])db.rows.set('locations/'+loc,{brandId:brand});
  db.rows.set('loyaltyPrograms/brand',{brandId:'brand',version,settings:program});
  addMember('anna','brand','anna@example.com');
  addMember('bo','brand2','bo@example.com','foreign');
  return db;
}
function addMember(memberId,brandId,email,companyId='esmeralda'){
  db.rows.set('loyaltyMembers/'+memberId,{companyId,brandId,customerId:'c-'+memberId,name:memberId.toUpperCase(),normalizedEmail:email,status:'active',joinedAt:NOW-DAY,currentCardId:null,stampDay:null,stampsOnDay:0});
  db.rows.set('loyaltyMemberIdentities/'+model.memberIdentityKey(brandId,email),{brandId,memberId});
}
const rows=prefix=>[...db.rows].filter(([path])=>path.startsWith(prefix+'/')).map(([path,value])=>({id:path.split('/')[1],...value}));
const events=type=>rows('loyaltyEvents').filter(e=>!type||e.type===type);
const card=()=>db.rows.get('loyaltyCards/'+db.rows.get('loyaltyMembers/anna').currentCardId);
const stamp=(changes={},who='cashier',now=NOW)=>counter.grantStamp(db,actor(who),counter.stampSchema.parse({brandId:'brand',locationId:'l1',memberId:'anna',channel:'dine_in',amountOre:12_000,discountUsed:false,via:'qr',idempotencyKey:key(Math.random().toString().slice(2)),...changes}),now);
const rejects=(promise,code)=>assert.rejects(promise,e=>e.code===code||e.message===code||(console.error(e),false));

test('a qualifying purchase gives one stamp, logged with employee, channel, amount and source',async()=>{
  setup();
  const result=await stamp({idempotencyKey:key(1)});
  assert.deepEqual({stamps:result.stamps,required:result.stampsRequired,rewards:result.rewardsEarned,replayed:result.replayed},{stamps:1,required:8,rewards:0,replayed:false});
  const [e]=events('stamp_added');
  assert.equal(e.actorName,'Cashier');assert.equal(e.actorId,principalKey(actor('cashier').identity));
  assert.equal(e.channel,'dine_in');assert.equal(e.amountOre,12_000);assert.equal(e.source,'counter_qr');assert.equal(e.locationId,'l1');
  assert.equal(e.companyId,'esmeralda');assert.equal(e.brandId,'brand');assert.equal(e.memberId,'anna');assert.equal(e.idempotencyKey,key(1));
  assert.equal(card().expiresAt,Date.parse('2027-04-20T10:00:00Z'));
  await stamp({via:'search'});assert.equal(events('stamp_added')[1].source,'counter_search');
});

test('the same idempotency key gives one stamp; a different request with it is rejected',async()=>{
  setup();
  const [a,b]=await Promise.all([stamp({idempotencyKey:key(7)}),stamp({idempotencyKey:key(7)})]);
  assert.equal(events('stamp_added').length,1);assert.equal(card().stamps,1);
  assert.deepEqual([a.replayed,b.replayed].sort(),[false,true]);assert.equal(b.stamps,1);
  await rejects(stamp({idempotencyKey:key(7),amountOre:20_000}),'idempotency_conflict');
});

test('below minimum, disabled channel, discount, daily limit and inactive program give no stamp',async()=>{
  setup({program:settings({counterChannels:['takeaway'],maxStampsPerDay:1})});
  await rejects(stamp({channel:'takeaway',amountOre:9_999}),'below_minimum');
  await rejects(stamp({channel:'dine_in'}),'channel_not_allowed');
  await rejects(stamp({channel:'takeaway',discountUsed:true}),'discount_excluded');
  await stamp({channel:'takeaway'});
  await rejects(stamp({channel:'takeaway'}),'daily_limit');
  assert.equal((await stamp({channel:'takeaway'},'cashier',NOW+DAY)).stamps,2);
  setup({program:settings({active:false})});await rejects(stamp(),'program_inactive');
  assert.equal(events().length,0);
  assert.throws(()=>counter.stampSchema.parse({brandId:'brand',locationId:'l1',memberId:'anna',channel:'wolt',amountOre:1,discountUsed:false,via:'qr',idempotencyKey:key(1)}));
});

test('discounted purchases qualify when the setting allows it',async()=>{
  setup({program:settings({discountedOrdersQualify:true})});
  assert.equal((await stamp({discountUsed:true})).stamps,1);
});

test('the Nth stamp earns a reward and starts a new card; the reward is redeemable once',async()=>{
  setup();
  for(let i=0;i<7;i++)await stamp();
  const full=await stamp();
  assert.equal(full.rewardsEarned,1);assert.equal(full.stamps,0);
  const rewards=rows('loyaltyRewards');assert.equal(rewards.length,1);
  assert.equal(rewards[0].description,'Gratis pizza');assert.equal(rewards[0].expiresAt,Date.parse('2027-01-20T10:00:00Z'));
  assert.equal(events('reward_earned').length,1);assert.equal(card().stamps,0);assert.equal(card().status,'active');
  assert.equal(rows('loyaltyCards').filter(c=>c.status==='completed').length,1);
  const redeem=k=>counter.redeemReward(db,actor('cashier'),{brandId:'brand',locationId:'l1',rewardId:rewards[0].id,via:'qr',idempotencyKey:key(k)},NOW+1);
  const [first,retry]=await Promise.all([redeem(100),redeem(100)]);
  assert.deepEqual([first.replayed,retry.replayed].sort(),[false,true]);
  await rejects(redeem(101),'reward_not_available');
  assert.equal(events('reward_redeemed').length,1);assert.equal(events('reward_redeemed')[0].actorName,'Cashier');
  assert.equal(db.rows.get('loyaltyRewards/'+rewards[0].id).status,'redeemed');
});

test('changed settings apply forward: the running card keeps its size and reward',async()=>{
  setup();
  for(let i=0;i<7;i++)await stamp();
  db.rows.set('loyaltyPrograms/brand',{brandId:'brand',version:2,settings:settings({stampsRequired:10,rewardDescription:'Gratis dessert',rewardValidityMonths:1})});
  const full=await stamp();
  assert.equal(full.rewardsEarned,1);assert.equal(full.stampsRequired,10);
  const [reward]=rows('loyaltyRewards');assert.equal(reward.description,'Gratis pizza');assert.equal(reward.programVersion,1);
  assert.equal(card().programVersion,2);assert.equal(card().stampsRequired,10);
});

test('permissions are enforced per action and location, including inactive and foreign staff',async()=>{
  setup();
  await rejects(stamp({},'none'),'forbidden');
  await rejects(stamp({},'inactive'),'forbidden');
  await rejects(stamp({locationId:'l2'},'cashier'),'forbidden');
  await rejects(stamp({},'other'),'forbidden');
  await rejects(stamp({brandId:'brand2',locationId:'x1',memberId:'anna'},'other'),'member_not_found');
  await rejects(stamp({locationId:'x1'},'manager'),'forbidden');
  await rejects(counter.correctMember(db,actor('cashier'),{brandId:'brand',locationId:'l1',kind:'add_stamps',memberId:'anna',count:1,reason:'Glemt stempel',idempotencyKey:key(1)},NOW),'forbidden');
  assert.equal(events().length,0);
});

test('lookup by QR token is single use, brand bound and expires; e-mail lookup masks the address',async()=>{
  setup();
  const lookup=(input,who='cashier',now=NOW)=>counter.lookupMember(db,actor(who),{brandId:'brand',locationId:'l1',...input},now);
  const {token}=await counter.issueQrToken(db,'brand','anna',NOW);
  assert.ok(![...db.rows.keys()].some(k=>k.includes(token)));
  const view=await lookup({qrToken:token});
  assert.equal(view.via,'qr');assert.deepEqual(view.member,{id:'anna',name:'ANNA',maskedEmail:'a***@example.com'});
  assert.deepEqual(view.permissions,{redeem:true,correct:false});assert.equal(view.program.active,true);
  await rejects(lookup({qrToken:token}),'qr_invalid');
  const late=await counter.issueQrToken(db,'brand','anna',NOW);await rejects(lookup({qrToken:late.token},'cashier',NOW+60_000),'qr_invalid');
  const foreign=await counter.issueQrToken(db,'brand2','bo',NOW);await rejects(lookup({qrToken:foreign.token}),'qr_invalid');
  await rejects(lookup({qrToken:'f'.repeat(64)}),'qr_invalid');
  assert.equal((await lookup({email:' ANNA@Example.com '})).via,'search');
  await rejects(lookup({email:'bo@example.com'}),'member_not_found');
  await rejects(lookup({email:'anna@example.com'},'none'),'forbidden');
  assert.equal((await lookup({email:'anna@example.com'},'manager')).permissions.correct,true);
});

test('lookups are rate limited per employee',async()=>{
  setup();
  for(let i=0;i<60;i++)await counter.lookupMember(db,actor('cashier'),{brandId:'brand',locationId:'l1',email:'anna@example.com'},NOW);
  await rejects(counter.lookupMember(db,actor('cashier'),{brandId:'brand',locationId:'l1',email:'anna@example.com'},NOW),'rate_limited');
  await counter.lookupMember(db,actor('cashier'),{brandId:'brand',locationId:'l1',email:'anna@example.com'},NOW+60_000);
});

test('manual correction needs the right and a reason, and is logged with the employee',async()=>{
  setup();
  const correct=(input,k)=>counter.correctMember(db,actor('manager'),counter.correctionSchema.parse({brandId:'brand',locationId:'l2',idempotencyKey:key(k),...input}),NOW);
  assert.throws(()=>counter.correctionSchema.parse({brandId:'brand',locationId:'l2',kind:'add_stamps',memberId:'anna',count:1,reason:' ',idempotencyKey:key(1)}));
  await rejects(correct({kind:'remove_stamps',memberId:'anna',count:1,reason:'Fejlregistrering'},1),'no_active_stamps');
  assert.equal((await correct({kind:'add_stamps',memberId:'anna',count:3,reason:'Papirkort ved kassefejl'},2)).stamps,3);
  assert.equal((await correct({kind:'remove_stamps',memberId:'anna',count:2,reason:'Dobbelt registreret'},3)).stamps,1);
  await rejects(correct({kind:'remove_stamps',memberId:'anna',count:5,reason:'For mange'},4),'no_active_stamps');
  const added=events('stamp_added')[0],removed=events('stamp_removed')[0];
  assert.equal(added.source,'correction');assert.equal(added.reason,'Papirkort ved kassefejl');assert.equal(added.actorName,'Manager');
  assert.equal(removed.quantity,2);assert.equal(removed.reason,'Dobbelt registreret');
  assert.equal((await correct({kind:'add_stamps',memberId:'anna',count:7,reason:'Kompensation'},5)).rewardsEarned,1);
  const [reward]=rows('loyaltyRewards');
  await counter.redeemReward(db,actor('manager'),{brandId:'brand',locationId:'l2',rewardId:reward.id,via:'search',idempotencyKey:key(6)},NOW);
  assert.equal(events('reward_redeemed')[0].source,'counter_search');
  assert.equal((await correct({kind:'cancel_redemption',rewardId:reward.id,reason:'Forkert kunde'},7)).status,'available');
  assert.equal(events('redemption_cancelled')[0].reason,'Forkert kunde');
  await rejects(correct({kind:'cancel_redemption',rewardId:reward.id,reason:'Igen'},8),'reward_not_redeemed');
});

test('location-bound cards and rewards when cross-location validity is off',async()=>{
  setup({program:settings({crossLocation:false,stampsRequired:2})});
  await stamp({},'manager');
  await rejects(stamp({locationId:'l2'},'manager'),'wrong_location');
  const full=await stamp({},'manager');assert.equal(full.rewardsEarned,1);
  const [reward]=rows('loyaltyRewards');assert.equal(reward.locationId,'l1');
  await rejects(counter.redeemReward(db,actor('manager'),{brandId:'brand',locationId:'l2',rewardId:reward.id,via:'qr',idempotencyKey:key(9)},NOW),'reward_wrong_location');
  assert.equal((await stamp({locationId:'l2'},'manager')).stamps,1);
});

test('expiry job expires idle cards and old rewards once, logs it and deletes nothing',async()=>{
  setup({program:settings({stampsRequired:2})});
  await stamp();await stamp();await stamp();
  const before=rows('loyaltyCards').length+rows('loyaltyRewards').length;
  const later=Date.parse('2027-04-21T10:00:00Z');
  assert.deepEqual(await runLoyaltyExpiry(db,later),{cards:1,rewards:1});
  assert.deepEqual(await runLoyaltyExpiry(db,later),{cards:0,rewards:0});
  assert.equal(rows('loyaltyCards').length+rows('loyaltyRewards').length,before);
  assert.equal(events('stamps_expired')[0].quantity,1);assert.equal(events('reward_expired').length,1);
  assert.equal(rows('loyaltyRewards')[0].status,'expired');
  await rejects(counter.redeemReward(db,actor('cashier'),{brandId:'brand',locationId:'l1',rewardId:rows('loyaltyRewards')[0].id,via:'qr',idempotencyKey:key(3)},later),'reward_not_available');
  const fresh=await stamp({},'cashier',later);assert.equal(fresh.stamps,1);
});

test('a stamp after the deadline but before the job starts a new card and logs the expiry',async()=>{
  setup();
  await stamp();
  const later=Date.parse('2027-04-21T10:00:00Z');
  assert.equal((await stamp({},'cashier',later)).stamps,1);
  assert.equal(events('stamps_expired').length,1);
  assert.deepEqual(await runLoyaltyExpiry(db,later),{cards:0,rewards:0});
});
