const { test } = require('node:test'), assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const schema=loadTs('src/lib/payments/worldline-settings.ts');
const blank={merchantNumber:'',accessToken:'',secretToken:'',md5Key:''};
function fixture(){
 const rows=new Map([['brands/b',{}],['locations/l',{brandId:'b'}]]),secrets=new Map(),reads=[],writes=[];
 const ref=path=>({path,get:async()=>({exists:rows.has(path),data:()=>rows.get(path)})});
 const db={collection:name=>({doc:id=>ref(name+'/'+id)}),runTransaction:async run=>run({get:r=>r.get(),set:(r,v)=>rows.set(r.path,v)})};
 const mocks={'@/lib/access/orderfly-session':{requirePlatformSuperuser:async()=>{}},'@/lib/firebase-admin':{getAdminDb:()=>db},'@/lib/payments/worldline-settings':schema,'@/lib/payments/worldline-store':{worldlineSettingsRef:s=>ref('settings/'+s.brandId+'/'+(s.locationId||'')),readWorldlineSecret:async(s,m,r)=>{reads.push(r);return secrets.get(r);},writeWorldlineSecret:async(s,m,k)=>{const id='private-ref-'+writes.length;writes.push(k);secrets.set(id,k);return id;},readStripeSecret:async(s,m,r)=>{reads.push(r);return secrets.get(r);},writeStripeSecret:async(s,m,k)=>{writes.push(k);return 'private-stripe';}}};
 const api=loadTs('src/app/superadmin/payments/worldline-actions.ts',mocks);return {api,rows,secrets,reads,writes};
}
test('effective legacy Stripe summary reflects mode and missing keys without exposing any values',async()=>{
 const f=fixture();f.rows.set('platform_settings/payment_gateway',{activeMode:'test',test:{secretKey:'private-stripe',publishableKey:'private-public',webhookSecret:'private-webhook'}});
 const view=await f.api.loadWorldlineSettings({brandId:'b',locationId:'l'});assert.equal(view.effective.source,'platform');assert.equal(view.effective.provider,'stripe');assert.equal(view.effective.mode,'test');assert.equal(view.effective.credentialsSet,true);assert.equal(f.reads.length,0);assert.doesNotMatch(JSON.stringify(view),/private-/);
 f.rows.get('platform_settings/payment_gateway').test.secretKey='';assert.equal((await f.api.loadWorldlineSettings({brandId:'b'})).effective.credentialsSet,false);
});
test('effective inherited provider and environment use one stored brand agreement',async()=>{
 const f=fixture();f.rows.set('settings/b/',{source:'own',provider:'worldline',mode:'test',test:'private-version',revision:1});
 const view=await f.api.loadWorldlineSettings({brandId:'b',locationId:'l'});assert.equal(view.effective.source,'brand');assert.equal(view.effective.provider,'worldline');assert.equal(view.effective.mode,'test');assert.equal(view.effective.credentialsSet,true);assert.equal(f.reads.length,0);assert.doesNotMatch(JSON.stringify(view),/private-version/);
});
test('own disabled/incomplete location never displays ready inherited credentials',async()=>{
 const f=fixture();f.rows.set('settings/b/',{source:'own',provider:'worldline',mode:'live',live:'private-brand',revision:1});f.rows.set('settings/b/l',{source:'own',provider:'stripe',mode:'test',revision:1});
 let view=await f.api.loadWorldlineSettings({brandId:'b',locationId:'l'});assert.equal(view.effective.source,'location');assert.equal(view.effective.provider,'stripe');assert.equal(view.effective.mode,'test');assert.equal(view.effective.credentialsSet,false);
 f.rows.get('settings/b/l').mode='disabled';view=await f.api.loadWorldlineSettings({brandId:'b',locationId:'l'});assert.equal(view.effective.mode,'disabled');assert.equal(view.effective.credentialsSet,false);
});
test('explicit inheritance with missing brand is incomplete rather than legacy fallback',async()=>{
 const f=fixture();f.rows.set('settings/b/l',{source:'brand',provider:'worldline',mode:'disabled',revision:1});const view=await f.api.loadWorldlineSettings({brandId:'b',locationId:'l'});assert.equal(view.effective.legacy,false);assert.equal(view.effective.configured,false);
});
test('changing Worldline merchant requires a complete replacement bundle and keeps old reference on failure',async()=>{
 const f=fixture();f.rows.set('settings/b/',{source:'own',provider:'worldline',mode:'test',test:'old-ref',revision:1});f.secrets.set('old-ref',{merchantNumber:'T123',accessToken:'old-access',secretToken:'old-secret',md5Key:'old-md5'});
 await assert.rejects(f.api.saveWorldlineSettings({brandId:'b'},{source:'own',provider:'worldline',mode:'test',revision:1,test:{...blank,merchantNumber:'T456'},live:blank}));assert.equal(f.writes.length,0);assert.equal(f.rows.get('settings/b/').test,'old-ref');
});
test('invalid credential input produces a fixed error without its raw value',async()=>{
 const f=fixture();await assert.rejects(f.api.saveWorldlineSettings({brandId:'b'},{source:'own',provider:'worldline',mode:'test',revision:0,test:{...blank,accessToken:'PRIVATE TOKEN'},live:blank}),e=>!e.message.includes('PRIVATE TOKEN'));assert.equal(f.writes.length,0);
});

test('saving explicit brand inheritance requires a stored brand agreement',async()=>{const f=fixture();await assert.rejects(f.api.saveWorldlineSettings({brandId:'b',locationId:'l'},{source:'brand',provider:'stripe',mode:'disabled',revision:0,test:blank,live:blank}));assert.equal(f.rows.has('settings/b/l'),false);});
