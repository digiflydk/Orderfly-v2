const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
process.env.MPANEL_PLATFORM_ADMIN_SECRET='synthetic-launch-secret-at-least-32-characters';
const identity={provider:'opsfly',organizationId:'11111111-1111-4111-8111-111111111111',subject:'22222222-2222-4222-8222-222222222222'};
const token='a'.repeat(64),challenge='b'.repeat(64);
const auth=loadTs('src/lib/access/opsfly-login.ts',{'server-only':{}});
function fixture(){
 let active=true,permissions=['orderfly.catalog:view'],queue=Promise.resolve();const records=new Map(),seen=[];
 const db={collection(name){assert.equal(name,'platformAdminControl');return {doc(id){return {id,set:async data=>records.set(id,data)};}};},runTransaction(fn){const work=queue.then(()=>fn({get:async ref=>({data:()=>records.get(ref.id)}),delete:ref=>records.delete(ref.id)}));queue=work.catch(()=>{});return work;}};
 const service=loadTs('src/lib/access/mpanel-launch.ts',{'server-only':{},'./opsfly-login':{...auth,nativeOpsflySession:async value=>{assert.equal(value,token);if(!active)throw Error('revoked');return {identity,expires_at:new Date(Date.now()+3600000).toISOString()};}},'./authority':{...loadTs('src/lib/access/authority.ts',{'server-only':{}}),executeAuthority:async(_db,actor)=>{seen.push(actor);return {superuser:false,permissions};}}});
 return {service,db,records,seen,revoke:()=>active=false,deny:()=>permissions=['opsfly.own_time:view']};
}
test('launch binds native identity, encrypts token and opens the first permitted module',async()=>{
 const f=fixture(),{code}=await f.service.issueLaunch(f.db,token,challenge);
 assert.match(code,/^[a-f0-9]{64}\.[a-f0-9]{64}$/);assert.ok(!JSON.stringify([...f.records]).includes(token));
 const result=await f.service.redeemLaunch(f.db,code,challenge);assert.equal(result.path,'/superadmin/products');assert.equal(auth.readOpsflyCookie(result.cookie.value),token);assert.equal(f.records.size,0);assert.deepEqual(f.seen,[identity,identity]);
});
test('wrong receiving browser and altered codes cannot consume a valid grant',async()=>{
 const f=fixture(),{code}=await f.service.issueLaunch(f.db,token,challenge);
 await assert.rejects(f.service.redeemLaunch(f.db,code,'c'.repeat(64)));
 await assert.rejects(f.service.redeemLaunch(f.db,code.slice(0,65)+'d'.repeat(64),challenge));
 assert.equal(f.records.size,1);await f.service.redeemLaunch(f.db,code,challenge);
 await assert.rejects(f.service.redeemLaunch(f.db,code,challenge));
});
test('simultaneous redemption is atomic, and a second launch invalidates the first',async()=>{
 const f=fixture(),first=await f.service.issueLaunch(f.db,token,challenge),second=await f.service.issueLaunch(f.db,token,challenge);
 assert.equal(f.records.size,1);await assert.rejects(f.service.redeemLaunch(f.db,first.code,challenge));
 const results=await Promise.allSettled([f.service.redeemLaunch(f.db,second.code,challenge),f.service.redeemLaunch(f.db,second.code,challenge)]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
});
test('expiry, native revocation and changed permissions fail closed at redemption',async()=>{
 for(const failure of ['expired','revoked','denied']){
  const f=fixture(),{code}=await f.service.issueLaunch(f.db,token,challenge);
  if(failure==='expired')[...f.records.values()][0].expires=Date.now()-1;
  if(failure==='revoked')f.revoke();if(failure==='denied')f.deny();
  await assert.rejects(f.service.redeemLaunch(f.db,code,challenge));
 }
 const f=fixture();f.deny();await assert.rejects(f.service.issueLaunch(f.db,token,challenge));assert.equal(f.records.size,0);
});
test('tampered encrypted credential never becomes a session',async()=>{
 const f=fixture(),{code}=await f.service.issueLaunch(f.db,token,challenge);[...f.records.values()][0].sealedToken='x'.repeat(120);
 await assert.rejects(f.service.redeemLaunch(f.db,code,challenge));
});
test('browser route requires exact same origin, JSON and receiver cookie',async()=>{
 let value,redeems=0;
 const service=fixture().service;
 const route=loadTs('src/app/api/admin/mpanel/route.ts',{'server-only':{},'next/headers':{cookies:async()=>({get:()=>value?{value}:undefined})},'@/lib/mpanel-admin-cutover':{mpanelAdminEnabled:()=>true},'@/lib/url':{getOrigin:async()=> 'https://orderfly.dk'},'@/lib/firebase-admin':{getAdminDb:()=>({})},'@/lib/access/mpanel-launch':{...service,redeemLaunch:async()=>{redeems++;return {path:'/superadmin/products',cookie:{value:'fixture-cookie',maxAge:3600}};}}});
 const req=(body,origin='https://orderfly.dk',extra={})=>new Request('https://orderfly.dk/api/admin/mpanel',{method:'POST',headers:{origin,'content-type':'application/json',...extra},body:JSON.stringify(body)});
 assert.equal((await route.POST(req({action:'start'},'https://foreign.test'))).status,403);
 assert.equal((await route.POST(req({action:'start'},undefined,{'sec-fetch-site':'cross-site'}))).status,403);
 const start=await route.POST(req({action:'start'}));assert.equal(start.status,200);assert.match(start.headers.get('set-cookie'),/HttpOnly/);assert.match(start.headers.get('set-cookie'),/Secure/);assert.match(start.headers.get('set-cookie'),/SameSite=strict/i);value=(await start.json()).challenge;assert.match(value,/^[a-f0-9]{64}$/);
 const saved=value;value=undefined;assert.equal((await route.POST(req({action:'redeem',code:challenge+'.'+challenge}))).status,403);assert.equal(redeems,0);
 value=saved;const response=await route.POST(req({action:'redeem',code:challenge+'.'+challenge}));assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/__session=fixture-cookie/);assert.equal(redeems,1);
 assert.equal((await route.POST(req({action:'redeem',code:challenge+'.'+challenge,redirect:'https://evil.test'}))).status,403);
});
test('machine issuer denies missing secret before parsing or native verification',async()=>{
 let checks=0;const service=fixture().service;
 const route=loadTs('src/app/api/integrations/mpanel/launch/route.ts',{'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>({})},'@/lib/mpanel-admin-cutover':{mpanelAdminEnabled:()=>true},'@/lib/access/mpanel-launch':{...service,checkLaunchAccess:async()=>{checks++;}}});
 const req=secret=>new Request('https://orderfly.dk/api/integrations/mpanel/launch',{method:'POST',headers:secret?{'x-mpanel-platform-secret':secret}:{},body:JSON.stringify({action:'check',token})});
 assert.equal((await route.POST(req())).status,401);assert.equal(checks,0);
 assert.equal((await route.POST(req(process.env.MPANEL_PLATFORM_ADMIN_SECRET))).status,200);assert.equal(checks,1);
});
