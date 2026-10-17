const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {memoryDb}=require('../helpers/marketing-db.cjs');

let db;
const NOW=Date.parse('2026-10-20T10:00:00Z');
const {NotificationPlatformError}=loadTs('src/lib/notifications/platform.ts',{'server-only':{},'@/lib/feedback/mail-config':{notificationPlatformConfig:()=>null}});
const mail=loadTs('src/lib/loyalty/stamp-card/mail.ts',{'server-only':{},'@/lib/feedback/mail-config':{notificationPlatformConfig:()=>({endpoint:'https://x',organizationId:'o',secret:'s'})},
  '@/lib/notifications/platform':{NotificationPlatformClient:class{},NotificationPlatformError}});

const job=(changes={})=>({brandId:'brand',memberId:'m',email:'anna@example.com',name:'Anna',brandName:'Esmeralda',programName:'Esmeralda Club',
  loginUrl:'https://esmeralda.orderfly.dk/club/login#token='+'a'.repeat(64),state:'pending',attempts:0,nextAttemptAt:NOW,expiresAt:NOW+900_000,createdAt:NOW,...changes});
const withMapping=async fn=>{const original=process.env.ORDERFLY_GAMES_NOTIFICATION_BRANDS,loyalty=process.env.ORDERFLY_LOYALTY_NOTIFICATION_BRANDS;
  process.env.ORDERFLY_GAMES_NOTIFICATION_BRANDS=JSON.stringify({brand:{organizationId:'aaa94d25-3ca6-4ebf-a673-164608db6c55',senderProfile:'orderfly'}});delete process.env.ORDERFLY_LOYALTY_NOTIFICATION_BRANDS;
  try{return await fn();}finally{for(const [k,v] of [['ORDERFLY_GAMES_NOTIFICATION_BRANDS',original],['ORDERFLY_LOYALTY_NOTIFICATION_BRANDS',loyalty]])if(v===undefined)delete process.env[k];else process.env[k]=v;}};

test('an accepted login mail uses the fixed template and the stored link is erased',async()=>withMapping(async()=>{
  db=memoryDb();db.rows.set('loyaltyMailOutbox/j1',job());
  const sent=[];
  assert.equal(await mail.deliverLoyaltyMail(db,'j1',NOW,{send:async message=>sent.push(message)}),'accepted');
  assert.equal(sent[0].templateKey,'orderfly.stamp_card.login_link');assert.equal(sent[0].idempotencyKey,'loyalty-login-j1');
  assert.equal(sent[0].organizationId,'aaa94d25-3ca6-4ebf-a673-164608db6c55');
  assert.deepEqual(Object.keys(sent[0].variables).sort(),['brand_id','brand_name','expires_at','login_url','name','program_name']);
  // The notification worker refuses to mail the link after this deadline.
  assert.equal(sent[0].variables.expires_at,new Date(job().expiresAt).toISOString());
  assert.equal(db.rows.get('loyaltyMailOutbox/j1').loginUrl,null);
  assert.equal(await mail.deliverLoyaltyMail(db,'j1',NOW,{send:async()=>assert.fail('sent twice')}),null);
}));

test('expired links are never sent; missing mapping waits; unknown results are not retried',async()=>{
  db=memoryDb();db.rows.set('loyaltyMailOutbox/old',job({expiresAt:NOW}));
  assert.equal(await mail.deliverLoyaltyMail(db,'old',NOW,{send:async()=>assert.fail('stale link sent')}),null);
  assert.equal(db.rows.get('loyaltyMailOutbox/old').state,'expired');assert.equal(db.rows.get('loyaltyMailOutbox/old').loginUrl,null);
  db.rows.set('loyaltyMailOutbox/nomap',job());
  assert.equal(await mail.deliverLoyaltyMail(db,'nomap',NOW,{send:async()=>assert.fail('no mapping')}),'pending');
  assert.equal(db.rows.get('loyaltyMailOutbox/nomap').lastError,'configuration_required');
  await withMapping(async()=>{
    db.rows.set('loyaltyMailOutbox/unknown',job());
    assert.equal(await mail.deliverLoyaltyMail(db,'unknown',NOW,{send:async()=>{throw new NotificationPlatformError('provider_result_unknown',true);}}),'uncertain');
    assert.equal(db.rows.get('loyaltyMailOutbox/unknown').loginUrl,null);
    db.rows.set('loyaltyMailOutbox/busy',job());
    assert.equal(await mail.deliverLoyaltyMail(db,'busy',NOW,{send:async()=>{throw new NotificationPlatformError('provider_rate_limited',false,true);}}),'failed');
    const busy=db.rows.get('loyaltyMailOutbox/busy');assert.equal(busy.nextAttemptAt,NOW+30_000);assert.ok(busy.loginUrl);
    db.rows.set('loyaltyMailOutbox/bad',job());
    await mail.deliverLoyaltyMail(db,'bad',NOW,{send:async()=>{throw new NotificationPlatformError('provider_rejected_400');}});
    assert.equal(db.rows.get('loyaltyMailOutbox/bad').loginUrl,null);assert.equal(db.rows.get('loyaltyMailOutbox/bad').nextAttemptAt,Number.MAX_SAFE_INTEGER);
  });
});

