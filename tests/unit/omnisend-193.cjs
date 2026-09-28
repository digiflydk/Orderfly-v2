const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { memoryDb } = require('../helpers/marketing-db.cjs');
const { checkout } = require('../helpers/checkout-fixture.cjs');
const config=loadTs('src/lib/marketing/config.ts',{'server-only':{}});
const { recordNewsletterConsent }=loadTs('src/lib/marketing/store.ts',{'server-only':{}});
const { NEWSLETTER_CONSENT_VERSION }=loadTs('src/lib/marketing/consent.ts');
const { runMarketingWorker,retryMarketingJob }=loadTs('src/lib/marketing/worker.ts',{'server-only':{}});
const { Omnisend }=loadTs('src/lib/marketing/provider.ts',{'server-only':{}});
const brand={brandId:'oeypKaMyYcQjIwaa1PtV',omnisendBrandId:'69618ede8284682be9bb5290',apiKey:'synthetic-restricted-key',enabled:true,consentMode:'single_opt_in'};
const consent={brandId:brand.brandId,brandName:'Esmeralda',locationId:'amager',customerId:'synthetic-customer',email:'orderfly.qa.20260928@example.com',submissionId:'22de2795-5a86-4260-a111-111111111111',version:NEWSLETTER_CONSENT_VERSION};

test('#193 missing, disabled, invalid and correct brand mapping have specific redacted status',()=>{
 const original=process.env.ORDERFLY_OMNISEND_BRANDS;
 try {
  for(const [raw,reason] of [[undefined,'secret_unavailable'],['not-json','invalid_mapping'],['[]','brand_not_mapped'],[JSON.stringify([{...brand,enabled:false}]),'brand_disabled']]) {
   if(raw===undefined)delete process.env.ORDERFLY_OMNISEND_BRANDS;else process.env.ORDERFLY_OMNISEND_BRANDS=raw;
   assert.equal(config.marketingConfigurationStatus(brand.brandId).reason,reason);
  }
  process.env.ORDERFLY_OMNISEND_BRANDS=JSON.stringify([brand]);
  assert.equal(config.marketingConfigurationStatus(brand.brandId).reason,null);
 } finally {if(original===undefined)delete process.env.ORDERFLY_OMNISEND_BRANDS;else process.env.ORDERFLY_OMNISEND_BRANDS=original;}
});

test('#193 Superadmin status reports missing configuration without credentials or contact data',async()=>{
 const previous=process.env.ORDERFLY_OMNISEND_BRANDS;
 delete process.env.ORDERFLY_OMNISEND_BRANDS;
 try {
  const db=memoryDb();db.rows.set('marketingOutbox/'+ 'a'.repeat(64),{brandId:brand.brandId,state:'pending',attempts:0,createdAt:1,updatedAt:1,email:consent.email});
  const route=loadTs('src/app/api/superadmin/marketing/route.ts',{
   'server-only':{},
   '@/lib/firebase-admin':{getAdminDb:()=>db},
   '@/lib/marketing/auth':{marketingAdminAuthorized:async()=>true},
   '@/lib/url':{getOrigin:async()=> 'https://example.test'},
  });
  const response=await route.GET(new Request(`https://example.test/api/superadmin/marketing?brandId=${brand.brandId}`));
  const payload=await response.json();
  assert.equal(response.status,200);assert.equal(payload.configurationError,'secret_unavailable');
  assert.equal(payload.configured,false);assert.equal(payload.jobs[0].attempts,0);
  assert.doesNotMatch(JSON.stringify(payload),/synthetic-restricted-key|orderfly\.qa\.20260928@example\.com/);
 } finally {if(previous===undefined)delete process.env.ORDERFLY_OMNISEND_BRANDS;else process.env.ORDERFLY_OMNISEND_BRANDS=previous;}
});

