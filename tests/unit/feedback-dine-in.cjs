const test = require('node:test');
const assert = require('node:assert/strict');
const {fixture} = require('../helpers/feedback-fixture.cjs');
const {loadTs} = require('../helpers/load-ts.cjs');
process.env.ORDERFLY_FEEDBACK_TOKEN_SECRET = 'synthetic-feedback-signing-secret-at-least-32';
function setup(){
 const f=fixture();
 f.mocks['next/headers'].headers=async()=>new Map([['x-forwarded-for','192.0.2.10']]);
 return {...f,service:loadTs('src/lib/feedback/dine-in.ts',f.mocks),submit:loadTs('src/app/feedback/dine-in/actions.ts',f.mocks).submitDineInFeedbackAction};
}
function form(page, answers={rating:{answer:5}}){
 const f=new FormData();
 for(const key of ['sourceType','sourceId','customerId','invitationToken'])f.set(key,page.context[key]);
 f.set('questionVersionId',page.questionsVersion.id);f.set('language',page.questionsVersion.language);f.set('responses',JSON.stringify(answers));return f;
}
async function saved(f,p,answers){ await assert.rejects(f.submit(null,form(p,answers)),e=>e.digest==='NEXT_REDIRECT'); }
const rows=f=>[...f.records].filter(([key])=>key.startsWith('feedback/')).map(([,value])=>value);
test('read-only QR resolution has anonymous server-scoped context and restaurant questions',async()=>{
 const f=setup(),p=await f.service.getDineInFeedbackContext('esmeralda','amager');
 assert.equal(p.context.sourceType,'dine_in');assert.equal(p.context.customerId,'');assert.equal(p.context.brandId,'b');assert.equal(p.context.locationId,'l');assert.equal(p.questionsVersion.id,'v1');assert.equal(f.writes.length,0);
});
test('inactive, cross-brand, duplicate slug, malformed and unavailable language are rejected',async()=>{
 for(const mutate of [f=>f.records.get('brands/b').status='inactive',f=>f.records.get('locations/l').isActive=false,f=>f.records.get('locations/l').brandId='other',f=>f.records.set('brands/dup',{slug:'esmeralda',status:'active'})]){const f=setup();mutate(f);assert.equal(await f.service.getDineInFeedbackContext('esmeralda','amager'),null);}
 const f=setup();assert.equal(await f.service.getDineInFeedbackContext('../bad','amager'),null);assert.equal(await f.service.getDineInFeedbackContext('esmeralda','amager','en'),null);
});
test('brand restaurant override wins and deliberately disabled brand forms block generic fallback',async()=>{
 const f=setup();f.records.set('feedbackQuestionsVersion/brand',{...f.records.get('feedbackQuestionsVersion/v1'),scope:'brand',brandId:'b',orderTypes:['booking']});
 assert.equal((await f.service.getDineInFeedbackContext('esmeralda','amager')).questionsVersion.id,'brand');
 f.records.get('feedbackQuestionsVersion/brand').isActive=false;assert.equal(await f.service.getDineInFeedbackContext('esmeralda','amager'),null);
});
test('token expiry, tamper, oversized token and future expiry fail closed',async()=>{
 const f=setup(),p=await f.service.getDineInFeedbackContext('esmeralda','amager'),t=p.context.invitationToken,data=f.service.readDineInToken(t);
 assert.equal(f.service.readDineInToken(t,data.exp),null);assert.equal(f.service.readDineInToken(t+'x'),null);assert.equal(f.service.readDineInToken('x'.repeat(5000)),null);assert.equal(f.service.readDineInToken(t,data.exp-1800001),null);
});
test('submission stores anonymous QR feedback without customer, invitation or email writes',async()=>{
 const f=setup(),p=await f.service.getDineInFeedbackContext('esmeralda','amager');await saved(f,p,{rating:{answer:4},nps:{answer:9},text:{answer:'God service'}});
 const r=rows(f)[0];assert.equal(r.sourceType,'dine_in');assert.equal(r.customerId,'');assert.equal(r.answeredVia,'qr');assert.equal(r.rating,4);assert.equal(r.npsScore,9);assert.equal(r.comment,'God service');assert.equal(r.showPublicly,false);assert.equal(r.orderId,undefined);assert.equal(r.externalReviewReceipt,undefined);
 assert.ok(f.writes.every(k=>k.startsWith('feedback/')||k.startsWith('feedbackDineInLimits/')));
});
test('replay and simultaneous duplicate submissions save once and do not reissue review receipt',async()=>{
 const f=setup(),p=await f.service.getDineInFeedbackContext('esmeralda','amager');f.records.set('feedbackSettings/b',{externalReviewsEnabled:true,externalReviewsMinRating:4.7,googleReviewUrl:'https://g.page/r/test/review'});
 await Promise.all([saved(f,p),saved(f,p)]);assert.equal(rows(f).length,1);await saved(f,p);assert.equal(f.cookieJar.has('feedback_review_receipt'),false);
});
test('review uses saved server rating and strict threshold, disabled and missing links suppressed',async()=>{
 for(const [settings,rating,expected]of [[{externalReviewsEnabled:true,externalReviewsMinRating:4,googleReviewUrl:'https://g.page/r/test/review'},5,true],[{externalReviewsEnabled:true,externalReviewsMinRating:4,googleReviewUrl:'https://g.page/r/test/review'},4,false],[{externalReviewsEnabled:false,externalReviewsMinRating:4,googleReviewUrl:'https://g.page/r/test/review'},5,false],[{externalReviewsEnabled:true,externalReviewsMinRating:4},5,false]]){
  const f=setup(),p=await f.service.getDineInFeedbackContext('esmeralda','amager');f.records.set('feedbackSettings/b',settings);await saved(f,p,{rating:{answer:rating},nps:{answer:10}});assert.equal(Boolean(rows(f)[0].externalReviewReceipt),expected);assert.equal(f.cookieJar.has('feedback_review_receipt'),expected);
 }
});
test('tampered identity/version/language, invalid and large answers rejected without writes',async()=>{
 for(const [k,v]of [['sourceType','booking'],['sourceId','fake'],['customerId','c'],['questionVersionId','en'],['language','en'],['responses','{'],['responses','[]'],['responses','x'.repeat(50001)],['responses',JSON.stringify({rating:{answer:6}})]]){const f=setup(),p=await f.service.getDineInFeedbackContext('esmeralda','amager'),body=form(p);body.set(k,v);assert.equal((await f.submit(null,body)).error,true);assert.equal(f.writes.length,0);}
});
test('source deactivation and question edit between GET and POST reject with answers preserved',async()=>{
 for(const mutate of [f=>f.records.get('brands/b').status='inactive',f=>f.records.get('locations/l').brandId='other',f=>f.records.get('feedbackQuestionsVersion/v1').questions=[{questionId:'new',label:'New',type:'stars',isRequired:true}]]){const f=setup(),p=await f.service.getDineInFeedbackContext('esmeralda','amager');mutate(f);assert.equal((await f.submit(null,form(p))).error,true);assert.equal(rows(f).length,0);}
});
test('transaction failure does not issue review or leave partial feedback',async()=>{
 const f=setup(),p=await f.service.getDineInFeedbackContext('esmeralda','amager');f.failure.write=true;assert.equal((await f.submit(null,form(p))).error,true);assert.equal(rows(f).length,0);assert.equal(f.cookieJar.has('feedback_review_receipt'),false);
});
test('rate limit blocks new submissions, replay remains idempotent and limits retain no IP',async()=>{
 const f=setup(),p=await f.service.getDineInFeedbackContext('esmeralda','amager');await saved(f,p);
 const key='feedbackDineInLimits/'+f.service.dineInRateKey('l','192.0.2.10');f.records.set(key,{count:30,resetAt:Date.now()+60000});
 const p2=await f.service.getDineInFeedbackContext('esmeralda','amager');assert.equal((await f.submit(null,form(p2))).error,true);await saved(f,p);assert.equal(rows(f).length,1);assert.ok(!JSON.stringify([...f.records].filter(([k])=>k.startsWith('feedbackDineInLimits/'))).includes('192.0.2.10'));
});

