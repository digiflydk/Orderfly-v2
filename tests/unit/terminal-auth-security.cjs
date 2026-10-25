const {test}=require('node:test'),assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {createTerminalAuthFixture,seedTerminalAdmin}=require('../helpers/terminal-auth-fixture.cjs');
const password=()=>randomBytes(24).toString('base64url');
async function configured(run){const f=createTerminalAuthFixture();seedTerminalAdmin(f);return f.withClock(async()=>{
 const core=f.load('src/lib/terminal-auth/core.ts'),secret=password(),username='fixture.location';
 const config=await core.updateTerminalLoginConfig('location',{username,password:secret,enabled:true,expectedRevision:0});
 await run({f,core,secret,username,config});
});}
async function login({f,core,secret,username}){const issued=await core.loginTerminal({username,password:secret});f.cookies.set(core.TERMINAL_COOKIE,issued.token);return issued;}

test('credentials use salted hashes only; config and audit never expose password, salt or session token',()=>configured(async({f,core,secret,username})=>{
 const stored=f.rows.get('terminalCredentials/location');assert.notEqual(stored.passwordHash,secret);assert.match(stored.passwordHash,/^[a-f0-9]{128}$/);assert.match(stored.salt,/^[a-f0-9]{32}$/);
 assert.equal(JSON.stringify([...f.rows]).includes(secret),false);
 const publicConfig=await core.readTerminalLoginConfig('location');assert.deepEqual(Object.keys(publicConfig).sort(),['canEdit','configured','enabled','revision','username']);
 const issued=await login({f,core,secret,username});assert.equal(JSON.stringify([...f.rows]).includes(issued.token),false);
 assert.ok(f.rows.has('terminalSessions/'+f.hash(issued.token)));assert.notEqual(issued.session.actorId,issued.token);
 assert.deepEqual(Object.keys(core.publicTerminalSession(issued.session)).sort(),['authenticated','brandId','brandName','locationId','locationName']);
}));
test('wrong password and unknown username return the same safe unauthorized error with no session',()=>configured(async({f,core,username})=>{
 for(const name of [username,'unknown-fixture'])await assert.rejects(core.loginTerminal({username:name,password:password()}),e=>e.status===401&&e.code==='unauthorized');
 assert.equal([...f.rows.keys()].some(key=>key.startsWith('terminalSessions/')),false);
}));
test('durable throttle survives new core instance and resets only after window',()=>configured(async({f,core,secret,username})=>{
 for(let i=0;i<core.TERMINAL_LOGIN_LIMIT;i++)await assert.rejects(core.loginTerminal({username,password:password()}),e=>e.status===401);
 const second=createTerminalAuthFixture([...f.rows]);second.now=f.now;second.cookies.set('__session',f.cookies.get('__session'));
 await second.withClock(async()=>{
   const fresh=second.load('src/lib/terminal-auth/core.ts');await assert.rejects(fresh.loginTerminal({username,password:secret}),e=>e.status===429);
   second.now+=fresh.TERMINAL_LOGIN_WINDOW_MS+1;assert.ok((await fresh.loginTerminal({username,password:secret})).token);
 });
}));
test('persistent session survives beyond eight hours; explicit logout revokes durable token',()=>configured(async(args)=>{
 const {f,core}=args,issued=await login(args);f.cookies.delete('__session');f.now+=9*60*60*1000;
 assert.equal((await core.getTerminalSession()).locationId,'location');
 await core.logoutTerminal();await assert.rejects(core.getTerminalSession(),e=>e.status===401);
 assert.equal(f.rows.get('terminalSessions/'+f.hash(issued.token)).revokedAt,f.now);
 await core.logoutTerminal();assert.equal(f.rows.get('terminalSessions/'+f.hash(issued.token)).revokedAt,f.now);
}));
test('password reset and disable revoke existing sessions without leaking credentials or reviving old token',()=>configured(async(args)=>{
 const {f,core,username}=args;const old=await login(args);
 await core.updateTerminalLoginConfig('location',{username,password:password(),enabled:true,expectedRevision:1});
 await assert.rejects(core.getTerminalSession(),e=>e.status===401);
 await assert.rejects(core.loginTerminal({username,password:args.secret}),e=>e.status===401);
 await core.updateTerminalLoginConfig('location',{username,enabled:false,expectedRevision:2});f.cookies.set(core.TERMINAL_COOKIE,old.token);
 await assert.rejects(core.getTerminalSession(),e=>e.status===401);
}));
test('only server-minted scope handles work; forged, copied and foreign-location sessions fail',()=>configured(async(args)=>{
 const {f,core}=args;const {session}=await login(args);
 await f.db.runTransaction(tx=>core.authorizeTerminalTransaction(tx,session,'brand','location'));
 for(const candidate of [{...session},JSON.parse(JSON.stringify(session)),{...session,locationId:'other'}])await assert.rejects(f.db.runTransaction(tx=>core.authorizeTerminalTransaction(tx,candidate,'brand','location')),e=>e.status===401);
 await assert.rejects(f.db.runTransaction(tx=>core.authorizeTerminalTransaction(tx,session,'brand','other')),e=>e.status===401);
 f.rows.get('locations/location').brandId='foreign';await assert.rejects(core.getTerminalSession(),e=>e.status===401);
}));
test('credential revocation on native retry discards all attempted business writes',()=>configured(async(args)=>{
 const {f,core}=args;const {session}=await login(args),before=f.commits.length;
 f.options.retry=rows=>{rows.get('terminalCredentials/location').revision++;};
 await assert.rejects(f.db.runTransaction(async tx=>{await core.authorizeTerminalTransaction(tx,session,'brand','location');tx.set(f.db.collection('proof').doc('mutation'),{ok:true});}),e=>e.status===401);
 assert.equal(f.rows.has('proof/mutation'),false);assert.equal(f.commits.length,before);
}));
test('terminal cookie grants no existing administrative session or location-config privilege',()=>configured(async(args)=>{
 const {f,core}=args;await login(args);f.cookies.delete('__session');
 const admin=f.load('src/lib/access/orderfly-session.ts');await assert.rejects(admin.orderflySession(),e=>e.status===401);
 await assert.rejects(core.readTerminalLoginConfig('location'),e=>e.status===401);
 await assert.rejects(core.updateTerminalLoginConfig('location',{username:args.username,enabled:false,expectedRevision:1}),e=>e.status===401);
}));
test('username collisions and stale revisions cannot overwrite another credential claim',()=>configured(async({f,core,username})=>{
 f.rows.get('platformAdminControl/access-v1').memberships[0].locationIds=['location','other'];
 await assert.rejects(core.updateTerminalLoginConfig('other',{username,password:password(),enabled:true,expectedRevision:0}),e=>e.status===409);
 assert.equal(f.rows.has('terminalCredentials/other'),false);assert.equal(f.rows.get('terminalUsernames/'+f.hash(username)).locationId,'location');
 await assert.rejects(core.updateTerminalLoginConfig('location',{username,enabled:false,expectedRevision:0}),e=>e.status===409);
 assert.equal(f.rows.get('terminalCredentials/location').enabled,true);
}));
const post=(path,value={},headers={})=>new Request('https://orderfly.dk/api/terminal/auth/'+path,{method:'POST',headers:{origin:'https://orderfly.dk','content-type':'application/json',...headers},body:JSON.stringify(value)});
test('login/logout/renewal reject cross-site or forged payloads; secure cookie never appears in JSON',()=>configured(async(args)=>{
 const {f,core,username,secret}=args,http=f.load('src/lib/terminal-auth/http.ts');
 const before=f.commits.length;
 for(const [handler,path,payload] of [[http.handleTerminalLogin,'login',{username,password:secret}],[http.handleTerminalLogout,'logout',{}],[http.handleTerminalSession,'session',{}]]){
   assert.equal((await handler(post(path,payload,{origin:'https://foreign.test'}))).status,403);
   assert.equal((await handler(post(path,payload,{'sec-fetch-site':'cross-site'}))).status,403);
 }
 assert.equal(f.commits.length,before);
 const response=await http.handleTerminalLogin(post('login',{username,password:secret}));assert.equal(response.status,200);
 const header=response.headers.get('set-cookie'),token=header.split(';')[0].split('=')[1];
 for(const part of ['__Host-orderfly_terminal=','Path=/','HttpOnly','Secure','SameSite=Lax','Max-Age=34560000'])assert.ok(header.includes(part),part);
 assert.equal(/Domain=/i.test(header),false);const body=await response.json();assert.equal(JSON.stringify(body).includes(token),false);
 f.cookies.set(core.TERMINAL_COOKIE,token);f.cookies.delete('__session');f.now+=24*60*60*1000;
 assert.equal((await http.handleTerminalSession(post('session',{role:'superuser'}))).status,400);
 const renewed=await http.handleTerminalSession(post('session'));assert.equal(renewed.status,200);assert.ok(renewed.headers.get('set-cookie').includes(token));
 const out=await http.handleTerminalLogout(post('logout'));assert.equal(out.status,200);assert.ok(out.headers.get('set-cookie').includes('Max-Age=0'));
 assert.equal((await http.handleTerminalSession(new Request('https://orderfly.dk/api/terminal/auth/session'))).status,401);
}));
test('password reset racing the credential read prevents issuing a stale authenticated session',()=>configured(async({f,core,username,secret})=>{
 let changed=false;f.options.afterRead=(path,rows)=>{if(path==='terminalCredentials/location'&&!changed){rows.get(path).revision++;changed=true;}};
 await assert.rejects(core.loginTerminal({username,password:secret}),e=>e.status===401);
 assert.equal([...f.rows.keys()].some(key=>key.startsWith('terminalSessions/')),false);
}));
test('unknown usernames use bounded durable buckets without consuming an unrelated known-login budget',()=>configured(async({f,core,username,secret})=>{
 for(let i=0;i<70;i++)await assert.rejects(core.loginTerminal({username:'missing-'+i,password:password()}),e=>[401,429].includes(e.status));
 const keys=[...f.rows.keys()].filter(key=>key.startsWith('terminalLoginThrottle/'));
 assert.ok(keys.length<=64);assert.equal(keys.some(key=>key.includes(username)),false);
 assert.ok((await core.loginTerminal({username,password:secret})).token);
}));
