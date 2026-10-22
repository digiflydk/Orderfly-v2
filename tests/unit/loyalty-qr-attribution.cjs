const {test}=require('node:test'), assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {loadTs}=require('../helpers/load-ts.cjs'), {memoryDb}=require('../helpers/marketing-db.cjs');
const mocks={'server-only':{}};
const m=loadTs('src/lib/loyalty/stamp-card/membership.ts',mocks);
const {defaultProgramSettings}=loadTs('src/lib/loyalty/stamp-card/rules.ts',mocks);
const NOW=Date.parse('2026-10-22T10:00:00Z'), SLUG='a'.repeat(32), CODE='b'.repeat(32), EVENT='12345678-1234-4123-8123-123456789abc', PROOF='c'.repeat(64);
const RECEIPT=`${SLUG}.${EVENT}.${PROOF}`, PREFIX=`brands/brand/qrCodes/${CODE}`;
const rows=(db,name)=>[...db.rows].filter(([key])=>key.startsWith(name+'/')).map(([key,value])=>({id:key.slice(name.length+1),...value}));
function fixture({retry=false,failCommit=false}={}) {
  const db=memoryDb(), originalCollection=db.collection, baseTransaction=db.runTransaction;
  db.collection=name=>{const collection=originalCollection(name),doc=collection.doc;return {...collection,doc:id=>{const ref=doc(id);return {...ref,collection:suffix=>db.collection(ref.path+'/'+suffix)};}};};
  db.runTransaction=fn=>baseTransaction(async tx=>{
    const strict=(discard=false)=>{let wrote=false;const wrapped={...tx,get:async ref=>{assert.equal(wrote,false,'read after write');return tx.get(ref);}};
      for(const method of ['create','set','update','delete']) wrapped[method]=(...args)=>{wrote=true;if(!discard)return tx[method](...args);};return wrapped;};
    if(retry) await fn(strict(true)); // Firestore retries discard the first attempt's pending writes.
    const result=await fn(strict());if(failCommit)throw Error('synthetic commit failure');return result;
  });
  db.rows.set('brands/brand',{name:'Esmeralda',slug:'esmeralda',status:'active'});
  db.rows.set('platformAdminControl/access-v1',{principals:[],companies:[{id:'esmeralda',active:true,locationIds:['l1'],orderflyBrandIds:['brand'],opsflyOrganizationId:null}],roles:[],memberships:[]});
  db.rows.set('locations/l1',{brandId:'brand',isActive:true});
  db.rows.set('loyaltyPrograms/brand',{brandId:'brand',version:1,settings:{...defaultProgramSettings('Esmeralda'),active:true,
    reward:{type:'free_product',productIds:['pizza'],categoryIds:[]},rewardDescription:'Gratis pizza',terms:'Vilkår',consentText:'Ja tak til nyhedsbrev.'}});
  db.rows.set(`qrPublicCodes/${SLUG}`,{brandId:'brand',codeId:CODE});
  const destination='https://esmeralda.orderfly.dk/club/tilmeld';
  db.rows.set(PREFIX,{id:CODE,brandId:'brand',slug:SLUG,destination,locationId:'l1',campaign:'Table',tags:['table'],status:'active',revision:1,expiresAt:null});
  db.rows.set(`${PREFIX}/qrScanEvents/${EVENT}`,{brandId:'brand',qrId:CODE,locationId:'l1',timestamp:NOW-1000,campaign:'Table',tags:['table'],classification:{probableScan:true},
    touch:{schemaVersion:1,proofHash:createHash('sha256').update(PROOF).digest('hex'),qrRevision:1,destination,expiresAt:NOW-1000+1800000}});
  return db;
}
async function input(db,changes={}) {const brand=await m.resolveBrand(db,'esmeralda'),program=await m.programForPortal(db,brand,NOW);return {name:'Anna',email:'anna@example.com',newsletterConsent:true,termsAccepted:true,
  consentVersion:program.consentVersion,termsVersion:program.termsVersion,qrAttribution:{receipt:RECEIPT,statisticsConsent:true},...changes};}
async function signup(db,changes={}) {return m.signup(db,await m.resolveBrand(db,'esmeralda'),await input(db,changes),{now:NOW,ip:'203.0.113.1'});}

