const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture}=require('../helpers/feedback-fixture.cjs');
const {loadTs}=require('../helpers/load-ts.cjs');
const {Timestamp}=require('firebase-admin/firestore');
const metrics=loadTs('src/lib/feedback/metrics.ts');
const stamp=value=>Timestamp.fromDate(new Date(value));
const row=(extra={})=>({brandId:'b',locationId:'l',customerId:'c',receivedAt:stamp('2026-09-09T10:00:00Z'),rating:4,comment:'God oplevelse',showPublicly:false,maskCustomerName:true,...extra});

test('ratings weight each reply equally, preserve genuine NPS zero and exclude missing/invalid scores',()=>{
 const rows=[row({responses:{food:{type:'stars',answer:2},service:{type:'stars',answer:4},nps:{type:'nps',answer:0}},npsScore:9}),row({rating:5,npsScore:10}),row({rating:0,npsScore:null}),row({rating:null,npsScore:false})];
 const result=metrics.summarizeFeedback(rows);
 assert.equal(result.responses,4);assert.equal(result.ratedResponses,2);assert.equal(result.averageRating,4);assert.equal(result.npsResponses,2);assert.equal(result.nps,0);assert.equal(result.detractors,1);assert.equal(result.promoters,1);
 assert.equal(metrics.summarizeFeedback([]).nps,null);assert.equal(metrics.summarizeFeedback([{rating:0}]).averageRating,null);
 assert.deepEqual(metrics.feedbackMetrics({responses:{first:{type:'nps',answer:0},second:{type:'nps',answer:10}}}),{rating:null,nps:0});
});
test('NPS uses percentage point difference over all valid NPS responses',()=>{
 const result=metrics.summarizeFeedback([0,6,7,8,9,10,10].map(npsScore=>({npsScore})));
 assert.equal(result.passives,2);assert.equal(result.npsResponses,7);assert.ok(Math.abs(result.nps-100/7)<1e-10);
});
test('Danish date boundaries include the complete last day and account for summer/winter time',()=>{
 const f=fixture();
 for(const [date,hours]of [['2026-03-29',23],['2026-10-25',25]]){
  const parsed=f.report.reportFilters({from:date,to:date});assert.equal((parsed.end-parsed.start)/3600000,hours);
 }
 for(const input of [{from:'2026-02-30'},{from:'2026-09-10',to:'2026-09-09'},{from:'2024-01-01',to:'2026-01-01'},{brandId:'a/b'}])assert.throws(()=>f.report.reportFilters(input));
});
test('report filters scope by brand, location, source and received date without exposing responses',async()=>{
 const f=fixture();
 f.records.set('feedback/start',row({receivedAt:stamp('2026-09-08T22:00:00Z'),rating:2,npsScore:0}));
 f.records.set('feedback/end',row({receivedAt:stamp('2026-09-09T21:59:59.999Z'),rating:5,npsScore:10,sourceType:'booking',internalNote:'PRIVATE_NOTE'}));
 f.records.set('feedback/outside',row({receivedAt:stamp('2026-09-09T22:00:00Z')}));
 f.records.set('feedback/location',row({locationId:'l2',rating:1}));
 f.records.set('feedback/foreign',row({brandId:'other',locationId:'foreign',rating:1}));
 f.records.set('feedback/dateless',row({receivedAt:null}));
 const input={from:'2026-09-09',to:'2026-09-09',brandId:'b',locationId:'l'};
 const report=await f.report.getFeedbackReport(input);
 assert.equal(report.summary.responses,2);assert.equal(report.summary.averageRating,3.5);assert.equal(report.summary.nps,0);assert.equal(report.locationSummary.length,1);assert.equal(report.daily[0].date,'2026-09-09');
 assert.doesNotMatch(JSON.stringify(report),/PRIVATE_NOTE|God oplevelse|private@example|customerId/);
 assert.equal((await f.report.getFeedbackReport({...input,source:'booking'})).summary.responses,1);
 await assert.rejects(()=>f.report.getFeedbackReport({...input,locationId:'foreign'}));
});
test('authenticated roles enforce brand scope on queries and mutations',async()=>{
 const f=fixture();f.records.set('feedback/b',row());f.records.set('feedback/other',row({brandId:'other',locationId:'foreign'}));
 f.auth.uid='qa-editor';
 assert.deepEqual((await f.admin.getFeedbackEntries()).map(f=>f.id),['b']);
 assert.ok(f.reads.filter(r=>r.collection==='feedback').every(r=>r.filters.some(([field,op,value])=>field==='brandId'&&op==='=='&&value==='b')));
 await assert.rejects(()=>f.admin.getFeedbackById('other'));assert.equal((await f.admin.updateFeedback('other',{showPublicly:true})).error,true);
 await assert.rejects(()=>f.report.getFeedbackReport({brandId:'other'}));await assert.rejects(()=>f.settings.writeFeedbackSettings({brandId:'other',publicReviewsEnabled:true}));
 assert.equal((await f.admin.updateFeedback('b',{showPublicly:true})).error,false);
 f.auth.uid='qa-viewer';assert.equal((await f.admin.updateFeedback('b',{showPublicly:false})).error,true);assert.equal((await f.admin.deleteFeedback('b')).error,true);
 await assert.rejects(()=>f.admin.getFeedbackQuestionVersions());
 assert.ok(f.records.has('publicFeedbackReviews/b'));
});
test('absent, revoked, unassigned and malformed access denies database reads',async()=>{
 const cases=[f=>f.auth.cookie=false,f=>f.failure.auth=true,f=>f.auth.uid='unknown'];
 for(const configure of cases){const f=fixture();configure(f);await assert.rejects(()=>f.admin.getFeedbackEntries());assert.equal(f.reads.length,0);assert.equal(f.writes.length,0);}
 const setting=process.env.ORDERFLY_FEEDBACK_ACCESS;
 try{for(const config of ['invalid','[]','[{"uid":"qa-platform","role":"brand_editor","brandIds":[]}]','[{"uid":"qa-platform","role":"platform_admin"},{"uid":"qa-platform","role":"brand_viewer","brandIds":["b"]}]']){
  process.env.ORDERFLY_FEEDBACK_ACCESS=config;const f=fixture();await assert.rejects(()=>f.admin.getFeedbackEntries());assert.equal(f.reads.length,0);
 }}finally{process.env.ORDERFLY_FEEDBACK_ACCESS=setting;}
});
test('approval publishes only the safe projection, with anonymous default and scope checks',async()=>{
 const f=fixture();f.records.set('feedback/f',row({maskCustomerName:false,internalNote:'PRIVATE_NOTE',orderId:'PRIVATE_ORDER',comment:'Mail private@example.test eller +45 12345678. https://example.test',npsScore:0}));
 const original=f.records.get('feedback/f').comment;
 assert.equal((await f.admin.updateFeedback('f',{showPublicly:true})).error,false);
 const projection=f.records.get('publicFeedbackReviews/f');assert.equal(projection.displayName,'Anonym kunde');assert.equal(projection.rating,4);
 assert.equal(f.records.get('feedback/f').comment,original);assert.equal(f.records.get('feedback/f').internalNote,'PRIVATE_NOTE');
 assert.doesNotMatch(JSON.stringify(projection),/PRIVATE_NOTE|PRIVATE_ORDER|private@example|12345678|https:|customerId|responses|npsScore/);
 assert.equal([...f.records.keys()].filter(k=>k.startsWith('feedbackModerationAudit/')).length,1);
 f.records.set('feedback/bad',row({locationId:'foreign'}));assert.equal((await f.admin.updateFeedback('bad',{showPublicly:true})).error,true);assert.equal(f.records.has('publicFeedbackReviews/bad'),false);
});
test('public review settings default off; only approved reviews from active requested location are returned',async()=>{
 const f=fixture();f.records.set('feedback/legacy',row({showPublicly:true}));f.records.set('feedback/pending',row());f.records.set('feedback/approved',row());
 await f.admin.updateFeedback('approved',{showPublicly:true});assert.equal(await f.reviews.readPublicReviews('b','l'),null);
 await f.settings.writeFeedbackSettings({brandId:'b',publicReviewsEnabled:true});
 const result=await f.reviews.readPublicReviews('b','l');assert.deepEqual(result.reviews.map(r=>r.id),['approved']);
 assert.deepEqual(Object.keys(result.reviews[0]).sort(),['comment','displayName','id','rating','receivedAt'].sort());
 assert.deepEqual((await f.reviews.readPublicReviews('b','l2')).reviews,[]);assert.equal(await f.reviews.readPublicReviews('b','foreign'),null);
 f.records.get('brands/b').status='suspended';assert.equal(await f.reviews.readPublicReviews('b','l'),null);
});
test('explicit name unmasking shows only first name and never another brand customer',async()=>{
 const f=fixture();f.records.set('feedback/f',row());
 await f.admin.updateFeedback('f',{showPublicly:true,maskCustomerName:false});assert.equal(f.records.get('publicFeedbackReviews/f').displayName,'QA');
 f.records.get('customers/c').brandId='other';await f.admin.updateFeedback('f',{publicComment:'Reviewed text'});assert.equal(f.records.get('publicFeedbackReviews/f').displayName,'Anonym kunde');
 assert.equal(f.records.get('feedback/f').comment,'God oplevelse');
});
test('hide, delete and disabling the brand remove public visibility after a fresh read',async()=>{
 const f=fixture();f.records.set('feedback/f',row());await f.settings.writeFeedbackSettings({brandId:'b',publicReviewsEnabled:true});
 await f.admin.updateFeedback('f',{showPublicly:true});await f.admin.updateFeedback('f',{showPublicly:false});assert.deepEqual((await f.reviews.readPublicReviews('b','l')).reviews,[]);
 await f.admin.updateFeedback('f',{showPublicly:true});await f.settings.writeFeedbackSettings({brandId:'b',publicReviewsEnabled:false});assert.equal(await f.reviews.readPublicReviews('b','l'),null);
 await f.settings.writeFeedbackSettings({brandId:'b',publicReviewsEnabled:true});await f.admin.deleteFeedback('f');assert.deepEqual((await f.reviews.readPublicReviews('b','l')).reviews,[]);assert.equal(f.records.has('feedback/f'),false);
});
test('failed moderation writes cannot expose a review or change the private answer',async()=>{
 const f=fixture();f.records.set('feedback/f',row());const original=f.records.get('feedback/f');f.failure.write=true;
 assert.equal((await f.admin.updateFeedback('f',{showPublicly:true})).error,true);assert.equal(f.records.get('feedback/f'),original);assert.equal(f.records.has('publicFeedbackReviews/f'),false);assert.equal(f.writes.length,0);
});
test('public pagination is bounded and never includes another location',async()=>{
 const f=fixture();await f.settings.writeFeedbackSettings({brandId:'b',publicReviewsEnabled:true});
 for(let i=0;i<25;i++)f.records.set('publicFeedbackReviews/p'+String(i).padStart(2,'0'),{brandId:'b',locationId:'l',displayName:'Anonym kunde',rating:4});
 f.records.set('publicFeedbackReviews/other',{brandId:'b',locationId:'l2',displayName:'Private location'});
 const first=await f.reviews.readPublicReviews('b','l'),second=await f.reviews.readPublicReviews('b','l',first.next);
 assert.equal(first.reviews.length,20);assert.equal(second.reviews.length,5);assert.equal(second.next,null);assert.equal(new Set([...first.reviews,...second.reviews].map(r=>r.id)).size,25);
});

