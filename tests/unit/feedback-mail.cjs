const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture,responseForm}=require('../helpers/feedback-fixture.cjs');
const {loadTs}=require('../helpers/load-ts.cjs');
const envKeys=['ORDERFLY_NOTIFICATION_ENDPOINT','ORDERFLY_NOTIFICATION_ORGANIZATION_ID','ORDERFLY_NOTIFICATION_SECRET','ORDERFLY_FEEDBACK_TOKEN_SECRET','ORDERFLY_FEEDBACK_WORKER_SECRET'];
function setup(t){
 const before=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));t.after(()=>{for(const[k,v]of Object.entries(before))v===undefined?delete process.env[k]:process.env[k]=v;});
 process.env.ORDERFLY_NOTIFICATION_ENDPOINT='https://notifications.example.test/functions/v1/orderfly-notification-enqueue';
 process.env.ORDERFLY_NOTIFICATION_ORGANIZATION_ID='11111111-1111-4111-8111-111111111111';
 process.env.ORDERFLY_NOTIFICATION_SECRET='synthetic-notification-secret-for-fixtures-only';
 process.env.ORDERFLY_FEEDBACK_TOKEN_SECRET='synthetic-token-key-for-fixtures-only';process.env.ORDERFLY_FEEDBACK_WORKER_SECRET='synthetic-worker-key-for-fixtures-only';
 const f=fixture();f.records.get('customers/c').marketingConsent=true;
 f.records.set('feedbackSettings/b',{emailEnabled:true,automaticRequests:true,delayHours:2,maxReminders:1,reminderAfterHours:72,autoReplyEnabled:true,language:'da'});
 f.events=[];f.provider=()=>({eligible:async()=>true,send:async(...args)=>f.events.push(args)});
 f.key=f.invitations.feedbackSourceKey('b','commerce_order','order');
 f.job=kind=>f.records.get('feedbackMailJobs/'+f.key+'-'+kind);
 return f;
}

