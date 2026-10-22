const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { memoryDb } = require('../helpers/marketing-db.cjs');
const mocks = { 'server-only': {} };
const rules = loadTs('src/lib/loyalty/stamp-card/campaign-rules.ts');
const campaigns = loadTs('src/lib/loyalty/stamp-card/campaigns.ts', mocks);
const bonus = loadTs('src/lib/loyalty/stamp-card/bonus.ts', mocks);
const model = loadTs('src/lib/loyalty/stamp-card/model.ts', mocks);
const { defaultProgramSettings } = loadTs('src/lib/loyalty/stamp-card/rules.ts');
const NOW = Date.parse('2026-10-22T10:00:00Z');
const brand = { brandId: 'brand', companyId: 'company' };
const profile = { phone: '+4526147157', birthDate: '1980-02-29', gender: 'prefer_not_to_say' };
function fixture(patch = {}) {
  const db = memoryDb(), run = db.runTransaction;
  // Firestore rejects a transaction read after its first write. Enforce that in
  // addition to the shared fixture's atomic rollback and serial contention.
  db.runTransaction = fn => run(tx => {
    let writing = false;
    return fn({ ...tx, get: ref => { assert.equal(writing, false, 'read after first write'); return tx.get(ref); },
      ...Object.fromEntries(['create','set','update','delete'].map(name => [name, (...args) => { writing = true; return tx[name](...args); }])) });
  });
  const settings = { ...defaultProgramSettings('Club'), active: true, reward: {type:'free_product',productIds:['pizza'],categoryIds:[]},
    rewardDescription: 'Pizza', terms:'Terms', consentText:'Consent', maxStampsPerDay:1, ...patch };
  db.rows.set('loyaltyPrograms/brand', { brandId:'brand',version:1,settings });
  const member = { ...brand, customerId:'customer',name:'Anna',normalizedEmail:'anna@example.com',status:'active',joinedAt:NOW,
    currentCardId:null,stampDay:'2026-10-22',stampsOnDay:1,sessionEpoch:0,termsVersion:'terms',
    consent:{status:'given',at:NOW,source:'portal',eventId:'consent'} };
  db.rows.set('loyaltyMembers/member', member);
  const config = rules.defaultCampaignSettings(); config.welcome.enabled = true; config.profile.enabled = true;
  db.rows.set('loyaltyCampaigns/brand', {brandId:'brand',version:1,updatedAt:NOW,settings:config});
  return { db, member, config };
}
function grant(f, changes = {}) {
  return f.db.runTransaction(async tx => {
    const memberId = changes.memberId || 'member';
    const member = (await tx.get(f.db.collection('loyaltyMembers').doc(memberId))).data();
    const staged = await bonus.stageBonusGrant({db:f.db,tx,brand,memberId,member,kind:'welcome',welcomeEligible:true,now:NOW,...changes});
    return { ...staged, result:staged.apply() };
  });
}
const rows = (db, collection) => [...db.rows].filter(([key])=>key.startsWith(collection+'/')).map(([,value])=>value);
const grants = db => rows(db,'loyaltyBonusGrants').filter(row=>row.scope==='email');
const rejects = (promise, code) => assert.rejects(promise,e=>e.code===code);

test('campaign defaults fail closed, one checkout mode and strict configuration/periods', () => {
  for (const value of [null,{}, {brandId:'other',version:1,updatedAt:NOW,settings:rules.defaultCampaignSettings()}]) {
    const c=rules.readCampaign('brand',value);assert.equal(c.version,0);assert.equal(c.settings.checkoutMode,'none');assert.equal(c.settings.welcome.enabled,false);
  }
  for(const change of [{checkoutMode:'both'},{welcome:{enabled:true,stamps:9,startsAt:null,endsAt:null}},
    {profile:{enabled:true,stamps:1,requiredFields:['phone','phone'],startsAt:null,endsAt:null}},
    {welcome:{enabled:true,stamps:1,startsAt:NOW,endsAt:NOW}}, {unexpected:true}])
    assert.equal(rules.campaignSettingsSchema.safeParse({...rules.defaultCampaignSettings(),...change}).success,false);
  assert.equal(rules.campaignInPeriod({enabled:true,startsAt:NOW,endsAt:NOW+1},NOW),true);
  assert.equal(rules.campaignInPeriod({enabled:true,startsAt:NOW,endsAt:NOW+1},NOW+1),false);
});

