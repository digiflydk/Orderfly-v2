const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {loadTs}=require('../helpers/load-ts.cjs');const {checkout}=require('../helpers/checkout-fixture.cjs');
const id='22222222-2222-4222-8222-222222222222',foreign='11111111-1111-4111-8111-111111111111',secret='b'.repeat(64);
const consent=(brand='b')=>({brand_id:brand,identityTokenHash:crypto.createHash('sha256').update(secret).digest('hex'),marketing:false,statistics:true,functional:true,linked_to_customer:false,last_seen:new Date(),consent_version:'v1',origin_brand:brand});
test('active checkout ignores a supplied foreign UUID and links only the verified server identity',async()=>{
 const f=await checkout({anonymousConsentId:foreign,consentCookie:id+'.'+secret,seed:[['anonymous_cookie_consents/'+id,consent()],['anonymous_cookie_consents/'+foreign,{...consent(),marketing:true}]]});
 assert.equal(f.result.success,true);assert.equal(f.records.get('anonymous_cookie_consents/'+foreign).linked_to_customer,false);
 assert.equal(f.records.get('anonymous_cookie_consents/'+id).linked_to_customer,true);
 const customer=[...f.records].find(([key])=>key.startsWith('customers/'))[1];assert.equal(customer.cookie_consent.linked_anon_id,id);assert.equal(customer.cookie_consent.marketing,false);
 assert.equal(f.sessionParams.metadata.anonymousConsentId,undefined);
});
for(const variant of ['no-cookie','wrong-secret','wrong-brand'])test(`checkout cannot link consent with ${variant}`,async()=>{
 const f=await checkout({anonymousConsentId:id,consentCookie:variant==='no-cookie'?undefined:id+'.'+(variant==='wrong-secret'?'a'.repeat(64):secret),seed:[['anonymous_cookie_consents/'+id,consent(variant==='wrong-brand'?'foreign':'b')]]});
 assert.equal(f.result.success,true);assert.equal(f.records.get('anonymous_cookie_consents/'+id).linked_to_customer,false);
 assert.equal([...f.records].find(([key])=>key.startsWith('customers/'))[1].cookie_consent,undefined);
});
test('late acknowledgement preserves the newer failed withdrawal and retries it with canonical identity',async()=>{
 const store=new Map(),cookies=[],requests=[];let release;const oldFetch=global.fetch;
 const api=loadTs('src/lib/consent-sync.ts',{'js-cookie':{default:{set:(...x)=>cookies.push(x)}},'./optional-storage':{optionalGet:k=>store.get(k)||null,optionalSet:(k,v)=>store.set(k,v),optionalRemove:k=>store.delete(k)}});
 try{
  global.fetch=async(_url,options)=>{requests.push(JSON.parse(options.body));if(requests.length===1)return new Promise(r=>release=r);if(requests.length===2)return Response.json({error:'offline'},{status:503});return Response.json({anon_user_id:id});};
  const accept=api.saveConsentChoice({marketing:true});await new Promise(r=>setImmediate(r));
  const withdraw=api.saveConsentChoice({marketing:false});assert.equal(requests.length,1);assert.equal(JSON.parse(store.get('pending_cookie_consent')).marketing,false);
  release(Response.json({anon_user_id:id}));await Promise.all([accept,withdraw]);
  assert.equal(requests.length,2);assert.ok(requests[1].choice_revision>requests[0].choice_revision);assert.equal(JSON.parse(store.get('pending_cookie_consent')).marketing,false);
  await api.retryPendingConsent();assert.equal(requests[2].marketing,false);assert.equal(store.has('pending_cookie_consent'),false);assert.equal(store.get('orderfly_anonymous_id'),id);assert.equal(cookies.at(-1)[1],id);
 }finally{global.fetch=oldFetch;}
});
