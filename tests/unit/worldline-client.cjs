const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs'),vm=require('node:vm');
function load(path,mocks={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>n==='server-only'?{}:mocks[n]||require(n),Buffer,URL,AbortSignal,fetch:mocks.fetch});return exports;}
const settings=load('src/lib/payments/worldline-settings.ts');
const keys={merchantNumber:'T123',accessToken:'access',secretToken:'secret',md5Key:'hash'};
const input={orderId:'123',amountMinor:12500,currency:'DKK',acceptUrl:'https://example.com/ok',cancelUrl:'https://example.com/cancel',callbackUrl:'https://example.com/callback'};
const good={meta:{result:true},token:'abc123',url:'https://v1.checkout.bambora.com/abc123'};
const client=fetch=>load('src/lib/payments/worldline-client.ts',{'./worldline-settings':settings,fetch});
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
