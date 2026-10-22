const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {memoryDb}=require('../helpers/marketing-db.cjs');
const mocks={'server-only':{}};
const {profileSchema,profileFromCustomer}=loadTs('src/lib/loyalty/stamp-card/profile-rules.ts',mocks);
const {updateMemberProfile}=loadTs('src/lib/loyalty/stamp-card/profile.ts',mocks);
const {customerIdentityKey}=loadTs('src/lib/customer-identity.ts',mocks);
const NOW=Date.parse('2026-10-22T00:00:00Z'),brand={brandId:'b',slug:'esmeralda',companyId:'co',brandName:'Esmeralda'};
function setup(){
 const db=memoryDb();
 const member={brandId:'b',companyId:'co',customerId:'c',normalizedEmail:'anna@example.com',name:'Anna',status:'active',sessionEpoch:2};
 const session={sessionId:'s',memberId:'m',member};
 db.rows.set('loyaltyMembers/m',member);
 db.rows.set('loyaltySessions/s',{brandId:'b',memberId:'m',epoch:2,expiresAt:NOW+60000,revokedAt:null});
 db.rows.set('customers/c',{id:'c',brandId:'b',email:'anna@example.com',normalizedEmail:'anna@example.com',emailAliases:['anna@home.dk'],
  phone:'+45 11112222',normalizedPhone:'+4511112222',phoneAliases:['+4533334444'],marketingConsent:true,fullName:'Anna',discountUsage:{d:1}});
 return {db,session};
}
const update=(db,session,input)=>updateMemberProfile(db,brand,session,input,{now:NOW,ip:'synthetic'});
const rejects=(promise,code)=>assert.rejects(promise,error=>error.code===code);

test('profile schema bounds fields, real calendar dates and explicit clearing',()=>{
 for(const value of [{},{memberId:'other'},{email:'other@x.dk'},{birthDate:'2026-02-30'},{birthDate:'1899-01-01'},{gender:'unknown'},{phone:'call-me'},{phone:'1'.repeat(81)}])assert.equal(profileSchema.safeParse(value).success,false);
 assert.deepEqual(profileSchema.parse({phone:null,birthDate:'',gender:''}),{phone:'',birthDate:null,gender:null});
 assert.equal(profileSchema.parse({birthDate:'2000-02-29'}).birthDate,'2000-02-29');
 assert.equal(profileSchema.parse({gender:'prefer_not_to_say'}).gender,'prefer_not_to_say');
 assert.deepEqual(profileFromCustomer({phone:'bad',birthDate:'bad',gender:'bad',secret:'never expose'}),{phone:'',birthDate:null,gender:null});
});

test('profile updates central customer and reserves phone without touching member, consent or email',async()=>{
 const {db,session}=setup(),before=structuredClone(db.rows.get('loyaltyMembers/m'));
 const result=await update(db,session,{phone:'0045 55556666',birthDate:'1990-05-01',gender:'prefer_not_to_say'});
 assert.deepEqual(result.profile,{phone:'0045 55556666',birthDate:'1990-05-01',gender:'prefer_not_to_say'});
 const c=db.rows.get('customers/c');
 assert.equal(c.normalizedPhone,'+4555556666');assert.deepEqual(c.phoneAliases,['+4533334444','+4511112222']);
 assert.equal(c.normalizedEmail,'anna@example.com');assert.deepEqual(c.emailAliases,['anna@home.dk']);assert.equal(c.marketingConsent,true);assert.deepEqual(c.discountUsage,{d:1});
 assert.deepEqual(db.rows.get('loyaltyMembers/m'),before);
 assert.equal(db.rows.get('integrationConsumerCustomerPhoneIdentities/'+customerIdentityKey('b','+4555556666')).customerId,'c');
 assert.equal([...db.rows.keys()].filter(k=>k.startsWith('loyaltyEvents/')).length,0);
});

