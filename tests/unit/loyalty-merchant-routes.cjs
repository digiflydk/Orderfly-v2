const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {AuthorityError}=loadTs('src/lib/access/authority.ts',{'server-only':{}});

let session,calls;
const counter={LoyaltyError:class extends Error{constructor(code,status=422){super(code);this.code=code;this.status=status;}}};
const {merchantRoute}=loadTs('src/lib/loyalty/stamp-card/http.ts',{'server-only':{},
  '@/lib/firebase-admin':{getAdminDb:()=>({})},'@/lib/url':{getOrigin:async()=>'https://orderfly.dk'},
  '@/lib/access/authority':{AuthorityError},'@/lib/access/orderfly-session':{orderflySession:async()=>session()},'./counter':counter});
const {z}=require('zod');
const schema=z.object({brandId:z.string()}).strict();
const request=(body,headers={})=>new Request('https://orderfly.dk/api/merchant/loyalty/stamp',{method:'POST',
  headers:{origin:'https://orderfly.dk','content-type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
const run=async(...args)=>{const response=await merchantRoute(...args);return {status:response.status,body:await response.json(),cache:response.headers.get('cache-control')};};
const ok=async(db,actor,input)=>{calls.push({actor,input});return {ok:true};};

test('a verified employee reaches the operation with the session identity and name',async()=>{
  calls=[];session=()=>({identity:{provider:'opsfly',organizationId:'o',subject:'s'},name:'Alex',permissions:[],superuser:false});
  const r=await run(request({brandId:'brand'}),schema,ok);
  assert.equal(r.status,200);assert.equal(r.cache,'no-store');assert.deepEqual(calls[0],{actor:{identity:{provider:'opsfly',organizationId:'o',subject:'s'},name:'Alex'},input:{brandId:'brand'}});
});

test('cross-origin, cross-site and non-JSON requests are rejected before the session is read',async()=>{
  calls=[];let read=0;session=()=>{read++;return {identity:{},name:'x'};};
  for(const headers of [{origin:'https://evil.example'},{'sec-fetch-site':'cross-site'},{'content-type':'text/plain'},{origin:''}])
    assert.equal((await run(request({brandId:'brand'},headers),schema,ok)).status,403);
  assert.equal(read,0);assert.equal(calls.length,0);
});

test('missing or deactivated sessions and missing permissions fail closed',async()=>{
  calls=[];
  session=()=>{throw new AuthorityError('unauthorized',401);};assert.deepEqual((await run(request({brandId:'b'}),schema,ok)).body,{error:'unauthorized'});
  session=()=>{throw new AuthorityError('principal_inactive');};assert.equal((await run(request({brandId:'b'}),schema,ok)).status,403);
  session=()=>({identity:{},name:'x'});
  assert.equal((await run(request({brandId:'b'}),schema,async()=>{throw new AuthorityError('forbidden');})).status,403);
  assert.equal(calls.length,0);
});

test('invalid bodies are 400; business rejections keep their code; unknown failures are 503 without details',async()=>{
  session=()=>({identity:{},name:'x'});
  for(const body of ['{',JSON.stringify({brandId:'b',extra:1}),JSON.stringify({brandId:'b',pad:'x'.repeat(5000)})])
    assert.equal((await run(request(body),schema,ok)).status,400);
  assert.deepEqual(await run(request({brandId:'b'}),schema,async()=>{throw new counter.LoyaltyError('below_minimum');}),{status:422,body:{error:'below_minimum'},cache:'no-store'});
  const failure=await run(request({brandId:'b'}),schema,async()=>{throw new Error('secret database detail');});
  assert.equal(failure.status,503);assert.doesNotMatch(JSON.stringify(failure.body),/secret/);
});

test('the worker heartbeat runs stamp-card expiry and isolates its failure from the other workers',async()=>{
  const previous=process.env.ORDERFLY_FEEDBACK_WORKER_SECRET;process.env.ORDERFLY_FEEDBACK_WORKER_SECRET='y'.repeat(32);
  const load=expiry=>loadTs('src/app/api/internal/feedback/send/route.ts',{'@/lib/feedback/mail-worker':{runFeedbackMailWorker:async()=>({sent:1})},
    '@/lib/notifications/order-worker':{runOrderNotificationWorker:async()=>({})},'@/lib/games/worker':{runGameOutbox:async()=>({})},
    '@/lib/marketing/worker':{runMarketingWorker:async()=>({})},'@/lib/firebase-admin':{getAdminDb:()=>({})},'@/lib/loyalty/stamp-card/expiry':{runLoyaltyExpiry:expiry}});
  const call=route=>route.POST(new Request('https://orderfly.dk/api/internal/feedback/send',{method:'POST',headers:{authorization:'Bearer '+'y'.repeat(32)}}));
  try{
    let response=await call(load(async()=>({cards:2,rewards:1})));
    assert.equal(response.status,200);assert.deepEqual((await response.json()).loyalty,{cards:2,rewards:1});
    response=await call(load(async()=>{throw new Error('private');}));
    const body=await response.json();
    assert.equal(response.status,200);assert.deepEqual(body.loyalty,{failed:true});assert.deepEqual(body.feedback,{sent:1});
    assert.doesNotMatch(JSON.stringify(body),/private/);
  }finally{if(previous===undefined)delete process.env.ORDERFLY_FEEDBACK_WORKER_SECRET;else process.env.ORDERFLY_FEEDBACK_WORKER_SECRET=previous;}
});