test('campaign saves use a version lease and stage all reads before writes', async () => {
  const f=fixture();
  const save=expectedVersion=>f.db.runTransaction(async tx=>{const stage=await campaigns.stageCampaignSettings({db:f.db,tx,brandId:'brand',
    settings:{...f.config,checkoutMode:'club'},expectedVersion,now:NOW+1});stage.apply();return stage.campaign;});
  const saved=await save(1);assert.equal(saved.version,2);assert.equal(saved.settings.checkoutMode,'club');
  await rejects(save(1),'campaign_changed');
  f.db.rows.set('loyaltyCampaigns/brand',{brandId:'other',version:2,settings:f.config,updatedAt:NOW});
  await rejects(save(2),'campaign_invalid');
});

test('welcome grants exactly once under contention without consuming the daily purchase allowance', async () => {
  const f=fixture(); const answers=await Promise.all(Array.from({length:12},()=>grant(f)));
  assert.equal(answers.filter(x=>x.eligible).length,1);
  assert.equal(grants(f.db).length,1);assert.equal(rows(f.db,'loyaltyCards')[0].stamps,1);
  const m=f.db.rows.get('loyaltyMembers/member');assert.equal(m.stampsOnDay,1);assert.equal(m.stampDay,'2026-10-22');
  const event=rows(f.db,'loyaltyEvents').find(x=>x.type==='stamp_added');assert.equal(event.channel,'bonus_welcome');assert.equal(event.reason,'Velkomststempel');
  assert.equal(JSON.stringify(rows(f.db,'loyaltyBonusGrants')).includes('anna@example.com'),false);
});

test('profile completion validates selected fields and opt-out gender counts as answered', async () => {
  const f=fixture();
  for(const invalid of [{...profile,phone:''},{...profile,birthDate:'1981-02-29'},{...profile,birthDate:'2090-01-01'},{...profile,gender:null}]) {
    const a=await grant(f,{kind:'profile',profile:invalid});assert.equal(a.reason,'profile_incomplete');
  }
  const a=await grant(f,{kind:'profile',profile});assert.equal(a.result.stamps,1);
  const second=await grant(f,{kind:'profile',profile:{...profile,phone:'+4599999999'}});assert.equal(second.reason,'already_granted');
  assert.equal(rows(f.db,'loyaltyEvents').find(x=>x.type==='stamp_added').channel,'bonus_profile');
});

test('welcome and profile are separate grants but edits, toggles and delete/recreate cannot repeat either', async () => {
  const f=fixture();await grant(f);await grant(f,{kind:'profile',profile});
  assert.equal(rows(f.db,'loyaltyCards')[0].stamps,2);
  f.config.welcome.stamps=2;f.db.rows.set('loyaltyCampaigns/brand',{brandId:'brand',version:2,updatedAt:NOW+1,settings:f.config});
  f.db.rows.delete('loyaltyMembers/member');f.db.rows.set('loyaltyMembers/recreated',{...f.member,normalizedEmail:'ANNA@EXAMPLE.COM'});
  assert.equal((await grant(f,{memberId:'recreated'})).alreadyGranted,true);
  assert.equal((await grant(f,{memberId:'recreated',kind:'profile',profile})).alreadyGranted,true);
  assert.equal(grants(f.db).length,2);
});

test('disabled, future, expired, inactive-program and historical welcome do not write', async () => {
  for(const change of [c=>c.welcome.enabled=false,c=>c.welcome.startsAt=NOW+1,c=>c.welcome.endsAt=NOW]) {
    const f=fixture();change(f.config);f.db.rows.set('loyaltyCampaigns/brand',{brandId:'brand',version:1,updatedAt:NOW,settings:f.config});
    assert.equal((await grant(f)).eligible,false);assert.equal(rows(f.db,'loyaltyCards').length,0);
  }
  const f=fixture();assert.equal((await grant(f,{welcomeEligible:false})).reason,'not_new_signup');
  f.db.rows.get('loyaltyPrograms/brand').settings.active=false;assert.equal((await grant(f)).reason,'program_inactive');
  assert.equal(grants(f.db).length,0);
});

