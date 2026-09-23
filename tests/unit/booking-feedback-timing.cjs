const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture}=require('../helpers/feedback-fixture.cjs');
const {loadTs}=require('../helpers/load-ts.cjs');
function setup(t){
 const keys=['ORDERFLY_NOTIFICATION_ENDPOINT','ORDERFLY_NOTIFICATION_ORGANIZATION_ID','ORDERFLY_NOTIFICATION_SECRET','ORDERFLY_FEEDBACK_TOKEN_SECRET'];const before=keys.map(k=>process.env[k]);t.after(()=>keys.forEach((k,i)=>before[i]===undefined?delete process.env[k]:process.env[k]=before[i]));
 process.env.ORDERFLY_NOTIFICATION_ENDPOINT='https://notifications.test/enqueue';process.env.ORDERFLY_NOTIFICATION_ORGANIZATION_ID='11111111-1111-4111-8111-111111111111';process.env.ORDERFLY_NOTIFICATION_SECRET='x'.repeat(40);process.env.ORDERFLY_FEEDBACK_TOKEN_SECRET='y'.repeat(40);
 const f=fixture();f.records.set('feedbackSettings/b',{emailEnabled:true,bookingAutomaticRequests:true,bookingDelayMinutes:35,bookingMaxReminders:1,bookingReminderAfterMinutes:90});return f;
}
const source={brandId:'b',locationId:'l',customerId:'c',sourceType:'booking',sourceId:'booking',invitationId:'i',invitationToken:'valid'};
test('booking uses planned end plus minutes, reschedules pending work and keeps one identity',async t=>{
 const f=setup(t),end=Date.now()+3600000;
 const ids=await Promise.all(Array.from({length:5},()=>f.mailQueue.queueBookingFeedback(source,new Date(end).toISOString())));assert.equal(new Set(ids).size,1);
 const job=f.records.get('feedbackMailJobs/'+ids[0]);assert.equal(job.nextAttemptAt,end+35*60000);const event=job.eventId;
 f.records.get('feedbackSettings/b').bookingDelayMinutes=45;
 await f.mailQueue.queueBookingFeedback(source,new Date(end-1800000).toISOString());assert.equal(job.eventId,event);
 assert.equal(f.records.get('feedbackMailJobs/'+ids[0]).nextAttemptAt,end-1800000+35*60000);
 f.records.get('feedbackMailJobs/'+ids[0]).state='accepted';await f.mailQueue.queueBookingFeedback(source,new Date(end+3600000).toISOString());assert.equal(f.records.get('feedbackMailJobs/'+ids[0]).state,'accepted');
});
test('booking opt-in is independent of orders; invalid end and disabled mail never enqueue',async t=>{
 const f=setup(t);assert.equal(await f.mailQueue.queueBookingFeedback(source,null),null);assert.equal(await f.mailQueue.queueBookingFeedback(source,'invalid'),null);
 f.records.get('feedbackSettings/b').bookingAutomaticRequests=false;f.records.get('feedbackSettings/b').automaticRequests=true;assert.equal(await f.mailQueue.queueBookingFeedback(source,new Date().toISOString()),null);
 f.records.get('feedbackSettings/b').bookingAutomaticRequests=true;f.records.get('feedbackSettings/b').emailEnabled=false;assert.equal(await f.mailQueue.queueBookingFeedback(source,new Date().toISOString()),null);
});
test('booking reminder supports minutes and stops when customer has answered',async t=>{
 const f=setup(t);f.records.get('feedbackSettings/b').bookingDelayMinutes=0;
 const id=await f.mailQueue.queueBookingFeedback(source,new Date(Date.now()-60000).toISOString());const sent=[];const provider=()=>({eligible:async()=>true,send:async(...args)=>sent.push(args)});
 const before=Date.now();await f.mailWorker.runFeedbackMailWorker(provider);assert.equal(sent.length,1);
 const reminder=f.records.get('feedbackMailJobs/'+id.replace('-invitation','-reminder'));assert.equal(reminder.reminderDelayMinutes,90);assert.ok(reminder.nextAttemptAt>=before+90*60000);
 f.records.get('integrationFeedbackInvitations/i').status='submitted';await f.mailWorker.runFeedbackMailWorker(provider,Date.now()+100*60000);assert.equal(sent.length,1);
});
test('invalid timing settings reject without silently enabling automation',()=>{
 const api=loadTs('src/lib/feedback/mail-config.ts',{'server-only':{}});
 for(const input of [{bookingDelayMinutes:-1},{bookingDelayMinutes:1.5},{bookingReminderAfterMinutes:0},{bookingReminderAfterMinutes:20161}])assert.equal(api.feedbackAutomationSchema.safeParse(input).success,false);
 assert.equal(api.feedbackAutomation({}).bookingAutomaticRequests,false);
});
function deliveryFixture(t){
 const f=setup(t),booking='33333333-3333-4333-8333-333333333333',event='44444444-4444-4444-8444-444444444444';
 const scope={organization_id:process.env.ORDERFLY_NOTIFICATION_ORGANIZATION_ID,brand_id:'b',location_id:'l',customer_id:'c',booking_id:booking,event_id:event,kind:'invitation',recipient_email:'private@example.test'};
 const key=f.invitations.feedbackSourceKey('b','booking',booking);
 f.records.set('feedbackMailJobs/'+key+'-invitation',{...source,sourceId:booking,kind:'invitation',eventId:event,state:'accepted',bookingDelayMinutes:35});
 f.mocks['@/lib/integrations/order-mail-diagnostics']={ESMERALDA_MAIL_SCOPE:{organization_id:scope.organization_id,brand_id:'b'}};
 f.mocks['@/lib/integrations/esmeralda-feedback-integration']={resolveBookingFeedbackInvitationToken:async()=>({organization_id:'b',location_id:'l',customer_id:'c',booking_id:booking,status:f.records.get('integrationFeedbackInvitations/i').status})};
 return {...f,scope,key,delivery:loadTs('src/lib/feedback/booking-delivery.ts',f.mocks)};
}
test('final delivery is read-only, scoped, and stops for replies, disabled automation and recipient changes',async t=>{
 const f=deliveryFixture(t);assert.deepEqual(await f.delivery.bookingDeliveryDecision(f.scope),{eligible:true,delay_minutes:35});assert.equal(f.writes.length,0);
 for(const patch of [{event_id:'55555555-5555-4555-8555-555555555555'},{location_id:'foreign'},{customer_id:'foreign'},{recipient_email:'different@example.test'}])assert.deepEqual(await f.delivery.bookingDeliveryDecision({...f.scope,...patch}),{eligible:false});
 f.records.get('integrationFeedbackInvitations/i').status='submitted';assert.deepEqual(await f.delivery.bookingDeliveryDecision(f.scope),{eligible:false});
 f.records.get('integrationFeedbackInvitations/i').status='active';f.records.get('feedbackSettings/b').bookingAutomaticRequests=false;assert.deepEqual(await f.delivery.bookingDeliveryDecision(f.scope),{eligible:false});
 assert.equal(f.writes.length,0);
});
test('delivery endpoint fails closed before reads on bad secret, payload or tenant',async()=>{
 let calls=0;const {z}=require('zod');const route=loadTs('src/app/api/integrations/esmeralda/feedback/delivery-check/route.ts',{
 '@/lib/integrations/esmeralda-customer-contract':{isValidMachineSecret:(_,secret)=>secret==='valid'},
 '@/lib/feedback/booking-delivery':{bookingDeliveryInput:z.object({scope:z.literal('allowed')}).strict(),bookingDeliveryDecision:async()=>{calls++;throw Error('private database detail');}},
 });
 const req=(secret,body)=>new Request('https://orderfly.test/api/check',{method:'POST',headers:{'x-esmeralda-integration-secret':secret},body:JSON.stringify(body)});
 assert.equal((await route.POST(req('bad',{scope:'allowed'}))).status,401);assert.equal((await route.POST(req('valid',{scope:'foreign'}))).status,400);assert.equal(calls,0);
 const response=await route.POST(req('valid',{scope:'allowed'}));assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');assert.doesNotMatch(await response.text(),/private database/);
});
