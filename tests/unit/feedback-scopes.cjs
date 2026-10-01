const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture,versionForm,responseForm,questions}=require('../helpers/feedback-fixture.cjs');
const redirected=promise=>assert.rejects(()=>promise,error=>error.digest==='NEXT_REDIRECT');

test('default, brand and legacy versions resolve within the brand, language and experience',async()=>{
 const f=fixture();
 const b=await f.admin.createOrUpdateQuestionVersion(versionForm({scope:'brand',brandId:'b',isActive:'on',orderTypes:['pickup']}));
 const other=await f.admin.createOrUpdateQuestionVersion(versionForm({scope:'brand',brandId:'other',isActive:'on',orderTypes:['pickup']}));
 assert.equal(b.ok,true);assert.equal(other.ok,true);
 assert.equal((await f.store.readActiveQuestionsForBrand('b','pickup')).id,b.id);
 assert.equal((await f.store.readActiveQuestionsForBrand('other','pickup')).id,other.id);
 assert.equal((await f.store.readActiveQuestionsForBrand('unconfigured','pickup')).id,'v1');
 assert.equal((await f.store.readActiveQuestionsForBrand('b','booking')).id,'v1');
 assert.equal((await f.store.readActiveQuestionsForBrand('b','pickup','en')).id,'en');
 assert.equal((await f.store.readActiveQuestions('pickup')).id,'v1');
 assert.ok(!(await f.store.readQuestionVersions(['b'])).some(v=>v.id===other.id));
});
test('activation conflict is per scope; brand identity and platform authorization are required',async()=>{
 const f=fixture(),form={scope:'brand',brandId:'b',isActive:'on',orderTypes:['pickup']};
 const results=await Promise.all([f.admin.createOrUpdateQuestionVersion(versionForm(form)),f.admin.createOrUpdateQuestionVersion(versionForm(form))]);
 assert.equal(results.filter(r=>r.ok).length,1);
 for(const data of [{scope:'brand'},{scope:'brand',brandId:'missing'},{scope:'default',brandId:'b'},{scope:'anything'}]){
  const before=f.writes.length;assert.equal((await f.admin.createOrUpdateQuestionVersion(versionForm(data))).ok,false);assert.equal(f.writes.length,before);
 }
 f.auth.uid='qa-editor';assert.equal((await f.admin.createOrUpdateQuestionVersion(versionForm(form))).ok,false);
});
test('booking-only selection preserves pickup fallback and the actual pickup submission',async()=>{
 const f=fixture();f.records.get('feedbackQuestionsVersion/v1').orderTypes=['pickup'];
 f.records.set('feedbackQuestionsVersion/booking',{scope:'brand',brandId:'b',versionLabel:'Booking',isActive:true,language:'da',orderTypes:['booking'],questions});
 await f.settings.writeFeedbackSettings({brandId:'b',questionVersionId:'booking'});
 assert.equal((await f.store.readActiveQuestionsForBrand('b','booking')).id,'booking');
 assert.equal((await f.store.readActiveQuestionsForBrand('b','pickup')).id,'v1');
 await redirected(f.public.submitFeedbackAction(null,responseForm()));
 assert.equal([...f.records.keys()].filter(k=>k.startsWith('feedback/')).length,1);
});
test('foreign selections and submissions cannot use another brand questionnaire',async()=>{
 const f=fixture();f.records.set('feedbackQuestionsVersion/foreign',{scope:'brand',brandId:'other',versionLabel:'Foreign',isActive:true,language:'da',orderTypes:['pickup'],questions});
 await assert.rejects(f.settings.writeFeedbackSettings({brandId:'b',questionVersionId:'foreign'}));
 f.records.set('feedbackSettings/b',{questionVersionId:'foreign'});
 assert.equal((await f.store.readActiveQuestionsForBrand('b','pickup')).id,'v1');
 assert.equal((await f.public.submitFeedbackAction(null,responseForm({questionVersionId:'foreign'}))).error,true);
 assert.equal([...f.records.keys()].filter(k=>k.startsWith('feedback/')).length,0);
});
test('inactive selection falls back and a brand override takes precedence over a selected default',async()=>{
 const f=fixture();f.records.set('feedbackQuestionsVersion/local',{scope:'brand',brandId:'b',versionLabel:'Local',isActive:true,language:'da',orderTypes:['pickup'],questions});
 f.records.set('feedbackSettings/b',{questionVersionId:'v1'});
 assert.equal((await f.store.readActiveQuestionsForBrand('b','pickup')).id,'local');
 assert.equal((await f.public.submitFeedbackAction(null,responseForm())).error,true);
 f.records.get('feedbackQuestionsVersion/local').isActive=false;f.records.get('feedbackSettings/b').questionVersionId='local';
 assert.equal((await f.store.readActiveQuestionsForBrand('b','pickup')).id,'v1');
 await redirected(f.public.submitFeedbackAction(null,responseForm()));
});
test('a questionnaire changed during submission rejects stale answers atomically',async()=>{
 const f=fixture(),transaction=f.db.runTransaction;
 f.db.runTransaction=callback=>{f.records.get('feedbackQuestionsVersion/v1').questions=[...questions,{questionId:'new',label:'Nyt spørgsmål',type:'stars',isRequired:true}];return transaction(callback);};
 assert.equal((await f.public.submitFeedbackAction(null,responseForm())).error,true);
 assert.equal([...f.records.keys()].filter(k=>k.startsWith('feedback/')).length,0);
});
test('editor UI capabilities are live and restricted to brands with full edit grants',async()=>{
 const f=fixture();f.auth.uid='qa-editor';const policy=f.records.get('platformAdminControl/access-v1');
 policy.companies.push({id:'other',active:true,locationIds:['foreign'],orderflyBrandIds:['other'],opsflyOrganizationId:null});
 policy.roles.push({id:'other-viewer',name:'Other reader',companyId:'other',kind:'company_user',permissions:['orderfly.feedback:view'],active:true});
 policy.memberships.push({...policy.memberships.find(m=>m.id==='editor'),id:'other-member',companyId:'other',roleIds:['other-viewer']});
 const editor=await f.access.requireFeedbackAccess();assert.deepEqual(new Set(editor.brandIds),new Set(['b','other']));
 assert.equal(f.access.canEditFeedbackBrand(editor,'b'),true);assert.equal(f.access.canEditFeedbackBrand(editor,'other'),false);
 f.auth.uid='qa-viewer';const viewer=await f.access.requireFeedbackAccess();assert.equal(f.access.canEditFeedbackBrand(viewer,'b'),false);
});
