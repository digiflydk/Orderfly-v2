const test=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {QrStoreError}=loadTs('src/lib/qr/store.ts');
const {qrAdminHttp}=loadTs('src/lib/qr/http.ts');
const draft={name:'Bord 1',brandId:'brandA',locationId:'locA',kind:'dynamic',destination:'https://esmeraldapizza.dk/menu',staticType:'url',fields:{},campaign:'table',tags:[],utm:{source:'poster',medium:'qr',campaign:'',term:'',content:''}};
const saved={id:'codeA',slug:'a'.repeat(32),brandId:'brandA',locationId:'locA',name:'Bord 1',destination:draft.destination,campaign:'table',tags:[],expiresAt:null,status:'active',revision:1,createdAt:1,updatedAt:1};
const requestId='00000000-0000-4000-8000-000000000001';
function fixture(denied){
 const calls=[];
 const store={get:async(scope,id)=>{calls.push(['get',scope,id]);return saved;},create:async(scope,input,key)=>{calls.push(['create',scope,input,key]);return {...saved,...input};},update:async()=>{throw new Error('not used');},pause:async()=>saved,activate:async()=>saved,archive:async()=>saved};
 const api=loadTs('src/lib/qr/admin.ts',{'./store':{createQrStore:()=>store,QrStoreError}});
 const execute=api.createQrAdminService({db:{},actorId:'actorA',list:async()=>({brands:[],codes:[]}),authorize:async(action,brandId,locationId)=>{
  calls.push(['authorize',action,brandId,locationId]);if(denied===action)throw new QrStoreError('forbidden',403);
  return {brandId,locationIds:['locA'],actorId:'actorA'};
 }});
 return {execute,calls};
}
test('server native action denial prevents every store write or image export',async()=>{
 const {execute,calls}=fixture('create');await assert.rejects(()=>execute({action:'save',draft,context:{requestId}}),e=>e.code==='forbidden');
 assert.equal(calls.some(x=>x[0]==='create'),false);
 const denied=fixture('export');await assert.rejects(()=>denied.execute({action:'render',draft,context:{id:'codeA',revision:'1'},format:'svg'}),e=>e.code==='forbidden');
 assert.equal(denied.calls.some(x=>x[0]==='get'),false);
});
test('dynamic creation preserves native scope, UTM and original idempotency key',async()=>{
 const {execute,calls}=fixture();const result=await execute({action:'save',draft,context:{requestId}});
 const mutation=calls.find(x=>x[0]==='create');assert.equal(mutation[1].brandId,'brandA');assert.equal(mutation[1].actorId,'actorA');assert.equal(mutation[3],requestId);
 assert.equal(new URL(mutation[2].destination).searchParams.get('utm_source'),'poster');assert.equal(result.publicUrl,'https://orderfly.dk/q/'+saved.slug);
});
test('invalid contrast is rejected before storing any dynamic definition',async()=>{
 const {execute,calls}=fixture();await assert.rejects(()=>execute({action:'save',draft:{...draft,style:{width:512,margin:4,dark:'#ffffff',light:'#ffffff',errorCorrectionLevel:'H'}},context:{requestId}}));
 assert.equal(calls.some(x=>x[0]==='create'),false);
});
test('static confidential payloads are never saved; immediate preview has no DB call',async()=>{
 const {execute,calls}=fixture(),wifi={...draft,kind:'static',staticType:'wifi',fields:{ssid:'Guest',password:'private-pass',security:'WPA'}};
 await assert.rejects(()=>execute({action:'save',draft:wifi,context:{requestId}}));
 const result=await execute({action:'render',draft:wifi,context:{},format:'preview'});
 assert.match(result.imageUrl,/^data:image\/png;base64,/);assert.match(result.payload,/WIFI:/);assert.equal(calls.some(x=>x[0]==='get'||x[0]==='create'),false);
});
test('dynamic image always encodes stored stable identity and rejects stale revision',async()=>{
 const {execute}=fixture();const result=await execute({action:'render',draft:{...draft,destination:'https://attacker.test/'},context:{id:'codeA',revision:'1'},format:'preview'});
 assert.equal(result.payload,'https://orderfly.dk/q/'+saved.slug);
 await assert.rejects(()=>execute({action:'render',draft,context:{id:'codeA',revision:'2'},format:'svg'}),e=>e.code==='revision_conflict');
 await assert.rejects(()=>execute({action:'render',draft,context:{},format:'preview'}),e=>e.code==='save_required');
});
test('location mismatch never changes status and schema rejects actor/scope injection',async()=>{
 const {execute}=fixture();await assert.rejects(()=>execute({action:'status',brandId:'brandA',locationId:'locOther',id:'codeA',status:'archived',revision:'1',requestId}),e=>e.code==='forbidden');
 await assert.rejects(()=>execute({action:'save',draft,context:{requestId},actorId:'owner'}));
});
const req=(body,extra={})=>new Request('https://orderfly.dk/api/qr/admin',{method:'POST',headers:{origin:'https://orderfly.dk','content-type':'application/json',...extra},body:typeof body==='string'?body:JSON.stringify(body)});
test('HTTP rejects CSRF/content type/oversize/malformed JSON before invoking service',async()=>{
 let calls=0;const deps={origin:'https://orderfly.dk',execute:async()=>{calls++;return {};}};
 for(const request of [req({}, {origin:'https://evil.example'}),req({}, {'sec-fetch-site':'cross-site'}),req({}, {'content-type':'text/plain'})])assert.equal((await qrAdminHttp(request,deps)).status,403);
 assert.equal((await qrAdminHttp(req('not json'),deps)).status,400);assert.equal((await qrAdminHttp(req('x'.repeat(32769)),deps)).status,413);assert.equal(calls,0);
});
test('HTTP unknown write outcome is503, native errors stay deny and all responses no-store',async()=>{
 for(const [error,status] of [[new Error('secret credential'),503],[{code:'forbidden',status:403},403],[{code:'unauthorized',status:401},401]]){
  const response=await qrAdminHttp(req({}),{origin:'https://orderfly.dk',execute:async()=>{throw error;}});
  assert.equal(response.status,status);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.text()).includes('secret'),false);
 }
});
