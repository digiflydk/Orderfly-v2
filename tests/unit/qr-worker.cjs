const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { runQrRetentionWorker, QR_MAINTENANCE_PATH, QR_RETENTION_LEASE_MS } = loadTs('src/lib/qr/worker.ts');
const now=Date.parse('2026-10-21T12:00:00Z');
const cursor={events:'brands/b/qrCodes/q/qrScanEvents/00000000-0000-4000-8000-000000000001',rateLimits:null};
const blank={events:null,rateLimits:null};
const result=(extra={})=>({scanned:3,deleted:1,skipped:1,errors:1,deletedEvents:1,deletedRateLimits:0,nextCursor:cursor,...extra});
const state=(extra={})=>({schemaVersion:1,revision:3,lease:null,leaseUntil:0,cursor:blank,updatedAt:now-1,...extra});
function deferred(){let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};}
function fixture(initial){let value=initial,queue=Promise.resolve();const writes=[],reads=[];let resolutions=0,commits=0,failCommit=null;
  const ref={path:QR_MAINTENANCE_PATH};
  const db={doc(path){assert.equal(path,QR_MAINTENANCE_PATH);return ref;},runTransaction(fn){const run=queue.then(async()=>{const pending=[];const tx={async get(reference){assert.equal(reference.path,QR_MAINTENANCE_PATH);reads.push(reference.path);return {exists:value!==undefined,data:()=>value?{...value,cursor:value.cursor?{...value.cursor}:value.cursor}:undefined};},set(reference,data,options){assert.equal(reference.path,QR_MAINTENANCE_PATH);assert.deepEqual(options,{merge:true});pending.push(data);},update(reference,data){assert.equal(reference.path,QR_MAINTENANCE_PATH);pending.push(data);}};const returned=await fn(tx);commits++;if(failCommit===commits)throw Error('secret DB error');for(const change of pending){value={...value,...change};writes.push(change);}return returned;});queue=run.catch(()=>{});return run;}};
  return {getDb(){resolutions++;return db;},db,writes,reads,get value(){return value;},get resolutions(){return resolutions;},set failCommit(n){failCommit=n;}};
}

test('module OFF by default and explicit disabled gate resolve no database',async()=>{
  const previous=process.env.QR_MODULE_ENABLED;delete process.env.QR_MODULE_ENABLED;
  try {
    const f=fixture();const options={retention:()=>{throw Error('must not call');}};
    assert.deepEqual(await runQrRetentionWorker(()=>{throw Error('db must not resolve');},options),{state:'disabled'});
    process.env.QR_MODULE_ENABLED='TRUE';assert.deepEqual(await runQrRetentionWorker(f.getDb,options),{state:'disabled'});
    process.env.QR_MODULE_ENABLED='true';assert.deepEqual(await runQrRetentionWorker(f.getDb,{...options,enabled:false}),{state:'disabled'});assert.equal(f.resolutions,0);
  }finally{if(previous===undefined)delete process.env.QR_MODULE_ENABLED;else process.env.QR_MODULE_ENABLED=previous;}
});

test('enabled bounded worker persists partial progress and returns only sanitized counters',async()=>{
  const f=fixture();let input;
  const output=await runQrRetentionWorker(f.getDb,{enabled:true,now:()=>now,leaseId:()=> 'lease-a',retention:async(db,options)=>{assert.equal(db,f.db);input=options;return result();}});
  assert.deepEqual(input,{now,limit:100,cursor:blank});assert.equal(output.state,'partial');assert.equal(output.scanned,3);assert.equal(output.errors,1);assert.equal('nextCursor'in output,false);assert.equal('lease'in output,false);
  assert.equal(f.value.revision,1);assert.deepEqual(f.value.cursor,cursor);assert.equal(f.value.lease,null);assert.equal(f.value.leaseUntil,0);assert.equal(f.value.lastError,'partial_failure');assert.equal(f.value.lastResult.scanned,3);assert.equal(f.value.lastFinishedAt,now);
});

