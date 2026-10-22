const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {memoryDb}=require('../helpers/marketing-db.cjs');
let db;
const mocks={'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db}};
const admin=loadTs('src/lib/loyalty/stamp-card/campaign-admin.ts',mocks);
const {defaultCampaignSettings}=loadTs('src/lib/loyalty/stamp-card/campaign-rules.ts');
const {principalKey}=loadTs('src/lib/access/authority.ts',mocks);
const who=name=>({identity:{provider:'firebase',subject:name},name});
const NOW=Date.parse('2026-10-22T00:00:00Z');
function setup(){
 db=memoryDb();const key=name=>principalKey(who(name).identity);
 db.rows.set('platformAdminControl/access-v1',{
  principals:['both','discount','loyalty','local','foreign'].map(name=>({id:key(name),active:true})),
  companies:[{id:'company',name:'Company',active:true,locationIds:['location'],orderflyBrandIds:['brand'],opsflyOrganizationId:null},{id:'other',name:'Other',active:true,locationIds:[],orderflyBrandIds:['otherbrand'],opsflyOrganizationId:null}],
  roles:[{id:'both',name:'Both',companyId:'company',kind:'company_user',active:true,permissions:['orderfly.discounts:edit','orderfly.stamp_cards:settings']},{id:'discount',name:'Discount',companyId:'company',kind:'company_user',active:true,permissions:['orderfly.discounts:edit']},{id:'loyalty',name:'Loyalty',companyId:'company',kind:'company_user',active:true,permissions:['orderfly.stamp_cards:settings']},{id:'foreign',name:'Foreign',companyId:'other',kind:'company_user',active:true,permissions:['orderfly.discounts:edit','orderfly.stamp_cards:settings']}],
  memberships:['both','discount','loyalty','local','foreign'].map(name=>({id:name,principalId:key(name),companyId:name==='foreign'?'other':'company',locationIds:name==='local'?['location']:null,roleIds:[name==='local'?'both':name],active:true})),
 });
 db.rows.set('brands/brand',{name:'Brand'});db.rows.set('brands/otherbrand',{name:'Other'});db.rows.set('locations/location',{brandId:'brand'});
}
const input=(changes={})=>({brandId:'brand',version:0,settings:{...defaultCampaignSettings(),checkoutMode:'club'},...changes});
const rejects=(promise,code)=>assert.rejects(promise,error=>error.code===code);

test('missing config preserves legacy newsletter and never enables stamp campaigns',async()=>{
 setup();const result=await admin.readClubCampaign(db,who('both'),'brand');
 assert.equal(result.version,0);assert.equal(result.settings.checkoutMode,'newsletter');assert.equal(result.settings.welcome.enabled,false);assert.equal(result.settings.profile.enabled,false);
 assert.equal(db.rows.has('loyaltyCampaigns/brand'),false);
});
test('only both full-brand permissions may read or save, including foreign and location denials',async()=>{
 setup();for(const actor of ['discount','loyalty','local','foreign']){
  await rejects(admin.readClubCampaign(db,who(actor),'brand'),'forbidden');
  await rejects(admin.saveClubCampaign(db,who(actor),input(),NOW),'forbidden');
 }
 assert.equal([...db.rows.keys()].some(key=>key.startsWith('loyaltyCampaigns/')),false);
});
test('save stores exactly one checkout mode and optimistic version with PII-free audit',async()=>{
 setup();const first=await admin.saveClubCampaign(db,who('both'),input(),NOW);
 assert.equal(first.settings.checkoutMode,'club');assert.equal(first.version,1);
 await rejects(admin.saveClubCampaign(db,who('both'),input(),NOW),'campaign_changed');
 const next=await admin.saveClubCampaign(db,who('both'),input({version:1,settings:{...defaultCampaignSettings(),checkoutMode:'none'}}),NOW+1);
 assert.equal(next.version,2);assert.equal((await admin.readClubCampaign(db,who('both'),'brand')).settings.checkoutMode,'none');
 const audits=[...db.rows].filter(([key])=>key.startsWith('loyaltyCampaignAudit/'));
 assert.equal(audits.length,2);assert.ok(audits.every(([,row])=>!('email' in row)&&!('phone' in row)&&!('birthDate' in row)));
});
test('simultaneous saves cannot silently overwrite the other version',async()=>{
 setup();const results=await Promise.allSettled([admin.saveClubCampaign(db,who('both'),input(),NOW),admin.saveClubCampaign(db,who('both'),input(),NOW)]);
 assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
 assert.equal(results.find(result=>result.status==='rejected').reason.code,'campaign_changed');
});
test('permission revocation between read and transaction prevents all writes',async()=>{
 setup();const original=db.runTransaction;
 db.runTransaction=async callback=>{const policy=db.rows.get('platformAdminControl/access-v1');policy.memberships.find(m=>m.id==='both').active=false;return original(callback);};
 await rejects(admin.saveClubCampaign(db,who('both'),input(),NOW),'forbidden');
 assert.equal(db.rows.has('loyaltyCampaigns/brand'),false);
});
test('invalid settings and malformed stored data fail without resetting configuration',async()=>{
 setup();const bad={...defaultCampaignSettings(),checkoutMode:'both'};
 await rejects(admin.saveClubCampaign(db,who('both'),input({settings:bad}),NOW),'invalid_request');
 await rejects(admin.saveClubCampaign(db,who('both'),input({settings:{...defaultCampaignSettings(),profile:{...defaultCampaignSettings().profile,requiredFields:[]}}}),NOW),'invalid_request');
 db.rows.set('loyaltyCampaigns/brand',{brandId:'otherbrand',version:1,settings:defaultCampaignSettings()});
 assert.equal((await admin.readClubCampaign(db,who('both'),'brand')).settings.checkoutMode,'none');
 await rejects(admin.saveClubCampaign(db,who('both'),input(),NOW),'campaign_invalid');
});
