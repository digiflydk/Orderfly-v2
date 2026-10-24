const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs'),{memoryDb}=require('../helpers/marketing-db.cjs');
const mocks={'server-only':{}};
const authority=loadTs('src/lib/access/authority.ts',mocks);mocks['@/lib/access/authority']=authority;
mocks['@/lib/loyalty/stamp-card/counter']=loadTs('src/lib/loyalty/stamp-card/counter.ts',mocks);
const service=loadTs('src/lib/loyalty/discount-card/invitations.ts',mocks);
const platform=loadTs('src/lib/notifications/platform.ts',mocks);mocks['@/lib/notifications/platform']=platform;
const mail=loadTs('src/lib/loyalty/discount-card/invitation-mail.ts',mocks);
const {hashKey}=loadTs('src/lib/loyalty/stamp-card/model.ts');
const NOW=Date.parse('2026-10-24T21:00:00Z');
const owner={identity:{provider:'firebase',subject:'owner'},name:'Owner'};
const brand={brandId:'brand',slug:'brand',companyId:'company',brandName:'Brand'};
const ctx={ip:'203.0.113.7',now:NOW};
function setup(){
 const db=memoryDb();
 process.env.ORDERFLY_NOTIFICATION_ENDPOINT='https://notifications.example.com/send';process.env.ORDERFLY_NOTIFICATION_SECRET='x'.repeat(40);process.env.ORDERFLY_NOTIFICATION_ORGANIZATION_ID='11111111-1111-4111-8111-111111111111';process.env.ORDERFLY_LOYALTY_NOTIFICATION_BRANDS=JSON.stringify({brand:{organizationId:process.env.ORDERFLY_NOTIFICATION_ORGANIZATION_ID,senderProfile:'orderfly'}});
 db.rows.set('platformAdminControl/access-v1',{principals:[{id:authority.principalKey(owner.identity),active:true}],companies:[{id:'company',active:true,locationIds:[],orderflyBrandIds:['brand'],opsflyOrganizationId:null}],roles:[{id:'root',name:'Super',kind:'superuser',companyId:null,permissions:[],active:true}],memberships:[{id:'owner',principalId:authority.principalKey(owner.identity),companyId:null,locationIds:null,roleIds:['root'],active:true}]});
 db.rows.set('brands/brand',{name:'Brand',slug:'brand',status:'active'});
 db.rows.set('discountCardFeatures/brand',{brandId:'brand',companyId:'company',version:1,enabled:true,locationScope:{mode:'all',locationIds:[]},updatedAt:NOW});
 db.rows.set('discountCardGroups/family',{id:'family',brandId:'brand',companyId:'company',version:1,name:'Family',percentage:20,active:true,updatedAt:NOW});
 // Fail if any real service reads after staging transaction writes.
 const original=db.runTransaction;db.runTransaction=fn=>original(async tx=>{let wrote=false;return fn({...tx,get:r=>{assert.equal(wrote,false,'transaction read after write');return tx.get(r);},...Object.fromEntries(['create','set','update','delete'].map(k=>[k,(...args)=>{wrote=true;return tx[k](...args);}]))});});
 return db;
}
const input={brandId:'brand',name:'Person',email:'person@example.com',groupId:'family',startsAt:null,expiresAt:null};
const rows=(db,c)=>[...db.rows].filter(([p])=>p.startsWith(c+'/')).map(([p,v])=>({id:p.split('/')[1],...v}));
async function invite(db){const result=await service.inviteDiscountCard(db,owner,input,NOW);return {result,token:db.rows.get(service.INVITATIONS.outbox+'/'+result.invitationId).invitationUrl.split('#token=')[1]};}
const accept=(db,token)=>service.acceptDiscountInvitation(db,brand,{token,termsAccepted:true,termsVersion:service.DISCOUNT_CARD_TERMS_VERSION},ctx);
const rejects=(p,code)=>assert.rejects(p,e=>e.code===code);
test('new invite proves email before creating customer/member/card; no marketing or stamps; normal session',async()=>{
 const db=setup(),{token}=await invite(db);assert.equal(rows(db,'customers').length,0);assert.equal(rows(db,'loyaltyMembers').length,0);
 const preview=await service.inspectDiscountInvitation(db,brand,{token},ctx);assert.equal(preview.percentage,20);
 const result=await accept(db,token);assert.match(result.session,/^[a-f0-9]{64}$/);
 assert.equal(rows(db,'customers')[0].marketingConsent,false);assert.equal(rows(db,'loyaltyMembers')[0].consent.status,'withdrawn');
 assert.equal(rows(db,'discountCardAssignments')[0].status,'active');assert.equal(rows(db,'loyaltyCards').length,0);assert.equal(rows(db,'loyaltySessions').length,1);
 await rejects(accept(db,token),'link_invalid');assert.equal(rows(db,'customers').length,1);
});
test('duplicate invitation is idempotent and new changed invitation revokes previous',async()=>{
 const db=setup(),a=await invite(db),b=await invite(db);assert.equal(a.result.invitationId,b.result.invitationId);assert.equal(rows(db,service.INVITATIONS.outbox).length,1);
 await service.inviteDiscountCard(db,owner,{...input,name:'New name'},NOW+1);
 await rejects(accept(db,a.token),'link_invalid');
});
test('feature/group version change, disabled, company ambiguity, cross-brand and expiry reject',async()=>{
 for(const mutate of [db=>db.rows.get('discountCardFeatures/brand').enabled=false,db=>db.rows.get('discountCardGroups/family').version++,db=>db.rows.get('platformAdminControl/access-v1').companies.push({id:'other',active:true,locationIds:[],orderflyBrandIds:['brand'],opsflyOrganizationId:null}),db=>db.rows.get('brands/brand').status='inactive',db=>db.rows.get('brands/brand').status='deleted',db=>db.rows.get('brands/brand').deletedAt=NOW]){
  const db=setup(),{token}=await invite(db);mutate(db);await rejects(accept(db,token),'link_invalid');assert.equal(rows(db,'customers').length,0);
 }
 const db=setup(),{token}=await invite(db);
 await rejects(service.acceptDiscountInvitation(db,{...brand,brandId:'other'},{token,termsAccepted:true,termsVersion:service.DISCOUNT_CARD_TERMS_VERSION},ctx),'link_invalid');
 await rejects(service.acceptDiscountInvitation(db,brand,{token,termsAccepted:true,termsVersion:service.DISCOUNT_CARD_TERMS_VERSION},{...ctx,now:NOW+service.INVITATION_LIFETIME}),'link_expired');
});
test('admin authorization, changed recipient and existing assignment conflict cannot grant another identity',async()=>{
 const db=setup();await rejects(service.inviteDiscountCard(db,{identity:{provider:'firebase',subject:'staff'},name:'Staff'},input,NOW),'forbidden');
 const {token}=await invite(db);db.rows.set('customers/customer',{brandId:'brand',normalizedEmail:input.email,email:input.email,status:'inactive'});
 await rejects(accept(db,token),'customer_conflict');assert.equal(rows(db,'loyaltyMembers').length,0);
});
test('invalid acceptance attempts are rate limited even when token lookup fails',async()=>{
 const db=setup();for(let i=0;i<30;i++)await rejects(accept(db,'a'.repeat(64)),'link_invalid');await rejects(accept(db,'a'.repeat(64)),'rate_limited');
});
test('explicit current terms are required and cannot be replaced with marketing consent',async()=>{
 const db=setup(),{token}=await invite(db);await assert.rejects(service.acceptDiscountInvitation(db,brand,{token,termsAccepted:false,termsVersion:service.DISCOUNT_CARD_TERMS_VERSION},ctx));assert.equal(rows(db,'customers').length,0);
});
test('mail uses central template, stable idempotency, cancels stale invite and scrubs sent secret',async()=>{
 const db=setup(),{result}=await invite(db);const sent=[];await mail.deliverDiscountInvitation(db,result.invitationId,NOW,{send:async m=>sent.push(m)});
 assert.equal(sent[0].templateKey,'orderfly.discount_card.invitation');assert.equal(sent[0].relatedEntity.type,'discount_invitation');assert.equal(db.rows.get(service.INVITATIONS.outbox+'/'+result.invitationId).invitationUrl,null);
 await mail.deliverDiscountInvitation(db,result.invitationId,NOW,{send:async m=>sent.push(m)});assert.equal(sent.length,1);
 const other=setup(),b=await invite(other);other.rows.get('discountCardGroups/family').active=false;await mail.deliverDiscountInvitation(other,b.result.invitationId,NOW,{send:async()=>{throw Error('must not send');}});assert.equal(other.rows.get(service.INVITATIONS.outbox+'/'+b.result.invitationId).state,'cancelled');
});
test('uncertain delivery stops, definitive retry keeps same provider idempotency',async()=>{
 const db=setup(),{result}=await invite(db);await mail.deliverDiscountInvitation(db,result.invitationId,NOW,{send:async()=>{throw new platform.NotificationPlatformError('unknown',true);}});assert.equal(db.rows.get(service.INVITATIONS.outbox+'/'+result.invitationId).state,'uncertain');
 const retry=setup(),b=await invite(retry),keys=[];await mail.deliverDiscountInvitation(retry,b.result.invitationId,NOW,{send:async m=>{keys.push(m.idempotencyKey);throw new platform.NotificationPlatformError('rate_limited',false,true);}});
 assert.equal(retry.rows.get(service.INVITATIONS.outbox+'/'+b.result.invitationId).state,'failed');await mail.deliverDiscountInvitation(retry,b.result.invitationId,NOW+30000,{send:async m=>keys.push(m.idempotencyKey)});assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);
});

test('deleted customers and aliases never create a duplicate identity or entitlement',async()=>{
 for(const extra of [{deletedAt:NOW},{status:'deleted'},{email:'canonical@example.com',normalizedEmail:'canonical@example.com',emailAliases:[input.email]}]){
  const db=setup();const {token}=await invite(db);db.rows.set('customers/customer',{brandId:'brand',normalizedEmail:input.email,email:input.email,...extra});
  await assert.rejects(accept(db,token));assert.equal(rows(db,'customers').length,1);assert.equal(rows(db,'discountCardAssignments').length,0);
 }
});

test('explicit reissue recovers uncertain or abandoned dispatch without automatically resending',async()=>{
 for(const state of ['uncertain','dispatching']){const db=setup(),first=await invite(db);Object.assign(db.rows.get(service.INVITATIONS.outbox+'/'+first.result.invitationId),{state,updatedAt:NOW});
  const second=await service.inviteDiscountCard(db,owner,input,NOW+120001);assert.notEqual(second.invitationId,first.result.invitationId);await rejects(accept(db,first.token),'link_invalid');
 }
});