// Portal HTTP boundary with the business functions replaced.
const LoyaltyError=class extends Error{constructor(code,status=422){super(code);this.code=code;this.status=status;}};
let session;
const portal=loadTs('src/lib/loyalty/stamp-card/portal-http.ts',{'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>({})},'@/lib/url':{getOrigin:async()=>'https://esmeralda.orderfly.dk'},
  './counter':{LoyaltyError},'./membership':{resolveBrand:async(db,slug)=>{if(slug!=='esmeralda')throw new LoyaltyError('brand_not_found',404);return {brandId:'brand',slug};},
    readSession:async(db,brand,token)=>{if(token!=='b'.repeat(64))throw new LoyaltyError('unauthorized',401);return session;}}});
const {z}=require('zod');
const params={params:Promise.resolve({brandSlug:'esmeralda'})};
const req=(method,body,headers={})=>new Request('https://esmeralda.orderfly.dk/api/loyalty/esmeralda/x',{method,headers:{...(method==='GET'?{}:{origin:'https://esmeralda.orderfly.dk','content-type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});

test('mutations are same-origin JSON; reads reject cross-site requests',async()=>{
  const run=async()=>({body:{ok:true}});
  for(const headers of [{origin:'https://evil.example'},{'content-type':'text/plain'},{'sec-fetch-site':'cross-site'}])
    assert.equal((await portal.portalRoute(req('POST',{},headers),params,{run})).status,403);
  assert.equal((await portal.portalRoute(req('GET',undefined,{'sec-fetch-site':'cross-site'}),params,{run})).status,403);
  assert.equal((await portal.portalRoute(req('GET'),params,{run})).status,200);
});

test('the session cookie is HttpOnly, Secure, SameSite=Lax and cleared on 401, logout and deletion',async()=>{
  const login=await portal.portalRoute(req('POST',{}),params,{run:async()=>({body:{ok:true},setSession:{token:'c'.repeat(64),expiresAt:Date.now()+86_400_000}})});
  const cookie=login.headers.get('set-cookie');
  assert.match(cookie,/^__Host-orderfly-loyalty=c{64}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=86(39|40)\d$/);
  const denied=await portal.portalRoute(req('GET',undefined,{cookie:'__Host-orderfly-loyalty='+'d'.repeat(64)}),params,{session:true,run:async()=>assert.fail('ran')});
  assert.equal(denied.status,401);assert.match(denied.headers.get('set-cookie'),/Max-Age=0/);
  session={memberId:'m'};let seen;
  const ok=await portal.portalRoute(req('GET',undefined,{cookie:'other=1; __Host-orderfly-loyalty='+'b'.repeat(64)}),params,{session:true,run:async c=>{seen=c.session;return {body:{}};}});
  assert.equal(ok.status,200);assert.equal(seen,session);
  const out=await portal.portalRoute(req('POST',{}),params,{run:async()=>({body:{ok:true},setSession:null})});
  assert.match(out.headers.get('set-cookie'),/^__Host-orderfly-loyalty=; .*Max-Age=0$/);
});

test('unknown brands, invalid bodies and failures map to codes without details',async()=>{
  const schema=z.object({email:z.string().email()}).strict();
  assert.deepEqual(await (await portal.portalRoute(req('GET'),{params:Promise.resolve({brandSlug:'nope'})},{run:async()=>({body:{}})})).json(),{error:'brand_not_found'});
  assert.equal((await portal.portalRoute(req('POST',{email:'x'}),params,{schema,run:async()=>({body:{}})})).status,400);
  const fail=await portal.portalRoute(req('POST',{email:'a@b.dk'}),params,{schema,run:async()=>{throw new Error('secret detail');}});
  assert.equal(fail.status,503);assert.doesNotMatch(await fail.text(),/secret/);
  let ip;await portal.portalRoute(req('POST',{email:'a@b.dk'},{'x-forwarded-for':'203.0.113.9, 10.0.0.1'}),params,{schema,run:async c=>{ip=c.context.ip;return {body:{}};}});
  assert.equal(ip,'203.0.113.9');
});
