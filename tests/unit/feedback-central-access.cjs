const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
function fixture({superuser=false,grants=[{tenantId:'brand-a',locationIds:null}],revoked=false,disabled=false,provider="firebase",missing=false}={}){
 const commands=[];
 const api=loadTs('src/lib/feedback/access.ts',{'server-only':{},'next/headers':{cookies:async()=>({get:()=>missing?undefined:({value:provider==='opsfly'?'opsfly.test-cookie':'verified-cookie'})})},
 '@/lib/firebase-admin':{getAdminDb:()=>({}),getAdminApp:()=>({auth:()=>({verifySessionCookie:async(cookie,checkRevoked)=>{assert.equal(checkRevoked,true);if(revoked)throw Error('revoked');return {uid:'native-uid'};}})})},
 './opsfly-login':{OPSFLY_COOKIE_PREFIX:'opsfly.',verifyOpsflyCookie:async()=>{if(revoked)throw Error('revoked');return {provider:'opsfly',subject:'native-uid',organizationId:'organization-a'};}},
 '@/lib/access/authority':{executeAuthority:async(db,identity,command)=>{assert.equal(identity.subject,'native-uid');assert.equal(identity.provider,provider);if(provider==='opsfly')assert.equal(identity.organizationId,'organization-a');commands.push(command);if(disabled)throw Error('inactive principal');return command.action==='session'?{superuser,actorId:'opsfly:organization-a:native-uid'}:{grants};}}});
 return {api,commands};
}
test('feedback permissions use current central grants and preserve brand scope',async()=>{
 const {api,commands}=fixture();const access=await api.requireFeedbackAccess('feedback:edit');assert.deepEqual(access.brandIds,['brand-a']);
 assert.equal(commands[1].permission,'orderfly.feedback:edit');api.assertFeedbackBrand(access,'brand-a');assert.throws(()=>api.assertFeedbackBrand(access,'foreign'));
});
test('revoked, inactive and location-only identities cannot read company-wide feedback',async()=>{
 for(const options of [{revoked:true},{disabled:true},{grants:[]},{grants:[{tenantId:'brand-a',locationIds:['one']}]}])await assert.rejects(fixture(options).api.requireFeedbackAccess());
});
test('company rights cannot change global questions and environment flags grant nothing',async()=>{
 process.env.ORDERFLY_FEEDBACK_TEST_ACCESS='enabled-for-dummy-data';process.env.ORDERFLY_FEEDBACK_ACCESS=JSON.stringify([{uid:'native-uid',role:'platform_admin'}]);
 try{const {api}=fixture();assert.equal(api.temporaryFeedbackTestAccessEnabled(),false);await assert.rejects(api.requireQuestionAccess(true));await assert.rejects(api.requireFeedbackAccess('unknown'));}
 finally{delete process.env.ORDERFLY_FEEDBACK_TEST_ACCESS;delete process.env.ORDERFLY_FEEDBACK_ACCESS;}
 assert.equal((await fixture({superuser:true}).api.requireQuestionAccess(true)).brandIds,null);
});
test('loyalty platform settings reject an unauthorized write before processing form or database access',async()=>{
 let reads=0;const api=loadTs('src/app/superadmin/loyalty/actions.ts',{'next/cache':{},'@/lib/firebase-admin':{getAdminDb:()=>{reads++;throw Error('unexpected database access');}},'@/lib/access/orderfly-session':{requirePlatformSuperuser:async()=>{throw Error('forbidden');}}});
 await assert.rejects(api.updateLoyaltySettings(null,new FormData()),/forbidden/);assert.equal(reads,0);
});

for(const provider of ['opsfly','firebase']) {
 test(provider+' shared session opens feedback and global questions for superusers',async()=>{
  const {api}=fixture({provider,superuser:true});
  for(const permission of ['feedback:view','feedback:edit','settings:view','settings:edit']) {
   const access=await api.requireFeedbackAccess(permission);assert.equal(access.brandIds,null);
   assert.equal(access.uid,provider==='firebase'?'native-uid':'opsfly:organization-a:native-uid');
  }
  assert.equal((await api.requireQuestionAccess(true)).brandIds,null);
 });
 test(provider+' session preserves rejection and company boundaries',async()=>{
  for(const options of [{missing:true},{revoked:true},{disabled:true},{grants:[]},{grants:[{tenantId:'brand-a',locationIds:['one']}]}])await assert.rejects(fixture({provider,...options}).api.requireFeedbackAccess());
  const {api}=fixture({provider});const access=await api.requireFeedbackAccess('feedback:edit');
  assert.deepEqual(access.brandIds,['brand-a']);assert.throws(()=>api.assertFeedbackBrand(access,'foreign'));await assert.rejects(api.requireQuestionAccess(true));
 });
}

function layoutFixture({signedIn=true,allowed=true}={}) {
 const ts=require('typescript'),fs=require('node:fs');
 const source=ts.transpileModule(fs.readFileSync('src/app/superadmin/feedback/layout.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const mocks={
  'react/jsx-runtime':{jsx:(type,props)=>({type,props}),Fragment:'Fragment'},
  'next/navigation':{redirect:href=>{throw Error('redirect:'+href);}},
  '@/lib/access/orderfly-session':{orderflySession:async()=>{if(!signedIn)throw Error('unauthorized');return {superuser:allowed};}},
  '@/lib/feedback/access':{requireFeedbackAccess:async()=>{if(!allowed)throw Error('forbidden');}},
  '@/components/superadmin/access-denied-page':{AccessDeniedPage:'AccessDenied'},
 };
 const mod={exports:{}};new Function('require','module','exports',source)(name=>{assert.ok(name in mocks);return mocks[name];},mod,mod.exports);return mod.exports.default;
}
test('feedback layout uses standard login only for missing sessions and denies missing rights without another login',async()=>{
 const accepted=await layoutFixture()({children:'protected-content'});assert.equal(accepted.props.children,'protected-content');
 const denied=await layoutFixture({allowed:false})({children:'protected-content'});assert.equal(denied.type,'AccessDenied');assert.doesNotMatch(JSON.stringify(denied),/protected-content/);
 await assert.rejects(layoutFixture({signedIn:false})({children:'protected-content'}),/redirect:\/admin-login/);
});