test('next completed run resumes the persisted cursor and clears previous partial status',async()=>{
  const f=fixture(state({cursor,lastError:'partial_failure'}));let received;
  const output=await runQrRetentionWorker(f.getDb,{enabled:true,now:()=>now,leaseId:()=> 'lease-b',retention:async(_,options)=>{received=options.cursor;return result({errors:0,skipped:2,nextCursor:blank});}});
  assert.deepEqual(received,cursor);assert.equal(output.state,'completed');assert.equal(f.value.revision,4);assert.deepEqual(f.value.cursor,blank);assert.equal(f.value.lastError,null);
});

test('an active lease makes concurrent heartbeat busy without running retention',async()=>{
  const f=fixture(state({lease:'other-worker',leaseUntil:now+1}));let calls=0;
  const output=await runQrRetentionWorker(f.getDb,{enabled:true,now:()=>now,retention:async()=>{calls++;return result();}});
  assert.deepEqual(output,{state:'busy'});assert.equal(calls,0);assert.equal(f.writes.length,0);
});

test('expired lease can be reclaimed; a stale owner never regresses the newer cursor',async()=>{
  const f=fixture();const firstEntered=deferred(),finishFirst=deferred();let clock=now;
  const first=runQrRetentionWorker(f.getDb,{enabled:true,now:()=>clock,leaseId:()=> 'old-owner',retention:async()=>{firstEntered.resolve();await finishFirst.promise;return result();}});
  await firstEntered.promise;clock=now+QR_RETENTION_LEASE_MS+1;
  const newer={events:null,rateLimits:'brands/b/qrCodes/q/qrRateLimits/123'};
  const second=await runQrRetentionWorker(f.getDb,{enabled:true,now:()=>clock,leaseId:()=> 'new-owner',retention:async()=>result({errors:0,nextCursor:newer})});
  assert.equal(second.state,'completed');finishFirst.resolve();assert.deepEqual(await first,{state:'superseded'});assert.equal(f.value.revision,2);assert.deepEqual(f.value.cursor,newer);assert.equal(f.value.lease,null);
});

test('retention failure preserves the prior cursor, releases only its own lease and stores no exception detail',async()=>{
  const f=fixture(state({cursor}));const output=await runQrRetentionWorker(f.getDb,{enabled:true,now:()=>now,retention:async()=>{throw Error('private-event-content');}});
  assert.deepEqual(output,{state:'failed'});assert.deepEqual(f.value.cursor,cursor);assert.equal(f.value.lease,null);assert.equal(f.value.lastError,'retention_failed');assert.equal(JSON.stringify(f.value).includes('private-event-content'),false);
});

test('failed cursor checkpoint leaves lease recoverable after timeout without pretending completion',async()=>{
  const f=fixture();f.failCommit=2;const output=await runQrRetentionWorker(f.getDb,{enabled:true,now:()=>now,leaseId:()=> 'owner',retention:async()=>result({errors:0})});
  assert.deepEqual(output,{state:'failed'});assert.deepEqual(f.value.cursor,blank);assert.equal(f.value.lease,'owner');assert.equal(f.value.leaseUntil,now+QR_RETENTION_LEASE_MS);
});

test('invalid state or clock fails closed before retention; a database failure is sanitized',async()=>{
  for(const initial of [state({schemaVersion:2}),state({revision:-1}),state({cursor:{}}),state({leaseUntil:NaN})]){
    const f=fixture(initial);let calls=0;assert.deepEqual(await runQrRetentionWorker(f.getDb,{enabled:true,now:()=>now,retention:async()=>{calls++;return result();}}),{state:'failed'});assert.equal(calls,0);assert.equal(f.writes.length,0);
  }
  const f=fixture();assert.deepEqual(await runQrRetentionWorker(f.getDb,{enabled:true,now:()=>NaN}),{state:'failed'});assert.equal(f.resolutions,0);
  assert.deepEqual(await runQrRetentionWorker(()=>{throw Error('secret DB configuration');},{enabled:true,now:()=>now}),{state:'failed'});
});

