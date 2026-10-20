const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {memoryDb}=require('../helpers/marketing-db.cjs');

let db;
const mocks={'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db}};
const m=loadTs('src/lib/loyalty/stamp-card/membership.ts',mocks);
const counter=loadTs('src/lib/loyalty/stamp-card/counter.ts',mocks);
const model=loadTs('src/lib/loyalty/stamp-card/model.ts',mocks);
const {defaultProgramSettings}=loadTs('src/lib/loyalty/stamp-card/rules.ts');
const {runMarketingWorker}=loadTs('src/lib/marketing/worker.ts',mocks);
const {consentPayload}=loadTs('src/lib/marketing/consent.ts');
const {principalKey}=loadTs('src/lib/access/authority.ts',mocks);
const {customerIdentityKey}=loadTs('src/lib/customer-identity.ts');

const NOW=Date.parse('2026-10-20T10:00:00Z'),DAY=86_400_000,BRAND='brand';
// The marketing worker also reads the wall clock (deadlines, completion time); keep it on the test clock so the suite does not expire with the calendar.
const realNow=Date.now,clockOffset=NOW-realNow();Date.now=()=>realNow()+clockOffset;
const CONSENT='Ja tak til nyhedsbrev fra Esmeralda på e-mail med tilbud og nyheder. Du kan altid afmelde dig.';
const settings=(changes={})=>({...defaultProgramSettings('Esmeralda'),active:true,reward:{type:'free_product',productIds:['pizza'],categoryIds:[]},
  rewardDescription:'Gratis pizza',terms:'Vilkår for Esmeralda Club',consentText:CONSENT,...changes});
const cashier={identity:{provider:'firebase',subject:'cashier'},name:'Kasse'};

function setup(program=settings()){
  db=memoryDb();
  db.rows.set('platformAdminControl/access-v1',{principals:[{id:principalKey(cashier.identity),active:true}],
    companies:[{id:'esmeralda',active:true,locationIds:['l1'],orderflyBrandIds:[BRAND],opsflyOrganizationId:null},{id:'other',active:true,locationIds:[],orderflyBrandIds:['brand2'],opsflyOrganizationId:null}],
    roles:[{id:'kasse',name:'Kasse',companyId:'esmeralda',kind:'company_user',active:true,permissions:['orderfly.stamp_cards:counter']}],
    memberships:[{id:'m1',principalId:principalKey(cashier.identity),companyId:'esmeralda',locationIds:null,roleIds:['kasse'],active:true}]});
  db.rows.set('brands/'+BRAND,{name:'Esmeralda',slug:'esmeralda'});db.rows.set('brands/brand2',{name:'Andet',slug:'andet'});
  db.rows.set('locations/l1',{brandId:BRAND});
  db.rows.set('loyaltyPrograms/'+BRAND,{brandId:BRAND,version:1,settings:program});
  db.rows.set('loyaltyPrograms/brand2',{brandId:'brand2',version:1,settings:settings()});
}
const rows=prefix=>[...db.rows].filter(([path])=>path.startsWith(prefix+'/')).map(([path,value])=>({id:path.split('/')[1],...value}));
const brand=async(slug='esmeralda')=>m.resolveBrand(db,slug);
const ctx=(changes={})=>({ip:'203.0.113.7',now:NOW,...changes});
const signupInput=async(changes={})=>{const p=await m.programForPortal(db,await brand());return {name:'Anna Jensen',email:'Anna@Example.com ',newsletterConsent:true,termsAccepted:true,consentVersion:p.consentVersion,termsVersion:p.termsVersion,...changes};};
const tokenOf=job=>db.rows.get('loyaltyMailOutbox/'+job).loginUrl.split('#token=')[1];
const rejects=(promise,code)=>assert.rejects(promise,e=>e.code===code||(console.error(e),false));
async function joined(email='anna@example.com'){
  const {mailJob}=await m.signup(db,await brand(),await signupInput({email}),ctx());
  const {session}=await m.verifyLoginLink(db,await brand(),{token:tokenOf(mailJob)},ctx());
  return {...await m.readSession(db,await brand(),session,NOW),token:session};
}

test('sign-up requires both unticked boxes to be ticked and the shown text versions',async()=>{
  setup();
  for(const changes of [{newsletterConsent:false},{termsAccepted:false},{newsletterConsent:undefined}])
    assert.equal(m.signupSchema.safeParse(await signupInput(changes)).success,false,JSON.stringify(changes));
  await rejects(m.signup(db,await brand(),await signupInput({consentVersion:'consent-old'}),ctx()),'program_changed');
  setup(settings({active:false}));
  await rejects(m.signup(db,await brand(),await signupInput(),ctx()),'program_inactive');
  assert.equal((await m.programForPortal(db,await brand())).consentText,'');
  assert.equal(rows('loyaltyMembers').length,0);
});

test('a new member creates one customer, logs versioned consent and syncs it as a loyalty opt-in',async()=>{
  setup();
  const p=await m.programForPortal(db,await brand());
  const result=await m.signup(db,await brand(),await signupInput(),ctx());
  assert.equal(result.ok,true);
  const [member]=rows('loyaltyMembers'),[customer]=rows('customers');
  assert.equal(member.normalizedEmail,'anna@example.com');assert.equal(member.customerId,customer.id);assert.equal(member.companyId,'esmeralda');
  assert.equal(member.consent.status,'given');assert.equal(member.consent.version,p.consentVersion);assert.equal(member.termsVersion,p.termsVersion);
  assert.equal(customer.brandId,BRAND);assert.equal(customer.normalizedEmail,'anna@example.com');assert.equal(customer.marketingConsent,true);
  const [consent]=rows('marketingConsents');
  assert.equal(consent.source,'loyalty');assert.equal(consent.version,p.consentVersion);assert.equal(consent.wording,CONSENT);assert.equal(consent.capturedAt,NOW);
  assert.equal(rows('marketingOutbox')[0].state,'pending');
  assert.equal(consentPayload(consent).identifiers[0].consent.source,'orderfly-loyalty');
  assert.deepEqual(rows('loyaltyEvents').map(e=>e.type).sort(),['consent_given','member_joined']);
  assert.equal(db.rows.get('integrationConsumerCustomerIdentities/'+customerIdentityKey(BRAND,'anna@example.com')).customerId,customer.id);
});

test('an existing customer is linked on normalized e-mail without a duplicate, also through an alias',async()=>{
  setup();
  db.rows.set('customers/c1',{id:'c1',brandId:BRAND,fullName:'Anna',email:'anna@example.com',normalizedEmail:'anna@example.com',marketingConsent:false});
  db.rows.set('customers/c2',{id:'c2',brandId:BRAND,fullName:'Bo',email:'bo@work.dk',normalizedEmail:'bo@work.dk',emailAliases:['bo@home.dk'],marketingConsent:false});
  db.rows.set('customers/c3',{id:'c3',brandId:'brand2',fullName:'Anna',email:'anna@example.com',normalizedEmail:'anna@example.com'});
  await m.signup(db,await brand(),await signupInput(),ctx());
  await m.signup(db,await brand(),await signupInput({email:'BO@home.dk'}),ctx());
  assert.equal(rows('customers').length,3);
  assert.deepEqual(rows('loyaltyMembers').map(r=>r.customerId).sort(),['c1','c2']);
  assert.equal(db.rows.get('customers/c1').marketingConsent,true);
  // Consent for an alias is recorded but does not change the primary address's consent.
  assert.equal(db.rows.get('customers/c2').marketingConsent,false);
  assert.equal(db.rows.get('customers/c3').marketingConsent,undefined);
});

test('signing up again or asking for a link never reveals whether the e-mail exists',async()=>{
  setup();
  const first=await m.signup(db,await brand(),await signupInput(),ctx());
  const again=await m.signup(db,await brand(),await signupInput({name:'Other name'}),ctx());
  const unknownLink=await m.requestLoginLink(db,await brand(),{email:'nobody@example.com'},ctx());
  const knownLink=await m.requestLoginLink(db,await brand(),{email:'anna@example.com'},ctx());
  for(const r of [first,again,unknownLink,knownLink])assert.equal(r.ok,true);
  assert.equal(rows('loyaltyMembers').length,1);assert.equal(rows('loyaltyMembers')[0].name,'Anna Jensen');
  assert.equal(unknownLink.mailJob,null);assert.ok(again.mailJob);assert.ok(knownLink.mailJob);
  assert.equal(rows('loyaltyMailOutbox').length,3);
  const job=db.rows.get('loyaltyMailOutbox/'+first.mailJob);
  assert.match(job.loginUrl,/^https:\/\/esmeralda\.orderfly\.dk\/club\/login#token=[a-f0-9]{64}$/);
  assert.ok(![...db.rows.keys()].some(k=>k.includes(tokenOf(first.mailJob))));
});

test('ambiguous customer identities fail neutrally without creating a member',async()=>{
  setup();
  db.rows.set('customers/a',{brandId:BRAND,email:'dup@example.com',normalizedEmail:'dup@example.com'});
  db.rows.set('customers/b',{brandId:BRAND,email:'x@example.com',normalizedEmail:'x@example.com',emailAliases:['dup@example.com']});
  const error=console.error;console.error=()=>{};
  try{assert.deepEqual(await m.signup(db,await brand(),await signupInput({email:'dup@example.com'}),ctx()),{ok:true,mailJob:null});}finally{console.error=error;}
  assert.equal(rows('loyaltyMembers').length,0);assert.equal(rows('marketingConsents').length,0);
});

test('a login link works once, expires after 15 minutes and is bound to its brand',async()=>{
  setup();
  const b=await brand();
  const {mailJob}=await m.signup(db,b,await signupInput(),ctx()),token=tokenOf(mailJob);
  await rejects(m.verifyLoginLink(db,await brand('andet'),{token},ctx()),'link_invalid');
  await rejects(m.verifyLoginLink(db,b,{token},ctx({now:NOW+15*60_000})),'link_expired');
  const {session,expiresAt}=await m.verifyLoginLink(db,b,{token},ctx({now:NOW+15*60_000-1}));
  assert.equal(expiresAt,NOW+15*60_000-1+180*DAY);
  await rejects(m.verifyLoginLink(db,b,{token},ctx()),'link_invalid');
  assert.equal((await m.readSession(db,b,session,NOW)).member.name,'Anna Jensen');
  await rejects(m.readSession(db,b,session,expiresAt),'unauthorized');
  await rejects(m.readSession(db,await brand('andet'),session,NOW),'unauthorized');
  await rejects(m.readSession(db,b,'f'.repeat(64),NOW),'unauthorized');
});

test('failed link verifications count against the IP limit',async()=>{
  setup();
  for(let i=0;i<30;i++)await rejects(m.verifyLoginLink(db,await brand(),{token:String(i).padStart(64,'0')},ctx()),'link_invalid');
  await rejects(m.verifyLoginLink(db,await brand(),{token:'f'.repeat(64)},ctx()),'rate_limited');
});

test('login-link requests are rate limited per e-mail and per IP',async()=>{
  setup();
  for(let i=0;i<5;i++)await m.requestLoginLink(db,await brand(),{email:'anna@example.com'},ctx());
  await rejects(m.requestLoginLink(db,await brand(),{email:'ANNA@example.com'},ctx({ip:'198.51.100.1'})),'rate_limited');
  await m.requestLoginLink(db,await brand(),{email:'anna@example.com'},ctx({now:NOW+3_600_000}));
  for(let i=0;i<30;i++)await m.requestLoginLink(db,await brand(),{email:`p${i}@example.com`},ctx({ip:'192.0.2.9'}));
  await rejects(m.requestLoginLink(db,await brand(),{email:'q@example.com'},ctx({ip:'192.0.2.9'})),'rate_limited');
  assert.ok(![...db.rows.values()].some(v=>JSON.stringify(v).includes('192.0.2.9')));
});

test('the member view shows card, rewards and history without staff identities',async()=>{
  setup(settings({stampsRequired:2}));
  const s=await joined();
  for(let i=0;i<3;i++)await counter.grantStamp(db,cashier,{brandId:BRAND,locationId:'l1',memberId:s.memberId,channel:'takeaway',amountOre:15_000,discountUsed:false,via:'qr',idempotencyKey:String(i).padStart(64,'0')},NOW+i);
  const view=await m.memberView(db,await brand(),await m.readSession(db,await brand(),await (async()=>{const {mailJob}=await m.requestLoginLink(db,await brand(),{email:'anna@example.com'},ctx());return (await m.verifyLoginLink(db,await brand(),{token:tokenOf(mailJob)},ctx())).session;})(),NOW),NOW+10);
  assert.deepEqual({stamps:view.card.stamps,required:view.card.stampsRequired},{stamps:1,required:2});
  assert.equal(view.rewards.length,1);assert.equal(view.rewards[0].description,'Gratis pizza');
  assert.equal(view.newsletter.subscribed,true);
  assert.deepEqual(view.history.map(h=>h.type).sort(),['reward_earned','stamp_added','stamp_added','stamp_added']);
  assert.ok(view.history.filter(h=>h.type==='stamp_added').every(h=>h.channel==='takeaway'));
  assert.doesNotMatch(JSON.stringify(view),/Kasse|actor|reason/);
});

test('QR tokens are issued for the session member and rate limited',async()=>{
  setup();
  const s=await joined(),b=await brand();
  const {token,expiresAt}=await m.memberQrToken(db,b,s,NOW);
  assert.equal(expiresAt,NOW+60_000);
  const lookup=await counter.lookupMember(db,cashier,{brandId:BRAND,locationId:'l1',qrToken:token},NOW+1);
  assert.equal(lookup.member.id,s.memberId);
  for(let i=1;i<20;i++)await m.memberQrToken(db,b,s,NOW);
  await rejects(m.memberQrToken(db,b,s,NOW),'rate_limited');
});

test('unsubscribing keeps membership and stamps and is synced to Omnisend; re-subscribing needs the current text',async()=>{
  setup();
  const s=await joined(),b=await brand();
  await counter.grantStamp(db,cashier,{brandId:BRAND,locationId:'l1',memberId:s.memberId,channel:'dine_in',amountOre:15_000,discountUsed:false,via:'qr',idempotencyKey:'1'.padStart(64,'0')},NOW);
  assert.deepEqual(await m.setNewsletterConsent(db,b,s,{subscribed:false},NOW+1),{subscribed:false});
  const member=db.rows.get('loyaltyMembers/'+s.memberId);
  assert.equal(member.status,'active');assert.equal(member.consent.status,'withdrawn');
  assert.equal(db.rows.get('loyaltyCards/'+member.currentCardId).stamps,1);
  assert.equal(db.rows.get('customers/'+member.customerId).marketingConsent,false);
  const unsubscribe=rows('marketingConsents').find(e=>e.action==='unsubscribe');
  assert.equal(consentPayload(unsubscribe).identifiers[0].channels.email.status,'unsubscribed');
  assert.equal(db.rows.get('marketingContacts/'+rows('marketingContacts')[0].id).latestEventId,unsubscribe.id);
  assert.equal(rows('loyaltyEvents').filter(e=>e.type==='consent_withdrawn').length,1);
  await rejects(m.setNewsletterConsent(db,b,s,{subscribed:true,consentVersion:'consent-old'},NOW+2),'program_changed');
  const version=(await m.programForPortal(db,b)).consentVersion;
  await m.setNewsletterConsent(db,b,s,{subscribed:true,consentVersion:version},NOW+3);
  assert.equal(db.rows.get('loyaltyMembers/'+s.memberId).consent.status,'given');
  assert.equal(db.rows.get('customers/'+member.customerId).marketingConsent,true);
});

test('an opt-out in Omnisend is synced back: consent withdrawn and logged, membership kept',async()=>{
  setup();
  const s=await joined();
  const member=db.rows.get('loyaltyMembers/'+s.memberId);
  const original=process.env.ORDERFLY_OMNISEND_BRANDS;
  process.env.ORDERFLY_OMNISEND_BRANDS=JSON.stringify([{brandId:BRAND,omnisendBrandId:'omni',apiKey:'synthetic-key',enabled:true,consentMode:'single_opt_in'}]);
  let status='subscribed';
  const provider={verifyBrand:async()=>{},sync:async()=>'synced',contact:async email=>({identifiers:[{type:'email',id:email,channels:{email:{status,statusChangedAt:new Date(NOW).toISOString()}}}]}),
    listContacts:async()=>({contacts:[],after:null})};
  try{
    await runMarketingWorker(db,NOW+1,()=>provider);
    assert.equal(rows('marketingContacts')[0].state,'synced');
    status='unsubscribed';
    await runMarketingWorker(db,NOW+3_600_002,()=>provider);
    await runMarketingWorker(db,NOW+7_200_003,()=>provider);
  }finally{if(original===undefined)delete process.env.ORDERFLY_OMNISEND_BRANDS;else process.env.ORDERFLY_OMNISEND_BRANDS=original;}
  const after=db.rows.get('loyaltyMembers/'+s.memberId);
  assert.equal(after.status,'active');assert.equal(after.consent.status,'withdrawn');assert.equal(after.consent.source,'omnisend');
  assert.equal(db.rows.get('customers/'+member.customerId).marketingConsent,false);
  assert.equal(rows('loyaltyEvents').filter(e=>e.type==='consent_withdrawn').length,1);
});

test('an Omnisend opt-out of an alias address withdraws the member consent without touching the primary address',async()=>{
  setup();
  db.rows.set('customers/c2',{id:'c2',brandId:BRAND,fullName:'Bo',email:'bo@work.dk',normalizedEmail:'bo@work.dk',emailAliases:['bo@home.dk'],marketingConsent:true});
  const s=await joined('bo@home.dk');
  const original=process.env.ORDERFLY_OMNISEND_BRANDS;
  process.env.ORDERFLY_OMNISEND_BRANDS=JSON.stringify([{brandId:BRAND,omnisendBrandId:'omni',apiKey:'synthetic-key',enabled:true,consentMode:'single_opt_in'}]);
  const provider={verifyBrand:async()=>{},sync:async()=>'suppressed',contact:async email=>({identifiers:[{type:'email',id:email,channels:{email:{status:'unsubscribed',statusChangedAt:new Date(NOW).toISOString()}}}]}),
    listContacts:async()=>({contacts:[],after:null})};
  try{await runMarketingWorker(db,NOW+1,()=>provider);}
  finally{if(original===undefined)delete process.env.ORDERFLY_OMNISEND_BRANDS;else process.env.ORDERFLY_OMNISEND_BRANDS=original;}
  assert.equal(rows('marketingContacts')[0].state,'suppressed');
  const after=db.rows.get('loyaltyMembers/'+s.memberId);
  assert.equal(after.status,'active');assert.equal(after.consent.status,'withdrawn');assert.equal(after.consent.source,'omnisend');
  assert.equal(db.rows.get('customers/c2').marketingConsent,true);
  assert.equal(rows('loyaltyEvents').filter(e=>e.type==='consent_withdrawn').length,1);
});

test('deletion removes personal data, sessions and rewards but keeps a pseudonymous log and the customer',async()=>{
  setup(settings({stampsRequired:1}));
  const s=await joined(),b=await brand(),member=db.rows.get('loyaltyMembers/'+s.memberId);
  const {mailJob:waiting}=await m.requestLoginLink(db,b,{email:'anna@example.com'},ctx());
  await counter.grantStamp(db,cashier,{brandId:BRAND,locationId:'l1',memberId:s.memberId,channel:'dine_in',amountOre:15_000,discountUsed:false,via:'qr',idempotencyKey:'2'.padStart(64,'0')},NOW);
  await m.deleteMembership(db,b,s,NOW+1);
  const tomb=db.rows.get('loyaltyMembers/'+s.memberId);
  assert.equal(tomb.status,'deleted');
  for(const field of ['name','normalizedEmail','customerId','consent'])assert.equal(tomb[field],undefined,field);
  assert.equal(rows('loyaltyMemberIdentities').length,0);
  const mails=rows('loyaltyMailOutbox');
  assert.ok(mails.length>=2);assert.equal(db.rows.get('loyaltyMailOutbox/'+waiting).state,'cancelled');
  assert.doesNotMatch(JSON.stringify(mails),/anna@example\.com|Anna Jensen|#token=/);
  assert.ok(rows('loyaltyRewards').every(r=>r.status==='cancelled'));
  await rejects(m.readSession(db,b,s.token,NOW+2),'unauthorized');
  assert.ok(db.rows.get('customers/'+member.customerId));
  const events=rows('loyaltyEvents');assert.ok(events.some(e=>e.type==='member_deleted'));
  assert.doesNotMatch(JSON.stringify(events),/anna@example\.com|Anna Jensen/);
  await rejects(counter.lookupMember(db,cashier,{brandId:BRAND,locationId:'l1',email:'anna@example.com'},NOW+2),'member_not_found');
  // The e-mail can join again as a new member.
  await m.signup(db,b,await signupInput(),ctx({now:NOW+3_600_000}));
  assert.equal(rows('loyaltyMembers').filter(r=>r.status==='active').length,1);
});

test('logout revokes the session; the session epoch revokes all sessions on deletion',async()=>{
  setup();
  const b=await brand(),s=await joined();
  const {mailJob}=await m.requestLoginLink(db,b,{email:'anna@example.com'},ctx());
  const second=(await m.verifyLoginLink(db,b,{token:tokenOf(mailJob)},ctx())).session;
  await m.logout(db,s,NOW);
  await rejects(m.readSession(db,b,s.token,NOW),'unauthorized');
  const other=await m.readSession(db,b,second,NOW);
  await m.deleteMembership(db,b,other,NOW);
  await rejects(m.readSession(db,b,second,NOW),'unauthorized');
});
