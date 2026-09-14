const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
test('legacy global permissions require a verified active central superuser',async()=>{
 let session={superuser:false},calls=0;
 const {hasPermission}=loadTs('src/lib/auth/permissions.ts',{'server-only':{},'@/lib/access/orderfly-session':{orderflySession:async()=>{calls++;if(session instanceof Error)throw session;return session;}}});
 assert.equal(await hasPermission('users:view'),false);session={superuser:true};assert.equal(await hasPermission('users:view'),true);
 assert.equal(await hasPermission('invented:permission'),false);assert.equal(calls,2);
 session=Error('revoked');assert.equal(await hasPermission('users:view'),false);
});
test('display context reads the authenticated Firebase account instead of the first directory entry',async()=>{
 const seen=[];const {getSuperadminUserContext}=loadTs('src/lib/auth/superadmin-context.ts',{'server-only':{},'@/lib/access/orderfly-session':{orderflySession:async()=>({identity:{provider:'firebase',subject:'actual-user'},superuser:false,name:'Member'})},'@/lib/firebase-admin':{getAdminApp:()=>({auth:()=>({getUser:async uid=>{seen.push(uid);return {uid,email:'actual@example.test',displayName:'Actual'};}})})}});
 assert.deepEqual(await getSuperadminUserContext(),{id:'actual-user',email:'actual@example.test',name:'Actual',role:'company_user'});assert.deepEqual(seen,['actual-user']);
});
test('login creates a cookie only for a fresh verified token with current Orderfly access',async()=>{
 let access={superuser:false,permissions:[]},age=0,issued=0,verified=[],commands=[];
 const route=loadTs('src/app/api/admin/session/route.ts',{'server-only':{},'@/lib/url':{getOrigin:async()=> 'https://orderfly.dk'},'@/lib/firebase-admin':{getAdminDb:()=>({}),getAdminApp:()=>({auth:()=>({verifyIdToken:async(token,revoked)=>{verified.push([token,revoked]);return {uid:'real-user',auth_time:Date.now()/1000-age};},createSessionCookie:async()=>{issued++;return 'fixture-cookie';}})})},'@/lib/access/authority':{executeAuthority:async(db,identity,command)=>{commands.push({identity,command});return access;}}});
 const request=origin=>new Request('https://orderfly.dk/api/admin/session',{method:'POST',headers:{origin},body:JSON.stringify({idToken:'fixture-token',role:'superuser'})});
 assert.equal((await route.POST(request('https://foreign.test'))).status,403);assert.equal(verified.length,0);
 assert.equal((await route.POST(request('https://orderfly.dk'))).status,403);assert.equal(issued,0);
 access={superuser:false,permissions:['orderfly.orders:view']};age=301;assert.equal((await route.POST(request('https://orderfly.dk'))).status,403);assert.equal(issued,0);
 age=0;const response=await route.POST(request('https://orderfly.dk'));assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/HttpOnly/i);assert.equal(issued,1);assert.ok(verified.every(([,revoked])=>revoked===true));assert.deepEqual(commands.at(-1),{identity:{provider:'firebase',subject:'real-user'},command:{action:'session'}});
});