test('partial updates preserve omitted fields and blank values clear displayed profile fields',async()=>{
 const {db,session}=setup();
 await update(db,session,{birthDate:'1990-05-01',gender:'female'});
 assert.equal(db.rows.get('customers/c').phone,'+45 11112222');
 await update(db,session,{phone:'',birthDate:null,gender:null});
 const c=db.rows.get('customers/c');
 assert.deepEqual(profileFromCustomer(c),{phone:'',birthDate:null,gender:null});
 assert.equal(c.normalizedPhone,null);assert.deepEqual(c.phoneAliases,['+4533334444','+4511112222']);
});

test('server rejects future date, hostile fields and invalid phone without writes',async()=>{
 const {db,session}=setup(),before=structuredClone([...db.rows]);
 for(const input of [{birthDate:'2027-01-01'},{phone:'x'},{gender:'x'},{memberId:'elsewhere'},{birthDate:'2026-02-30'}])await rejects(update(db,session,input),'invalid_request');
 assert.deepEqual([...db.rows],before);
});

test('fresh session, member and central customer ownership are rechecked inside transaction',async()=>{
 for(const mutate of [
  db=>db.rows.get('loyaltySessions/s').revokedAt=NOW,
  db=>db.rows.get('loyaltySessions/s').expiresAt=NOW,
  db=>db.rows.get('loyaltySessions/s').epoch=1,
  db=>db.rows.get('loyaltySessions/s').brandId='other',
  db=>db.rows.get('loyaltySessions/s').memberId='other',
  db=>db.rows.get('loyaltyMembers/m').status='deleted',
  db=>db.rows.get('loyaltyMembers/m').brandId='other',
 ]){const {db,session}=setup();mutate(db);await rejects(update(db,session,{gender:'male'}),'unauthorized');assert.equal(db.rows.get('customers/c').gender,undefined);}
 for(const mutate of [db=>db.rows.get('customers/c').brandId='other',db=>{db.rows.get('customers/c').email='other@x.dk';db.rows.get('customers/c').normalizedEmail='other@x.dk';}]){
  const {db,session}=setup();mutate(db);await rejects(update(db,session,{gender:'male'}),'customer_conflict');assert.equal(db.rows.get('customers/c').gender,undefined);
 }
});

test('conflicting current phone, alias or reservation rejects without revealing customer details',async()=>{
 for(const field of ['normalizedPhone','phone','phoneAliases','reservation']){
  const {db,session}=setup();
  if(field==='reservation')db.rows.set('integrationConsumerCustomerPhoneIdentities/'+customerIdentityKey('b','+4555556666'),{brandId:'b',customerId:'other'});
  else db.rows.set('customers/other',{brandId:'b',[field]:field==='phoneAliases'?['+4555556666']:'+4555556666'});
  await rejects(update(db,session,{phone:'+4555556666'}),'customer_conflict');assert.equal(db.rows.get('customers/c').normalizedPhone,'+4511112222');
 }
});