test('#193 queued Esmeralda consent waits at zero attempts, then syncs once after configuration',async()=>{
 const original=process.env.ORDERFLY_OMNISEND_BRANDS;
 try {
  delete process.env.ORDERFLY_OMNISEND_BRANDS;
  const db=memoryDb();db.rows.set('customers/synthetic-customer',{brandId:brand.brandId,normalizedEmail:consent.email,marketingConsent:false});
  const id=await recordNewsletterConsent(db,consent);
  assert.equal(id,await recordNewsletterConsent(db,consent));
  assert.equal([...db.rows.keys()].filter(key=>key.startsWith('marketingOutbox/')).length,1);
  await runMarketingWorker(db,Date.now()+1,()=>{throw Error('provider must not be called without a brand mapping')});
  const job=db.rows.get('marketingOutbox/'+id);
  assert.equal(job.state,'pending');assert.equal(job.attempts,0);assert.equal(job.lastError,'secret_unavailable');
  process.env.ORDERFLY_OMNISEND_BRANDS=JSON.stringify([brand]);
  assert.equal(await retryMarketingJob(db,'other-brand',id),false);
  assert.equal(await retryMarketingJob(db,brand.brandId,id),true);
  let calls=0;
  const provider=()=>({verifyBrand:async()=>{},sync:async event=>{calls++;assert.equal(event.brandId,brand.brandId);return 'synced';},contact:async()=>({identifiers:[{type:'email',id:consent.email,channels:{email:{status:'subscribed'}}}]})});
  await runMarketingWorker(db,Date.now()+1,provider);
  await runMarketingWorker(db,Date.now()+2,provider);
  assert.equal(calls,1);assert.equal(db.rows.get('marketingOutbox/'+id).state,'synced');assert.equal(db.rows.get('marketingOutbox/'+id).attempts,1);
  assert.equal(await retryMarketingJob(db,brand.brandId,id),false);
 } finally {if(original===undefined)delete process.env.ORDERFLY_OMNISEND_BRANDS;else process.env.ORDERFLY_OMNISEND_BRANDS=original;}
});

test('#193 provider already subscribed after uncertain reply is confirmed without another POST',async()=>{
 let writes=0;
 const provider=new Omnisend(brand,async(url,init)=>{
  if(init.method==='POST')writes++;
  return Response.json({contacts:[{identifiers:[{type:'email',id:consent.email,channels:{email:{status:'subscribed'}}}]}]});
 });
 assert.equal(await provider.sync({...consent,id:'synthetic-consent',source:'checkout',channel:'email',capturedAt:Date.now(),wording:'fixture'}),'synced');
 assert.equal(writes,0);
});

test('#193 active newsletter discount is unavailable until brand integration is configured',async()=>{
 const discount={id:'d',brandId:'b',applicationType:'newsletter_signup',isActive:true,locationIds:['l'],orderTypes:['pickup'],activeDays:[],activeTimeSlots:[],discountType:'percentage',discountValue:10,code:'NEWSLETTER_SIGNUP',usageLimit:0,usedCount:0,perCustomerLimit:1};
 const unavailable=await checkout({kind:'newsletter',marketingConfigured:false,seed:[['discounts/d',discount]]});
 assert.equal(unavailable.result.success,false);assert.match(unavailable.result.error,/afventer opsætning/);
 assert.equal(unavailable.events.includes('stripe'),false);
 const available=await checkout({kind:'newsletter',marketingConfigured:true,seed:[['discounts/d',discount]]});
 assert.equal(available.result.success,true,available.result.error);
 const customerId='cust-v2-'+require('node:crypto').createHash('sha256').update('b\ntest@example.test').digest('hex').slice(0,32);
 const alreadyUsed=await checkout({kind:'newsletter',marketingConfigured:true,seed:[['discounts/d',discount],[`customers/${customerId}`,{id:customerId,brandId:'b',normalizedEmail:'test@example.test',email:'test@example.test',marketingConsent:true,discountUsage:{d:1}}]]});
 assert.equal(alreadyUsed.result.success,false);
 assert.equal(alreadyUsed.events.includes('stripe'),false);
});

test('#193 existing notification heartbeat also runs the consent queue without starting campaigns',async()=>{
 let calls=0;
 const route=loadTs('src/app/api/internal/feedback/send/route.ts',{
  '@/lib/feedback/mail-worker':{runFeedbackMailWorker:async()=>({})},
  '@/lib/notifications/order-worker':{runOrderNotificationWorker:async()=>({})},
  '@/lib/games/worker':{runGameOutbox:async()=>({})},
  '@/lib/marketing/worker':{runMarketingWorker:async()=>{calls++;return {processed:1}}},
  '@/lib/firebase-admin':{getAdminDb:()=>({})},
 });
 const previous=process.env.ORDERFLY_FEEDBACK_WORKER_SECRET;
 process.env.ORDERFLY_FEEDBACK_WORKER_SECRET='x'.repeat(32);
 try {
  const response=await route.POST(new Request('https://example.test',{method:'POST',headers:{authorization:`Bearer ${'x'.repeat(32)}`}}));
  assert.equal(response.status,200);assert.equal(calls,1);
  assert.equal((await response.json()).contacts.processed,1);
 } finally {if(previous===undefined)delete process.env.ORDERFLY_FEEDBACK_WORKER_SECRET;else process.env.ORDERFLY_FEEDBACK_WORKER_SECRET=previous;}
});