test('address and location cap namespaces cannot collide',()=>{
 const f=setup();assert.notEqual(f.service.dineInRateKey('l','location-total'),f.service.dineInRateKey('l'));
});
test('Esmeralda fallback is restaurant-specific, read-only, and disabled brand form prevents it',async()=>{
 const f=setup(),brandId='oeypKaMyYcQjIwaa1PtV';f.records.set('brands/'+brandId,f.records.get('brands/b'));f.records.delete('brands/b');f.records.get('locations/l').brandId=brandId;
 let p=await f.service.getDineInFeedbackContext('esmeralda','amager');assert.equal(p.questionsVersion.id,'esmeralda-dine-in-default-da-v1');assert.ok(p.questionsVersion.questions.some(q=>q.questionId==='service'));assert.equal(f.writes.length,0);
 f.records.set('feedbackQuestionsVersion/disabled',{...f.records.get('feedbackQuestionsVersion/v1'),scope:'brand',brandId,orderTypes:['booking'],isActive:false});assert.equal(await f.service.getDineInFeedbackContext('esmeralda','amager'),null);
});
test('location-wide cap remains effective when a new client address arrives',async()=>{
 const f=setup(),p=await f.service.getDineInFeedbackContext('esmeralda','amager');f.records.set('feedbackDineInLimits/'+f.service.dineInRateKey('l'),{count:300,resetAt:Date.now()+3600000});
 assert.equal((await f.submit(null,form(p))).error,true);assert.equal(rows(f).length,0);
});
