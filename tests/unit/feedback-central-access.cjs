const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
function fixture({superuser=false,grants=[{tenantId:'brand-a',locationIds:null}],revoked=false,disabled=false}={}){
 const commands=[];
 const api=loadTs('src/lib/feedback/access.ts',{'server-only':{},'next/headers':{cookies:async()=>({get:()=>({value:'verified-cookie'})})},
 '@/lib/firebase-admin':{getAdminDb:()=>({}),getAdminApp:()=>({auth:()=>({verifySessionCookie:async(cookie,checkRevoked)=>{assert.equal(checkRevoked,true);if(revoked)throw Error('revoked');return {uid:'native-uid'};}})})},
 '@/lib/access/authority':{executeAuthority:async(db,identity,command)=>{assert.equal(identity.subject,'native-uid');commands.push(command);if(disabled)throw Error('inactive principal');return command.action==='session'?{superuser}:{grants};}}});
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