test('native new-member transaction includes one verified QR conversion without contact identity',async()=>{
 const db=fixture(),r=await signup(db);assert.equal(r.ok,true);
 const [conversion]=rows(db,'qrConversions'),[member]=rows(db,'loyaltyMembers');assert.ok(conversion);
 assert.equal(conversion.conversionType,'new_member');assert.equal(conversion.qrId,CODE);assert.equal(conversion.scanEventId,EVENT);assert.equal(conversion.campaign,'Table');
 assert.equal(rows(db,'loyaltyEvents').filter(e=>e.type==='member_joined').length,1);
 for(const secret of [member.id,member.customerId,'anna@example.com',RECEIPT,PROOF]) assert.equal(JSON.stringify(conversion).includes(secret),false);
 assert.deepEqual(Object.keys(conversion).sort(),['id','schemaVersion','conversionType','brandId','locationId','qrId','qrRevision','scanEventId','occurredAt','convertedAt','campaign','tags','statisticsConsent'].sort());
});
test('transaction retry and concurrent repeat signup record only the native new membership',async()=>{
 const db=fixture({retry:true});const result=await Promise.all([signup(db),signup(db),signup(db)]);
 assert.ok(result.every(r=>r.ok));assert.equal(rows(db,'loyaltyMembers').length,1);assert.equal(rows(db,'qrConversions').length,1);
 await m.requestLoginLink(db,await m.resolveBrand(db,'esmeralda'),{email:'anna@example.com'},{now:NOW,ip:'203.0.113.2'});
 assert.equal(rows(db,'qrConversions').length,1);
});
test('failed commit leaves no member, conversion, native event or email job',async()=>{
 const db=fixture({failCommit:true}),before=structuredClone([...db.rows]);await assert.rejects(signup(db),/synthetic commit failure/);assert.deepEqual([...db.rows],before);
});
test('existing membership cannot be retrospectively attributed',async()=>{
 const db=fixture();await signup(db,{qrAttribution:undefined});assert.equal(rows(db,'qrConversions').length,0);
 const r=await signup(db);assert.equal(r.ok,true);assert.equal(rows(db,'qrConversions').length,0);
});
for(const mode of ['missing','denied','forged','expired','foreign-brand','foreign-location','changed-target','changed-revision','lookup-failure']) test(`${mode}: normal signup succeeds without a QR conversion`,async()=>{
 const db=fixture(),changes={};
 if(mode==='missing')changes.qrAttribution=undefined;
 if(mode==='denied')changes.qrAttribution={receipt:RECEIPT,statisticsConsent:false};
 if(mode==='forged')changes.qrAttribution={receipt:RECEIPT.slice(0,-1)+'d',statisticsConsent:true};
 if(mode==='expired')db.rows.get(`${PREFIX}/qrScanEvents/${EVENT}`).touch.expiresAt=NOW;
 if(mode==='foreign-brand')db.rows.get(`qrPublicCodes/${SLUG}`).brandId='other';
 if(mode==='foreign-location')db.rows.get('locations/l1').brandId='other';
 if(mode==='changed-target')db.rows.get(PREFIX).destination='https://esmeralda.orderfly.dk/club/tilmeld?utm_campaign=new';
 if(mode==='changed-revision')db.rows.get(PREFIX).revision=2;
 if(mode==='lookup-failure'){const collection=db.collection;db.collection=name=>{if(name==='qrPublicCodes')throw Error('synthetic optional lookup');return collection(name);};}
 const r=await signup(db,changes);assert.equal(r.ok,true);assert.equal(rows(db,'loyaltyMembers').length,1);assert.equal(rows(db,'qrConversions').length,0);
});
test('signup remains strictly bounded; arbitrary client provenance and identity are rejected',async()=>{
 const db=fixture(),valid=await input(db);assert.equal(m.signupSchema.safeParse(valid).success,true);
 for(const qrAttribution of [{receipt:RECEIPT,statisticsConsent:true,brandId:'other'},{receipt:'bad',statisticsConsent:true},{receipt:RECEIPT,statisticsConsent:'true'},{receipt:RECEIPT,statisticsConsent:true,memberId:'forged'}])
  assert.equal(m.signupSchema.safeParse({...valid,qrAttribution}).success,false);
});

test('real consent parser distinguishes unknown from an explicit statistics choice',()=>{
 let stored=null;global.document={cookie:''};
 const analytics=loadTs('src/lib/analytics.ts',{'./optional-storage':{optionalGet:()=>stored}});
 for(const [value,known,allowed] of [[null,false,false],['{}',false,false],['null',false,false],['not-json',false,false],['{"statistics":false}',true,false],['{"statistics":true}',true,true],['{"analytics":false}',true,false],['{"analytics":true}',true,true]]) {
   stored=value;assert.equal(analytics.hasTrackingConsentChoice(),known,String(value));assert.equal(analytics.trackingConsent().statistics,allowed,String(value));
 }
 stored=null;document.cookie='orderfly_cookie_consent='+encodeURIComponent('{"statistics":false}');assert.equal(analytics.hasTrackingConsentChoice(),true);assert.equal(analytics.trackingConsent().statistics,false);
 document.cookie='orderfly_cookie_consent=bad%encoding';assert.equal(analytics.hasTrackingConsentChoice(),false);assert.equal(analytics.trackingConsent().statistics,false);
 delete global.document;
});