test('session endpoint requires same-origin, recently authenticated and explicitly authorized Firebase identity',async()=>{
 const calls=[];let uid='qa-platform',age=0;
 const route=loadTs('src/app/api/feedback-admin/session/route.ts',{
  'server-only':{},'@/lib/url':{getOrigin:async()=> 'https://orderfly.dk'},
  '@/lib/firebase-admin':{getAdminApp:()=>({auth:()=>({
   verifyIdToken:async(token,revoked)=>{calls.push({token,revoked});return{uid,auth_time:Math.floor(Date.now()/1000)-age};},
   createSessionCookie:async()=>{calls.push('created');return 'synthetic-session';},
  })})},
 });
 const request=origin=>new Request('https://orderfly.dk/api/feedback-admin/session',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({idToken:'synthetic-id-token'})});
 assert.equal((await route.POST(request('https://evil.example'))).status,403);assert.equal(calls.length,0);
 uid='not-authorized';assert.equal((await route.POST(request('https://orderfly.dk'))).status,403);assert.equal(calls.includes('created'),false);
 uid='qa-platform';age=600;assert.equal((await route.POST(request('https://orderfly.dk'))).status,403);assert.equal(calls.includes('created'),false);
 age=0;const result=await route.POST(request('https://orderfly.dk'));assert.equal(result.status,200);assert.match(result.headers.get('set-cookie'),/HttpOnly/);assert.match(result.headers.get('set-cookie'),/SameSite=lax/i);assert.equal(result.headers.get('cache-control'),'no-store');assert.ok(calls.filter(c=>typeof c==='object').every(c=>c.revoked===true));
 assert.equal((await route.DELETE(new Request('https://orderfly.dk/api/feedback-admin/session',{method:'DELETE',headers:{origin:'https://evil.example'}}))).status,403);
});

