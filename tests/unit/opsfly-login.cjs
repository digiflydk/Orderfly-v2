const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const identity={provider:'opsfly',organizationId:'11111111-1111-4111-8111-111111111111',subject:'22222222-2222-4222-8222-222222222222'},token='a'.repeat(64);
const expires_at=()=>new Date(Date.now()+3600000).toISOString();
process.env.MPANEL_PLATFORM_ADMIN_SECRET='synthetic-test-secret-never-a-real-credential';
const auth=loadTs('src/lib/access/opsfly-login.ts',{'server-only':{}});

test('signed cookie rejects alteration, expired data, oversize and key changes',()=>{
 const c=auth.createOpsflyCookie(token,expires_at());assert.equal(auth.readOpsflyCookie(c.value),token);assert.ok(c.maxAge<=3600);
 for(const value of [c.value+'.extra',c.value.replace('opsfly.v1.','opsfly.v2.'),c.value.slice(0,-8)+'AAAAAAAA','x'.repeat(1200)])assert.throws(()=>auth.readOpsflyCookie(value));
 const now=Date.now;Date.now=()=>now()+4000000;try{assert.throws(()=>auth.readOpsflyCookie(c.value));}finally{Date.now=now;}
 const key=process.env.MPANEL_PLATFORM_ADMIN_SECRET;process.env.MPANEL_PLATFORM_ADMIN_SECRET='different-test-secret-never-real-credentials';try{assert.throws(()=>auth.readOpsflyCookie(c.value));}finally{process.env.MPANEL_PLATFORM_ADMIN_SECRET=key;}
 assert.throws(()=>auth.createOpsflyCookie(token,'invalid'));assert.throws(()=>auth.createOpsflyCookie(token,'2000-01-01T00:00:00.000Z'));
 assert.ok(auth.createOpsflyCookie(token,new Date(Date.now()+86400000).toISOString()).maxAge<=28800);
});
test('native identity is reverified on every request and never taken from the login role',async()=>{
 const original=global.fetch,calls=[];let active=true;
 global.fetch=async(url,options)=>{calls.push({url,...options,body:JSON.parse(options.body)});const action=JSON.parse(options.body).action;
  return Response.json(action==='login'?{token,employee:{role:'admin',id:'ignored'}}:active?{identity,expires_at:expires_at()}:{error:'revoked'},{status:active||action==='login'?200:401});
 };
 try {
  const logged=await auth.loginOpsfly('Fixture','123456');assert.deepEqual(logged.identity,identity);
  const cookie=auth.createOpsflyCookie(logged.token,logged.expires_at).value;assert.deepEqual(await auth.verifyOpsflyCookie(cookie),identity);
  active=false;await assert.rejects(auth.verifyOpsflyCookie(cookie));assert.equal(calls.filter(c=>c.body.action==='session').length,3);
  for(const call of calls){assert.equal(call.url,'https://bdemvarwpfcxyczunchx.supabase.co/functions/v1/timeclock-admin-auth');assert.equal(call.redirect,'error');assert.equal(call.cache,'no-store');assert.equal(call.body.organization_slug,'esmeralda');}
  assert.ok(calls.filter(c=>c.body.action==='session').every(c=>c.headers['x-session-token']===token));
 }finally{global.fetch=original;}
});
test('PostgreSQL timestamp offsets remain valid and expired offsets are denied',async()=>{
 const original=global.fetch;
 try {
  const future=new Date(Date.now()+3600000);
  for(const expires of [future.toISOString().replace('Z','+00:00'),new Date(future.getTime()+7200000).toISOString().replace('Z','+02:00')]) {
   global.fetch=async()=>Response.json({identity,expires_at:expires});
   const verified=await auth.nativeOpsflySession(token);
   assert.deepEqual(verified.identity,identity);
   const cookie=auth.createOpsflyCookie(token,verified.expires_at);
   assert.ok(cookie.maxAge>3500&&cookie.maxAge<=3600);
   assert.equal(auth.readOpsflyCookie(cookie.value),token);
  }
  for(const expires of ['2000-01-01T00:00:00+00:00','2000-01-01T02:00:00+02:00','not-a-date']) {
   global.fetch=async()=>Response.json({identity,expires_at:expires});
   await assert.rejects(auth.nativeOpsflySession(token));
  }
 }finally{global.fetch=original;}
});
test('upstream throttling, failures, oversize and malformed identity fail closed',async()=>{
 const original=global.fetch;
 try {
  for(const status of [401,429,503]){global.fetch=async()=>Response.json({error:'private detail'},{status});await assert.rejects(auth.loginOpsfly('Fixture','123456'),e=>e.status===(status===401?403:status)&&!e.message.includes('private'));}
  for(const body of [{identity:{...identity,provider:'firebase'},expires_at:expires_at()},{identity,expires_at:'2000-01-01T00:00:00.000Z'},{identity,expires_at:expires_at(),token},'x'.repeat(9000)]){global.fetch=async()=>Response.json(body);await assert.rejects(auth.nativeOpsflySession(token));}
  global.fetch=async()=>{throw Error('offline');};await assert.rejects(auth.nativeOpsflySession(token));
 }finally{global.fetch=original;}
});
test('login route uses verified native identity, denies missing grants and cleans rejected sessions',async()=>{
 let allowed=false,logins=0,revoked=0,seen=[];
 const mocks={'server-only':{},'next/headers':{cookies:async()=>({get:()=>undefined})},'@/lib/url':{getOrigin:async()=> 'https://orderfly.dk'},'@/lib/firebase-admin':{getAdminDb:()=>({}),getAdminApp:()=>{throw Error('Firebase is not used');}},'@/lib/access/opsfly-login':{...auth,loginOpsfly:async()=>{logins++;return {token,identity,expires_at:expires_at()};},logoutOpsfly:async()=>{revoked++;}},'@/lib/access/authority':{executeAuthority:async(db,actor)=>{seen.push(actor);return {superuser:allowed,permissions:allowed?[]:['opsfly.own_time:view']};}}};
 const route=loadTs('src/app/api/admin/session/route.ts',mocks);
 const request=(extra={},origin='https://orderfly.dk')=>new Request(origin+'/api/admin/session',{method:'POST',headers:{origin},body:JSON.stringify({provider:'opsfly',identifier:'Fixture',pin:'123456',...extra})});
 assert.equal((await route.POST(request({},'https://foreign.test'))).status,403);assert.equal(logins,0);
 for(const extra of [{pin:'123'},{role:'superadmin'},{organizationId:identity.organizationId},{identifier:' '}])assert.equal((await route.POST(request(extra))).status,400);
 assert.equal(logins,0);assert.equal((await route.POST(request())).status,403);assert.equal(revoked,1);
 allowed=true;const response=await route.POST(request());assert.equal(response.status,200);const cookie=response.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=lax/i);assert.match(cookie,/Max-Age=/);assert.deepEqual(seen,[identity,identity]);assert.deepEqual(await response.json(),{ok:true});
});
test('logout revokes the native session and only then clears the cookie; outages are retryable',async()=>{
 let revoked=0,fail=false;const value=auth.createOpsflyCookie(token,expires_at()).value;
 const route=loadTs('src/app/api/admin/session/route.ts',{'server-only':{},'next/headers':{cookies:async()=>({get:()=>({value})})},'@/lib/url':{getOrigin:async()=> 'https://orderfly.dk'},'@/lib/firebase-admin':{},'@/lib/access/opsfly-login':{...auth,logoutOpsfly:async seen=>{assert.equal(seen,token);revoked++;if(fail)throw new auth.OpsflyLoginError(503);}}});
 const req=origin=>new Request('https://orderfly.dk/api/admin/session',{method:'DELETE',headers:{origin}});
 assert.equal((await route.DELETE(req('https://foreign.test'))).status,403);assert.equal(revoked,0);
 fail=true;const failed=await route.DELETE(req('https://orderfly.dk'));assert.equal(failed.status,503);assert.equal(failed.headers.get('set-cookie'),null);
 fail=false;const response=await route.DELETE(req('https://orderfly.dk'));assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/Max-Age=0/);assert.equal(revoked,2);
});
test('Opsfly display context never queries Firebase using an employee ID',async()=>{
 const {getSuperadminUserContext}=loadTs('src/lib/auth/superadmin-context.ts',{'server-only':{},'@/lib/access/orderfly-session':{orderflySession:async()=>({identity,actorId:'central-owner',superuser:true,name:'Fixture'})},'@/lib/firebase-admin':{getAdminApp:()=>{throw Error('Wrong provider');}}});
 assert.deepEqual(await getSuperadminUserContext(),{id:'central-owner',email:null,name:'Fixture',role:'superadmin'});
});