test('same phone on another brand is isolated; parallel same-brand phone claims have one winner',async()=>{
 const {db,session}=setup();db.rows.set('customers/otherbrand',{brandId:'other',normalizedPhone:'+4555556666'});
 await update(db,session,{phone:'+4555556666'});
 const otherMember={...session.member,customerId:'c2',normalizedEmail:'bo@example.com'};
 db.rows.set('customers/c2',{brandId:'b',email:'bo@example.com',phone:''});db.rows.set('loyaltyMembers/m2',otherMember);
 db.rows.set('loyaltySessions/s2',{brandId:'b',memberId:'m2',epoch:2,expiresAt:NOW+60000});
 const results=await Promise.allSettled([update(db,session,{phone:'+4577778888'}),update(db,{sessionId:'s2',memberId:'m2',member:otherMember},{phone:'+4577778888'})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'customer_conflict');
});

test('unindexed formatted legacy primary phones and aliases block a new identity reservation',async()=>{
 for(const legacy of [{phone:'+45 55 55 66 66'},{phone:'0045 (55) 55-66-66'},{phoneAliases:['+45 55 55 66 66']}]){
  const {db,session}=setup();db.rows.set('customers/legacy',{brandId:'b',email:'legacy@example.com',...legacy});
  const before=structuredClone([...db.rows]);
  await rejects(update(db,session,{phone:'+4555556666'}),'customer_conflict');assert.deepEqual([...db.rows],before);
 }
 const {db,session}=setup();db.rows.set('customers/otherbrand',{brandId:'other',phone:'+45 55 55 66 66'});
 assert.equal((await update(db,session,{phone:'+4555556666'})).profile.phone,'+4555556666');
});

test('future persisted birth dates project empty on the Copenhagen calendar boundary',async()=>{
 assert.equal(profileFromCustomer({birthDate:'2027-01-01'},NOW).birthDate,null);
 assert.equal(profileFromCustomer({birthDate:'2026-10-23'},Date.parse('2026-10-22T23:30:00Z')).birthDate,'2026-10-23');
 assert.equal(profileFromCustomer({birthDate:'2026-10-24'},Date.parse('2026-10-22T23:30:00Z')).birthDate,null);
 const {db,session}=setup();db.rows.get('customers/c').birthDate='2999-01-01';
 const result=await update(db,session,{gender:'male'});assert.equal(result.profile.birthDate,null);
 assert.equal(db.rows.get('customers/c').birthDate,'2999-01-01','omitted malformed legacy value is not silently rewritten');
});


test('changing or clearing legacy phone retains both displayed and stale normalized identities',async()=>{
 for(const normalizedPhone of ['', 'invalid', '+4577778888'])for(const phone of ['', '+4555556666']){
  const {db,session}=setup();db.rows.get('customers/c').normalizedPhone=normalizedPhone;
  await update(db,session,{phone});
  const aliases=db.rows.get('customers/c').phoneAliases;
  assert.ok(aliases.includes('+4511112222'),'displayed legacy identity must survive');
  if(normalizedPhone==='+4577778888')assert.ok(aliases.includes(normalizedPhone),'valid stale normalized identity must survive');
  assert.equal(aliases.includes('invalid'),false);assert.equal(aliases.includes(''),false);
 }
});

test('saving unchanged normalized displayed phone with birth date or gender avoids the brand customer scan',async()=>{
 for(const fields of [{phone:'+45 11112222',birthDate:'1990-05-01'},{phone:'0045 11.11.22.22',gender:'female'},{gender:'male'}]){
  const {db,session}=setup();let scans=0;const run=db.runTransaction;
  db.runTransaction=fn=>run(tx=>fn({...tx,get:ref=>{if(!ref.path)scans++;return tx.get(ref)}}));
  await update(db,session,fields);assert.equal(scans,0,'unchanged phone must not read the whole customer brand');
 }
 const {db,session}=setup();db.rows.get('customers/c').normalizedPhone='+4599998888';
 let scans=0;const run=db.runTransaction;db.runTransaction=fn=>run(tx=>fn({...tx,get:ref=>{if(!ref.path)scans++;return tx.get(ref)}}));
 await update(db,session,{phone:'+4511112222',birthDate:'1990-05-01'});assert.equal(scans,0,'displayed legacy phone is unchanged even when old normalized field is stale');
});

test('unchanged phone still rejects a conflicting deterministic reservation without a brand scan',async()=>{
 const {db,session}=setup();let scans=0;const run=db.runTransaction;
 db.runTransaction=fn=>run(tx=>fn({...tx,get:ref=>{if(!ref.path)scans++;return tx.get(ref)}}));
 db.rows.set('integrationConsumerCustomerPhoneIdentities/'+customerIdentityKey('b','+4511112222'),{brandId:'b',customerId:'other'});
 const before=structuredClone([...db.rows]);await rejects(update(db,session,{phone:'+4511112222',gender:'male'}),'customer_conflict');
 assert.equal(scans,0);assert.deepEqual([...db.rows],before);
});
