const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture,responseForm}=require('../helpers/feedback-fixture.cjs');
const {loadTs}=require('../helpers/load-ts.cjs');
const settings={externalReviewsEnabled:true,externalReviewsMinRating:4.7,googleReviewUrl:'https://g.page/r/example/review',trustpilotReviewUrl:'https://www.trustpilot.com/evaluate/example.com'};
function prepare(){const f=fixture();f.records.set('feedbackSettings/b',settings);return{f,receipt:loadTs('src/lib/feedback/external-review-receipt.ts',f.mocks)};}
async function submit(f,overrides={}){await assert.rejects(f.public.submitFeedbackAction(null,responseForm(overrides)),e=>e.digest==='NEXT_REDIRECT'&&!e.url.includes('receipt'));}
test('new submission creates only hashed receipt, HttpOnly cookie and scoped links; duplicate clears cookie',async()=>{
 const{f,receipt}=prepare();await submit(f);
 const cookie=f.cookieJar.get('feedback_review_receipt');assert.ok(cookie.httpOnly);assert.equal(cookie.path,'/feedback');assert.equal(cookie.sameSite,'lax');assert.equal(cookie.maxAge,600);
 const saved=[...f.records.entries()].find(([k])=>k.startsWith('feedback/'))[1];assert.equal(saved.externalReviewReceipt.hash.length,64);assert.equal(JSON.stringify(saved).includes(cookie.value.split('.')[1]),false);
 assert.deepEqual(await receipt.readExternalReviewReceipt('b'),{googleReviewUrl:settings.googleReviewUrl,trustpilotReviewUrl:settings.trustpilotReviewUrl});
 assert.equal(await receipt.readExternalReviewReceipt('other'),null);
 await submit(f);assert.equal(f.cookieJar.size,0);assert.equal(await receipt.readExternalReviewReceipt('b'),null);
});
test('tampered, expired, future malformed receipt and disabled settings fail closed',async()=>{
 const{f,receipt}=prepare();await submit(f);const cookie=f.cookieJar.get('feedback_review_receipt');const value=cookie.value;
 f.cookieJar.set('feedback_review_receipt',{...cookie,value:value.slice(0,-1)+(value.endsWith('a')?'b':'a')});assert.equal(await receipt.readExternalReviewReceipt('b'),null);
 f.cookieJar.set('feedback_review_receipt',cookie);assert.equal(await receipt.readExternalReviewReceipt('b',Date.now()+601000),null);
 const key=[...f.records.keys()].find(k=>k.startsWith('feedback/'));const saved=f.records.get(key);
 f.records.set(key,{...saved,externalReviewReceipt:{...saved.externalReviewReceipt,expiresAt:Date.now()+700000}});assert.equal(await receipt.readExternalReviewReceipt('b'),null);
 f.records.set(key,{...saved,externalReviewReceipt:{...saved.externalReviewReceipt,hash:'bad'}});assert.equal(await receipt.readExternalReviewReceipt('b'),null);f.records.set(key,saved);
 f.records.set('feedbackSettings/b',{...settings,externalReviewsEnabled:false});assert.equal(await receipt.readExternalReviewReceipt('b'),null);
});
test('failed validation or failed commit never leaves an invitation receipt',async()=>{
 const{f,receipt}=prepare();await submit(f);const result=await f.public.submitFeedbackAction(null,responseForm({responses:'{}'}));assert.equal(result.error,true);assert.equal(await receipt.readExternalReviewReceipt('b'),null);
 const other=prepare();other.f.failure.write=true;assert.equal((await other.f.public.submitFeedbackAction(null,responseForm())).error,true);assert.equal(other.f.cookieJar.size,0);assert.equal([...other.f.records.keys()].some(k=>k.startsWith('feedback/')),false);
});
test('equal, below, missing ratings and disabled config do not issue receipts; NPS is not rating',async()=>{
 for(const [rating,minimum,enabled]of [[4,4,true],[4,4.7,true],[5,4.7,false]]){const{f}=prepare();f.records.set('feedbackSettings/b',{...settings,externalReviewsMinRating:minimum,externalReviewsEnabled:enabled});await submit(f,{responses:JSON.stringify({rating:{answer:rating},nps:{answer:10}})});assert.equal(f.cookieJar.size,0);}
 const{f}=prepare();f.records.set('feedbackQuestionsVersion/v1',{...f.records.get('feedbackQuestionsVersion/v1'),questions:[{questionId:'nps',label:'NPS',type:'nps',isRequired:true}]});await submit(f,{responses:JSON.stringify({nps:{answer:10}})});assert.equal(f.cookieJar.size,0);
});
test('booking uses verified invitation brand and never creates a second receipt',async()=>{
 const{f,receipt}=prepare();await submit(f,{sourceType:'booking',sourceId:'booking',invitationToken:'valid'});assert.ok(await receipt.readExternalReviewReceipt('b'));
 await submit(f,{sourceType:'booking',sourceId:'booking',invitationToken:'valid'});assert.equal(f.cookieJar.size,0);
});

test('transaction retry ending in duplicate does not reuse first attempt eligibility',async()=>{
 const{f}=prepare();const run=f.db.runTransaction;let firstId;
 f.db.runTransaction=async callback=>{
  await callback({get:ref=>ref.get(),create:(ref,data)=>{if(ref.key.startsWith('feedback/'))firstId=ref.id;},update:()=>{}});
  assert.ok(firstId);f.records.set('feedback/'+firstId,{brandId:'b',customerId:'c',rating:5});
  return run(callback);
 };
 await submit(f);assert.equal(f.cookieJar.size,0);assert.equal(f.records.get('feedback/'+firstId).externalReviewReceipt,undefined);
});