test('manual/automatic queue is idempotent under concurrent calls and honours zero delay',async t=>{
 const f=setup(t);const before=Date.now();await Promise.all(Array.from({length:4},()=>f.mailQueue.queueOrderFeedback('order',true)));
 assert.equal([...f.records.keys()].filter(k=>k.startsWith('feedbackMailJobs/')).length,1);assert.ok(f.job('invitation').nextAttemptAt>=before+7200000);
 assert.equal([...f.records.keys()].filter(k=>k.startsWith('feedbackInvitations/')).length,1);
 f.records.get('feedbackSettings/b').delayHours=0;f.records.delete('feedbackMailJobs/'+f.key+'-invitation');await f.mailQueue.queueOrderFeedback('order',true);assert.ok(f.job('invitation').nextAttemptAt<=Date.now());
});
test('disabled automation is inert; unconfigured or invalid source cannot queue',async t=>{
 const f=setup(t);f.records.get('feedbackSettings/b').automaticRequests=false;assert.equal(await f.mailQueue.queueOrderFeedback('order',true),null);
 await f.mailQueue.queueOrderFeedback('order');assert.ok(f.job('invitation'));
 for(const update of [{status:'Canceled'},{paymentStatus:'Pending'},{refundedAmount:1},{refundedAmountOre:1},{locationId:'foreign'},{customerDetails:{id:'missing'}}]){
  const g=setup(t);Object.assign(g.records.get('orders/order'),update);await assert.rejects(()=>g.mailQueue.queueOrderFeedback('order'));assert.equal(g.writes.length,0);
 }
 delete process.env.ORDERFLY_NOTIFICATION_ENDPOINT;await assert.rejects(()=>f.mailQueue.queueOrderFeedback('order'));
});
test('signed order invitations reject tampering, expiry and revocation',async t=>{
 const f=setup(t);await f.mailQueue.queueOrderFeedback('order');const data=f.records.get('feedbackInvitations/'+f.key);
 const token=f.invitations.signOrderFeedbackInvitation(f.key,data.expiresAt);assert.equal((await f.invitations.resolveOrderFeedbackInvitation(token)).sourceId,'order');
 assert.equal(await f.invitations.resolveOrderFeedbackInvitation(token+'x'),null);
 assert.equal(await f.invitations.resolveOrderFeedbackInvitation(f.invitations.signOrderFeedbackInvitation(f.key,Date.now()-1)),null);
 data.status='revoked';assert.equal(await f.invitations.resolveOrderFeedbackInvitation(token),null);
});
test('workers dispatch one invitation and create at most one reminder atomically',async t=>{
 const f=setup(t);await f.mailQueue.queueOrderFeedback('order');await Promise.all([f.mailWorker.runFeedbackMailWorker(f.provider),f.mailWorker.runFeedbackMailWorker(f.provider)]);
 assert.equal(f.events.length,1);assert.equal(f.job('invitation').state,'accepted');assert.ok(f.job('invitation').acceptedAt);assert.equal(f.job('reminder').state,'pending');
 assert.ok(f.job('reminder').nextAttemptAt>=f.job('invitation').acceptedAt+72*3600000-10);
 const link=new URL(f.events[0][3].feedbackUrl);assert.equal(link.origin,'https://orderfly.dk');assert.ok(await f.invitations.resolveOrderFeedbackInvitation(link.searchParams.get('orderToken')));
 await f.mailWorker.runFeedbackMailWorker(f.provider);assert.equal(f.events.length,1);
 await f.mailWorker.runFeedbackMailWorker(f.provider,Date.now()+73*3600000);assert.equal(f.events.length,2);assert.equal(f.job('reminder').state,'accepted');
 await f.mailWorker.runFeedbackMailWorker(f.provider,Date.now()+74*3600000);assert.equal(f.events.length,2);
});
test('reply, cancellation, missing recipient, foreign customer and inactive location suppress pending mail',async t=>{
 for(const update of [f=>f.records.set('feedback/'+f.key,{brandId:'b'}),f=>f.records.get('orders/order').status='Canceled',f=>f.records.get('customers/c').email='',f=>f.records.get('customers/c').brandId='other',f=>f.records.get('locations/l').isActive=false]){
  const f=setup(t);await f.mailQueue.queueOrderFeedback('order');update(f);const result=await f.mailWorker.runFeedbackMailWorker(f.provider);assert.equal(result.suppressed,1);assert.equal(f.events.length,0);assert.equal(f.job('invitation').state,'suppressed');
 }
});
test('provider opt-out and cancellation during preflight stop dispatch',async t=>{
 for(const scenario of ['optout','cancel']){const f=setup(t);await f.mailQueue.queueOrderFeedback('order');const provider=()=>({eligible:async()=>{if(scenario==='cancel')f.records.get('orders/order').status='Canceled';return scenario!=='optout';},send:async()=>{throw Error('Must never send');}});
 await f.mailWorker.runFeedbackMailWorker(provider);assert.equal(f.job('invitation').state,'suppressed');}
});
test('response and thank-you job commit together; retry cannot duplicate either',async t=>{
 const f=setup(t);await f.mailQueue.queueOrderFeedback('order');await f.mailWorker.runFeedbackMailWorker(f.provider);
 const token=f.invitations.signOrderFeedbackInvitation(f.key,f.records.get('feedbackInvitations/'+f.key).expiresAt);
 const submit=()=>f.public.submitFeedbackAction(null,responseForm({invitationToken:token}));
 f.failure.write=true;assert.equal((await submit()).error,true);assert.equal(f.records.has('feedback/'+f.key),false);assert.equal(f.job('thankYou'),undefined);f.failure.write=false;
 for(let i=0;i<2;i++)await assert.rejects(submit,e=>e.digest==='NEXT_REDIRECT');
 assert.equal(f.records.get('feedbackInvitations/'+f.key).status,'submitted');assert.equal(f.job('thankYou').state,'pending');
 await f.mailWorker.runFeedbackMailWorker(f.provider,Date.now()+73*3600000);
 assert.equal(f.events.length,2);assert.equal(f.events[1][1],'thankYou');assert.equal(f.events[1][3].feedbackUrl,undefined);assert.equal(f.job('reminder').state,'suppressed');assert.equal(f.records.get('feedback/'+f.key).autoResponseSent,false);
});
test('response refuses an unpaid order, forged invitation or mismatched customer',async t=>{
 const f=setup(t);await f.mailQueue.queueOrderFeedback('order');const token=f.invitations.signOrderFeedbackInvitation(f.key,f.records.get('feedbackInvitations/'+f.key).expiresAt);
 for(const update of [{invitationToken:token+'x'},{invitationToken:token,customerId:'foreign'}])assert.equal((await f.public.submitFeedbackAction(null,responseForm(update))).error,true);
 f.records.get('orders/order').paymentStatus='Pending';assert.equal((await f.public.submitFeedbackAction(null,responseForm({invitationToken:token}))).error,true);assert.equal(f.records.has('feedback/'+f.key),false);
});
test('timeout and HTTP 5xx remain uncertain and are never resent automatically',async t=>{
 for(const status of [0,500]){const f=setup(t);await f.mailQueue.queueOrderFeedback('order');let requests=0;const provider=config=>{const real=new f.mailProvider.FeedbackMailProvider(config,async()=>{requests++;if(!status)throw Error('private provider body');return new Response('private response',{status});});return{eligible:async()=>true,send:real.send.bind(real)};};
 await f.mailWorker.runFeedbackMailWorker(provider);assert.equal(f.job('invitation').state,'uncertain');assert.equal(f.job('reminder'),undefined);await f.mailWorker.runFeedbackMailWorker(provider,Date.now()+86400000);assert.equal(requests,1);assert.doesNotMatch(JSON.stringify(f.job('invitation')),/private provider|private response/);}
});
test('rate limiting retries are bounded while permanent rejection is terminal',async t=>{
 for(const status of [429,400]){const f=setup(t);await f.mailQueue.queueOrderFeedback('order');let requests=0;const provider=config=>{const real=new f.mailProvider.FeedbackMailProvider(config,async()=>{requests++;return new Response('',{status});});return{eligible:async()=>true,send:real.send.bind(real)};};
 for(let i=0;i<5;i++)await f.mailWorker.runFeedbackMailWorker(provider,Date.now()+i*120000);
 assert.equal(requests,status===429?3:1);assert.equal(f.job('invitation').state,'failed');}
});
test('expired dispatch lease becomes uncertain; only unfinished preflight can be reclaimed',async t=>{
 const f=setup(t);await f.mailQueue.queueOrderFeedback('order');Object.assign(f.job('invitation'),{state:'dispatching',lease:'lost-worker'});
 await f.mailWorker.runFeedbackMailWorker(f.provider);assert.equal(f.job('invitation').state,'uncertain');assert.equal(f.events.length,0);
 Object.assign(f.job('invitation'),{state:'preparing',nextAttemptAt:Date.now()-1});await f.mailWorker.runFeedbackMailWorker(f.provider);assert.equal(f.events.length,1);
});
test('manual retry needs explicit provider check and scoped editor; admin queue excludes recipients and tokens',async t=>{
 const f=setup(t);const id=await f.mailQueue.queueOrderFeedback('order');Object.assign(f.job('invitation'),{state:'uncertain',invitationToken:'PRIVATE_TOKEN'});
 await assert.rejects(()=>f.mailAdmin.retryFeedbackMailJob(id,false));f.auth.uid='qa-viewer';await assert.rejects(()=>f.mailAdmin.retryFeedbackMailJob(id,true));
 f.auth.uid='qa-editor';await f.mailAdmin.retryFeedbackMailJob(id,true);assert.equal(f.job('invitation').manualRetries,1);assert.equal(f.job('invitation').lastRetriedBy,'qa-editor');await assert.rejects(()=>f.mailAdmin.retryFeedbackMailJob(id,true));
 assert.doesNotMatch(JSON.stringify(await f.mailAdmin.feedbackMailJobs('b')),/PRIVATE_TOKEN|private@example|customerId|sourceId|invitationId/);
 await assert.rejects(()=>f.mailAdmin.feedbackMailJobs('other'));
});
test('booking automation waits until the visit and stops for revoked invitations',async t=>{
 const f=setup(t);const source={brandId:'b',locationId:'l',customerId:'c',sourceType:'booking',sourceId:'booking',invitationId:'i',invitationToken:'valid'};
 const now=Date.now();const id=await f.mailQueue.queueBookingFeedback(source,new Date(now+3600000).toISOString());assert.ok(f.records.get('feedbackMailJobs/'+id).nextAttemptAt>=now+3*3600000);
 f.records.get('integrationFeedbackInvitations/i').status='revoked';await f.mailWorker.runFeedbackMailWorker(f.provider,now+4*3600000);assert.equal(f.records.get('feedbackMailJobs/'+id).state,'suppressed');assert.equal(f.events.length,0);
});
test('provider enqueues only the scoped Orderfly template without exposing its secret in the payload',async t=>{
 const f=setup(t);const config=loadTs('src/lib/feedback/mail-config.ts',f.mocks).feedbackMailConfig('b');let request;
 const provider=new f.mailProvider.FeedbackMailProvider(config,async(url,options)=>{request={url,options};return new Response('',{status:202});});
 assert.equal(await provider.eligible('private@example.test'),true);
 await provider.send('event-1','invitation','private@example.test',{sourceType:'commerce_order',sourceId:'order',language:'da',feedbackUrl:'https://orderfly.dk/feedback?token=private'});
 const body=JSON.parse(request.options.body);assert.equal(request.url,process.env.ORDERFLY_NOTIFICATION_ENDPOINT);assert.equal(request.options.method,'POST');assert.equal(request.options.headers['x-orderfly-notification-secret'],process.env.ORDERFLY_NOTIFICATION_SECRET);
 assert.equal(body.sender_profile,'orderfly');assert.equal(body.template_key,'orderfly.feedback.invitation');assert.equal(body.idempotency_key,'event-1');assert.equal(body.related_entity.id,'order');assert.equal(body.recipient.email,'private@example.test');assert.doesNotMatch(request.options.body,/synthetic-notification-secret/);
});
test('worker endpoint denies missing/wrong credentials before work and hides internal failures',async t=>{
 setup(t);let calls=0;const route=loadTs('src/app/api/internal/feedback/send/route.ts',{'@/lib/feedback/mail-worker':{runFeedbackMailWorker:async()=>{calls++;throw Error('private');}},'@/lib/notifications/order-worker':{runOrderNotificationWorker:async()=>({})}});
 for(const authorization of ['', 'Bearer wrong'])assert.equal((await route.POST(new Request('https://orderfly.dk/api/internal/feedback/send',{method:'POST',headers:{authorization}}))).status,401);
 assert.equal(calls,0);const response=await route.POST(new Request('https://orderfly.dk/api/internal/feedback/send',{method:'POST',headers:{authorization:'Bearer '+process.env.ORDERFLY_FEEDBACK_WORKER_SECRET}}));assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/private/);assert.equal(calls,1);
});
test('mail settings preserve false/zero and refuse invalid or unconfigured enablement',async t=>{
 const f=setup(t);await f.settings.writeFeedbackSettings({brandId:'b',emailEnabled:true,automaticRequests:false,delayHours:0,maxReminders:0,autoReplyEnabled:false,language:'en'});
 const settings=await f.settings.readFeedbackSettings('b');assert.equal(settings.delayHours,0);assert.equal(settings.maxReminders,0);assert.equal(settings.automaticRequests,false);assert.equal(settings.autoReplyEnabled,false);assert.equal(settings.language,'en');assert.equal(settings.emailConfigured,true);
 await assert.rejects(()=>f.settings.writeFeedbackSettings({brandId:'b',maxReminders:2}));delete process.env.ORDERFLY_NOTIFICATION_ENDPOINT;await assert.rejects(()=>f.settings.writeFeedbackSettings({brandId:'b',emailEnabled:true}));await f.settings.writeFeedbackSettings({brandId:'b',emailEnabled:false});
});

