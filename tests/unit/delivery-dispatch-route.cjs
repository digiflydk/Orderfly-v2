const {test}=require('node:test');const assert=require('node:assert/strict');const {loadTs}=require('../helpers/load-ts.cjs');
test('internal dispatcher denies missing/wrong/oversized bearer before worker and uses existing configured secret',async()=>{
 const prior=process.env.ORDERFLY_NOTIFICATION_SECRET,priorFeedback=process.env.ORDERFLY_FEEDBACK_WORKER_SECRET;
 process.env.ORDERFLY_NOTIFICATION_SECRET='x'.repeat(40);delete process.env.ORDERFLY_FEEDBACK_WORKER_SECRET;let calls=0;
 try{const route=loadTs('src/app/api/internal/delivery/dispatch/route.ts',{'@/lib/delivery/booking/dispatcher':{runDeliveryDispatchWorker:async()=>{calls++;return{state:'disabled',processed:0}}}});
  for(const authorization of ['', 'Bearer wrong','Bearer '+'x'.repeat(600)]){const r=await route.POST(new Request('https://example.test/api/internal/delivery/dispatch',{method:'POST',headers:{authorization}}));assert.equal(r.status,401);}assert.equal(calls,0);
  const ok=await route.POST(new Request('https://example.test/api/internal/delivery/dispatch',{method:'POST',headers:{authorization:'Bearer '+'x'.repeat(40)}}));assert.equal(ok.status,200);assert.equal(ok.headers.get('cache-control'),'no-store');assert.equal((await ok.json()).state,'disabled');assert.equal(calls,1);
 }finally{if(prior===undefined)delete process.env.ORDERFLY_NOTIFICATION_SECRET;else process.env.ORDERFLY_NOTIFICATION_SECRET=prior;if(priorFeedback===undefined)delete process.env.ORDERFLY_FEEDBACK_WORKER_SECRET;else process.env.ORDERFLY_FEEDBACK_WORKER_SECRET=priorFeedback;}
});
