const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs'),vm=require('node:vm');
const keys={merchantNumber:'T123',accessToken:'synthetic-access',secretToken:'synthetic-secret'};
function load(fetch,timers={}){
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/payments/worldline-response-diagnostics.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>{assert.equal(n,'server-only');return {};},Buffer,AbortController,setTimeout,clearTimeout,fetch,...timers});return exports;
}
const body=(source='BEC',code='40200',type='generalerror')=>({meta:{result:false,action:{source,code,type},message:{merchant:'synthetic-private-message'}}});
const catalog=(label,changes={})=>({meta:{result:true},responsecode:{source:'BEC',actioncode:'40200',merchantlabel:label,enduserlabel:'Error',...changes}});

test('action diagnostics accept only bounded codes, finite types, and static known source names',()=>{
 const m=load();assert.deepEqual({...m.extractWorldlineActionDiagnostics(body())},{source:'BEC',code:'40200',type:'generalerror'});
 for(const code of ['', '40200\n','40200\r','1234567','synthetic-secret',{},-1,NaN])assert.equal(m.extractWorldlineActionDiagnostics(body('BEC',code)).code,undefined);
 for(const source of ['syntheticSecret','__proto__','BEC\n','https://evil.test'])assert.equal(m.extractWorldlineActionDiagnostics(body(source)).source,undefined);
 assert.equal(m.extractWorldlineActionDiagnostics(body('BEC','40200','synthetic-secret')).type,undefined);
 assert.equal(m.extractWorldlineActionDiagnostics(body('ePayWebservice',103,'validationerror')).source,'EPAYWEBSERVICE');
});
test('exact-source catalog grouping returns finite diagnostics without financial claims',()=>{
 const m=load();for(const [label,category] of [['Invalid session status','SESSION_STATE'],['Session has expired','SESSION_EXPIRED'],['Session not found','SESSION_NOT_FOUND'],['Access denied to merchant','ACCESS_DENIED'],['Payment approved','UNCLASSIFIED'],['Payment declined','UNCLASSIFIED'],['Payment expired','UNCLASSIFIED']]){
  const value=m.classifyWorldlineCatalogResponse(catalog(label),'BEC','40200');assert.equal(value,category);assert.ok(!/paid|void|canceled|released/i.test(value));
 }
});
test('catalog requires successful meta and exact echoed source and code',()=>{
 const m=load();for(const data of [catalog('Session expired',{source:'other'}),catalog('Session expired',{actioncode:'40000'}),catalog('Session expired',{actioncode:40200}),{...catalog('Session expired'),meta:{result:false}},{...catalog('Session expired'),meta:{result:'true'}},{},null,catalog('Session expired',{merchantlabel:'x'.repeat(513)}),catalog('Session expired',{enduserlabel:null})])assert.equal(m.classifyWorldlineCatalogResponse(data,'BEC','40200'),'UNCLASSIFIED');
});
test('expiry refusal and negation cannot be mislabeled as an expired session',()=>{
 const m=load();for(const label of ['Session cannot be expired','Session is not expired','Session has not expired','Session could not be expired','Session expiration failed','Session expiry is not allowed'])assert.equal(m.classifyWorldlineCatalogResponse(catalog(label),'BEC','40200'),'SESSION_STATE');
 for(const label of ['Session cannot be expired: access denied','Session has expired: no access','Access denied: invalid session status'])assert.equal(m.classifyWorldlineCatalogResponse(catalog(label),'BEC','40200'),'ACCESS_DENIED');
 for(const label of ['Session expired','Session is expired','Session has expired','The session has already expired','Session token is already expired'])assert.equal(m.classifyWorldlineCatalogResponse(catalog(label),'BEC','40200'),'SESSION_EXPIRED');
});
test('one fixed-host GET uses the original account, blocks redirects, and returns no labels',async()=>{
 let calls=0;const m=load(async(url,options)=>{
  calls++;assert.equal(url,'https://data-v1.api-eu.bambora.com/responsecodes/BEC/40200');assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert.equal(options.headers.Authorization,'Basic '+Buffer.from('synthetic-access@T123:synthetic-secret').toString('base64'));assert.equal(options.signal.aborted,false);assert.equal(options.body,undefined);
  return {ok:true,json:async()=>catalog('Invalid session status synthetic-private-message')};
 });
 assert.equal(await m.worldlineExpiryDiagnostic(keys,body()),'_PROVIDER_40200_SRC_BEC_REASON_SESSION_STATE');assert.equal(calls,1);
});
test('unknown source can only select an encoded fixed-host catalog path and never becomes support text',async()=>{
 let calls=0;const m=load(async(url)=>{calls++;assert.equal(url,'https://data-v1.api-eu.bambora.com/responsecodes/AnotherSource/40200');return{ok:true,json:async()=>catalog('Session expired',{source:'AnotherSource'})};});
 assert.equal(await m.worldlineExpiryDiagnostic(keys,body('AnotherSource')),'_PROVIDER_40200_REASON_SESSION_EXPIRED');assert.equal(calls,1);
 for(const source of ['BEC/../evil','BEC\n','x'.repeat(33)])assert.equal(await m.worldlineExpiryDiagnostic(keys,body(source)),'_PROVIDER_40200');assert.equal(calls,1);
});
test('missing code avoids all catalog calls; malformed diagnostics cannot carry raw strings',async()=>{
 let calls=0;const m=load(async()=>{calls++;throw Error('must not execute');});
 for(const data of [null,{},body('BEC','synthetic-secret'),body('BEC','40200\n'),new Proxy({},{get(){throw Error('synthetic-secret');}})])assert.equal(await m.worldlineExpiryDiagnostic(keys,data),'');
 assert.equal(calls,0);
});
test('HTTP, transport, JSON and mismatched catalog failures are redacted and never retried',async()=>{
 for(const reply of [async()=>{throw Error('synthetic-secret');},async()=>({ok:false,json:async()=>{throw Error('must not read');}}),async()=>({ok:true,json:async()=>{throw Error('synthetic-private-message');}}),async()=>({ok:true,json:async()=>catalog('Session expired',{source:'foreign'})}),async()=>({ok:true,json:async()=>catalog('Session expired',{actioncode:'999'})})]){
  let calls=0;const m=load(async(...args)=>{calls++;return reply(...args);});assert.equal(await m.worldlineExpiryDiagnostic(keys,body()),'_PROVIDER_40200_SRC_BEC');assert.equal(calls,1);
 }
});
test('the complete catalog read has one two-second deadline even if fetch ignores abort',async()=>{
 let calls=0,signal,timeout,cleared=false;const m=load(async(_url,options)=>{calls++;signal=options.signal;return new Promise(()=>{});},{setTimeout:(callback,ms)=>{timeout=ms;queueMicrotask(callback);return 17;},clearTimeout:value=>{cleared=value===17;}});
 assert.equal(await m.worldlineExpiryDiagnostic(keys,body()),'_PROVIDER_40200_SRC_BEC');assert.equal(timeout,2000);assert.equal(signal.aborted,true);assert.equal(cleared,true);assert.equal(calls,1);
});
test('a stalled catalog body is bounded by the same deadline and cannot trigger another request',async()=>{
 let calls=0,fire;const m=load(async()=>{calls++;return {ok:true,json:async()=>{queueMicrotask(fire);return new Promise(()=>{});}};},{setTimeout:callback=>{fire=callback;return 9;},clearTimeout:()=>{}});
 assert.equal(await m.worldlineExpiryDiagnostic(keys,body()),'_PROVIDER_40200_SRC_BEC');assert.equal(calls,1);
});
test('all support suffixes are bounded and use only static diagnostic fields',async()=>{
 const m=load(async()=>({ok:true,json:async()=>catalog('Session not found synthetic-secret',{source:'ePayWebservice',actioncode:'123456'})}));
 const result=await m.worldlineExpiryDiagnostic(keys,body('ePayWebservice','123456'));assert.equal(result,'_PROVIDER_123456_SRC_EPAYWEBSERVICE_REASON_SESSION_NOT_FOUND');assert.ok(result.length<=80);assert.match(result,/^_[A-Z0-9_]+$/);assert.ok(!result.includes('synthetic'));
});
