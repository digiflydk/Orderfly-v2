const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture,versionForm,responseForm}=require('../helpers/feedback-fixture.cjs');
const {loadTs}=require('../helpers/load-ts.cjs');
const setup=f=>loadTs('src/lib/feedback/esmeralda-booking-setup.ts',f.mocks);
test('concurrent first invitations create one scoped editable questionnaire without replacing order settings',async()=>{
 const f=fixture(),s=setup(f),brand=s.ESMERALDA_FEEDBACK_BRAND,id=s.ESMERALDA_BOOKING_VERSION;
 f.records.set('brands/'+brand,{name:'Esmeralda'});f.records.set('feedbackSettings/'+brand,{questionVersionId:'v1',bookingQuestionVersionId:null,emailEnabled:false});
 await Promise.all([s.ensureBookingFeedbackQuestions(brand),s.ensureBookingFeedbackQuestions(brand)]);
 const form=f.records.get('feedbackQuestionsVersion/'+id);
 assert.equal(form.questions.length,8);assert.equal(form.brandId,brand);assert.deepEqual(form.orderTypes,['booking']);
 assert.equal(f.writes.filter(p=>p==='feedbackQuestionsVersion/'+id).length,1);
 assert.equal(f.records.get('feedbackSettings/'+brand).questionVersionId,'v1');
 assert.equal(f.records.get('feedbackSettings/'+brand).emailEnabled,false);
 assert.equal((await f.store.readActiveQuestionsForBrand(brand,'booking')).id,id);
 assert.equal((await f.store.readActiveQuestionsForBrand(brand,'pickup')).id,'v1');
 assert.equal((await f.store.readActiveQuestionsForBrand('other','booking')).id,'v1');
 const edit=await f.admin.createOrUpdateQuestionVersion(versionForm({id,versionLabel:'Edited',isActive:'on',orderTypes:['booking']}));
 assert.equal(edit.ok,true,JSON.stringify(edit));await s.ensureBookingFeedbackQuestions(brand);
 assert.equal(f.records.get('feedbackQuestionsVersion/'+id).versionLabel,'Edited');
 assert.equal(f.records.get('feedbackQuestionsVersion/'+id).brandId,brand);
 f.records.get('feedbackQuestionsVersion/'+id).isActive=false;
 await assert.rejects(s.ensureBookingFeedbackQuestions(brand),/active Danish/);
 assert.equal(f.records.get('feedbackQuestionsVersion/'+id).isActive,false);
});
test('explicit selections and unsupported language survive initialization; foreign brand is never seeded',async()=>{
 for(const settings of [{bookingQuestionVersionId:'missing'},{language:'en'}]){
  const f=fixture(),s=setup(f),brand=s.ESMERALDA_FEEDBACK_BRAND;
  f.records.set('brands/'+brand,{name:'Esmeralda'});f.records.set('feedbackSettings/'+brand,settings);
  await assert.rejects(s.ensureBookingFeedbackQuestions(brand));assert.equal(f.writes.length,0);
 }
 const f=fixture(),s=setup(f);await s.ensureBookingFeedbackQuestions('other');assert.equal(f.writes.length,0);
 await assert.rejects(s.ensureBookingFeedbackQuestions(s.ESMERALDA_FEEDBACK_BRAND));assert.equal(f.writes.length,0);
});
test('booking override saves independently and rejects foreign, inactive and non-booking versions',async()=>{
 const f=fixture();f.records.set('feedbackQuestionsVersion/booking',{...f.records.get('feedbackQuestionsVersion/v1'),brandId:'b',orderTypes:['booking']});
 await f.settings.writeFeedbackSettings({brandId:'b',questionVersionId:'v1',bookingQuestionVersionId:'booking'});
 assert.equal((await f.store.readActiveQuestionsForBrand('b','booking')).id,'booking');
 assert.equal((await f.store.readActiveQuestionsForBrand('b','pickup')).id,'v1');
 for(const change of [{brandId:'other'},{isActive:false},{orderTypes:['pickup']}]){
  const original=f.records.get('feedbackQuestionsVersion/booking');f.records.set('feedbackQuestionsVersion/booking',{...original,...change});
  await assert.rejects(f.settings.writeFeedbackSettings({brandId:'b',bookingQuestionVersionId:'booking'}));
  assert.equal(await f.store.readActiveQuestionsForBrand('b','booking'),null);
  f.records.set('feedbackQuestionsVersion/booking',original);
 }
});
test('submission uses booking override and rejects stale or cross-brand form without writes',async()=>{
 const f=fixture();f.records.set('feedbackQuestionsVersion/booking',{...f.records.get('feedbackQuestionsVersion/v1'),brandId:'b',orderTypes:['booking']});
 f.records.set('feedbackSettings/b',{questionVersionId:'en',bookingQuestionVersionId:'booking'});
 const form=()=>responseForm({sourceType:'booking',sourceId:'booking',invitationToken:'valid',questionVersionId:'booking'});
 assert.equal((await f.public.submitFeedbackAction(null,responseForm({sourceType:'booking',sourceId:'booking',invitationToken:'valid'}))).error,true);
 f.records.get('feedbackQuestionsVersion/booking').brandId='other';assert.equal((await f.public.submitFeedbackAction(null,form())).error,true);assert.equal(f.writes.length,0);
 f.records.get('feedbackQuestionsVersion/booking').brandId='b';
 await assert.rejects(f.public.submitFeedbackAction(null,form()),e=>e.digest==='NEXT_REDIRECT');
 assert.equal(f.records.get('integrationFeedbackInvitations/i').status,'submitted');
});
test('machine route checks form readiness after verified invitation and never enqueues a second email',async()=>{
 const calls=[];let ready=true;process.env.ORDERFLY_ESMERALDA_INTEGRATION_SECRET='s'.repeat(32);
 const route=loadTs('src/app/api/integrations/esmeralda/feedback/invitations/route.ts',{
  'server-only':{},
  '@/lib/integrations/esmeralda-consumer-customer':{IntegrationBoundaryError:class extends Error{}},
  '@/lib/integrations/esmeralda-feedback-integration':{createBookingFeedbackInvitation:async()=>{calls.push('verified');return{invitation:{organization_id:'b',invitation_id:'i',status:'active'},token:'token'};}},
  '@/lib/feedback/esmeralda-booking-setup':{ensureBookingFeedbackQuestions:async()=>{calls.push('ready');if(!ready)throw Error('Form disabled');}},
  '@/lib/feedback/mail-queue':{queueBookingFeedback:()=>{throw Error('Duplicate sender');}},
 });
 const body={organization_id:'b',location_id:'l',booking_id:'booking',customer_id:'c',full_name:'QA Guest',email:'qa@example.test',starts_at:'2026-09-15T10:00:00Z'};
 const request=secret=>new Request('https://orderfly.test/api/integrations/esmeralda/feedback/invitations',{method:'POST',headers:{'x-esmeralda-integration-secret':secret},body:JSON.stringify(body)});
 assert.equal((await route.POST(request('wrong'))).status,401);assert.deepEqual(calls,[]);
 for(let i=0;i<2;i++){const result=await route.POST(request('s'.repeat(32)));assert.equal(result.status,200);assert.equal((await result.json()).email_queue,'not_queued');}
 assert.deepEqual(calls,['verified','ready','verified','ready']);
 ready=false;const failed=await route.POST(request('s'.repeat(32)));assert.equal(failed.status,500);assert.equal((await failed.json()).feedback_url,undefined);
});