test('brand/company/card mismatches reject without a grant', async () => {
  const f=fixture();await rejects(grant(f,{brand:{brandId:'other',companyId:'company'}}),'unauthorized');
  f.member.currentCardId='foreign';f.db.rows.set('loyaltyMembers/member',f.member);
  f.db.rows.set('loyaltyCards/foreign',{...model.newCard({brandId:'brand',version:1,settings:f.db.rows.get('loyaltyPrograms/brand').settings},'company','other-member',NOW)});
  await rejects(grant(f),'card_conflict');assert.equal(grants(f.db).length,0);
});

test('bonus completes the frozen card, carries overflow with current rules, and preserves location binding', async () => {
  const f=fixture({stampsRequired:10,crossLocation:false});
  const oldProgram={brandId:'brand',version:1,settings:{...f.db.rows.get('loyaltyPrograms/brand').settings,stampsRequired:8,rewardDescription:'Old reward'}};
  f.member.currentCardId='card';f.db.rows.set('loyaltyMembers/member',f.member);
  f.db.rows.set('loyaltyCards/card',{...model.newCard(oldProgram,'company','member',NOW),stamps:7,locationId:'restaurant'});
  f.config.welcome.stamps=2;f.db.rows.set('loyaltyCampaigns/brand',{brandId:'brand',version:2,settings:f.config,updatedAt:NOW});
  const a=await grant(f);assert.equal(a.result.stamps,1);assert.equal(a.result.stampsRequired,10);assert.equal(a.result.rewardsEarned,1);
  const reward=rows(f.db,'loyaltyRewards')[0];assert.equal(reward.description,'Old reward');assert.equal(reward.locationId,'restaurant');
  const next=f.db.rows.get('loyaltyCards/'+a.result.cardId);assert.equal(next.locationId,'restaurant');assert.equal(next.stamps,1);
});

test('expired card is expired atomically before starting the bonus card', async () => {
  const f=fixture();f.member.currentCardId='expired';f.db.rows.set('loyaltyMembers/member',f.member);
  f.db.rows.set('loyaltyCards/expired',{...model.newCard({brandId:'brand',version:1,settings:f.db.rows.get('loyaltyPrograms/brand').settings},'company','member',NOW),
    stamps:5,expiresAt:NOW-1});
  const a=await grant(f);assert.equal(f.db.rows.get('loyaltyCards/expired').status,'expired');assert.equal(a.result.stamps,1);
  assert.equal(rows(f.db,'loyaltyEvents').filter(x=>x.type==='stamps_expired').length,1);
});

test('new signup stages reads before member creation and apply is safe to call once or twice', async () => {
  const f=fixture();f.db.rows.delete('loyaltyMembers/member');
  await f.db.runTransaction(async tx=>{
    const staged=await bonus.stageBonusGrant({db:f.db,tx,brand,memberId:'member',member:f.member,kind:'welcome',welcomeEligible:true,now:NOW});
    tx.create(f.db.collection('loyaltyMembers').doc('member'),f.member);
    const a=staged.apply(),b=staged.apply();assert.deepEqual(a,b);
  });
  assert.equal(grants(f.db).length,1);assert.equal(rows(f.db,'loyaltyCards')[0].stamps,1);
});


test('a different email alias for the same central customer cannot collect the same bonus twice', async () => {
  const f=fixture();await grant(f);
  f.db.rows.set('loyaltyMembers/alias',{...f.member,normalizedEmail:'anna@work.example'});
  assert.equal((await grant(f,{memberId:'alias'})).alreadyGranted,true);
  assert.equal(grants(f.db).length,1);assert.equal(rows(f.db,'loyaltyCards')[0].stamps,1);
});
