const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs'),vm=require('node:vm');
function load(path,mocks={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>n==='server-only'?{}:mocks[n]||require(n),Buffer,URL,AbortSignal,fetch:mocks.fetch});return exports;}
const verification=load('src/lib/payments/worldline-verification.ts',{'./worldline-settings':load('src/lib/payments/worldline-settings.ts')});
const settings=load('src/lib/payments/worldline-settings.ts');
const keys={merchantNumber:'T123',accessToken:'access',secretToken:'secret',md5Key:'hash'};
const input={orderId:'123',amountMinor:12500,currency:'DKK',acceptUrl:'https://example.com/ok',cancelUrl:'https://example.com/cancel',callbackUrl:'https://example.com/callback'};
const good={meta:{result:true},token:'abc123',url:'https://v1.checkout.bambora.com/abc123'};
const client=fetch=>load('src/lib/payments/worldline-client.ts',{'./worldline-settings':settings,'./worldline-verification':verification,fetch});
test('creates hosted session with exact amount and server credentials',async()=>{
 let count=0;const c=client(async(url,options)=>{count++;assert.equal(url,'https://api.v1.checkout.bambora.com/sessions');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Basic '+Buffer.from('access@T123:secret').toString('base64'));const body=JSON.parse(options.body);assert.equal(body.order.amount,12500);assert.equal(body.url.callbacks[0].url,input.callbackUrl);return {ok:true,json:async()=>good};});
 assert.equal((await c.createWorldlineCheckoutSession(keys,'test',input)).url,good.url);assert.equal(count,1);
});
test('rejects wrong environment and insecure callback before network',async()=>{
 const c=client(async()=>{throw Error('network must not run');});
 await assert.rejects(c.createWorldlineCheckoutSession(keys,'live',input));
 await assert.rejects(c.createWorldlineCheckoutSession(keys,'test',{...input,callbackUrl:'http://example.com'}));
});
test('timeout is unknown, redacted, and never retried',async()=>{
 let count=0;const c=client(async()=>{count++;throw Error('secret access');});
 await assert.rejects(c.createWorldlineCheckoutSession(keys,'test',input),e=>e.outcome==='unknown'&&!e.message.includes('secret'));assert.equal(count,1);
});
test('rejects provider refusal even with HTTP success',async()=>{
 const c=client(async()=>({ok:true,json:async()=>({meta:{result:false}})}));
 await assert.rejects(c.createWorldlineCheckoutSession(keys,'test',input),e=>e.outcome==='rejected');
});
test('malformed or foreign hosted URL is an uncertain result',async()=>{
 for(const body of [{}, {...good,url:'https://evil.example/abc123'}, {...good,url:'https://v1.checkout.bambora.com/other'}]){
 const c=client(async()=>({ok:true,json:async()=>body}));await assert.rejects(c.createWorldlineCheckoutSession(keys,'test',input),e=>e.outcome==='unknown');}
});
test('transaction read rejects a different merchant or transaction identity',async()=>{
 const transaction={id:'123',orderid:'123',merchantnumber:'T123',status:'Approved',currency:{code:'DKK',minorunits:2},total:{authorized:12500,captured:0,credited:0}};
 for(const changed of [{merchantnumber:'T999'},{id:'999'}]){
 const c=client(async()=>({ok:true,json:async()=>({meta:{result:true},transaction:{...transaction,...changed}})}));
 await assert.rejects(c.readWorldlineTransaction(keys,'test','123'),e=>e.outcome==='unknown');}
 const c=client(async()=>({ok:true,json:async()=>({meta:{result:true},transaction})}));
 assert.equal((await c.readWorldlineTransaction(keys,'test','123')).total.authorized,12500);
});
test('capture, credit and delete use the Europe operation contracts once',async()=>{
 for(const operation of ['capture','credit','delete']){
 let calls=0;const c=client(async(url,options)=>{calls++;assert.equal(url,`https://transaction-v1.api-eu.bambora.com/transactions/123/${operation}`);const body=JSON.parse(options.body);if(operation==='delete')assert.equal(body.deletetype,'instant');else{assert.equal(body.amount,12500);assert.equal(body.currency,'DKK');}return {ok:true,json:async()=>({meta:{result:true}})};});
 await c.mutateWorldlineTransaction(keys,'test','123',operation,operation==='delete'?undefined:12500);assert.equal(calls,1);
 }
});
test('money operation timeouts and malformed replies are uncertain and never retried',async()=>{
 for(const fetch of [async()=>{throw Error('secret');},async()=>({ok:true,json:async()=>({})}),async()=>({ok:false,json:async()=>({meta:{result:false}})})]){
 let calls=0;const c=client(async(...args)=>{calls++;return fetch(...args);});await assert.rejects(c.mutateWorldlineTransaction(keys,'test','123','credit',100),e=>e.outcome==='unknown');assert.equal(calls,1);
 }
});
test('operation validation rejects wrong environment and malformed amounts before I/O',async()=>{
 let calls=0;const c=client(async()=>{calls++;});
 for(const amount of [undefined,0,-1,1.5,2147483648])await assert.rejects(c.mutateWorldlineTransaction(keys,'test','123','capture',amount));
 await assert.rejects(c.mutateWorldlineTransaction(keys,'live','123','credit',1));assert.equal(calls,0);
});
test('checkout HTTP diagnostics distinguish refusal from uncertain outcomes without reading error bodies',async()=>{
 for(const [status,outcome] of [[400,'rejected'],[401,'rejected'],[403,'rejected'],[408,'unknown'],[429,'rejected'],[503,'unknown']]){
  let calls=0,reads=0;const c=client(async()=>{calls++;return {ok:false,status,json:async()=>{reads++;throw Error('private provider body');}};});
  await assert.rejects(c.createWorldlineCheckoutSession(keys,'test',input),e=>e.outcome===outcome&&e.code===`WORLDLINE_CHECKOUT_HTTP_${status}`&&!e.message.includes('private'));
  assert.equal(calls,1);assert.equal(reads,0);
 }
});
test('provider diagnostics expose only four numeric action digits and preserve explicit rejection',async()=>{
 const privateValue='synthetic-credential-value';
 for(const [action,code] of [[{code:'1001'},'WORLDLINE_CHECKOUT_PROVIDER_1001'],[{code:privateValue},'WORLDLINE_CHECKOUT_REJECTED'],[{code:'12345'},'WORLDLINE_CHECKOUT_REJECTED'],[{code:'1234\n'},'WORLDLINE_CHECKOUT_REJECTED'],[{code:1001},'WORLDLINE_CHECKOUT_REJECTED'],[null,'WORLDLINE_CHECKOUT_REJECTED']]){
  let calls=0;const c=client(async()=>{calls++;return {ok:true,json:async()=>({meta:{result:false,action,message:{merchant:privateValue,enduser:privateValue}},privateValue})};});
  await assert.rejects(c.createWorldlineCheckoutSession(keys,'test',input),e=>{
   assert.equal(e.outcome,'rejected');assert.equal(e.code,code);
   assert.ok(!JSON.stringify(e).includes(privateValue));assert.ok(!e.message.includes(privateValue));assert.equal(e.cause,undefined);return true;
  });
  assert.equal(calls,1);
 }
});
test('checkout timeout, bad JSON and malformed success have a fixed redacted unknown diagnostic and no retry',async()=>{
 const secret='synthetic-credential-value';
 for(const transport of [async()=>{throw Error(secret);},async()=>({ok:true,json:async()=>{throw Error(secret);}}),async()=>({ok:true,json:async()=>({meta:{result:true,message:secret},url:secret,token:secret})})]){
  let calls=0;const c=client(async(...args)=>{calls++;return transport(...args);});
  await assert.rejects(c.createWorldlineCheckoutSession(keys,'test',input),e=>e.outcome==='unknown'&&e.code==='WORLDLINE_CHECKOUT_UNKNOWN'&&!e.message.includes(secret)&&!JSON.stringify(e).includes(secret));
  assert.equal(calls,1);
 }
});
