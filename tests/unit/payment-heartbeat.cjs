const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
function fixture({mailFailure=false}={}){
 let release;const pending=new Promise(resolve=>release=resolve);const calls=[];
 const done=async()=>({ok:true});
 const mocks={'@/lib/payments/native-free-recovery':{processDueNativeFreeCheckouts:async()=>{calls.push('free');return done();}},'@/lib/payments/worldline-stale-holds':{processWorldlineStaleCheckouts:async()=>{calls.push('expiry');return done();}},'@/lib/payments/worldline-reconcile':{processWorldlineJobs:async()=>{calls.push('payment');return pending;}},'@/lib/feedback/dully-worker':{runDullyFeedbackWorker:done},'@/lib/feedback/mail-worker':{runFeedbackMailWorker:async()=>{if(mailFailure)throw Error('mail unavailable');return done();}},'@/lib/notifications/order-worker':{runOrderNotificationWorker:done},'@/lib/firebase-admin':{getAdminDb:()=>({})},'@/lib/games/worker':{runGameOutbox:done},'@/lib/marketing/worker':{runMarketingWorker:done},'@/lib/loyalty/stamp-card/worker':{runLoyaltyWorker:done},'@/lib/qr/worker':{runQrRetentionWorker:done},'@/lib/delivery/booking/dispatcher':{runDeliveryDispatchWorker:done}};
 return {api:loadTs('src/app/api/internal/feedback/send/route.ts',mocks),calls,release};
}
test('unauthorized heartbeat never starts payment recovery',async()=>{const f=fixture();const response=await f.api.POST(new Request('https://example.test',{method:'POST'}));assert.equal(response.status,401);assert.deepEqual(f.calls,[]);});
test('legacy mail failure retains 503 but waits for durable payment work to finish',async()=>{
 const old=process.env.ORDERFLY_FEEDBACK_WORKER_SECRET;process.env.ORDERFLY_FEEDBACK_WORKER_SECRET='synthetic-worker-secret-'.repeat(2);
 try{const f=fixture({mailFailure:true});let replied=false;const response=f.api.POST(new Request('https://example.test',{method:'POST',headers:{authorization:'Bearer '+process.env.ORDERFLY_FEEDBACK_WORKER_SECRET}})).then(v=>{replied=true;return v;});await new Promise(resolve=>setImmediate(resolve));assert.equal(replied,false);assert.deepEqual(f.calls.sort(),['expiry','free','payment']);f.release({ok:true});assert.equal((await response).status,503);}finally{if(old===undefined)delete process.env.ORDERFLY_FEEDBACK_WORKER_SECRET;else process.env.ORDERFLY_FEEDBACK_WORKER_SECRET=old;}
});
