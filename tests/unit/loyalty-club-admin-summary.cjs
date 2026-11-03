const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {memoryDb}=require('../helpers/marketing-db.cjs');
let db;
const mocks={'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db}};
const summary=loadTs('src/lib/loyalty/stamp-card/club-admin-summary.ts',mocks);
const {defaultCampaignSettings}=loadTs('src/lib/loyalty/stamp-card/campaign-rules.ts');
const {defaultProgramSettings}=loadTs('src/lib/loyalty/stamp-card/rules.ts');
const {principalKey}=loadTs('src/lib/access/authority.ts',mocks);
const who=name=>({identity:{provider:'firebase',subject:name},name});
const NOW=Date.parse('2026-11-03T12:00:00Z');
const ROLES={all:['orderfly.discounts:edit','orderfly.discounts:view','orderfly.stamp_cards:settings'],loyalty:['orderfly.stamp_cards:settings'],viewer:['orderfly.discounts:view'],
 editor:['orderfly.discounts:edit'],creator:['orderfly.discounts:view','orderfly.discounts:create'],overview:['orderfly.stamp_cards:overview'],local:['orderfly.discounts:edit','orderfly.stamp_cards:settings'],foreign:['orderfly.discounts:edit','orderfly.stamp_cards:settings']};
function setup(){
 db=memoryDb();const key=name=>principalKey(who(name).identity),names=Object.keys(ROLES);
 db.rows.set('platformAdminControl/access-v1',{
  principals:names.map(name=>({id:key(name),active:true})),
  companies:[{id:'company',name:'Company',active:true,locationIds:['location'],orderflyBrandIds:['brand'],opsflyOrganizationId:null},{id:'other',name:'Other',active:true,locationIds:[],orderflyBrandIds:['otherbrand'],opsflyOrganizationId:null}],
  roles:names.map(name=>({id:name,name,companyId:name==='foreign'?'other':'company',kind:'company_user',active:true,permissions:ROLES[name]})),
  memberships:names.map(name=>({id:name,principalId:key(name),companyId:name==='foreign'?'other':'company',locationIds:name==='local'?['location']:null,roleIds:[name],active:true})),
 });
 db.rows.set('brands/brand',{name:'Esmeralda'});db.rows.set('brands/otherbrand',{name:'Other'});db.rows.set('locations/location',{brandId:'brand'});
 const discount=(changes)=>({brandId:'brand',isActive:true,discountType:'percentage',discountValue:10,description:'',locationIds:['location'],orderTypes:['pickup'],...changes});
 db.rows.set('discounts/news',discount({applicationType:'newsletter_signup',description:'Velkomst',discountValue:15}));
 db.rows.set('discounts/news-off',discount({applicationType:'newsletter_signup',isActive:false}));
 db.rows.set('discounts/news-expired',discount({applicationType:'newsletter_signup',endDate:'2026-10-01T00:00:00Z'}));
 db.rows.set('discounts/club',discount({applicationType:'club_signup',discountType:'fixed_amount',discountValue:50}));
 db.rows.set('discounts/code',discount({code:'SUMMER'}));
 db.rows.set('discounts/news-nowhere',discount({applicationType:'newsletter_signup',locationIds:[]}));
 db.rows.set('discounts/news-baddate',discount({applicationType:'newsletter_signup',endDate:'not a date'}));
 db.rows.set('discounts/foreign',discount({brandId:'otherbrand',applicationType:'newsletter_signup'}));
}
const read=(name,brandId='brand',superuser=false)=>summary.readClubAdminSummary(db,who(name),brandId,{superuser,now:NOW});

test('missing campaign shows the legacy newsletter checkout and disabled stamps without writing',async()=>{
 setup();const result=await read('all');
 assert.equal(result.brandName,'Esmeralda');assert.equal(result.campaign.checkoutMode,'newsletter');assert.equal(result.campaign.saved,false);
 assert.equal(result.campaign.welcome.enabled,false);assert.equal(result.campaign.profile.activeNow,false);
 assert.equal(db.rows.has('loyaltyCampaigns/brand'),false);
});
test('saved campaign reports mode and stamp periods; a corrupt document fails closed',async()=>{
 setup();const settings={...defaultCampaignSettings(),checkoutMode:'club',welcome:{enabled:true,stamps:2,startsAt:NOW-1000,endsAt:NOW+1000}};
 db.rows.set('loyaltyCampaigns/brand',{brandId:'brand',version:3,updatedAt:NOW,settings});
 let result=await read('all');assert.equal(result.campaign.checkoutMode,'club');assert.equal(result.campaign.welcome.enabled,true);assert.equal(result.campaign.welcome.startsAt,NOW-1000);assert.equal(result.campaign.welcome.stamps,2);
 db.rows.set('loyaltyCampaigns/brand',{brandId:'brand',version:3,settings:{checkoutMode:'club'}});
 // Shows the mode checkout actually applies, and flags that the panel cannot load the document.
 result=await read('all');assert.equal(result.campaign.checkoutMode,'club');assert.equal(result.campaign.invalid,true);assert.equal(result.campaign.welcome.enabled,false);
});
test('only active, unassigned signup discounts of the selected brand are listed',async()=>{
 setup();const result=await read('all');
 assert.deepEqual(result.discounts.map(d=>[d.id,d.applicationType,d.discountValue]),[['news','newsletter_signup',15],['club','club_signup',50]]);
});
test('each card requires its own full-brand permission and names what is missing',async()=>{
 setup();
 const loyalty=await read('loyalty');assert.equal(loyalty.campaign,null);assert.equal(loyalty.discounts,null);assert.ok(loyalty.texts);
 assert.deepEqual(loyalty.permissions,{settings:true,discountsView:false,discountsEdit:false,discountsCreate:false});
 const viewer=await read('viewer');assert.equal(viewer.campaign,null);assert.equal(viewer.texts,null);assert.equal(viewer.discounts.length,2);
 // Edit does not imply view: the central policy evaluates each permission on its own.
 const editor=await read('editor');assert.equal(editor.permissions.discountsView,false);assert.equal(editor.discounts,null);assert.equal(editor.campaign,null);
 assert.equal(viewer.permissions.discountsCreate,false);assert.equal((await read('creator')).permissions.discountsCreate,true);
 for(const name of ['overview','local','foreign'])await assert.rejects(read(name),error=>error.code==='forbidden',name);
 await assert.rejects(read('all','otherbrand'),error=>error.code==='forbidden');
 assert.deepEqual((await summary.clubAdminBrands(db,who('viewer'))).map(b=>b.brandId),['brand']);
 assert.deepEqual(await summary.clubAdminBrands(db,who('overview')),[]);
});
test('texts card reports a missing programme and filled readiness',async()=>{
 setup();let result=await read('loyalty');assert.equal(result.texts.programExists,false);
 db.rows.set('loyaltyPrograms/brand',{brandId:'brand',version:1,settings:{...defaultProgramSettings('Esmeralda'),active:true,reward:{type:'free_product',productIds:['pizza'],categoryIds:[]},rewardDescription:'Gratis pizza',terms:'Vilkår',consentText:'Ja tak til nyhedsbrev på e-mail. Du kan altid afmelde dig.'}});
 result=await read('loyalty');assert.equal(result.texts.programExists,true);assert.equal(result.texts.programActive,true);
 assert.equal(typeof result.texts.ready,'boolean');assert.equal(result.texts.ready,!result.texts.missingPlaceholders.length&&!result.texts.invalidFields.length);
});
test('Omnisend status is only loaded for superusers and never exposes configuration',async()=>{
 setup();const previous=process.env.ORDERFLY_OMNISEND_BRANDS;
 try{
  process.env.ORDERFLY_OMNISEND_BRANDS=JSON.stringify([{brandId:'brand',omnisendBrandId:'om',apiKey:'secret-key-123',enabled:true,consentMode:'single_opt_in'}]);
  assert.equal((await read('all')).omnisend,null);
  const result=await read('all','brand',true);assert.equal(result.omnisend,'connected');assert.equal(JSON.stringify(result).includes('secret-key'),false);
  process.env.ORDERFLY_OMNISEND_BRANDS=JSON.stringify([{brandId:'brand',omnisendBrandId:'om',apiKey:'secret-key-123',enabled:false,consentMode:'single_opt_in'}]);
  assert.equal(summary.omnisendStatus('brand'),'disabled');assert.equal(summary.omnisendStatus('otherbrand'),'not_configured');
  process.env.ORDERFLY_OMNISEND_BRANDS='not json';assert.equal(summary.omnisendStatus('brand'),'invalid');
  delete process.env.ORDERFLY_OMNISEND_BRANDS;assert.equal(summary.omnisendStatus('brand'),'not_configured');
 }finally{if(previous===undefined)delete process.env.ORDERFLY_OMNISEND_BRANDS;else process.env.ORDERFLY_OMNISEND_BRANDS=previous;}
});

const programme={brandId:'brand',version:1,settings:{...defaultProgramSettings('Esmeralda'),active:true,reward:{type:'free_product',productIds:['pizza'],categoryIds:[]},rewardDescription:'Gratis pizza',terms:'Vilkår',consentText:'Ja tak til nyhedsbrev på e-mail. Du kan altid afmelde dig.'}};
const saveMode=(checkoutMode,changes={})=>db.rows.set('loyaltyCampaigns/brand',{brandId:'brand',version:2,updatedAt:NOW,settings:{...defaultCampaignSettings(),checkoutMode,...changes}});
test('discount rows say whether checkout uses them, with the same mode rule as checkout',async()=>{
 setup();const previous=process.env.ORDERFLY_OMNISEND_BRANDS;
 try{
  delete process.env.ORDERFLY_OMNISEND_BRANDS;
  db.rows.set('brands/brand',{name:'Esmeralda',slug:'esmeralda'});db.rows.set('loyaltyPrograms/brand',programme);
  saveMode('club');let rows=Object.fromEntries((await read('viewer')).discounts.map(d=>[d.id,d]));
  assert.equal(rows.news.inactiveReason,'mode_club');assert.equal(rows.news.usedInCheckout,false);
  assert.equal((await read('all')).texts.ready,true);assert.equal(rows.club.usedInCheckout,true);assert.equal(rows.club.inactiveReason,null);
  saveMode('newsletter');rows=Object.fromEntries((await read('viewer')).discounts.map(d=>[d.id,d]));
  assert.equal(rows.club.inactiveReason,'mode_newsletter');assert.equal(rows.news.inactiveReason,'newsletter_service_pending');
  process.env.ORDERFLY_OMNISEND_BRANDS=JSON.stringify([{brandId:'brand',omnisendBrandId:'om',apiKey:'secret-key-123',enabled:true,consentMode:'single_opt_in'}]);
  rows=Object.fromEntries((await read('viewer')).discounts.map(d=>[d.id,d]));assert.equal(rows.news.usedInCheckout,true);assert.equal(rows.news.inactiveReason,null);
  saveMode('none');rows=Object.fromEntries((await read('viewer')).discounts.map(d=>[d.id,d]));
  assert.equal(rows.news.inactiveReason,'mode_none');assert.equal(rows.club.inactiveReason,'mode_none');
 }finally{if(previous===undefined)delete process.env.ORDERFLY_OMNISEND_BRANDS;else process.env.ORDERFLY_OMNISEND_BRANDS=previous;}
});
test('a saved Club mode is flagged when checkout suppresses it, and stamps are not granted without an active programme',async()=>{
 setup();saveMode('club',{welcome:{enabled:true,stamps:1,startsAt:null,endsAt:null}});
 let result=await read('all');assert.equal(result.campaign.checkoutMode,'club');assert.equal(result.campaign.clubSuppressed,'brand_unavailable');
 assert.equal(result.campaign.welcome.activeNow,false);
 db.rows.set('brands/brand',{name:'Esmeralda',slug:'esmeralda'});
 result=await read('all');assert.equal(result.campaign.clubSuppressed,'program_missing');
 db.rows.set('loyaltyPrograms/brand',{...programme,settings:{...programme.settings,active:false}});
 result=await read('all');assert.equal(result.campaign.clubSuppressed,'program_inactive');
 db.rows.set('loyaltyPrograms/brand',programme);
 result=await read('all');
 assert.equal(result.texts.ready,true);assert.equal(result.campaign.clubSuppressed,null);assert.equal(result.campaign.welcome.activeNow,true);
 saveMode('newsletter');assert.equal((await read('all')).campaign.clubSuppressed,null);
});
test('creation date comes from the first saved campaign version in the audit, and live follows what checkout shows',async()=>{
 setup();
 let result=await read('all');assert.equal(result.createdAt,null);assert.equal(result.campaignSaved,false);
 // No saved campaign: checkout keeps the legacy newsletter, which customers see.
 assert.equal(result.checkoutMode,'newsletter');assert.equal(result.live,true);assert.equal(result.campaign.version,0);
 db.rows.set('loyaltyCampaignAudit/a2',{brandId:'brand',version:2,at:NOW});
 db.rows.set('loyaltyCampaignAudit/a1',{brandId:'brand',version:1,at:NOW-86400000});
 db.rows.set('loyaltyCampaignAudit/foreign',{brandId:'otherbrand',version:1,at:NOW-1});
 saveMode('none');result=await read('all');
 assert.equal(result.createdAt,NOW-86400000);assert.equal(result.live,false);assert.equal(result.campaign.version,2);
 saveMode('club');assert.equal((await read('all')).live,false,'club without an active programme is not shown');
 db.rows.set('brands/brand',{name:'Esmeralda',slug:'esmeralda'});db.rows.set('loyaltyPrograms/brand',programme);
 result=await read('all');assert.equal(result.live,true);assert.equal(result.programName,programme.settings.name);
 // Customer-visible facts are shown to discount viewers too; campaign settings are not.
 const viewer=await read('viewer');assert.equal(viewer.live,true);assert.equal(viewer.checkoutMode,'club');assert.equal(viewer.campaign,null);
});
test('the overview lists one summary per granted brand only',async()=>{
 setup();
 assert.deepEqual((await summary.listClubAdminSummaries(db,who('all'),{superuser:false,now:NOW})).map(row=>row.brandId),['brand']);
 assert.deepEqual(await summary.listClubAdminSummaries(db,who('overview'),{superuser:false,now:NOW}),[]);
 assert.deepEqual((await summary.listClubAdminSummaries(db,who('foreign'),{superuser:false,now:NOW})).map(row=>row.brandId),['otherbrand']);
});
