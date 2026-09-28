const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {memoryDb}=require('../helpers/marketing-db.cjs');

let configured=false;
const {MarketingError}=loadTs('src/lib/marketing/provider.ts',{'server-only':{}});
const {runGameOutbox,retryGameConsentJob}=loadTs('src/lib/games/worker.ts',{
  'server-only':{},
  '@/lib/marketing/config':{marketingConfig:()=>configured?{brandId:'b',omnisendBrandId:'omni-b',apiKey:'synthetic-key',enabled:true,consentMode:'single_opt_in'}:null},
  '@/lib/marketing/provider':{MarketingError,Omnisend:class{}},
  '@/lib/notifications/platform':{NotificationPlatformClient:class{},NotificationPlatformError:class{}},
  './mail-config':{gameMailConfig:()=>null},
  './scratch-card':{scratchCardDraftSchema:{safeParse:()=>({success:false})},redemptionText:()=>''},
});

function fixture(){
  const db=memoryDb(),now=Date.now(),id='play-1';
  db.rows.set('gamePlays/'+id,{brandId:'b',email:'buyer@example.test',newsletter:true,mode:'live'});
  db.rows.set('gameConsentOutbox/'+id,{brandId:'b',playId:id,email:'buyer@example.test',wording:'Ja tak',version:'game-email-da-v1',capturedAt:now-1000,state:'pending',attempts:0,nextAttemptAt:now-1});
  return {db,now,id};
}

test('missing configuration retains explicit consent until the brand is connected',async()=>{
  configured=false;
  const {db,now,id}=fixture();let calls=0;
  const provider=()=>{calls++;throw Error('must not instantiate');};
  for(let hour=0;hour<7;hour++)assert.equal((await runGameOutbox(db,now+hour*3600000,provider)).pending,1);
  let job=db.rows.get('gameConsentOutbox/'+id);
  assert.equal(job.state,'pending');assert.equal(job.lastError,'configuration_required');assert.equal(job.nextAttemptAt,now+7*3600000);assert.equal(job.attempts,0);assert.equal(calls,0);
  configured=true;
  assert.equal(await retryGameConsentJob(db,'other',id),false);
  assert.equal(await retryGameConsentJob(db,'b',id),true);
  assert.equal(db.rows.get('gameConsentOutbox/'+id).attempts,0);
  const retryAt=Date.now()+1;
  await runGameOutbox(db,retryAt,()=>({verifyBrand:async()=>{},sync:async()=>{calls++;throw new MarketingError('provider_http_429',true,false);}}));
  job=db.rows.get('gameConsentOutbox/'+id);
  assert.equal(job.state,'failed');assert.equal(job.attempts,1);assert.ok(job.nextAttemptAt>retryAt);
  await runGameOutbox(db,job.nextAttemptAt,()=>({verifyBrand:async()=>{},sync:async()=>{calls++;return 'synced';}}));
  job=db.rows.get('gameConsentOutbox/'+id);
  assert.equal(job.state,'synced');assert.equal(calls,2);
});

test('already subscribed contact stays unchanged; an opted-out contact is not reported as subscribed',async()=>{
  configured=true;
  for(const [status,expected] of [['subscribed','accepted'],['unsubscribed','suppressed']]){
    const {db,now,id}=fixture();let writes=0;
    const provider=()=>({verifyBrand:async()=>{},sync:async()=>{writes++;return 'suppressed';},contact:async()=>({identifiers:[{type:'email',id:'buyer@example.test',channels:{email:{status}}}]})});
    await runGameOutbox(db,now,provider);
    assert.equal(db.rows.get('gameConsentOutbox/'+id).state,expected);
    assert.equal(writes,1);
    assert.equal(await retryGameConsentJob(db,'b',id),false);
  }
});

test('a failed or uncertain cross-brand job cannot be replayed as another brand',async()=>{
  const {db,id}=fixture();
  db.rows.set('gameConsentOutbox/'+id,{...db.rows.get('gameConsentOutbox/'+id),state:'failed',lastError:'provider_http_400',attempts:5,lease:null});
  assert.equal(await retryGameConsentJob(db,'foreign',id),false);
  assert.equal(await retryGameConsentJob(db,'b',id),true);
  assert.equal(db.rows.get('gameConsentOutbox/'+id).attempts,0);
  configured=true;
  const retryAt=Date.now()+1;
  await runGameOutbox(db,retryAt,()=>({verifyBrand:async()=>{},sync:async()=>{throw new MarketingError('provider_http_429',true,false);}}));
  assert.ok(db.rows.get('gameConsentOutbox/'+id).nextAttemptAt>retryAt);
  db.rows.set('gameConsentOutbox/'+id,{...db.rows.get('gameConsentOutbox/'+id),state:'uncertain'});
  assert.equal(await retryGameConsentJob(db,'b',id),false);
});

test('admin replay requires a superuser, current mapping and the matching consented live play',async()=>{
  let allowed=false,ready=true,replayed=0;
  const db=memoryDb();
  const {retryGameNewsletter}=loadTs('src/app/superadmin/games/participants/actions.ts',{
    'next/cache':{revalidatePath:()=>{}},
    '@/lib/access/orderfly-session':{requirePlatformSuperuser:async()=>{if(!allowed)throw Error('forbidden');}},
    '@/lib/firebase-admin':{getAdminDb:()=>db},
    '@/lib/games/worker':{retryGameConsentJob:async()=>{replayed++;return true;}},
    '@/lib/marketing/config':{marketingConfig:()=>ready?{brandId:'b'}:null},
  });
  const form=new FormData();form.set('brandId','b');form.set('playId','play-1');
  db.rows.set('gamePlays/play-1',{brandId:'other',mode:'live',newsletter:true});
  await assert.rejects(retryGameNewsletter(form),/forbidden/);assert.equal(replayed,0);
  allowed=true;await retryGameNewsletter(form);assert.equal(replayed,0);
  db.rows.set('gamePlays/play-1',{brandId:'b',mode:'test',newsletter:true});
  await retryGameNewsletter(form);assert.equal(replayed,0);
  db.rows.set('gamePlays/play-1',{brandId:'b',mode:'live',newsletter:false});
  await retryGameNewsletter(form);assert.equal(replayed,0);
  db.rows.set('gamePlays/play-1',{brandId:'b',mode:'live',newsletter:true});
  ready=false;await retryGameNewsletter(form);assert.equal(replayed,0);
  ready=true;await retryGameNewsletter(form);assert.equal(replayed,1);
});