function heartbeat(qrWorker,counters){return loadTs('src/app/api/internal/feedback/send/route.ts',{
  '@/lib/feedback/dully-worker':{runDullyFeedbackWorker:async()=>{counters.dully++;return {accepted:3};}},
  '@/lib/delivery/booking/dispatcher':{runDeliveryDispatchWorker:async()=>{counters.delivery++;return {state:'idle'};}},
  '@/lib/feedback/mail-worker':{runFeedbackMailWorker:async()=>{counters.feedback++;return {sent:1};}},
  '@/lib/notifications/order-worker':{runOrderNotificationWorker:async()=>{counters.orders++;return {sent:2};}},
  '@/lib/games/worker':{runGameOutbox:async()=>{counters.games++;return {};}},
  '@/lib/marketing/worker':{runMarketingWorker:async()=>{counters.contacts++;return {};}},
  '@/lib/loyalty/stamp-card/worker':{runLoyaltyWorker:async()=>{counters.loyalty++;return {};}},
  '@/lib/firebase-admin':{getAdminDb:()=>({})},'@/lib/qr/worker':{runQrRetentionWorker:qrWorker},
});}
test('existing authenticated heartbeat isolates a QR exception from the other seven workers',async()=>{
  const previous=process.env.ORDERFLY_FEEDBACK_WORKER_SECRET;process.env.ORDERFLY_FEEDBACK_WORKER_SECRET='s'.repeat(32);
  try{
    const counters={feedback:0,orders:0,games:0,contacts:0,loyalty:0,delivery:0,dully:0};let qrCalls=0;
    const route=heartbeat(async getDb=>{assert.equal(typeof getDb,'function');qrCalls++;throw Error('private QR failure');},counters);
    const response=await route.POST(new Request('https://orderfly.dk/api/internal/feedback/send',{method:'POST',headers:{authorization:'Bearer '+'s'.repeat(32)}}));
    assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const body=await response.json();assert.deepEqual(body.qr,{state:'failed'});assert.equal(body.feedback.sent,1);assert.deepEqual(body.dully,{accepted:3});assert.equal(qrCalls,1);assert.deepEqual(counters,{feedback:1,orders:1,games:1,contacts:1,loyalty:1,delivery:1,dully:1});assert.equal(JSON.stringify(body).includes('private QR failure'),false);
  }finally{if(previous===undefined)delete process.env.ORDERFLY_FEEDBACK_WORKER_SECRET;else process.env.ORDERFLY_FEEDBACK_WORKER_SECRET=previous;}
});
test('unauthorized heartbeat cannot start QR retention or any existing worker',async()=>{
  const previous=process.env.ORDERFLY_FEEDBACK_WORKER_SECRET;process.env.ORDERFLY_FEEDBACK_WORKER_SECRET='s'.repeat(32);
  try{
    const counters={feedback:0,orders:0,games:0,contacts:0,loyalty:0,delivery:0,dully:0};let qrCalls=0;const route=heartbeat(async()=>{qrCalls++;return {state:'disabled'};},counters);
    const response=await route.POST(new Request('https://orderfly.dk/api/internal/feedback/send',{method:'POST',headers:{authorization:'Bearer invalid'}}));assert.equal(response.status,401);assert.equal(qrCalls,0);assert.deepEqual(counters,{feedback:0,orders:0,games:0,contacts:0,loyalty:0,delivery:0,dully:0});
  }finally{if(previous===undefined)delete process.env.ORDERFLY_FEEDBACK_WORKER_SECRET;else process.env.ORDERFLY_FEEDBACK_WORKER_SECRET=previous;}
});
