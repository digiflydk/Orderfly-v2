const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {memoryDb}=require('../helpers/marketing-db.cjs');

let db;
const mocks={'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db}};
const admin=loadTs('src/lib/loyalty/stamp-card/admin.ts',mocks);
const counter=loadTs('src/lib/loyalty/stamp-card/counter.ts',mocks);
const {defaultProgramSettings}=loadTs('src/lib/loyalty/stamp-card/rules.ts');
const {principalKey}=loadTs('src/lib/access/authority.ts',mocks);
const {parseFilters,presetRange}=loadTs('src/lib/loyalty/stamp-card/filters.ts');

const NOW=Date.parse('2026-10-20T10:00:00Z'),S='orderfly.stamp_cards:';
const who=name=>({identity:{provider:'firebase',subject:name},name:name[0].toUpperCase()+name.slice(1)});
const settings=(changes={})=>({...defaultProgramSettings('Esmeralda'),active:true,reward:{type:'free_product',productIds:['pizza'],categoryIds:[]},
  rewardDescription:'Gratis pizza',terms:'Vilkår',consentText:'Ja tak til nyhedsbrev på e-mail. Du kan altid afmelde dig.',...changes});

function setup(){
  db=memoryDb();
  const id=name=>principalKey(who(name).identity);
  db.rows.set('platformAdminControl/access-v1',{
    principals:['owner','leder','afdeling','kasse','fremmed'].map(n=>({id:id(n),active:true})),
    companies:[{id:'esmeralda',name:'Esmeralda',active:true,locationIds:['l1','l2'],orderflyBrandIds:['brand'],opsflyOrganizationId:null},
      {id:'andet',name:'Andet',active:true,locationIds:['x1'],orderflyBrandIds:['brand2'],opsflyOrganizationId:null}],
    roles:[{id:'super',name:'Super',companyId:null,kind:'superuser',permissions:[],active:true},
      {id:'admin',name:'Admin',companyId:'esmeralda',kind:'company_user',active:true,permissions:[S+'settings',S+'members',S+'log',S+'correct',S+'overview']},
      {id:'leder',name:'Leder',companyId:'esmeralda',kind:'company_user',active:true,permissions:[S+'members',S+'log',S+'correct',S+'counter',S+'redeem']},
      {id:'kasse',name:'Kasse',companyId:'esmeralda',kind:'company_user',active:true,permissions:[S+'counter',S+'redeem']},
      {id:'andet-admin',name:'Admin',companyId:'andet',kind:'company_user',active:true,permissions:[S+'settings',S+'members',S+'log']}],
    memberships:[
      {id:'m0',principalId:id('owner'),companyId:null,locationIds:null,roleIds:['super'],active:true},
      {id:'m1',principalId:id('leder'),companyId:'esmeralda',locationIds:null,roleIds:['leder','admin'],active:true},
      {id:'m2',principalId:id('afdeling'),companyId:'esmeralda',locationIds:['l1'],roleIds:['leder'],active:true},
      {id:'m3',principalId:id('kasse'),companyId:'esmeralda',locationIds:null,roleIds:['kasse'],active:true},
      {id:'m4',principalId:id('fremmed'),companyId:'andet',locationIds:null,roleIds:['andet-admin'],active:true}]});
  for(const [b,name] of [['brand','Esmeralda'],['brand2','Andet']])db.rows.set('brands/'+b,{name,slug:b});
  for(const [l,b] of [['l1','brand'],['l2','brand'],['x1','brand2']])db.rows.set('locations/'+l,{brandId:b,name:'Afdeling '+l,isActive:true});
  db.rows.set('products/pizza',{brandId:'brand',productName:'Pizza'});db.rows.set('products/foreign',{brandId:'brand2',productName:'Fremmed'});
  db.rows.set('loyaltyPrograms/brand',{brandId:'brand',version:1,settings:settings({stampsRequired:2})});
  db.rows.set('loyaltyPrograms/brand2',{brandId:'brand2',version:1,settings:settings()});
  for(const [m,b,email] of [['anna','brand','anna@example.com'],['bo','brand','bo@example.com'],['carl','brand2','carl@example.com']])
    db.rows.set('loyaltyMembers/'+m,{companyId:b==='brand'?'esmeralda':'andet',brandId:b,customerId:'c-'+m,name:m.toUpperCase(),normalizedEmail:email,status:'active',joinedAt:NOW-86_400_000,
      currentCardId:null,stampDay:null,stampsOnDay:0,consent:{status:m==='bo'?'withdrawn':'given',at:NOW,source:'portal',eventId:'e'},termsVersion:'t',sessionEpoch:0});
}
const rows=prefix=>[...db.rows].filter(([p])=>p.startsWith(prefix+'/')).map(([p,v])=>({id:p.split('/')[1],...v}));
const stamp=(memberId,n,at=NOW)=>counter.grantStamp(db,who('leder'),{brandId:'brand',locationId:'l1',memberId,channel:'takeaway',amountOre:15_000,discountUsed:false,via:'qr',idempotencyKey:String(n).padStart(64,'0')},at);
const rejects=(promise,code)=>assert.rejects(promise,e=>e.code===code||(console.error(e),false));

test('administration requires the permission for the whole brand and never crosses tenants',async()=>{
  setup();
  const brands=async(name,p)=>(await admin.adminBrands(db,who(name),S+p)).map(b=>b.brandId);
  assert.deepEqual(await brands('leder','members'),['brand']);
  assert.deepEqual(await brands('afdeling','members'),[]);
  assert.deepEqual(await brands('kasse','log'),[]);
  assert.deepEqual(await brands('fremmed','members'),['brand2']);
  assert.deepEqual((await brands('owner','settings')).sort(),['brand','brand2']);
  await rejects(admin.readSettings(db,who('fremmed'),'brand'),'forbidden');
  await rejects(admin.memberDetail(db,who('fremmed'),'anna',NOW),'forbidden');
  const foreign=await admin.listMembers(db,who('fremmed'),['brand','brand2'],NOW);
  assert.deepEqual(foreign.rows.map(r=>r.id),['carl']);
  const log=await admin.listEvents(db,who('fremmed'),{brandIds:['brand'],from:'2026-10-01',to:'2026-10-31',type:null,actorId:null,channel:null});
  assert.equal(log.rows.length,0);
});

test('settings save a new version, log old and new values with the employee, and apply forward only',async()=>{
  setup();
  const read=await admin.readSettings(db,who('leder'),'brand');
  assert.equal(read.version,1);assert.deepEqual(read.products,[{id:'pizza',name:'Pizza'}]);
  const result=await admin.saveSettings(db,who('leder'),{brandId:'brand',version:1,settings:settings({stampsRequired:10,name:'Esmeralda Club'})},NOW);
  assert.deepEqual(result,{version:2,changed:1});
  const program=db.rows.get('loyaltyPrograms/brand');
  assert.equal(program.version,2);assert.equal(program.settings.stampsRequired,10);assert.equal(program.updatedByName,'Leder');
  assert.equal(db.rows.get('loyaltyProgramVersions/brand_2').settings.stampsRequired,10);
  const [event]=rows('loyaltyEvents');
  assert.equal(event.type,'settings_changed');assert.equal(event.actorName,'Leder');assert.equal(event.createdAt,NOW);
  assert.deepEqual(event.result.changes,[{field:'stampsRequired',from:2,to:10}]);
  assert.deepEqual(await admin.saveSettings(db,who('leder'),{brandId:'brand',version:2,settings:settings({stampsRequired:10})},NOW),{version:2,changed:0});
  const log=await admin.listEvents(db,who('leder'),{brandIds:['brand'],from:'2026-10-20',to:'2026-10-20',type:'settings_changed',actorId:null,channel:null});
  assert.equal(log.rows[0].details,'stampsRequired: 2 → 10');
});

test('settings reject stale versions, foreign products, invalid values and users without the right',async()=>{
  setup();
  await rejects(admin.saveSettings(db,who('leder'),{brandId:'brand',version:0,settings:settings()},NOW),'record_changed');
  await rejects(admin.saveSettings(db,who('leder'),{brandId:'brand',version:1,settings:settings({reward:{type:'free_product',productIds:['foreign'],categoryIds:[]}})},NOW),'invalid_reward_reference');
  await assert.rejects(admin.saveSettings(db,who('kasse'),{brandId:'brand',version:1,settings:settings()},NOW),/forbidden/);
  await assert.rejects(admin.saveSettings(db,who('fremmed'),{brandId:'brand',version:1,settings:settings()},NOW),/forbidden/);
  for(const bad of [{stampsRequired:0},{minimumAmountOre:-1},{consentText:''},{counterChannels:['wolt']}])
    assert.equal(admin.saveSettingsSchema.safeParse({brandId:'brand',version:1,settings:settings(bad)}).success,false,JSON.stringify(bad));
  assert.equal(rows('loyaltyEvents').length,0);assert.equal(db.rows.get('loyaltyPrograms/brand').version,1);
});

test('the member list shows stamps, rewards, next expiry, newsletter and last activity',async()=>{
  setup();
  await stamp('anna',1);await stamp('anna',2,NOW+1000);await stamp('anna',3,NOW+2000);
  const {rows:list,truncated}=await admin.listMembers(db,who('leder'),['brand'],NOW+3000);
  assert.equal(truncated,false);
  const anna=list.find(r=>r.id==='anna'),bo=list.find(r=>r.id==='bo');
  assert.deepEqual({stamps:anna.stamps,required:anna.stampsRequired,rewards:anna.rewards,newsletter:anna.newsletter,last:anna.lastActivityAt},
    {stamps:1,required:2,rewards:1,newsletter:true,last:NOW+2000});
  assert.equal(anna.nextExpiry,Date.parse('2027-01-20T10:00:01Z'));
  assert.deepEqual({stamps:bo.stamps,rewards:bo.rewards,newsletter:bo.newsletter,next:bo.nextExpiry},{stamps:0,rewards:0,newsletter:false,next:null});
  assert.ok(list.every(r=>r.brandId==='brand'));
});

test('member detail shows full history with staff, and correction locations follow the right',async()=>{
  setup();
  await stamp('anna',1);
  const detail=await admin.memberDetail(db,who('leder'),'anna',NOW+1);
  assert.equal(detail.card.stamps,1);assert.equal(detail.events[0].actorName,'Leder');assert.equal(detail.events[0].locationName,'Afdeling l1');
  assert.deepEqual(detail.correctLocations.map(l=>l.id).sort(),['l1','l2']);
  db.rows.get('platformAdminControl/access-v1').roles.find(r=>r.id==='leder').permissions=[S+'members'];
  db.rows.get('platformAdminControl/access-v1').roles.find(r=>r.id==='admin').permissions=[S+'members'];
  assert.deepEqual((await admin.memberDetail(db,who('leder'),'anna',NOW+1)).correctLocations,[]);
  await rejects(admin.memberDetail(db,who('leder'),'../x',NOW),'member_not_found');
});

test('the log filters by Copenhagen period, type, employee and channel and labels deleted members',async()=>{
  setup();
  await stamp('anna',1,Date.parse('2026-10-19T21:59:59Z'));
  await stamp('bo',2,Date.parse('2026-10-19T22:00:00Z'));
  await counter.grantStamp(db,who('owner'),{brandId:'brand',locationId:'l2',memberId:'anna',channel:'dine_in',amountOre:20_000,discountUsed:false,via:'search',idempotencyKey:'9'.padStart(64,'0')},Date.parse('2026-10-20T21:59:59Z'));
  db.rows.set('loyaltyMembers/bo',{companyId:'esmeralda',brandId:'brand',status:'deleted',joinedAt:NOW,sessionEpoch:1});
  const list=filter=>admin.listEvents(db,who('leder'),{brandIds:['brand'],from:'2026-10-20',to:'2026-10-20',type:null,actorId:null,channel:null,...filter});
  const day=await list({});
  // Anna's second stamp fills the two-stamp card, so the day also has her reward.
  assert.deepEqual(day.rows.map(r=>[r.type,r.memberName]).sort(),[['reward_earned','ANNA'],['stamp_added','ANNA'],['stamp_added','Slettet medlem']]);
  assert.deepEqual(day.actors.map(a=>a.name).sort(),['Leder','Owner']);
  assert.deepEqual((await list({channel:'dine_in'})).rows.map(r=>r.source),['counter_search']);
  assert.deepEqual((await list({actorId:principalKey(who('leder').identity)})).rows.map(r=>r.memberName),['Slettet medlem']);
  assert.deepEqual((await list({type:'reward_earned'})).rows.map(r=>r.actorName),['Owner']);
  assert.equal((await list({type:'stamp_removed'})).rows.length,0);
  assert.equal((await list({from:'2026-10-19',to:'2026-10-19'})).rows.length,1);
});

test('Copenhagen midnight is correct on both sides of daylight saving time',()=>{
  assert.equal(admin.copenhagenMidnight('2026-07-01'),Date.parse('2026-06-30T22:00:00Z'));
  assert.equal(admin.copenhagenMidnight('2026-12-01'),Date.parse('2026-11-30T23:00:00Z'));
  assert.equal(admin.copenhagenMidnight('2026-10-25'),Date.parse('2026-10-24T22:00:00Z'));
  assert.equal(admin.copenhagenMidnight('2026-10-26'),Date.parse('2026-10-25T23:00:00Z'));
});

test('filters parse presets and reject malformed URL values',()=>{
  assert.deepEqual(presetRange('lastMonth',NOW),{from:'2026-09-01',to:'2026-09-30'});
  assert.deepEqual(presetRange('7d',NOW),{from:'2026-10-14',to:'2026-10-20'});
  const f=parseFilters({period:'custom',from:'2026-10-10',to:'2026-10-01',brand:'a,../b,c',channel:'wolt',actor:'x'},NOW);
  assert.equal(f.period,'custom');assert.deepEqual([f.from,f.to],['2026-09-21','2026-10-20']);
  assert.deepEqual(f.brands,['a','c']);assert.equal(f.channel,null);assert.equal(f.actor,null);
  assert.deepEqual(parseFilters({},NOW).period,'30d');
});

test('the overview counts members, stamps, rewards, expiry and consent within filters and tenant',async()=>{
  setup();
  const at=Date.parse('2026-10-20T08:00:00Z');
  await stamp('anna',1,at);await stamp('anna',2,at+1000);
  await counter.grantStamp(db,who('owner'),{brandId:'brand',locationId:'l2',memberId:'bo',channel:'dine_in',amountOre:20_000,discountUsed:false,via:'search',idempotencyKey:'7'.padStart(64,'0')},at+2000);
  const [reward]=rows('loyaltyRewards');
  await counter.redeemReward(db,who('leder'),{brandId:'brand',locationId:'l1',rewardId:reward.id,via:'qr',idempotencyKey:'8'.padStart(64,'0')},at+3000);
  await counter.correctMember(db,who('leder'),{brandId:'brand',locationId:'l1',kind:'add_stamps',memberId:'bo',count:1,reason:'Kompensation',idempotencyKey:'9'.padStart(64,'0')},at+4000);
  const filter={brandIds:['brand','brand2'],from:'2026-10-14',to:'2026-10-20',channel:null};
  const o=await admin.loyaltyOverview(db,who('leder'),filter,at+5000);
  assert.deepEqual(o.programs.map(p=>p.brandId),['brand']);
  assert.deepEqual({...o.kpi,newsletterShare:undefined},{activeMembers:2,newMembers:2,stamps:3,rewardsEarned:2,rewardsRedeemed:1,rewardsOpen:1,cardsExpiringSoon:0,newsletterMembers:1,newsletterShare:undefined});
  assert.equal(o.kpi.newsletterShare,0.5);
  // Corrections are adjustments, not stamps given at the counter; Bo's correction still completes a card and earns a reward.
  assert.deepEqual(o.channels,{dine_in:1,takeaway:2});
  assert.equal(o.daily.length,7);assert.deepEqual(o.daily.at(-1),{day:'2026-10-20',stamps:3,redemptions:1});
  assert.deepEqual(o.staff.map(s=>[s.name,s.stamps,s.redemptions]),[['Leder',2,1],['Owner',1,0]]);
  // The correction and the reward it completed share a timestamp, so their order is not asserted.
  assert.ok(o.latest.slice(0,2).some(e=>e.type==='stamp_added'&&e.reason==='Kompensation'));assert.ok(o.latest.length<=20);
  const dineIn=await admin.loyaltyOverview(db,who('leder'),{...filter,channel:'dine_in'},at+5000);
  assert.equal(dineIn.kpi.stamps,1);assert.equal(dineIn.kpi.rewardsRedeemed,1);
  const before=await admin.loyaltyOverview(db,who('leder'),{...filter,from:'2026-10-01',to:'2026-10-13'},at+5000);
  assert.deepEqual([before.kpi.stamps,before.kpi.newMembers,before.kpi.activeMembers],[0,0,2]);
  assert.equal(o.periodShortened,false);
  // A custom period longer than 366 days is shortened, so every counted stamp has a daily bucket.
  const long=await admin.loyaltyOverview(db,who('leder'),{...filter,from:'2020-01-01'},at+5000);
  assert.equal(long.periodShortened,true);assert.equal(long.periodFrom,'2025-10-20');assert.equal(long.daily.length,366);
  assert.equal(long.daily.reduce((n,d)=>n+d.stamps,0),long.kpi.stamps);assert.equal(long.kpi.stamps,3);
  // A card whose deadline falls within 30 days counts as expiring.
  await stamp('anna',10,at+6000);
  const later=Date.parse('2027-04-01T00:00:00Z');
  assert.equal((await admin.loyaltyOverview(db,who('leder'),filter,later)).kpi.cardsExpiringSoon,1);
  assert.deepEqual((await admin.loyaltyOverview(db,who('fremmed'),filter,at)).programs,[]);
  assert.deepEqual((await admin.loyaltyOverview(db,who('kasse'),filter,at)).programs,[]);
});
