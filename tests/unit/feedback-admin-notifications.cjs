const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture,responseForm}=require('../helpers/feedback-fixture.cjs');
const redirected=promise=>assert.rejects(()=>promise,error=>error.digest==='NEXT_REDIRECT');
function setup(t){
 const values={ORDERFLY_NOTIFICATION_ENDPOINT:'https://notifications.example.test/enqueue',ORDERFLY_NOTIFICATION_ORGANIZATION_ID:'11111111-1111-4111-8111-111111111111',ORDERFLY_NOTIFICATION_SECRET:'synthetic-private-key-for-admin-feedback-tests',ORDERFLY_FEEDBACK_ADMIN_NOTIFICATIONS:JSON.stringify({b:{organizationId:'11111111-1111-4111-8111-111111111111',email:'admin@example.test'}})};
 const previous=Object.fromEntries(Object.keys(values).map(k=>[k,process.env[k]]));Object.assign(process.env,values);
 t.after(()=>{for(const[k,v]of Object.entries(previous))v===undefined?delete process.env[k]:process.env[k]=v;});
 const f=fixture();f.events=[];f.provider=()=>({eligible:async()=>true,send:async(...args)=>f.events.push(args)});
 f.key=f.invitations.feedbackSourceKey('b','commerce_order','order');f.job=()=>f.records.get('feedbackMailJobs/'+f.key+'-adminNotification');return f;
}
test('every new order or booking reply queues exactly one admin mail independently of customer mail',async t=>{
 const f=setup(t);await Promise.all([redirected(f.public.submitFeedbackAction(null,responseForm())),redirected(f.public.submitFeedbackAction(null,responseForm()))]);
 assert.equal([...f.records.keys()].filter(k=>k.startsWith('feedbackMailJobs/')).length,1);assert.equal(f.job().recipientEmail,'admin@example.test');
 await f.mailWorker.runFeedbackMailWorker(f.provider);assert.equal(f.events.length,1);assert.equal(f.events[0][1],'adminNotification');
 assert.equal(f.events[0][2],'admin@example.test');assert.equal(f.events[0][3].adminUrl,'https://orderfly.dk/superadmin/feedback/'+f.key);
 assert.doesNotMatch(JSON.stringify(f.events),/private@example|invitationToken|responses|QA Guest/);
 await f.mailWorker.runFeedbackMailWorker(f.provider);assert.equal(f.events.length,1);
 await redirected(f.public.submitFeedbackAction(null,responseForm({sourceType:'booking',sourceId:'booking',invitationToken:'valid'})));
 assert.equal([...f.records.values()].filter(v=>v.kind==='adminNotification').length,2);
});
test('feedback and notification persist together or neither persists',async t=>{
 const f=setup(t);f.failure.write=true;
 assert.equal((await f.public.submitFeedbackAction(null,responseForm())).error,true);
 assert.equal(f.job(),undefined);assert.equal(f.records.has('feedback/'+f.key),false);
});
test('disabled, removed, changed-recipient and cross-brand feedback suppress pending notifications',async t=>{
 for(const update of [f=>f.records.set('feedbackSettings/b',{adminNotificationsEnabled:false}),f=>f.records.delete('feedback/'+f.key),f=>f.records.set('feedbackSettings/b',{adminNotificationEmail:'changed@example.test'}),f=>f.records.get('feedback/'+f.key).brandId='other']){
  const f=setup(t);await redirected(f.public.submitFeedbackAction(null,responseForm()));update(f);
  assert.equal((await f.mailWorker.runFeedbackMailWorker(f.provider)).suppressed,1);assert.equal(f.events.length,0);
 }
});
test('legacy replies and brands without a configured recipient do not create new notifications',async t=>{
 const f=setup(t);f.records.set('feedback/legacy',{brandId:'b',customerId:'c',orderId:'order'});await redirected(f.public.submitFeedbackAction(null,responseForm()));assert.equal(f.job(),undefined);
 delete process.env.ORDERFLY_FEEDBACK_ADMIN_NOTIFICATIONS;const other=fixture();await redirected(other.public.submitFeedbackAction(null,responseForm()));assert.equal([...other.records.values()].filter(v=>v.kind==='adminNotification').length,0);
});
test('uncertain dispatch is never blindly retried and admin history omits the recipient',async t=>{
 const f=setup(t);await redirected(f.public.submitFeedbackAction(null,responseForm()));
 const provider=()=>({eligible:async()=>true,send:async()=>{throw new f.mailProvider.FeedbackMailError('unknown',true)}});
 await f.mailWorker.runFeedbackMailWorker(provider);assert.equal(f.job().state,'uncertain');
 await f.mailWorker.runFeedbackMailWorker(f.provider);assert.equal(f.events.length,0);
 assert.doesNotMatch(JSON.stringify(await f.mailAdmin.feedbackMailJobs('b')),/admin@example|private@example|recipientEmail/);
 f.auth.uid='qa-viewer';await assert.rejects(f.mailAdmin.retryFeedbackMailJob(f.key+'-adminNotification',true));
 f.auth.uid='qa-editor';await f.mailAdmin.retryFeedbackMailJob(f.key+'-adminNotification',true);assert.equal(f.job().state,'pending');
});
test('admin recipient settings are brand-scoped and require a valid configured address',async t=>{
 const f=setup(t);f.auth.uid='qa-editor';await f.settings.writeFeedbackSettings({brandId:'b',adminNotificationsEnabled:true,adminNotificationEmail:' New@example.test '});
 assert.equal((await f.settings.readFeedbackSettings('b')).adminNotificationEmail,'new@example.test');
 await assert.rejects(f.settings.writeFeedbackSettings({brandId:'other',adminNotificationsEnabled:true,adminNotificationEmail:'new@example.test'}));
 await assert.rejects(f.settings.writeFeedbackSettings({brandId:'b',adminNotificationEmail:'invalid'}));
 await assert.rejects(f.settings.writeFeedbackSettings({brandId:'b',adminNotificationEmail:null,adminNotificationsEnabled:true}));
});
test('provider sends the received template through the brand organization with a stable event ID',async t=>{
 const f=setup(t);let payload;
 const config={platform:{endpoint:process.env.ORDERFLY_NOTIFICATION_ENDPOINT,organizationId:process.env.ORDERFLY_NOTIFICATION_ORGANIZATION_ID,secret:process.env.ORDERFLY_NOTIFICATION_SECRET}};
 const provider=new f.mailProvider.FeedbackMailProvider(config,async(url,options)=>{payload=JSON.parse(options.body);return new Response(null,{status:202})});
 await provider.send('fixed-event','adminNotification','admin@example.test',{language:'da',brandId:'b',feedbackId:f.key,adminUrl:'https://orderfly.dk/superadmin/feedback/'+f.key});
 assert.equal(payload.template_key,'orderfly.feedback.received');assert.equal(payload.idempotency_key,'fixed-event');assert.equal(payload.organization_id,config.platform.organizationId);assert.deepEqual(payload.related_entity,{type:'feedback',id:f.key});
});
