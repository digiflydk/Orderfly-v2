const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {memoryDb}=require('../helpers/marketing-db.cjs');
let db;
const mocks={'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db}};
const authority=loadTs('src/lib/access/authority.ts',mocks);
const platform=loadTs('src/lib/notifications/platform.ts',mocks);
mocks['@/lib/access/authority']=authority;mocks['@/lib/notifications/platform']=platform;
const notifications=loadTs('src/lib/loyalty/stamp-card/signup-notifications.ts',mocks);
const rules=loadTs('src/lib/loyalty/stamp-card/signup-notification-rules.ts');
const membership=loadTs('src/lib/loyalty/stamp-card/membership.ts',mocks);
const {defaultProgramSettings}=loadTs('src/lib/loyalty/stamp-card/rules.ts');
const {principalKey,AuthorityError}=authority;
const {NotificationPlatformError}=platform;
const {defaultCampaignSettings}=loadTs('src/lib/loyalty/stamp-card/campaign-rules.ts');
const NOW=Date.parse('2026-10-23T09:00:00Z'),N=notifications.SIGNUP_NOTIFICATIONS;
const actor=name=>({identity:{provider:'firebase',subject:name},name});
const rows=c=>[...db.rows].filter(([p])=>p.startsWith(c+'/')).map(([p,v])=>({id:p.split('/')[1],...v}));
const enable=async(brandId='brand',recipientEmail='owner@example.com')=>notifications.saveSignupNotifications(db,actor('owner'),{brandId,version:0,settings:{enabled:true,recipientEmail}},NOW);
function setup(){
 db=memoryDb();
 process.env.ORDERFLY_NOTIFICATION_ENDPOINT='https://notifications.example.com/send';process.env.ORDERFLY_NOTIFICATION_SECRET='x'.repeat(40);
 process.env.ORDERFLY_NOTIFICATION_ORGANIZATION_ID='11111111-1111-4111-8111-111111111111';
 process.env.ORDERFLY_LOYALTY_NOTIFICATION_BRANDS=JSON.stringify({brand:{organizationId:process.env.ORDERFLY_NOTIFICATION_ORGANIZATION_ID,senderProfile:'orderfly'},brand2:{organizationId:process.env.ORDERFLY_NOTIFICATION_ORGANIZATION_ID,senderProfile:'orderfly'}});
 db.rows.set('platformAdminControl/access-v1',{
  principals:['owner','staff'].map(n=>({id:principalKey(actor(n).identity),active:true})),
  companies:[{id:'company',active:true,locationIds:[],orderflyBrandIds:['brand','brand2'],opsflyOrganizationId:null}],
  roles:[{id:'root',name:'Super',kind:'superuser',companyId:null,permissions:[],active:true},{id:'staff',name:'Staff',kind:'company_admin',companyId:'company',permissions:['orderfly.stamp_cards:settings'],active:true}],
  memberships:[{id:'owner',principalId:principalKey(actor('owner').identity),companyId:null,locationIds:null,roleIds:['root'],active:true},{id:'staff',principalId:principalKey(actor('staff').identity),companyId:'company',locationIds:null,roleIds:['staff'],active:true}]
 });
 for(const brandId of ['brand','brand2']){
  db.rows.set('brands/'+brandId,{name:brandId,slug:brandId});
  db.rows.set('loyaltyPrograms/'+brandId,{brandId,version:1,settings:{...defaultProgramSettings('Club'),active:true,reward:{type:'free_product',productIds:['pizza'],categoryIds:[]},rewardDescription:'Pizza',terms:'Vilkår',consentText:'Samtykke'}});
 }
}
async function join(brandId='brand',email='member@example.com',trusted={}){
 const brand=await membership.resolveBrand(db,brandId),p=await membership.programForPortal(db,brand);
 return membership.signup(db,brand,{name:'Private Name',email,newsletterConsent:true,termsAccepted:true,termsVersion:p.termsVersion,consentVersion:p.consentVersion},{ip:'203.0.113.7',now:NOW},trusted);
}
const rejects=(promise,code)=>assert.rejects(promise,e=>e.code===code);
async function queued(){setup();await enable();await join();return rows(N.outbox)[0].id;}

test('settings default off, are brand-specific, audited and do not change program settings',async()=>{
 setup();const before=structuredClone(db.rows.get('loyaltyPrograms/brand'));
 assert.deepEqual((await notifications.readSignupNotifications(db,actor('owner'),'brand')).settings,{enabled:false,recipientEmail:null});
 const result=await enable('brand',' OWNER@Example.com ');assert.equal(result.version,1);assert.equal(result.settings.recipientEmail,'owner@example.com');
 assert.equal((await notifications.readSignupNotifications(db,actor('owner'),'brand2')).settings.enabled,false);
 assert.deepEqual(db.rows.get('loyaltyPrograms/brand'),before);assert.equal(rows(N.audit).length,1);
 assert.equal((await notifications.saveSignupNotifications(db,actor('owner'),{brandId:'brand',version:1,settings:result.settings},NOW)).changed,false);
 assert.equal(rows(N.audit).length,1);
});
test('recipient reads and writes require fresh superuser policy, not brand settings permission',async()=>{
 setup();await enable();
 for(const name of ['staff','unknown']){
  await rejects(notifications.readSignupNotifications(db,actor(name),'brand'),'forbidden');
  await rejects(notifications.saveSignupNotifications(db,actor(name),{brandId:'brand',version:1,settings:{enabled:false,recipientEmail:null}},NOW),'forbidden');
 }
 db.rows.get('platformAdminControl/access-v1').memberships[0].active=false;
 await rejects(notifications.saveSignupNotifications(db,actor('owner'),{brandId:'brand',version:1,settings:{enabled:false,recipientEmail:null}},NOW),'forbidden');
 assert.equal(db.rows.get(N.settings+'/brand').settings.enabled,true);
});
test('validation, stale versions, unknown brands and missing mail configuration are rejected',async()=>{
 setup();for(const settings of [{enabled:true,recipientEmail:null},{enabled:true,recipientEmail:'bad'},{enabled:'yes',recipientEmail:'a@b.dk'}])assert.equal(rules.signupNotificationSettingsSchema.safeParse(settings).success,false);
 await rejects(notifications.readSignupNotifications(db,actor('owner'),'missing'),'forbidden');
 await enable();await rejects(enable(),'record_changed');
 delete process.env.ORDERFLY_LOYALTY_NOTIFICATION_BRANDS;delete process.env.ORDERFLY_GAMES_NOTIFICATION_BRANDS;
 await rejects(enable('brand2'),'mail_configuration_required');
 assert.equal(db.rows.has(N.settings+'/brand2'),false);
});
test('new signup queues exactly once; repeated signup and login produce no admin duplicates',async()=>{
 setup();await enable();await join();await join();
 await membership.requestLoginLink(db,await membership.resolveBrand(db,'brand'),{email:'member@example.com'},{ip:'203.0.113.7',now:NOW});
 assert.equal(rows(N.outbox).length,1);assert.equal(rows('loyaltyMembers').length,1);
 assert.doesNotMatch(JSON.stringify(rows(N.outbox)),/Private Name|member@example.com|loginUrl|token/);
});
test('disabled/other brand signup does not enqueue and enabling does not backfill',async()=>{
 setup();await join();await enable();await join();await join('brand2');
 assert.equal(rows(N.outbox).length,0);
 await join('brand','new@example.com');assert.equal(rows(N.outbox).length,1);
});
test('checkout signup uses same new-membership queue',async()=>{
 setup();await enable();db.rows.set('loyaltyCampaigns/brand',{brandId:'brand',version:1,updatedAt:NOW,settings:{...defaultCampaignSettings(),checkoutMode:'club'}});
 await join('brand','checkout@example.com',{source:'checkout'});
 assert.equal(rows(N.outbox).length,1);
});
test('membership failure rolls back notification and settings are read before transaction writes',async()=>{
 setup();await enable();const original=db.runTransaction.bind(db);
 db.runTransaction=fn=>original(async tx=>{
  let wrote=false;const strict={...tx,get:ref=>{assert.equal(wrote,false,'read after write');return tx.get(ref);},create:(ref,data)=>{wrote=true;if(ref.path.startsWith('loyaltyLoginTokens/'))throw Error('forced rollback');return tx.create(ref,data);},set:(...a)=>{wrote=true;return tx.set(...a);},update:(...a)=>{wrote=true;return tx.update(...a);}};
  return fn(strict);
 });
 await assert.rejects(join(),/forced rollback/);assert.equal(rows(N.outbox).length,0);assert.equal(rows('loyaltyMembers').length,0);
});
test('competing delivery workers send once with minimal fixed-link payload',async()=>{
 const id=await queued(),sent=[];const client={send:async msg=>sent.push(msg)};
 await Promise.all([notifications.deliverSignupNotification(db,id,NOW,client),notifications.deliverSignupNotification(db,id,NOW,client)]);
 assert.equal(sent.length,1);assert.equal(sent[0].templateKey,'orderfly.stamp_card.member_joined');
 assert.equal(sent[0].idempotencyKey,'loyalty-member-joined-'+id);assert.equal(sent[0].relatedEntity.type,'loyalty_member');
 assert.equal(sent[0].variables.admin_url,'https://orderfly.dk/superadmin/loyalty/stamp-card/members/'+sent[0].relatedEntity.id);
 assert.equal(sent[0].variables.joined_at,new Date(NOW).toISOString());assert.doesNotMatch(JSON.stringify(sent[0]),/member@example.com|Private Name|token/);
 assert.equal(db.rows.get(N.outbox+'/'+id).state,'accepted');
});
test('disabling, recipient changes, deleted member and foreign member cancel waiting deliveries',async()=>{
 for(const change of ['disabled','recipient','deleted','foreign','suspended']){
  const id=await queued(),job=db.rows.get(N.outbox+'/'+id);
  if(change==='disabled')db.rows.get(N.settings+'/brand').settings.enabled=false;
  if(change==='recipient')db.rows.get(N.settings+'/brand').settings.recipientEmail='changed@example.com';
  if(change==='deleted')db.rows.get('loyaltyMembers/'+job.memberId).status='deleted';
  if(change==='foreign')db.rows.get('loyaltyMembers/'+job.memberId).brandId='brand2';
  if(change==='suspended')db.rows.get('brands/brand').status='suspended';
  await notifications.deliverSignupNotification(db,id,NOW,{send:async()=>assert.fail(change)});
  assert.equal(db.rows.get(N.outbox+'/'+id).state,'cancelled',change);
 }
});
test('turning off and back on does not resurrect old jobs',async()=>{
 const id=await queued();
 await notifications.saveSignupNotifications(db,actor('owner'),{brandId:'brand',version:1,settings:{enabled:false,recipientEmail:'owner@example.com'}},NOW+1);
 await notifications.saveSignupNotifications(db,actor('owner'),{brandId:'brand',version:2,settings:{enabled:true,recipientEmail:'owner@example.com'}},NOW+2);
 await notifications.deliverSignupNotification(db,id,NOW+3,{send:async()=>assert.fail('stale settings version')});
 assert.equal(db.rows.get(N.outbox+'/'+id).state,'cancelled');
});
test('missing configuration postpones without affecting signup; definite retries retain idempotency',async()=>{
 const id=await queued();delete process.env.ORDERFLY_LOYALTY_NOTIFICATION_BRANDS;
 await notifications.deliverSignupNotification(db,id,NOW,{send:async()=>assert.fail('missing configuration')});
 assert.equal(db.rows.get(N.outbox+'/'+id).state,'pending');assert.equal(db.rows.get(N.outbox+'/'+id).nextAttemptAt,NOW+60000);
 process.env.ORDERFLY_LOYALTY_NOTIFICATION_BRANDS=JSON.stringify({brand:{organizationId:process.env.ORDERFLY_NOTIFICATION_ORGANIZATION_ID,senderProfile:'orderfly'}});
 const seen=[];const client={send:async msg=>{seen.push(msg.idempotencyKey);throw new NotificationPlatformError('provider_rate_limited',false,true);}};
 await notifications.deliverSignupNotification(db,id,NOW+60000,client);
 assert.equal(db.rows.get(N.outbox+'/'+id).state,'failed');
 await notifications.deliverSignupNotification(db,id,NOW+60001,client);assert.equal(seen.length,1);
 await notifications.deliverSignupNotification(db,id,NOW+90000,{send:async msg=>seen.push(msg.idempotencyKey)});
 assert.equal(seen.length,2);assert.equal(seen[0],seen[1]);assert.equal(db.rows.get(N.outbox+'/'+id).state,'accepted');
});
test('unknown result and permanent rejection are never blindly retried',async()=>{
 for(const error of [new NotificationPlatformError('provider_result_unknown',true),new NotificationPlatformError('provider_rejected_400')]){
  const id=await queued();let sent=0;
  const client={send:async()=>{sent++;throw error;}};
  await notifications.deliverSignupNotification(db,id,NOW,client);await notifications.deliverSignupNotification(db,id,NOW+9e9,client);
  assert.equal(sent,1);assert.equal(db.rows.get(N.outbox+'/'+id).nextAttemptAt,Number.MAX_SAFE_INTEGER);
 }
});
test('server action rejects non-superuser before exposing settings and preserves domain errors',async()=>{
 setup();let allowed=false;
 const action=loadTs('src/app/superadmin/loyalty/stamp-card/notification-actions.ts',{
  ...mocks,'next/cache':{revalidatePath(){}},'@/lib/access/authority':{AuthorityError},
  '@/lib/access/orderfly-session':{requirePlatformSuperuser:async()=>{if(!allowed)throw new AuthorityError('forbidden');return actor('owner');}},
  '@/lib/loyalty/stamp-card/signup-notifications':notifications,
 });
 assert.deepEqual(await action.saveSignupNotificationAction({}),{ok:false,error:'forbidden'});
 allowed=true;assert.deepEqual(await action.saveSignupNotificationAction({}),{ok:false,error:'invalid_settings'});
 assert.equal((await action.saveSignupNotificationAction({brandId:'brand',version:0,settings:{enabled:true,recipientEmail:'owner@example.com'}})).ok,true);
 assert.equal((await action.saveSignupNotificationAction({brandId:'brand',version:0,settings:{enabled:false,recipientEmail:null}})).error,'record_changed');
});

test('a retried transaction discards its first staged notification and commits only one',async()=>{
 setup();await enable();const original=db.runTransaction.bind(db);let retried=false;
 db.runTransaction=async fn=>{
  if(!retried){retried=true;await fn({get:ref=>ref.get(),create(){},set(){},update(){},delete(){}});}
  return original(fn);
 };
 await join();assert.equal(rows(N.outbox).length,1);assert.equal(rows('loyaltyMembers').length,1);
});
test('foreign settings and moved company cancel jobs without sending',async()=>{
 for(const mode of ['settings','company']){
  const id=await queued();
  if(mode==='settings')db.rows.get(N.settings+'/brand').brandId='brand2';
  else db.rows.get('platformAdminControl/access-v1').companies[0].orderflyBrandIds=['brand2'];
  await notifications.deliverSignupNotification(db,id,NOW,{send:async()=>assert.fail(mode)});
  assert.equal(db.rows.get(N.outbox+'/'+id).state,'cancelled');
 }
});
test('definite transient failures stop after five attempts',async()=>{
 const id=await queued();let sends=0;
 for(let i=0;i<8;i++)await notifications.deliverSignupNotification(db,id,NOW+i*600000,{send:async()=>{sends++;throw new NotificationPlatformError('provider_rate_limited',false,true);}});
 assert.equal(sends,5);assert.equal(db.rows.get(N.outbox+'/'+id).attempts,5);assert.equal(db.rows.get(N.outbox+'/'+id).nextAttemptAt,Number.MAX_SAFE_INTEGER);
});