test('notification configuration rejects unsafe endpoints and short or missing secrets',async t=>{
 const f=setup(t),config=loadTs('src/lib/feedback/mail-config.ts',f.mocks);
 for(const [key,value] of [['ORDERFLY_NOTIFICATION_ENDPOINT','http://unsafe.example.test'],['ORDERFLY_NOTIFICATION_ENDPOINT','https://user:pass@example.test/send'],['ORDERFLY_NOTIFICATION_SECRET','short'],['ORDERFLY_NOTIFICATION_ORGANIZATION_ID','not-a-uuid']]){
  const previous=process.env[key];process.env[key]=value;assert.equal(config.feedbackMailConfig('b'),null);process.env[key]=previous;
 }
});
test('transient context read retries recover once; permanent read errors stay failed',async t=>{
 for(const code of [4,8,10,13,14,'unavailable',7]){
  const f=setup(t);await f.mailQueue.queueOrderFeedback('order');const original=f.db.collection;let fail=true;
  f.db.collection=(...args)=>{const collection=original(...args);if(args[0]!=='customers')return collection;const doc=collection.doc;collection.doc=(...ids)=>{const ref=doc(...ids);const get=ref.get;ref.get=async()=>{if(fail)throw Object.assign(Error('private database error'),{code});return get();};return ref;};return collection;};
  await f.mailWorker.runFeedbackMailWorker(f.provider);assert.equal(f.job('invitation').state,code===7?'failed':'pending');assert.equal(f.events.length,0);
  fail=false;await f.mailWorker.runFeedbackMailWorker(f.provider,Date.now()+120000);
  assert.equal(f.job('invitation').state,code===7?'failed':'accepted');assert.equal(f.events.length,code===7?0:1);
  await f.mailWorker.runFeedbackMailWorker(f.provider,Date.now()+240000);assert.equal(f.events.length,code===7?0:1);
 }
});
test('provider authorization rejection is terminal and never blindly retried',async t=>{
 const f=setup(t);await f.mailQueue.queueOrderFeedback('order');let requests=0;
 const provider=config=>{const real=new f.mailProvider.FeedbackMailProvider(config,async()=>{requests++;return new Response('',{status:403});});return{eligible:real.eligible.bind(real),send:real.send.bind(real)};};
 await f.mailWorker.runFeedbackMailWorker(provider);await f.mailWorker.runFeedbackMailWorker(provider,Date.now()+120000);
 assert.equal(f.job('invitation').state,'failed');assert.equal(f.job('invitation').attempts,1);assert.equal(f.job('invitation').lastError,'provider_rejected_403');assert.equal(requests,1);
});

