const {test}=require('node:test');const assert=require('node:assert/strict');
const {fixture,versionForm,responseForm,questions}=require('../helpers/feedback-fixture.cjs');
const {loadTs}=require('../helpers/load-ts.cjs');
const validate=loadTs('src/lib/feedback/response-validation.ts').validateFeedbackResponses;
const redirected=promise=>assert.rejects(()=>promise,error=>error.digest==='NEXT_REDIRECT');
test('create/list/reopen/edit one canonical version; creation date preserved',async()=>{
 const f=fixture(),saved=await f.admin.createOrUpdateQuestionVersion(versionForm());assert.equal(saved.ok,true,JSON.stringify(saved));
 assert.equal((await f.admin.getFeedbackQuestionVersions()).find(v=>v.id===saved.id).versionLabel,'Ny version');
 const original=f.records.get('feedbackQuestionsVersion/'+saved.id).createdAt;
 assert.equal((await f.store.readQuestionVersion('v1')).id,'v1');assert.ok((await f.store.readQuestionVersion('v1')).createdAt instanceof Date);
 const edited=await f.admin.createOrUpdateQuestionVersion(versionForm({id:saved.id,versionLabel:'Rettet'}));assert.equal(edited.ok,true);
 assert.equal(f.records.get('feedbackQuestionsVersion/'+saved.id).createdAt,original);
});
for(const override of [{questions:'[]'},{questions:'invalid'},{questions:JSON.stringify([questions[0],questions[0]])},{questions:JSON.stringify([{...questions[0],type:'tags',options:[]}])},{questions:JSON.stringify([{...questions[0],type:'tags',options:[{id:'x',label:'Food'}],minSelection:2,maxSelection:1}])},{orderTypes:[]},{id:'missing'}])test('reject invalid version '+JSON.stringify(override),async()=>{
 const f=fixture(),result=await f.admin.createOrUpdateQuestionVersion(versionForm(override));assert.equal(result.ok,false);assert.equal(f.writes.length,0);
});
test('activation conflicts reject without disabling existing types; language-specific lookup',async()=>{
 const f=fixture();const conflict=await f.admin.createOrUpdateQuestionVersion(versionForm({isActive:'on',orderTypes:['pickup']}));assert.equal(conflict.ok,false);assert.match(conflict.error,/Deactivate/);
 f.records.set('feedbackQuestionsVersion/aaa',{versionLabel:'Broken legacy',isActive:true,language:'da',orderTypes:['pickup'],questions:[]});
 assert.equal((await f.public.getActiveFeedbackQuestionsForExperience('pickup','da')).id,'v1');
 assert.equal((await f.public.getActiveFeedbackQuestionsForExperience('pickup','en')).id,'en');assert.equal(await f.public.getActiveFeedbackQuestionsForExperience('delivery','da'),null);
});
test('concurrent activation allows only one matching active version',async()=>{
 const f=fixture();const results=await Promise.all([f.admin.createOrUpdateQuestionVersion(versionForm({isActive:'on'})),f.admin.createOrUpdateQuestionVersion(versionForm({isActive:'on'}))]);assert.equal(results.filter(r=>r.ok).length,1);
});
for(const value of [null,false,true,'',[],{},-1,11,1.5])test('NPS rejects '+JSON.stringify(value),()=>{
 assert.equal(validate([questions[1]],{nps:{answer:value}}).ok,false);
});
test('NPS zero, required stars and trusted labels are preserved',()=>{
 const result=validate(questions,{rating:{answer:4,type:'text',questionLabel:'forged'},nps:{answer:0}});assert.equal(result.ok,true);assert.equal(result.responses.nps.answer,0);assert.equal(result.responses.rating.questionLabel,questions[0].label);
 assert.equal(validate(questions,{}).ok,false);assert.equal(validate([],{ }).ok,false);
});
test('commerce retries and concurrent submissions create one answer and preserve existing legacy feedback',async()=>{
 const f=fixture();await Promise.all([redirected(f.public.submitFeedbackAction(null,responseForm())),redirected(f.public.submitFeedbackAction(null,responseForm()))]);
 assert.equal([...f.records.keys()].filter(k=>k.startsWith('feedback/')).length,1);
 const legacy=fixture();legacy.records.set('feedback/old',{orderId:'order',customerId:'c',brandId:'b'});await redirected(legacy.public.submitFeedbackAction(null,responseForm()));assert.equal([...legacy.records.keys()].filter(k=>k.startsWith('feedback/')).length,1);
});
test('booking invitation is consumed once; invalid token is rejected',async()=>{
 const f=fixture(),data=responseForm({sourceType:'booking',sourceId:'booking',invitationToken:'valid'});
 await redirected(f.public.submitFeedbackAction(null,data));await redirected(f.public.submitFeedbackAction(null,data));assert.equal(f.records.get('integrationFeedbackInvitations/i').status,'submitted');assert.equal([...f.records.keys()].filter(k=>k.startsWith('feedback/')).length,1);
 const failed=await f.public.submitFeedbackAction(null,responseForm({sourceType:'booking',sourceId:'booking',invitationToken:'invalid'}));assert.equal(failed.error,true);
});
test('wrong customer, inactive version, language mismatch and invalid answers write nothing',async()=>{
 for(const overrides of [{customerId:'other'},{language:'en'},{responses:'invalid'},{responses:'{}'}]){const f=fixture();assert.equal((await f.public.submitFeedbackAction(null,responseForm(overrides))).error,true);assert.equal(f.writes.length,0);}
 const f=fixture();f.records.get('feedbackQuestionsVersion/v1').isActive=false;assert.equal((await f.public.submitFeedbackAction(null,responseForm())).error,true);assert.equal(f.writes.length,0);
});
test('moderation cannot create records or change tenant/rating; note and booleans can update',async()=>{
 const f=fixture();f.records.set('feedback/f',{brandId:'b',locationId:'l',customerId:'c',rating:4});
 for(const data of [{brandId:'evil'},{rating:1},{showPublicly:'true'},{}])assert.equal((await f.admin.updateFeedback('f',data)).error,true);
 assert.equal((await f.admin.updateFeedback('missing',{internalNote:'note'})).error,true);
 assert.equal((await f.admin.updateFeedback('f',{internalNote:'note',showPublicly:true})).error,false);assert.equal(f.records.get('feedback/f').rating,4);
 f.failure.auth=true;assert.equal((await f.admin.updateFeedback('f',{showPublicly:false})).error,true);
});
test('feedback canonical id and nested timestamps serialize; date fallback; mail is never falsely reported sent',async()=>{
 const f=fixture();f.records.set('feedback/f',{id:'old',brandId:'b',receivedAt:undefined,nested:{time:f.records.get('feedbackQuestionsVersion/v1').createdAt}});
 const saved=await f.admin.getFeedbackById('f');assert.equal(saved.id,'f');assert.ok(saved.nested.time instanceof Date);
 assert.equal((await f.admin.getFeedbackEntries()).length,1);assert.ok((await f.admin.sendFeedbackRequestEmail('order')).error);
 assert.equal(loadTs('src/lib/feedback/display.ts').feedbackDate('invalid'),'Dato mangler');
});
test('debug route exposes no feedback data and reserved question IDs are rejected',async()=>{
 const response=await loadTs('src/app/api/debug/feedback/route.ts').GET();assert.equal(response.status,404);assert.deepEqual(await response.json(),{error:'Not found'});
 const f=fixture();const result=await f.admin.createOrUpdateQuestionVersion(versionForm({questions:JSON.stringify([{...questions[0],questionId:'__proto__'}])}));assert.equal(result.ok,false);assert.equal(f.writes.length,0);
});