test('public DTO strips unexpected fields even if a stored projection is malformed',()=>{
 const f=fixture(),dto=f.reviews.publicReviewDto('safe',{displayName:'secret@example.test',comment:'Text',rating:0,email:'private@example.test',internalNote:'private',customerId:'c',responses:{q:'secret'}});
 assert.deepEqual(dto,{id:'safe',displayName:'Anonym kunde',comment:'Text',rating:null,receivedAt:null});
});

test('customer history also enforces feedback session and brand boundary without returning private fields',async()=>{
 const f=fixture();const history=loadTs('src/lib/feedback/customer-history.ts',f.mocks);
 f.records.set('feedback/b',row({internalNote:'PRIVATE_NOTE',receivedAt:null}));f.records.set('feedback/other',row({brandId:'other'}));
 f.auth.cookie=false;assert.equal(await history.customerFeedbackHistory('b','c'),null);assert.equal(f.reads.length,0);
 f.auth.cookie=true;f.auth.uid='qa-editor';assert.equal(await history.customerFeedbackHistory('other','c'),null);assert.equal(f.reads.length,0);
 const rows=await history.customerFeedbackHistory('b','c');assert.equal(rows.length,1);assert.equal(rows[0].receivedAt,null);assert.doesNotMatch(JSON.stringify(rows),/PRIVATE_NOTE|private@example|customerId/);
});