test('order confirmation worker sends one scoped message and suppresses canceled orders',async t=>{
 const f=setup(t);Object.assign(f.records.get('orders/order'),{customerContact:'private@example.test',customerName:'QA Guest',brandName:'Esmeralda QA',locationName:'Amager',totalAmount:129,deliveryTime:'18:30'});
 f.records.set('orderNotificationJobs/job',{orderId:'order',brandId:'b',locationId:'l',eventId:'confirmation-event',state:'pending',nextAttemptAt:Date.now()-1,attempts:0});
 const sent=[];const worker=loadTs('src/lib/notifications/order-worker.ts',{...f.mocks,'./platform':{NotificationPlatformError:class extends Error{},NotificationPlatformClient:class{}}});
 const client=()=>({send:async message=>sent.push(message)});
 await Promise.all([worker.runOrderNotificationWorker(client),worker.runOrderNotificationWorker(client)]);
 assert.equal(sent.length,1);assert.equal(sent[0].templateKey,'orderfly.order.confirmation');assert.equal(sent[0].recipientEmail,'private@example.test');assert.equal(sent[0].variables.totalAmount,129);assert.equal(f.records.get('orderNotificationJobs/job').state,'accepted');
 f.records.set('orderNotificationJobs/canceled',{orderId:'order',brandId:'b',locationId:'l',eventId:'canceled-event',state:'pending',nextAttemptAt:Date.now()-1,attempts:0});f.records.get('orders/order').status='Canceled';
 const result=await worker.runOrderNotificationWorker(client);assert.equal(result.suppressed,1);assert.equal(sent.length,1);assert.equal(f.records.get('orderNotificationJobs/canceled').state,'suppressed');
 assert.doesNotMatch(JSON.stringify(f.records.get('orderNotificationJobs/job')),/private@example/);
});
