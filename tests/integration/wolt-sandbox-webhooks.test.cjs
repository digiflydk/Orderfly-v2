const {test}=require('node:test'),assert=require('node:assert/strict');
const {manageSandboxWebhooks}=require('../../scripts/wolt-sandbox-webhooks.cjs');
const credentials={environment:'sandbox',merchantId:'merchant-fixture',merchantKey:'synthetic-merchant-only-key'};
const callback={environment:'sandbox',callbackKey:'synthetic-callback-12345678',secret:'synthetic-webhook-secret-separate-from-key',callbackUrl:'https://owned.example.test/callback/synthetic-callback-12345678'};
test('list-before-create and owned cleanup preserve existing merchant subscriptions',async()=>{
 let state,rows=[{id:'other',callback_url:'https://other.example.test'}];const calls=[];
 const fake=async(url,opts)=>{assert.ok(url.startsWith('https://daas-public-api.development.dev.woltapi.com/'));assert.equal(opts.redirect,'error');calls.push(opts.method);
  if(opts.method==='GET')return Response.json(rows);
  if(opts.method==='POST'){assert.equal(state.phase,'registering');rows.push({id:'own',callback_url:JSON.parse(opts.body).callback_url});return Response.json(rows[1],{status:201})}
  assert.equal(url.endsWith('/own'),true);rows=rows.filter(v=>v.id!=='own');return new Response(null,{status:204});};
 const save=async value=>state=value;
 assert.deepEqual(await manageSandboxWebhooks('register',credentials,callback,null,save,fake),{status:'registered'});
 assert.deepEqual(calls,['GET','POST']);
 await assert.rejects(manageSandboxWebhooks('register',credentials,callback,state,save,fake),/DO_NOT_DUPLICATE/);
 assert.deepEqual(await manageSandboxWebhooks('cleanup',credentials,callback,state,save,fake),{status:'cleaned',remainingSubscriptions:1});assert.equal(rows[0].id,'other');assert.equal(state.phase,'cleaned');
});
test('failed or ambiguous registration is not repeated and ownership mismatches cannot delete',async()=>{
 let state;const save=async value=>state=value;
 const fake=async(_,opts)=>{if(opts.method==='GET')return Response.json([]);throw Error('lost response')};
 await assert.rejects(manageSandboxWebhooks('register',credentials,callback,null,save,fake));assert.equal(state.phase,'registering');
 await assert.rejects(manageSandboxWebhooks('register',credentials,callback,state,save,fake),/DO_NOT_DUPLICATE/);
 let calls=0;await assert.rejects(manageSandboxWebhooks('cleanup',credentials,callback,{...state,callbackUrl:'https://foreign.example'},save,async()=>{calls++}),/OWNERSHIP/);assert.equal(calls,0);
 await assert.rejects(manageSandboxWebhooks('register',{...credentials,environment:'production'},callback,null,save,fake),/INVALID_SANDBOX/);
 await assert.rejects(manageSandboxWebhooks('register',credentials,{...callback,secret:credentials.merchantKey},null,save,fake),/INVALID_CALLBACK/);
});
